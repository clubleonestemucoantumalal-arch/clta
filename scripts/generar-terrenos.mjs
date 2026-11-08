/* Genera una página real (HTML estático) para cada proyecto de «Lo que hacemos en terreno».
 *
 * ¿Para qué? Google lee mucho mejor una página con su propio título, descripción, texto y fotos
 * que una página armada con JavaScript. Cada historia queda así como una página propia:
 *    https://clta.cl/terreno/<nombre-de-la-historia>.html
 * con datos estructurados (schema.org), foto para compartir y enlaces a las demás historias.
 *
 * También actualiza sitemap.xml y escribe terreno/index.html (el archivo completo, por mes).
 * Se ejecuta solo en GitHub (.github/workflows/terrenos.yml) cada vez que el panel publica.
 * A mano:  node scripts/generar-terrenos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITIO = 'https://clta.cl';
const CLUB = 'Club de Leones Temuco Antumalal';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const leer = (r) => fs.readFileSync(path.join(RAIZ, r), 'utf8');
const D = JSON.parse(leer('data/contenido.json'));
const IMGS = JSON.parse(leer('data/imagenes.json'));

/* ───────── utilidades ───────── */
const plano = (s) => String(s == null ? '' : s)
  .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/\s+/g, ' ').trim();
const esc = (s) => plano(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slug = (s) => plano(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const idDe = (p) => p.id || slug(p.titulo);
const fechaLarga = (f) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || ''); return m ? `${+m[3]} de ${MESES[+m[2] - 1]} de ${m[1]}` : ''; };
const mesAnio = (f) => { const m = /^(\d{4})-(\d{2})/.exec(f || ''); return m ? `${MESES[+m[2] - 1]} ${m[1]}` : ''; };
const corta = (t, n) => { t = plano(t); if (t.length <= n) return t; const c = t.slice(0, n - 1); return c.slice(0, c.lastIndexOf(' ') > 60 ? c.lastIndexOf(' ') : n - 1).replace(/[,.;:\s]+$/, '') + '…'; };

/* Las fotos subidas desde el panel viven dentro de imagenes.json (en base64): se guardan como archivos para poder usarlas en HTML y en Google. */
function archivoDeFoto(ref) {
  ref = String(ref || '').trim();
  if (!ref) return '';
  if (ref.startsWith('img:')) {
    const clave = ref.slice(4), dato = IMGS[clave];
    const m = typeof dato === 'string' && /^data:image\/(\w+);base64,(.+)$/s.exec(dato);
    if (!m) return '';
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const rel = `assets/img/proyectos/gen/${slug(clave)}.${ext}`;
    const destino = path.join(RAIZ, rel);
    const buf = Buffer.from(m[2], 'base64');
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    if (!fs.existsSync(destino) || fs.statSync(destino).size !== buf.length) fs.writeFileSync(destino, buf);
    return rel;
  }
  if (/assets\/img\/fotos\/.*\.svg$/i.test(ref)) return '';   /* marcador de «sin foto» */
  if (/^https?:/i.test(ref)) return ref;
  return ref.replace(/^\//, '').replace(/\?.*$/, '');
}
const urlFoto = (rel) => (/^https?:/i.test(rel) ? rel : `${SITIO}/${rel}`);

/* Estilos: se toman de trabajo.html para que las páginas nuevas se vean igual */
const html0 = leer('trabajo.html');
const ESTILO = (/<style>([\s\S]*?)<\/style>/.exec(html0) || [, ''])[1];
const FUENTES = (/<link href="(https:\/\/fonts\.googleapis\.com[^"]+)"/.exec(html0) || [, ''])[1];

const proyectos = (D.proyectos || []).filter((p) => p && p.titulo).slice()
  .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
const usados = new Set();
proyectos.forEach((p) => { let s = idDe(p) || 'historia', k = s, n = 2; while (usados.has(k)) k = `${s}-${n++}`; usados.add(k); p.__slug = k; });

const SOBRE = 'El Club de Leones Temuco Antumalal es una organización de servicio voluntario, fundada en 1983 en Temuco (La Araucanía) y parte de Lions Clubs International. Trabajamos en salud, niñez, adultos mayores y apoyo a familias vulnerables.';

