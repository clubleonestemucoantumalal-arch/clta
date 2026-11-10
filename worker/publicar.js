/**
 * Publicador del panel del Club de Leones Temuco Antumalal.
 *
 * Recibe los cambios del panel y los sube al repositorio de GitHub con una
 * llave que vive solo aquí (secreto GITHUB_TOKEN), así nadie tiene que pegar
 * el token en su computador.
 *
 * Seguridad:
 *  - Solo responde a quien Cloudflare Access ya identificó: se verifica la firma
 *    del JWT (cabecera Cf-Access-Jwt-Assertion), su vencimiento, su emisor y su
 *    audiencia. Si ACCESS_TEAM o ACCESS_AUD no están configurados, se rechaza todo.
 *  - Solo puede escribir las rutas de PERMITIDOS y solo con JSON válido.
 *  - Cada cambio queda en el historial de GitHub con el correo de quien publicó.
 */

const PERMITIDOS = ['data/contenido.json', 'data/imagenes.json', 'data/instagram.json'];
const MAX_TOTAL = 8 * 1024 * 1024; // 8 MB entre todos los archivos

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

const b64u = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
const txt = (bytes) => new TextDecoder().decode(bytes);

function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Devuelve el correo verificado o lanza un error. */
async function identificar(req, env) {
  if (!env.ACCESS_TEAM || !env.ACCESS_AUD) throw Object.assign(new Error('El publicador aún no está configurado.'), { status: 503 });
  const jwt = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) throw Object.assign(new Error('Sin sesión.'), { status: 401 });

  const [h, p, s] = jwt.split('.');
  if (!h || !p || !s) throw Object.assign(new Error('Sesión inválida.'), { status: 401 });
  const cabecera = JSON.parse(txt(b64u(h)));
  const datos = JSON.parse(txt(b64u(p)));

  const emisor = `https://${env.ACCESS_TEAM}.cloudflareaccess.com`;
  const auds = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  if (datos.iss !== emisor) throw Object.assign(new Error('Emisor no válido.'), { status: 401 });
  if (!auds.includes(env.ACCESS_AUD)) throw Object.assign(new Error('Audiencia no válida.'), { status: 401 });
  if (!datos.exp || datos.exp * 1000 < Date.now()) throw Object.assign(new Error('La sesión venció. Recarga la página.'), { status: 401 });

  const claves = await (await fetch(`${emisor}/cdn-cgi/access/certs`)).json();
  const jwk = (claves.keys || []).find((k) => k.kid === cabecera.kid);
  if (!jwk) throw Object.assign(new Error('Llave de sesión desconocida.'), { status: 401 });
  const llave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const firmaOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', llave, b64u(s), new TextEncoder().encode(h + '.' + p));
  if (!firmaOk) throw Object.assign(new Error('Firma no válida.'), { status: 401 });

  const correo = String(datos.email || '').toLowerCase();
  if (!correo) throw Object.assign(new Error('Sesión sin correo.'), { status: 401 });
  if (env.EDITORES) {
    const lista = env.EDITORES.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
    if (lista.length && !lista.includes(correo)) throw Object.assign(new Error('Este correo no puede publicar.'), { status: 403 });
  }
  return correo;
}

