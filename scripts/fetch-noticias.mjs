#!/usr/bin/env node
/* =========================================================================
   FETCH-NOTICIAS.MJS
   -------------------------------------------------------------------------
   Lee las fuentes oficiales de Lions y la prensa que cubre a los Clubes de
   Leones en Chile, y escribe  data/noticias.json  que consume la web.

   Uso:
     npm run noticias
     node scripts/fetch-noticias.mjs

   Sin dependencias: sólo Node 18+ (fetch nativo).
   ========================================================================= */

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ    = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SALIDA  = resolve(RAIZ, 'data/noticias.json');
const MAXIMO  = 24;                       // cuántas noticias guardar
const UA      = 'Mozilla/5.0 (compatible; LeonesAntumalalBot/1.0; +https://clta.cl)';

/* -------------------------------------------------------------------------
   FUENTES
   - tipo "oficial": publicaciones de Lions Clubs International
   - tipo "prensa" : medios que informan sobre Clubes de Leones en Chile
   Puedes agregar o quitar fuentes libremente.
   ------------------------------------------------------------------------- */
const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=CL&ceid=CL:es-419`;

const FUENTES = [
  {
    nombre: 'Distrito T4',
    tipo:   'oficial',
    url:    'https://leonest4.cl/noticias',
    limite: 8,
    custom: 'leonest4'
  },
  {
    nombre: 'LION Magazine',
    tipo:   'oficial',
    url:    'https://www.lionmagazine.org/feed',
    limite: 6,
    idioma: 'en'
  },
  {
    nombre: 'Prensa · Temuco y La Araucanía',
    tipo:   'prensa',
    url:    gnews('"club de leones" (Temuco OR Araucanía OR Antumalal)'),
    limite: 8
  },
  {
    nombre: 'Prensa · Chile',
    tipo:   'prensa',
    url:    gnews('"club de leones" Chile'),
    limite: 8
  },
  {
    nombre: 'Prensa · Leonismo',
    tipo:   'prensa',
    url:    gnews('leonismo OR "clubes de leones" Chile'),
    limite: 6
  }
];

/* Sólo se publican notas de prensa que realmente hablen del leonismo:
   Google News devuelve coincidencias por nombre de calles, escuelas, etc. */
const RELEVANTE = /\bleon(es|ismo|ístic)|\blions?\b/i;

/* ---------- utilidades de parseo (sin librerías) ---------- */
const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', iquest: '¿', iexcl: '¡',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…',
  mdash: '—', ndash: '–', laquo: '«', raquo: '»', deg: '°'
};

function decodificar(s = '') {
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n] ?? ENTIDADES[n.toLowerCase()] ?? m);
}

const sinEtiquetas = (s = '') =>
  decodificar(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function etiqueta(bloque, nombre) {
  const re = new RegExp(`<${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</${nombre}>`, 'i');
  const m = bloque.match(re);
  if (!m) return '';
  return decodificar(m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')).trim();
}

function atributo(bloque, nombre, attr) {
  const m = bloque.match(new RegExp(`<${nombre}[^>]*\\s${attr}=["']([^"']+)["']`, 'i'));
  return m ? decodificar(m[1]) : '';
}

function imagenDe(bloque) {
  return atributo(bloque, 'media:content', 'url')
      || atributo(bloque, 'media:thumbnail', 'url')
      || atributo(bloque, 'enclosure', 'url')
      || (bloque.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1]
      || '';
}

/* ---------- traducción (fuentes en inglés, ej. LION Magazine) ---------- */
async function traducir(texto, destino = 'es') {
  if (!texto) return texto;
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${destino}&dt=t&q=${encodeURIComponent(texto)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return texto;
    const datos = await r.json();
    const traducido = (datos[0] || []).map((seg) => seg[0]).join('');
    return traducido || texto;
  } catch (e) {
    console.warn(`  ! No se pudo traducir "${texto.slice(0, 40)}…": ${e.message}`);
    return texto;
  }
}

/* ---------- descarga con reintentos ---------- */
async function traer(url, intentos = 2) {
  for (let i = 0; i <= intentos; i++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml, */*' },
        signal: ctrl.signal
      });
      clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i === intentos) throw e;
      await new Promise((r) => setTimeout(r, 900 * (i + 1)));
    }
  }
}


/* ---------- Distrito T4 (leonest4.cl): no tiene RSS, se leen sus páginas ---------- */
const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

async function leerLeonesT4(f) {
  const base = 'https://leonest4.cl';
  const listado = await traer(f.url);
  const slugs = [...new Set([...listado.matchAll(/href="\/noticias\/([a-z0-9-]+)"/gi)].map((m) => m[1]))].slice(0, f.limite || 8);

  const items = await Promise.all(slugs.map(async (slug) => {
    try {
      const html = await traer(`${base}/noticias/${slug}`);
      const titulo = decodificar((html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '')
        .replace(/\s+[—-]\s+Distrito T4\s*$/i, '').trim();
      const resumen = decodificar((html.match(/<meta name="description" content="([^"]*)"/i) || [])[1] || '').slice(0, 230);
      const d = html.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
      const mes = d ? MESES_ES.indexOf(d[2].toLowerCase()) : -1;
      const fecha = d && mes >= 0 ? new Date(Date.UTC(+d[3], mes, +d[1], 12)) : new Date();
      const img = (html.match(/<img[^>]+src="(\/uploads\/[^"]+)"/i) || [])[1];
      return {
        titulo,
        resumen,
        enlace: `${base}/noticias/${slug}`,
        fecha: fecha.toISOString(),
        fuente: 'Distrito T4',
        tipo: f.tipo,
        imagen: img ? base + img : ''
      };
    } catch {
      return null;
    }
  }));
  return items.filter((n) => n && n.titulo);
}

/* ---------- procesar una fuente ---------- */
async function leerFuente(f) {
  if (f.custom === 'leonest4') return leerLeonesT4(f);
  const xml = await traer(f.url);
  const bloques = xml.match(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi) || [];

  return Promise.all(bloques.slice(0, f.limite || 6).map(async (b) => {
    const bruto = etiqueta(b, 'title');
    const medioRss = etiqueta(b, 'source');

    // Google News escribe el título como "Titular - Medio"
    const esGoogle = f.url.includes('news.google.com');
    let titulo = bruto;
    let medio  = medioRss || f.nombre;

    if (esGoogle) {
      // 1) si conocemos el medio por <source>, se recorta ese sufijo exacto
      if (medioRss && titulo.toLowerCase().endsWith(' - ' + medioRss.toLowerCase())) {
        titulo = titulo.slice(0, -(medioRss.length + 3));
      } else {
        // 2) si no, se corta por el último " - " siempre que quede titular
        const corte = titulo.lastIndexOf(' - ');
        if (corte > 20) { medio = medioRss || titulo.slice(corte + 3); titulo = titulo.slice(0, corte); }
      }
    }

    const desc = sinEtiquetas(etiqueta(b, 'description') || etiqueta(b, 'summary') || etiqueta(b, 'content'));
    // en Google News la descripción sólo repite el titular: se descarta
    let resumen = (!esGoogle && desc.length > 50) ? desc : '';

    // fuentes en inglés (ej. LION Magazine): se traducen antes de publicar
    if (f.idioma === 'en') {
      titulo = await traducir(titulo);
      if (resumen) resumen = await traducir(resumen);
    }
    resumen = resumen.slice(0, 230);

    const enlace = etiqueta(b, 'link') || atributo(b, 'link', 'href');
    const fechaTxt = etiqueta(b, 'pubDate') || etiqueta(b, 'published') || etiqueta(b, 'updated');
    const fecha = new Date(fechaTxt);

    return {
      titulo: titulo.trim(),
      resumen,
      enlace: enlace.trim(),
      fecha: (isNaN(fecha) ? new Date() : fecha).toISOString(),
      fuente: (medio || f.nombre).trim().slice(0, 34),
      tipo: f.tipo,
      imagen: imagenDe(b)
    };
  })).then((items) => items.filter((n) =>
    n.titulo && n.enlace &&
    (n.tipo !== 'prensa' || RELEVANTE.test(n.titulo))
  ));
}

/* ---------- fotos: toda noticia lleva una ---------- */
const RESPALDO = 'assets/img/noticias-respaldo.jpg';
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// Google Noticias entrega un enlace intermedio: se resuelve al de la nota original.
async function resolverGoogle(enlace) {
  const id = enlace.split('/articles/')[1]?.split('?')[0];
  if (!id) return '';
  const r = await fetch(`https://news.google.com/articles/${id}?hl=es-419&gl=CL&ceid=CL:es-419`,
    { headers: { 'User-Agent': NAVEGADOR }, signal: AbortSignal.timeout(12000) });
  const html = await r.text();
  const sg = (html.match(/data-n-a-sg="([^"]+)"/) || [])[1];
  const ts = (html.match(/data-n-a-ts="([^"]+)"/) || [])[1];
  if (!sg || !ts) return '';
  const carga = ['Fbv4je', JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, Number(ts), sg]), null, 'generic'];
  const rr = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': NAVEGADOR },
    body: 'f.req=' + encodeURIComponent(JSON.stringify([[carga]])),
    signal: AbortSignal.timeout(12000)
  });
  const m = (await rr.text()).match(/garturlres\\",\\"(https?:[^\\]+)/);
  return m ? m[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&') : '';
}