/* ───────── cabecera y pie comunes ───────── */
function cabeza({ titulo, descripcion, canonica, imagen, tipo = 'article', json }) {
  return `<!DOCTYPE html>
<html lang="es-CL">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${canonica}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="${tipo}">
<meta property="og:site_name" content="${CLUB}">
<meta property="og:locale" content="es_CL">
<meta property="og:url" content="${canonica}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:image" content="${imagen}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${imagen}">
<meta name="theme-color" content="#030A1F">
<link rel="icon" href="/assets/img/lions-international.png" type="image/png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FUENTES}" rel="stylesheet">
<script type="application/ld+json">${JSON.stringify(json)}</script>
<style>${ESTILO}
  .hero--simple { min-height: 0; background: #0B2260; } .hero--simple .hero__txt { padding-top: clamp(6rem, 14vh, 8rem); }
  .meses h2 { font: 400 clamp(1.6rem, 3vw, 2.2rem)/1 var(--f-tit); color: #fff; margin: 2rem 0 1rem; }
  .meses small { font: 600 .8rem/1 var(--f-txt); letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.6); margin-left: .6rem; }
  .sobre { padding: 1.4rem 0 2.4rem; font-size: 1rem; color: rgba(255,255,255,.75); }
</style>
</head>
<body>
<header class="barra">
  <a class="barra__marca" href="/" aria-label="${CLUB}, inicio">
    <img src="/assets/img/lions-international.png" alt="" width="48" height="48"><span>Leones Temuco Antumalal</span>
  </a>
  <a class="pill" href="/terreno/">&larr; Todo el trabajo en terreno</a>
</header>
`;
}
const pie = `<footer><div class="wrap"><span>${CLUB} · Distrito T-4 · Nosotros Servimos</span><a href="/">Ir al sitio principal</a></div></footer>
<script src="/assets/js/visitas.js?v=2" defer></script>
</body>
</html>
`;

