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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
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