async function subirArchivo(env, ruta, texto, correo) {
  const usuario = env.GH_USUARIO, repo = env.GH_REPO, rama = env.GH_RAMA || 'main';
  const base = `https://api.github.com/repos/${encodeURIComponent(usuario)}/${encodeURIComponent(repo)}/contents/${ruta}`;
  const cab = {
    Authorization: 'Bearer ' + env.GITHUB_TOKEN,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'clta-publicar'
  };
  let sha;
  const previo = await fetch(`${base}?ref=${encodeURIComponent(rama)}`, { headers: cab });
  if (previo.ok) sha = (await previo.json()).sha;
  else if (previo.status !== 404) throw new Error(`GitHub respondió ${previo.status} al leer ${ruta}.`);

  const r = await fetch(base, {
    method: 'PUT',
    headers: { ...cab, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Actualizar el sitio desde el panel (${correo})`,
      content: aBase64(texto),
      branch: rama,
      sha
    })
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(`No se pudo guardar ${ruta}: ${e.message || r.status}`);
  }
}

/* ───────────────────────── Visitas y mensajes (base D1) ─────────────────────────
   Públicas (sin Access):  POST /p/visita  ·  POST /p/mensaje
   Del panel (con Access): /api/resumen, /api/mensajes, /api/ajustes …            */

let tablasListas = false;
async function tablas(env) {
  if (tablasListas) return;
  if (!env.DB) throw Object.assign(new Error('Falta conectar la base de datos (D1) al publicador.'), { status: 503 });
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS visitas (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, dia TEXT, hora INTEGER, tipo TEXT, ruta TEXT, ref TEXT, vid TEXT)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS i_vis_dia ON visitas(dia, tipo)'),
    /* Un mismo dispositivo cuenta una sola vez por día (por tipo y lugar), aunque recargue o borre sus datos */
    env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS u_vis ON visitas(dia, tipo, ruta, vid)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mensajes (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER, nombre TEXT, email TEXT, telefono TEXT, motivo TEXT, mensaje TEXT, origen TEXT, estado TEXT DEFAULT \'nuevo\', nota TEXT DEFAULT \'\', reenvios TEXT DEFAULT \'[]\', ip TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS ajustes (clave TEXT PRIMARY KEY, valor TEXT)')
  ]);
  /* Bases creadas antes de existir las etiquetas: se agrega la columna una vez */
  try { await env.DB.prepare("ALTER TABLE mensajes ADD COLUMN etiqueta TEXT DEFAULT ''").run(); } catch { /* ya existe */ }
  /* Procedencia de la visita (país y ciudad aproximados que entrega Cloudflare) y huella de la conexión; no se guarda la IP */
  for (const col of ['pais', 'ciudad', 'iph']) {
    try { await env.DB.prepare(`ALTER TABLE visitas ADD COLUMN ${col} TEXT DEFAULT ''`).run(); } catch { /* ya existe */ }
  }
  tablasListas = true;
}

const recorta = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
const hoyChile = (t) => new Date(t || Date.now()).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
async function huella(texto) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const esRobot = (ua) => /bot|crawl|spider|slurp|preview|headless|monitor|curl|wget|python|facebookexternalhit/i.test(ua || '');

async function rutaPublica(req, env, url) {
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  await tablas(env);
  const c = await req.json().catch(() => null);
  if (!c || typeof c !== 'object') return json({ error: 'Datos inválidos.' }, 400);

  if (url.pathname === '/p/visita') {
    if (esRobot(req.headers.get('User-Agent'))) return json({ ok: true });
    const ruta = recorta(c.r, 120).split('?')[0] || '/';
    let ref = '';
    try { ref = c.ref ? new URL(String(c.ref)).hostname.replace(/^www\./, '').slice(0, 80) : ''; } catch { ref = ''; }
    if (ref === 'clta.cl') ref = '';
    const tipo = ['v', 'p', 's'].includes(c.tipo) ? c.tipo : 'p';
    const vid = recorta(c.v, 40);
    if (!vid) return json({ ok: true });
    const ahora = Date.now();
    const hora = parseInt(new Date(ahora).toLocaleString('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', hour12: false }), 10) % 24;
    const cf = req.cf || {};
    const iph = await huella((req.headers.get('CF-Connecting-IP') || '') + '|vis');
    /* Un mismo dispositivo o una misma conexión (IP) cuenta una sola vez cada 7 días */
    if (tipo === 'v') {
      const antes = await env.DB.prepare("SELECT 1 AS x FROM visitas WHERE tipo = 'v' AND t > ? AND (vid = ? OR (iph != '' AND iph = ?)) LIMIT 1")
        .bind(ahora - 7 * 86400000, vid, iph).first();
      if (antes) return json({ ok: true });
    }
    await env.DB.prepare('INSERT OR IGNORE INTO visitas (t, dia, hora, tipo, ruta, ref, vid, pais, ciudad, iph) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .bind(ahora, hoyChile(ahora), hora, tipo, tipo === 's' ? ruta.replace(/^.*#/, '#') : ruta, tipo === 'v' ? ref : '', vid,
        recorta(cf.country, 2), recorta(cf.city, 60), iph).run();
    return json({ ok: true });
  }

  if (url.pathname === '/p/mensaje') {
    if (c.web) return json({ ok: true });                       /* trampa para robots: el campo "web" va oculto */
    const nombre = recorta(c.nombre, 120), email = recorta(c.email, 160), mensaje = recorta(c.mensaje, 4000);
    if (!nombre || !mensaje || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'Faltan datos.' }, 400);
    const ip = await huella((req.headers.get('CF-Connecting-IP') || '') + '|clta');
    const reciente = await env.DB.prepare('SELECT COUNT(*) AS n FROM mensajes WHERE ip = ? AND t > ?').bind(ip, Date.now() - 10 * 60 * 1000).first();
    if (reciente && reciente.n >= 5) return json({ error: 'Demasiados mensajes seguidos. Intenta en unos minutos.' }, 429);
    await env.DB.prepare('INSERT INTO mensajes (t, nombre, email, telefono, motivo, mensaje, origen, ip) VALUES (?,?,?,?,?,?,?,?)')
      .bind(Date.now(), nombre, email, recorta(c.telefono, 40), recorta(c.motivo, 120), mensaje, recorta(c.origen, 120), ip).run();
    return json({ ok: true });
  }
  return json({ error: 'No encontrado.' }, 404);
}

async function rutaPanel(req, env, url) {
  await tablas(env);
  const ruta = url.pathname;

  if (ruta === '/api/resumen' && req.method === 'GET') {
    const hoy = hoyChile();
    const q = async (sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results || [];
    /* El contador se puede «reiniciar» sin borrar nada: solo se cuenta desde ese día. El historial completo queda guardado. */
    const fila = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'visitas_desde'").first();
    const base = (fila && fila.valor) || '0000-00-00';
    const desde = (d) => { const x = hoyChile(Date.now() - d * 86400000); return x > base ? x : base; };
    const V = "tipo = 'v'";
    const [tot, d30, d7, dh, uni, porDia, porHora, porSemana, paginas, secciones, origenes, ultimas, nuevos, histTot, histMes, reinicios, paises, ciudades] = await Promise.all([
      q(`SELECT COUNT(*) AS n FROM visitas WHERE ${V} AND dia >= ?`, base),
      q(`SELECT COUNT(*) AS n FROM visitas WHERE ${V} AND dia >= ?`, desde(29)),
      q(`SELECT COUNT(*) AS n FROM visitas WHERE ${V} AND dia >= ?`, desde(6)),
      q(`SELECT COUNT(*) AS n FROM visitas WHERE ${V} AND dia = ?`, hoy),
      q(`SELECT COUNT(DISTINCT vid) AS n FROM visitas WHERE ${V} AND dia >= ?`, desde(29)),
      q(`SELECT dia, COUNT(*) AS n FROM visitas WHERE ${V} AND dia >= ? GROUP BY dia ORDER BY dia`, desde(29)),
      q(`SELECT hora, COUNT(*) AS n FROM visitas WHERE ${V} AND dia >= ? GROUP BY hora ORDER BY hora`, desde(29)),
      q(`SELECT dia FROM visitas WHERE ${V} AND dia >= ?`, desde(89)),
      q("SELECT ruta, COUNT(*) AS n FROM visitas WHERE tipo = 'p' AND dia >= ? GROUP BY ruta ORDER BY n DESC LIMIT 8", desde(29)),
      q("SELECT ruta, COUNT(*) AS n FROM visitas WHERE tipo = 's' AND dia >= ? GROUP BY ruta ORDER BY n DESC LIMIT 14", desde(29)),
      q(`SELECT ref, COUNT(*) AS n FROM visitas WHERE ${V} AND dia >= ? AND ref != '' GROUP BY ref ORDER BY n DESC LIMIT 6`, desde(29)),
      q(`SELECT t, dia, hora, ruta, ref, pais, ciudad FROM visitas WHERE ${V} AND dia >= ? ORDER BY t DESC LIMIT 15`, base),
      q("SELECT COUNT(*) AS n FROM mensajes WHERE estado = 'nuevo'"),
      q(`SELECT COUNT(*) AS n, MIN(dia) AS primera FROM visitas WHERE ${V}`),
      q(`SELECT substr(dia, 1, 7) AS mes, COUNT(*) AS n FROM visitas WHERE ${V} GROUP BY mes ORDER BY mes`),
      q("SELECT valor FROM ajustes WHERE clave = 'visitas_reinicios'"),
      q(`SELECT pais, COUNT(*) AS n FROM visitas WHERE ${V} AND dia >= ? AND pais != '' GROUP BY pais ORDER BY n DESC LIMIT 8`, desde(29)),
      q(`SELECT ciudad, pais, COUNT(*) AS n FROM visitas WHERE ${V} AND dia >= ? AND ciudad != '' GROUP BY ciudad, pais ORDER BY n DESC LIMIT 8`, desde(29))
    ]);
    let lista = []; try { lista = JSON.parse((reinicios[0] && reinicios[0].valor) || '[]'); } catch { lista = []; }
    const semana = [0, 0, 0, 0, 0, 0, 0]; /* lunes a domingo */
    porSemana.forEach((r) => { const d = new Date(r.dia + 'T12:00:00Z').getUTCDay(); semana[(d + 6) % 7]++; });
    return json({ ok: true, hoy, total: tot[0].n, d30: d30[0].n, d7: d7[0].n, hoyN: dh[0].n, unicos30: uni[0].n, desdeDia: base === '0000-00-00' ? '' : base, historico: { total: histTot[0].n, primera: histTot[0].primera || '', porMes: histMes, reinicios: lista }, porDia, porHora, semana, paises, ciudades, paginas, secciones, origenes, ultimas, nuevos: nuevos[0].n });
  }

  if (ruta === '/api/mensajes' && req.method === 'GET') {
    const r = await env.DB.prepare('SELECT id, t, nombre, email, telefono, motivo, mensaje, origen, estado, nota, etiqueta, reenvios FROM mensajes ORDER BY t DESC LIMIT 500').all();
    return json({ ok: true, mensajes: (r.results || []).map((m) => ({ ...m, reenvios: (() => { try { return JSON.parse(m.reenvios); } catch { return []; } })() })) });
  }

  if (ruta === '/api/mensajes' && req.method === 'POST') {
    const correo = await identificar(req, env);
    const c = await req.json().catch(() => null);
    const id = c && parseInt(c.id, 10);
    if (!id) return json({ error: 'Falta el mensaje.' }, 400);
    if (c.accion === 'estado' && ['nuevo', 'leido', 'archivado'].includes(c.estado)) {
      await env.DB.prepare('UPDATE mensajes SET estado = ? WHERE id = ?').bind(c.estado, id).run();
    } else if (c.accion === 'etiqueta') {
      await env.DB.prepare('UPDATE mensajes SET etiqueta = ? WHERE id = ?').bind(recorta(c.etiqueta, 40), id).run();
    } else if (c.accion === 'nota') {
      await env.DB.prepare('UPDATE mensajes SET nota = ? WHERE id = ?').bind(recorta(c.nota, 1000), id).run();
    } else if (c.accion === 'reenvio') {
      const m = await env.DB.prepare('SELECT reenvios FROM mensajes WHERE id = ?').bind(id).first();
      let lista = []; try { lista = JSON.parse((m && m.reenvios) || '[]'); } catch { lista = []; }
      lista.push({ t: Date.now(), por: correo, para: recorta(c.para, 400), comentario: recorta(c.comentario, 1000) });
      await env.DB.prepare("UPDATE mensajes SET reenvios = ?, estado = CASE WHEN estado = 'nuevo' THEN 'leido' ELSE estado END WHERE id = ?").bind(JSON.stringify(lista.slice(-20)), id).run();
    } else if (c.accion === 'borrar') {
      await env.DB.prepare('DELETE FROM mensajes WHERE id = ?').bind(id).run();
    } else return json({ error: 'Acción no válida.' }, 400);
    return json({ ok: true });
  }

  if (ruta === '/api/socios' && req.method === 'GET') {
    const f = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'socios'").first();
    let v = []; try { v = JSON.parse((f && f.valor) || '[]'); } catch { v = []; }
    return json({ ok: true, socios: v });
  }
  if (ruta === '/api/socios' && req.method === 'POST') {
    await identificar(req, env);
    const c = await req.json().catch(() => null);
    if (!c || !Array.isArray(c.socios) || c.socios.length > 1500) return json({ error: 'Datos inválidos.' }, 400);
    const limpio = c.socios.map((x) => ({ id: recorta(x.id, 20), n: recorta(x.n, 80), a: recorta(x.a, 80), c: recorta(x.c, 160), m: recorta(x.m, 30), t: recorta(x.t, 30), f: recorta(x.f, 12), i: recorta(x.i, 12), e: recorta(x.e, 40), p: recorta(x.p, 40) }));
    await env.DB.prepare("INSERT INTO ajustes (clave, valor) VALUES ('socios', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").bind(JSON.stringify(limpio)).run();
    return json({ ok: true });
  }

  if (ruta === '/api/reiniciar' && req.method === 'POST') {
    const correo = await identificar(req, env);
    const c = await req.json().catch(() => null);
    const que = c && Array.isArray(c.que) ? c.que : [];
    if (que.includes('visitas')) {
      const hoyDia = hoyChile();
      const prev = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'visitas_reinicios'").first();
      let lista = []; try { lista = JSON.parse((prev && prev.valor) || '[]'); } catch { lista = []; }
      lista.push({ dia: hoyDia, por: correo });
      await env.DB.batch([
        env.DB.prepare("INSERT INTO ajustes (clave, valor) VALUES ('visitas_desde', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").bind(hoyDia),
        env.DB.prepare("INSERT INTO ajustes (clave, valor) VALUES ('visitas_reinicios', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").bind(JSON.stringify(lista.slice(-50)))
      ]);
    }
    const sentencias = {
      mensajes: "UPDATE mensajes SET estado = 'archivado'",
      socios: "DELETE FROM ajustes WHERE clave = 'socios'",
      ajustes: "DELETE FROM ajustes WHERE clave = 'panel'"
    };
    const validas = que.filter((k) => sentencias[k]);
    if (!validas.length && !que.includes('visitas')) return json({ error: 'No hay nada que reiniciar.' }, 400);
    if (validas.length) await env.DB.batch(validas.map((k) => env.DB.prepare(sentencias[k])));
    return json({ ok: true, reiniciado: que, por: correo });
  }


  if (ruta === '/api/contactos' && req.method === 'GET') {
    const f = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'contactos'").first();
    let v = { listas: [] }; try { v = JSON.parse((f && f.valor) || '{"listas":[]}'); } catch { v = { listas: [] }; }
    return json({ ok: true, contactos: v });
  }
  if (ruta === '/api/contactos' && req.method === 'POST') {
    await identificar(req, env);
    const c = await req.json().catch(() => null);
    if (!c || !c.contactos || !Array.isArray(c.contactos.listas) || c.contactos.listas.length > 30) return json({ error: 'Datos inválidos.' }, 400);
    const limpio = { listas: c.contactos.listas.map((l) => ({
      id: recorta(l.id, 30), nombre: recorta(l.nombre, 60),
      contactos: (Array.isArray(l.contactos) ? l.contactos : []).slice(0, 2000).map((x) => ({
        id: recorta(x.id, 30), nombre: recorta(x.nombre, 120), org: recorta(x.org, 120), cargo: recorta(x.cargo, 80), correo: recorta(x.correo, 160),
        celular: recorta(x.celular, 40), trato: recorta(x.trato, 80), notas: recorta(x.notas, 600), ultimo: recorta(x.ultimo, 12)
      }))
    })) };
    const txt = JSON.stringify(limpio);
    if (txt.length > 900000) return json({ error: 'Demasiado grande.' }, 413);
    await env.DB.prepare("INSERT INTO ajustes (clave, valor) VALUES ('contactos', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").bind(txt).run();
    return json({ ok: true });
  }
  if (ruta === '/api/ajustes' && req.method === 'GET') {
    const f = await env.DB.prepare("SELECT valor FROM ajustes WHERE clave = 'panel'").first();
    let v = {}; try { v = JSON.parse((f && f.valor) || '{}'); } catch { v = {}; }
    return json({ ok: true, ajustes: v });
  }
  if (ruta === '/api/ajustes' && req.method === 'POST') {
    await identificar(req, env);
    const c = await req.json().catch(() => null);
    if (!c || typeof c.ajustes !== 'object') return json({ error: 'Datos inválidos.' }, 400);
    const txt = JSON.stringify(c.ajustes);
    if (txt.length > 20000) return json({ error: 'Demasiado grande.' }, 413);
    await env.DB.prepare("INSERT INTO ajustes (clave, valor) VALUES ('panel', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor").bind(txt).run();
    return json({ ok: true });
  }
  return null;
}


/* ───────────────────────── Historial de cambios de la página ─────────────────────────
   Lee de GitHub las últimas publicaciones del panel (data/contenido.json) y cuenta qué cambió en cada una. */
const NOMBRES_SECCION = {
  identidad: 'Nombre y lema del club', contacto: 'Teléfono y correo', redes: 'Redes sociales', formulario: 'Cuadro para escribirnos',
  noticias: 'Noticias', causas: 'Causas', sellos: 'Franja azul de respaldo', impacto: 'Números del club', proyectos: 'Trabajo en terreno',
  articulos: 'Blog', valores: 'Valores', directiva: 'Directiva', testimonios: 'Testimonios', faq: 'Preguntas frecuentes',
  donaEventos: 'Actividades solidarias', donaOps: 'Cómo ayudar', clubFirma: 'Firma del club', agenda: 'Agenda', textos: 'Textos de la página',
  donaciones: 'Cuenta para donar', pie: 'Final de la página', unete: 'Invitación a ser socio', quienes: 'Quiénes somos', portada: 'Portada'
};
const nombreDe = (x) => String((x && (x.titulo || x.nombre || x.etiqueta || x.pregunta || x.id)) || 'sin título').slice(0, 60);
function describirCambios(antes, despues) {
  const out = [];
  const A = antes || {}, D = despues || {};
  const claves = new Set([...Object.keys(A), ...Object.keys(D)]);
  claves.delete('actualizado');
  for (const k of claves) {
    const a = A[k], d = D[k];
    if (JSON.stringify(a) === JSON.stringify(d)) continue;
    const nom = NOMBRES_SECCION[k] || k;
    if (Array.isArray(a) || Array.isArray(d)) {
      const la = Array.isArray(a) ? a : [], ld = Array.isArray(d) ? d : [];
      const ta = la.map(nombreDe), td = ld.map(nombreDe);
      const nuevos = td.filter((t) => !ta.includes(t)), quitados = ta.filter((t) => !td.includes(t));
      if (nuevos.length) out.push(`${nom}: se agregó «${nuevos[0]}»${nuevos.length > 1 ? ` y ${nuevos.length - 1} más` : ''}`);
      if (quitados.length) out.push(`${nom}: se quitó «${quitados[0]}»${quitados.length > 1 ? ` y ${quitados.length - 1} más` : ''}`);
      if (!nuevos.length && !quitados.length) out.push(`${nom}: se cambió un texto o una foto`);
    } else if (a && d && typeof a === 'object' && typeof d === 'object') {
      if (k === 'agenda') {
        const sub = describirCambios({ eventos: a.eventos }, { eventos: d.eventos }).map((x) => x.replace(/^eventos/, 'Agenda'));
        if (sub.length) out.push(...sub);
        if (JSON.stringify({ ...a, eventos: 0 }) !== JSON.stringify({ ...d, eventos: 0 })) out.push('Agenda: se cambió la sesión o la configuración');
      } else {
        const subs = [...new Set([...Object.keys(a), ...Object.keys(d)])].filter((x) => JSON.stringify(a[x]) !== JSON.stringify(d[x]));
        const nombres = subs.map((x) => NOMBRES_SECCION[x] || x).slice(0, 3).join(', ');
        out.push(`${nom}: se cambió ${nombres || 'un texto'}${subs.length > 3 ? ' y más' : ''}`);
      }
    } else out.push(`${nom}: se cambió`);
  }
  return out;
}

async function historialPagina(env) {
  if (!env.GITHUB_TOKEN || !env.GH_USUARIO || !env.GH_REPO) return json({ error: 'El publicador no tiene su llave de GitHub.' }, 503);
  const base = `https://api.github.com/repos/${encodeURIComponent(env.GH_USUARIO)}/${encodeURIComponent(env.GH_REPO)}`;
  const cab = { Authorization: 'Bearer ' + env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'clta-publicar' };
  const rama = env.GH_RAMA || 'main';
  const r = await fetch(`${base}/commits?sha=${encodeURIComponent(rama)}&path=data/contenido.json&per_page=12`, { headers: cab });
  if (!r.ok) return json({ error: 'No se pudo leer el historial (GitHub respondió ' + r.status + ').' }, 502);
  const commits = await r.json();
  const leer = async (sha) => {
    if (!sha) return null;
    const x = await fetch(`https://api.github.com/repos/${encodeURIComponent(env.GH_USUARIO)}/${encodeURIComponent(env.GH_REPO)}/contents/data/contenido.json?ref=${sha}`, { headers: { ...cab, Accept: 'application/vnd.github.raw+json' } });
    if (!x.ok) return null;
    try { return JSON.parse(await x.text()); } catch { return null; }
  };
  const items = await Promise.all(commits.slice(0, 10).map(async (c) => {
    const msg = (c.commit && c.commit.message || '').split('\n')[0];
    const quien = (msg.match(/\(([^)]+@[^)]+)\)/) || [])[1] || '';
    const [nuevo, previo] = await Promise.all([leer(c.sha), leer(c.parents && c.parents[0] && c.parents[0].sha)]);
    const cambios = nuevo && previo ? describirCambios(previo, nuevo) : [];
    return { fecha: c.commit && c.commit.author && c.commit.author.date, quien, mensaje: msg, cambios: cambios.slice(0, 8) };
  }));
  return json({ ok: true, items });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/p/')) return await rutaPublica(req, env, url);
      if (url.pathname === '/api/resumen' || url.pathname === '/api/mensajes' || url.pathname === '/api/ajustes' || url.pathname === '/api/socios' || url.pathname === '/api/contactos') {
        await identificar(req, env);
        const r = await rutaPanel(req, env, url);
        if (r) return r;
      }
      if (url.pathname === '/api/historial' && req.method === 'GET') {
        await identificar(req, env);
        return await historialPagina(env);
      }
      if (url.pathname === '/api/sesion' && req.method === 'GET') {
        return json({ ok: true, email: await identificar(req, env) });
      }

      if (url.pathname === '/api/publicar' && req.method === 'POST') {
        const correo = await identificar(req, env);
        if (!env.GITHUB_TOKEN || !env.GH_USUARIO || !env.GH_REPO) return json({ error: 'El publicador no tiene su llave de GitHub.' }, 503);

        const cuerpo = await req.json().catch(() => null);
        const archivos = cuerpo && Array.isArray(cuerpo.archivos) ? cuerpo.archivos : null;
        if (!archivos || !archivos.length) return json({ error: 'No llegaron archivos.' }, 400);

        let total = 0;
        for (const a of archivos) {
          if (!a || typeof a.ruta !== 'string' || typeof a.texto !== 'string') return json({ error: 'Archivo mal formado.' }, 400);
          if (!PERMITIDOS.includes(a.ruta)) return json({ error: `Ruta no permitida: ${a.ruta}` }, 400);
          total += a.texto.length;
          try { JSON.parse(a.texto); } catch { return json({ error: `${a.ruta} no es un JSON válido.` }, 400); }
        }
        if (total > MAX_TOTAL) return json({ error: 'Los cambios pesan demasiado. Reduce las fotos.' }, 413);

        for (const a of archivos) await subirArchivo(env, a.ruta, a.texto, correo);
        return json({ ok: true, email: correo, archivos: archivos.length });
      }

      return json({ error: 'No encontrado.' }, 404);
    } catch (e) {
      return json({ error: e.message || 'Error inesperado.' }, e.status || 500);
    }
  }
};