/* ───────── una página por proyecto ───────── */
function paginaProyecto(p, i) {
  const titulo = plano(p.titulo);
  const url = `${SITIO}/terreno/${p.__slug}.html`;
  const fotos = [p.imagen, p.foto2, p.foto3, p.foto4].map(archivoDeFoto).filter(Boolean);
  const resumen = plano(p.texto) || corta(p.cuerpo, 150);
  const descripcion = corta(`${resumen} ${CLUB}, Temuco.`, 158);
  const tituloPag = `${titulo} | ${titulo.length > 38 ? 'Leones Temuco Antumalal' : CLUB}`;
  const parrafos = String(p.cuerpo || p.texto || '').split(/\n\s*\n/).map(plano).filter(Boolean);
  const cifras = [];
  if (p.personas) cifras.push([plano(p.personas), 'Personas beneficiadas']);
  if (p.fecha) cifras.push([fechaLarga(p.fecha), 'Fecha']);
  if (p.lugar) cifras.push([plano(p.lugar), 'Lugar']);
  const otros = proyectos.filter((x) => x !== p).slice(0, 3);
  const imagenOg = fotos[0] ? urlFoto(fotos[0]) : `${SITIO}/assets/img/compartir.jpg`;

  const json = [
    {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: corta(titulo, 110), description: resumen, inLanguage: 'es-CL',
      ...(p.fecha ? { datePublished: p.fecha, dateModified: p.fecha } : {}),
      image: fotos.length ? fotos.map(urlFoto) : [imagenOg],
      mainEntityOfPage: url,
      author: { '@type': 'Organization', name: CLUB, url: `${SITIO}/` },
      publisher: { '@type': 'Organization', name: CLUB, logo: { '@type': 'ImageObject', url: `${SITIO}/assets/img/lions-international.png` } },
      ...(p.tag ? { about: plano(p.tag) } : {}),
      ...(p.lugar ? { contentLocation: { '@type': 'Place', name: plano(p.lugar), address: { '@type': 'PostalAddress', addressRegion: 'La Araucanía', addressCountry: 'CL' } } } : {})
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITIO}/` },
        { '@type': 'ListItem', position: 2, name: 'Trabajo en terreno', item: `${SITIO}/terreno/` },
        { '@type': 'ListItem', position: 3, name: titulo, item: url }
      ]
    }
  ];

  let h = cabeza({ titulo: tituloPag, descripcion, canonica: url, imagen: imagenOg, json });
  h += `<main>
<section class="hero${fotos[0] ? '' : ' hero--simple'}">
${fotos[0] ? `  <div class="hero__img"><img src="/${fotos[0].replace(/^\//, '')}" alt="${esc(titulo)}" fetchpriority="high"></div>\n` : ''}  <div class="hero__txt wrap">
    <div class="chips">${p.fecha ? `<span class="chip">${esc(mesAnio(p.fecha))}</span>` : ''}${p.tag ? `<span class="chip chip--l">${esc(plano(p.tag).replace(/^[^·]*·\s*/, '') || p.tag)}</span>` : ''}</div>
    <h1>${esc(titulo)}</h1>
    <p class="hero__bajada">${esc(resumen)}</p>
  </div>
</section>
`;
  if (cifras.length) h += `<div class="wrap"><div class="cifras">${cifras.map(([a, b]) => `<div class="cifra"><b>${esc(a)}</b><span>${b}</span></div>`).join('')}</div></div>\n`;
  const mitad = Math.ceil(parrafos.length / 2);
  h += `<article class="relato estrecho">\n${parrafos.map((t, k) => `<p>${esc(t)}</p>${k === mitad - 1 && p.cita && parrafos.length > 2 ? `\n<blockquote class="cita">${esc(p.cita)}</blockquote>` : ''}`).join('\n')}\n</article>\n`;
  if (fotos.length > 1) {
    h += `<section class="galeria wrap"><h2>Así se vivió</h2><div class="galeria__rej">\n${fotos.slice(1).map((f) => `<a class="foto" href="/${f.replace(/^\//, '')}" target="_blank" rel="noopener"><img src="/${f.replace(/^\//, '')}" alt="Foto de ${esc(titulo)}" loading="lazy"></a>`).join('\n')}\n</div></section>\n`;
  }
  h += `<div class="estrecho sobre"><p>${SOBRE}</p></div>
<section class="unete estrecho"><div><h2>¿Quieres ser parte de esto?</h2><p>Hacemos este trabajo con voluntarios como tú.</p></div><a class="btn" href="/#unete">Súmate al club</a></section>
`;
  if (otros.length) {
    h += `<section class="mas"><div class="wrap"><h2>Más trabajo en terreno</h2><div class="mas__rej">\n${otros.map((o) => {
      const fo = archivoDeFoto(o.imagen);
      return `<a class="mini" href="/terreno/${o.__slug}.html">${fo ? `<div class="mini__img"><img src="/${fo.replace(/^\//, '')}" alt="" loading="lazy"></div>` : ''}<div class="mini__c">${o.fecha ? `<small>${esc(mesAnio(o.fecha))}</small>` : ''}<h3>${esc(o.titulo)}</h3></div></a>`;
    }).join('\n')}\n</div><div class="mas__todo"><a class="btn" href="/terreno/">Ver todo el archivo</a><a class="btn btn--l" href="/#proyectos">Volver al sitio</a></div></div></section>\n`;
  }
  h += `</main>\n` + pie;
  return h;
}

/* ───────── archivo completo: /terreno/ ───────── */
function paginaIndice() {
  const url = `${SITIO}/terreno/`;
  const grupos = new Map();
  proyectos.forEach((p) => { const k = /^\d{4}-\d{2}/.exec(p.fecha || '')?.[0] || 'sin-fecha'; (grupos.get(k) || grupos.set(k, []).get(k)).push(p); });
  const claves = [...grupos.keys()].filter((k) => k !== 'sin-fecha').sort().reverse();
  if (grupos.has('sin-fecha')) claves.push('sin-fecha');
  const descripcion = `Todo lo que hacemos en terreno: operativos de salud, ayuda a familias, adultos mayores, niñez y comunidad. ${CLUB}, Temuco.`;
  const json = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: `Trabajo en terreno · ${CLUB}`, url, description: descripcion, inLanguage: 'es-CL',
      isPartOf: { '@type': 'WebSite', name: CLUB, url: `${SITIO}/` } },
    { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: proyectos.map((p, k) => ({ '@type': 'ListItem', position: k + 1, url: `${SITIO}/terreno/${p.__slug}.html`, name: plano(p.titulo) })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITIO}/` }, { '@type': 'ListItem', position: 2, name: 'Trabajo en terreno', item: url }] }
  ];
  let h = cabeza({ titulo: `Trabajo en terreno | ${CLUB}`, descripcion, canonica: url, imagen: `${SITIO}/assets/img/compartir.jpg`, tipo: 'website', json });
  h += `<main>
<section class="hero hero--simple"><div class="hero__txt wrap"><div class="chips"><span class="chip">${proyectos.length} historias</span></div>
<h1>Lo que hacemos en terreno</h1>
<p class="hero__bajada">Operativos de salud, ayuda a familias, adultos mayores, niñez y comunidad. El trabajo del ${CLUB}, contado por quienes lo hacemos.</p></div></section>
<section class="mas meses"><div class="wrap">\n`;
  claves.forEach((k) => {
    const lista = grupos.get(k);
    const nombre = k === 'sin-fecha' ? 'Otras actividades' : mesAnio(k + '-01');
    h += `<h2 style="color:#08163F">${esc(nombre)}<small style="color:#8a6d00">${lista.length} ${lista.length === 1 ? 'actividad' : 'actividades'}</small></h2><div class="mas__rej">\n`;
    lista.forEach((o) => {
      const fo = archivoDeFoto(o.imagen);
      h += `<a class="mini" href="/terreno/${o.__slug}.html">${fo ? `<div class="mini__img"><img src="/${fo.replace(/^\//, '')}" alt="" loading="lazy"></div>` : ''}<div class="mini__c">${o.tag ? `<small>${esc(o.tag)}</small>` : ''}<h3>${esc(o.titulo)}</h3><p style="font-size:.95rem;color:#3B4A76">${esc(corta(o.texto, 130))}</p></div></a>\n`;
    });
    h += `</div>\n`;
  });
  h += `</div></section>\n</main>\n` + pie;
  return h;
}