async function fotoDeNota(url) {
  const r = await fetch(url, { headers: { 'User-Agent': NAVEGADOR }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  const h = await r.text();
  const m = h.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']/i)
         || h.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  const img = m && decodificar(m[1]);
  return img && /^https?:/i.test(img) ? img : '';
}

// A cada noticia sin foto se le busca la de la nota original; si no hay, va la imagen del club.
async function completarFotos(noticias, previas) {
  const conocidas = new Map((previas || []).filter((p) => p.imagen && p.imagen !== RESPALDO).map((p) => [p.enlace, p.imagen]));
  let encontradas = 0, respaldo = 0;
  for (const n of noticias) {
    if (n.imagen) continue;
    if (conocidas.has(n.enlace)) { n.imagen = conocidas.get(n.enlace); continue; }
    try {
      const destino = n.enlace.includes('news.google.com') ? await resolverGoogle(n.enlace) : n.enlace;
      if (destino && !/instagram\.com|facebook\.com/i.test(destino)) n.imagen = await fotoDeNota(destino);
    } catch { /* se usa la imagen de respaldo */ }
    if (n.imagen) encontradas++; else { n.imagen = RESPALDO; respaldo++; }
  }
  console.log(`   fotos: ${encontradas} halladas en la nota original, ${respaldo} con la imagen del club`);
}

/* ---------- principal ---------- */
(async () => {
  console.log('Consultando fuentes de noticias…\n');

  const resultados = await Promise.allSettled(FUENTES.map(leerFuente));

  let noticias = [];
  resultados.forEach((r, i) => {
    const f = FUENTES[i];
    if (r.status === 'fulfilled') {
      console.log(`  ✓ ${f.nombre.padEnd(32)} ${r.value.length} publicaciones`);
      noticias.push(...r.value);
    } else {
      console.warn(`  ✗ ${f.nombre.padEnd(32)} ${r.reason?.message || r.reason}`);
    }
  });

  // Deduplicar por enlace y por titular
  const vistos = new Set();
  noticias = noticias.filter((n) => {
    const clave = n.titulo.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/gi, '').slice(0, 70);
    if (vistos.has(n.enlace) || vistos.has(clave)) return false;
    vistos.add(n.enlace); vistos.add(clave);
    return true;
  });

  noticias.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  noticias = noticias.slice(0, MAXIMO);

  let previas = [];
  try { previas = JSON.parse(await readFile(SALIDA, 'utf8')).noticias || []; } catch { /* primera vez */ }
  await completarFotos(noticias, previas);

  if (!noticias.length) {
    console.error('\nNo se obtuvo ninguna noticia. Se conserva el archivo anterior.');
    process.exit(1);
  }

  const salida = {
    generado: new Date().toISOString(),
    total: noticias.length,
    fuentes: FUENTES.map(({ nombre, tipo, url }) => ({ nombre, tipo, url })),
    noticias
  };

  await mkdir(dirname(SALIDA), { recursive: true });

  // Si no hubo cambios reales, no reescribir (evita commits vacíos en CI)
  try {
    const previo = JSON.parse(await readFile(SALIDA, 'utf8'));
    const igual = JSON.stringify(previo.noticias) === JSON.stringify(noticias);
    if (igual) {
      console.log('\nSin cambios respecto de la última ejecución.');
      return;
    }
  } catch { /* no existía */ }

  await writeFile(SALIDA, JSON.stringify(salida, null, 2) + '\n', 'utf8');

  const oficiales = noticias.filter((n) => n.tipo === 'oficial').length;
  console.log(`\n${noticias.length} noticias guardadas en data/noticias.json`);
  console.log(`   ${oficiales} oficiales · ${noticias.length - oficiales} de prensa`);
})().catch((e) => {
  console.error('\nError:', e.message);
  process.exit(1);
});