/* ───────── escribir todo ───────── */
const dirT = path.join(RAIZ, 'terreno');
fs.mkdirSync(dirT, { recursive: true });
const esperados = new Set(['index.html']);
proyectos.forEach((p, i) => { fs.writeFileSync(path.join(dirT, `${p.__slug}.html`), paginaProyecto(p, i)); esperados.add(`${p.__slug}.html`); });
fs.writeFileSync(path.join(dirT, 'index.html'), paginaIndice());
/* si un proyecto se elimina en el panel, su página también se retira */
fs.readdirSync(dirT).filter((f) => f.endsWith('.html') && !esperados.has(f)).forEach((f) => fs.unlinkSync(path.join(dirT, f)));

/* sitemap: se reemplazan solo las páginas de terreno; lo demás queda igual */
let mapa = leer('sitemap.xml');
mapa = mapa.replace(/\s*<url>\s*<loc>https:\/\/clta\.cl\/trabajo\.html\?id=[^<]*<\/loc>[\s\S]*?<\/url>/g, '');
mapa = mapa.replace(/\s*<!-- terrenos:inicio -->[\s\S]*?<!-- terrenos:fin -->/, '');
const bloque = ['  <!-- terrenos:inicio -->',
  `  <url>\n    <loc>${SITIO}/terreno/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`,
  ...proyectos.map((p) => `  <url>\n    <loc>${SITIO}/terreno/${p.__slug}.html</loc>${/^\d{4}-\d{2}-\d{2}/.test(p.fecha || '') ? `\n    <lastmod>${p.fecha.slice(0, 10)}</lastmod>` : ''}\n    <priority>0.6</priority>\n  </url>`),
  '  <!-- terrenos:fin -->'].join('\n');
mapa = mapa.replace('</urlset>', bloque + '\n</urlset>');
fs.writeFileSync(path.join(RAIZ, 'sitemap.xml'), mapa);

console.log(`Páginas de terreno: ${proyectos.length} + índice. Sitemap actualizado.`);
