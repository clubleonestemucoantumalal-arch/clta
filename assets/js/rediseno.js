/* =========================================================================
   REDISENO.JS — "LA MELENA"
   -------------------------------------------------------------------------
   Lee el mismo contenido que el resto del sitio (data/contenido.json, el que
   escribe el panel admin.html), dibuja todas las secciones y les da vida:
   scroll suave (Lenis), animaciones (GSAP + ScrollTrigger) y la escena 3D
   de partículas (rediseno-gl.js).

   Si una librería no carga, la página se ve igual: todos los estados
   iniciales de las animaciones los pone JavaScript, nunca el CSS.
   ========================================================================= */
(() => {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const MOV_RED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PUNTERO_FINO = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const G = window.gsap;
  const HAY_GSAP = !!G;

  /* ═══════════════ UTILIDADES ═══════════════ */
  const texto = (v) => String(v == null ? '' : v);
  const esc = (v) => texto(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Solo se permiten etiquetas de formato simple (el texto lo edita el club) */
  const TAGS_OK = ['B', 'STRONG', 'I', 'EM', 'U', 'SMALL', 'BR', 'SPAN', 'A'];
  function limpiar(html) {
    const caja = document.createElement('div');
    caja.innerHTML = texto(html);
    $$('*', caja).forEach((el) => {
      if (!TAGS_OK.includes(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      [...el.attributes].forEach((a) => {
        const ok = el.tagName === 'A' && ['href', 'target', 'rel'].includes(a.name);
        if (!ok) el.removeAttribute(a.name);
      });
      if (el.tagName === 'A') {
        if (/^\s*(javascript|data):/i.test(el.getAttribute('href') || '')) el.setAttribute('href', '#');
        if (el.target === '_blank') el.setAttribute('rel', 'noopener');
      }
    });
    return caja.innerHTML;
  }

  const ico = (clave, t = 24) => {
    const i = (window.ICONOS || {})[clave] || (window.ICONOS || {}).corazonSolo;
    return `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${i ? i.d : ''}</svg>`;
  };
  const flecha = (t = 16) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES3 = MESES.map((m) => m.slice(0, 3));
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  /* ═══════════════ DATOS ═══════════════ */
  const slugDe = (t) => texto(t).replace(/<[^>]+>/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const bajar = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let IMGS = {};

  async function cargarDatos() {
    let D = null;
    if (/[?&]borrador=1/.test(location.search)) {
      try { D = JSON.parse(localStorage.getItem('antumalal.borrador')); } catch { /* se usa el publicado */ }
    }
    D = D || (await bajar('data/contenido.json')) || window.RESPALDO || {};
    const [noti, imgs, dist, propias] = await Promise.all([
      bajar((D.noticias && D.noticias.archivoLocal) || 'data/noticias.json').then((r) => r || window.RESPALDO_NOTICIAS),
      bajar('data/imagenes.json'),
      bajar('data/agenda-distrito.json').then((r) => r || window.RESPALDO_AGENDA),
      bajar('data/noticias-propias.json').then((r) => r || window.RESPALDO_NOTICIAS_PROPIAS)
    ]);
    IMGS = imgs || {};
    return { D, noticias: [...((propias && propias.noticias) || []), ...((noti && noti.noticias) || [])], distrito: (dist && dist.eventos) || [] };
  }

  /* Imagen real (ruta o foto subida al panel). Los marcadores SVG cuentan como "sin foto". */
  function fotoReal(ref) {
    const r = texto(ref);
    if (!r) return '';
    if (r.startsWith('img:')) return IMGS[r.slice(4)] || '';
    if (/assets\/img\/fotos\/.*\.svg$/i.test(r)) return '';
    return r;
  }

  /* Próximas actividades: sesiones fijas (2° y 4° lunes) + las cargadas en el panel
     + el calendario del Distrito T4 (data/agenda-distrito.json, se actualiza solo). */
  function calcularAgenda(D, distrito) {
    const cfg = D.agenda || {};
    const lugar = cfg.lugar || 'Centro de reuniones quincho Martin Lutero, Temuco.';
    const hora = cfg.hora || '20:30 h';
    const cupo = Math.max(1, parseInt(cfg.maximo, 10) || 6);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const items = [];
    const lunes = (a, m, cual) => {
      const d = new Date(a, m, 1);
      return new Date(a, m, 1 + ((8 - d.getDay()) % 7) + (cual === 2 ? 7 : 21));
    };
    if (cfg.auto !== false) {
      for (let m = 0; m < 12 && items.length < 200; m++) {
        const b = new Date(hoy.getFullYear(), hoy.getMonth() + m, 1);
        for (const cual of [2, 4]) {
          const f = lunes(b.getFullYear(), b.getMonth(), cual);
          if (f < hoy) continue;
          items.push({
            f, hora, texto: lugar, abierto: false,
            titulo: cual === 2 ? (cfg.tituloSegundo || 'Sesión ordinaria') : (cfg.tituloCuarto || 'Sesión ordinaria y trabajo de comisiones')
          });
        }
      }
    }
    (Array.isArray(cfg.eventos) ? cfg.eventos : []).forEach((e) => {
      if (!e || !e.fecha) return;
      const p = texto(e.fecha).split('-').map(Number);
      if (p.length < 3 || !p[0]) return;
      const f = new Date(p[0], p[1] - 1, p[2]);
      if (isNaN(f) || f < hoy) return;
      items.push({ f, titulo: e.titulo || 'Actividad del club', texto: e.texto || lugar, hora: e.hora || hora, abierto: e.abierto !== false, enlace: texto(e.enlace), enlaceTexto: texto(e.enlaceTexto) });
    });
    (Array.isArray(distrito) ? distrito : []).forEach((e) => {
      if (!e || !e.fecha) return;
      const p = texto(e.fecha).split('-').map(Number);
      if (p.length < 3 || !p[0]) return;
      const f = new Date(p[0], p[1] - 1, p[2]);
      if (isNaN(f) || f < hoy) return;
      items.push({ f, titulo: e.titulo || 'Distrito T4', texto: e.texto || 'Distrito T4', hora: e.hora || '', abierto: false, distrito: true, internacional: e.ambito === 'internacional' });
    });
    const orden = items.sort((a, b) => a.f - b.f);
    const visibles = orden.slice(0, cupo);
    visibles.todos = orden;
    return visibles;
  }

  /* Agenda interactiva: calendario mensual + lista del mes (o del día elegido) */
  const NOMBRE_DIA_MINI = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const htmlEvento = (e) => `
              <li class="evento">
                <div class="evento__f"><b>${String(e.f.getDate()).padStart(2, '0')}</b><span>${MES3[e.f.getMonth()]} ${e.f.getFullYear()}</span></div>
                <div class="evento__c"><h3>${limpiar(e.titulo)}</h3><p>${limpiar(e.texto)}</p>${e.enlace ? `<a class="evento__go" href="${esc(e.enlace)}"${/^https?:/i.test(e.enlace) ? ' target="_blank" rel="noopener"' : ''}>${limpiar(e.enlaceTexto || 'Más información')} ${flecha(14)}</a>` : ''}</div>
                <div class="evento__h"><span>${DIAS[e.f.getDay()]}</span><b>${esc(e.hora)}</b></div>
                <span class="evento__tag ${e.abierto ? 'abierto' : ''}">${e.internacional ? 'Internacional' : e.distrito ? 'Distrito T4' : (e.abierto ? 'Abierta a la comunidad' : 'Solo socios')}</span>
              </li>`;
  const htmlDias = (todos, anio, mes, sel) => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const n = new Date(anio, mes + 1, 0).getDate();
    const off = (new Date(anio, mes, 1).getDay() + 6) % 7;
    const con = new Set(todos.filter((e) => e.f.getFullYear() === anio && e.f.getMonth() === mes).map((e) => e.f.getDate()));
    return Array(off).fill('<span></span>').concat(Array.from({ length: n }, (_, i) => {
      const d = i + 1;
      const esHoy = hoy.getFullYear() === anio && hoy.getMonth() === mes && hoy.getDate() === d;
      const cls = [esHoy ? 'hoy' : '', con.has(d) ? 'con-evento' : '', sel === d ? 'sel' : ''].join(' ').trim();
      return con.has(d)
        ? `<button type="button" class="${cls}" data-dia="${d}" aria-label="${d} de ${MESES[mes]}: ver actividades">${d}</button>`
        : `<span class="${cls}">${d}</span>`;
    })).join('');
  };
  function agendaInteractiva(todos) {
    const cont = $('.agenda__cal');
    if (!cont || !todos || !todos.length) return;
    const hoy = new Date();
    const base = { a: hoy.getFullYear(), m: hoy.getMonth() };
    const est = { a: base.a, m: base.m, dia: null };
    const MAX = 11;
    const pintar = () => {
      $('#calTitulo').textContent = `${MESES[est.m]} ${est.a}`;
      $('#calDias').innerHTML = htmlDias(todos, est.a, est.m, est.dia);
      const delMes = todos.filter((e) => e.f.getFullYear() === est.a && e.f.getMonth() === est.m);
      const lista = est.dia ? delMes.filter((e) => e.f.getDate() === est.dia) : delMes;
      const ver = lista.slice(0, 5);
      const resto = lista.length - ver.length;
      $('#agendaLista').innerHTML = ver.length
        ? ver.map(htmlEvento).join('') + (resto > 0 ? `<li class="evento evento--mas">y ${resto} actividad${resto === 1 ? '' : 'es'} más este mes</li>` : '')
        : `<li class="evento evento--vacio">No hay actividades registradas en ${MESES[est.m]}.</li>`;
      const dist = (est.a - base.a) * 12 + est.m - base.m;
      $('[data-dir="-1"]', cont).disabled = dist <= 0;
      $('[data-dir="1"]', cont).disabled = dist >= MAX;
    };
    cont.addEventListener('click', (ev) => {
      const nav = ev.target.closest('[data-dir]');
      if (nav && !nav.disabled) {
        const d = new Date(est.a, est.m + Number(nav.dataset.dir), 1);
        est.a = d.getFullYear(); est.m = d.getMonth(); est.dia = null;
        pintar(); return;
      }
      const dia = ev.target.closest('[data-dia]');
      if (dia) { const n = Number(dia.dataset.dia); est.dia = est.dia === n ? null : n; pintar(); }
    });
    pintar();
  }

  /* ═══════════════ PLANTILLAS ═══════════════ */
  const NAV = [
    ['club', 'El Club'], ['causas', 'Causas'], ['proyectos', 'Proyectos'], ['noticias', 'Noticias'],
    ['agenda', 'Agenda'], ['dona', 'Colabora'], ['contacto', 'Contacto'], ['articulos', 'Blog']
  ];
  // «Artículos» no está en la portada: el menú abre su página propia
  const destinoNav = (id) => (id === 'articulos' ? 'articulos.html' : '#' + id);
  const RIEL = [
    ['inicio', 'Inicio'], ['club', 'El Club'], ['impacto', 'Impacto'], ['causas', 'Causas'], ['proyectos', 'Proyectos'],
    ['noticias', 'Noticias'], ['agenda', 'Agenda'], ['directorio', 'Directorio'],
    ['testimonios', 'Voces'], ['unete', 'Súmate'], ['dona', 'Colabora'], ['faq', 'Dudas'], ['contacto', 'Contacto']
  ];
  const ICONO_PROYECTO = [
    [/visual|vista|ojo/i, 'ojo'], [/invierno|abrigo/i, 'casa'], [/educaci|beca/i, 'graduacion'],
    [/juventud|paz/i, 'estrella'], [/adulto|mayor/i, 'personas'], [/ambiente|verde/i, 'arbol']
  ];
  const iconoDeProyecto = (tag) => (ICONO_PROYECTO.find(([r]) => r.test(tag || '')) || [0, 'corazon'])[1];

  const cabecera = (eyebrow, titulo, lead, extra = '') => `
    <header class="sec__cab ${extra}">
      <p class="eyebrow" data-rev><i></i>${limpiar(eyebrow)}</p>
      <h2 class="tit split">${limpiar(titulo)}</h2>
      ${lead ? `<p class="lead" data-rev>${limpiar(lead)}</p>` : ''}
    </header>`;

  function plantillas(D, noticias, agenda) {
    const T = D.textos || {};
    const H = T.hero || {}, CL = T.club || {}, C = D.contacto || {}, R = D.redes || {};
    const fecha = new Date(D.identidad && D.identidad.fundacion ? D.identidad.fundacion + 'T12:00:00' : '1983-03-28T12:00:00');
    const anios = new Date().getFullYear() - fecha.getFullYear();

    /* ── HERO ── */
    const hero = `
    <section class="hero sec--noche" id="inicio" data-shape="ondas" data-lado="1" data-esc="1.3" data-alfa=".2" data-ym=".58" data-escm=".5" data-nav>
      <div class="hero__in wrap">
        <div class="hero__nombre" data-hero="pill">
          <span class="hero__club">Club de Leones</span>
          <strong class="hero__temuco">Temuco Antumalal</strong>
          <span class="hero__dist"><i class="pill__punto"></i>Distrito T4 · Desde 1983</span>
        </div>
        <h1 class="hero__t split" data-hero="titulo">${limpiar(H.titulo || '')}</h1>
        <p class="hero__sub" data-hero="sub">${limpiar(H.sub || '')}</p>
        <div class="hero__cta" data-hero="cta">
          <a class="btn btn--oro btn--lg mag" href="#unete"><span>${limpiar(H.btn1 || 'Súmate al club')}</span>${flecha(18)}</a>
          <a class="btn btn--vidrio btn--lg mag" href="#proyectos"><span>${limpiar(H.btn2 || 'Ver proyectos')}</span></a>
        </div>
      </div>
      <div class="hero__pie wrap" data-hero="pie">
        <div class="hero__stat">
          <b class="hero__statn" data-count="${esc(H.statValor || anios)}">0</b>
          <span>${limpiar(H.statTexto || 'Años sirviendo a Temuco')}</span>
        </div>
        <a class="hero__scroll" href="#club" aria-label="Bajar">
          <span>Desliza</span><i><b></b></i>
        </a>
      </div>
    </section>`;

    /* ── MARQUESINA ── */
    const chips = (T.marquesina || []).map((t, i) => `<span class="marq__it${i % 2 ? ' marq__it--vacio' : ''}">${esc(t)}</span><i class="marq__est">✦</i>`).join('');
    const marquesina = `
    <div class="marq" aria-hidden="true">
      <div class="marq__pista"><div class="marq__set">${chips}</div><div class="marq__set">${chips}</div><div class="marq__set">${chips}</div></div>
    </div>`;

    /* ── EL CLUB ── */
    const parrafos = CL.parrafos || [];
    const arco = `${esc(D.identidad ? D.identidad.nombreCorto : 'Leones Antumalal')} · ${esc(D.identidad ? D.identidad.ciudad : 'Temuco')} · Distrito T-4 · `;
    const club = `
    <section class="sec sec--noche club" id="club" data-shape="volcan" data-lado="1" data-esc="1" data-nav>
      <div class="wrap">
        ${cabecera(CL.eyebrow || 'El Club', CL.titulo || '')}
        <div class="club__cuerpo">
          <p class="club__lit lit">${limpiar(parrafos[0] || '')}</p>
          <div class="club__cols">
            <div class="club__txt">${parrafos.slice(1).map((p) => `<p data-rev>${limpiar(p)}</p>`).join('')}</div>
            <div class="sello" data-rev>
              <svg viewBox="0 0 200 200" class="sello__giro" aria-hidden="true">
                <defs><path id="selloArco" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs>
                <text><textPath href="#selloArco" startOffset="0" textLength="495" lengthAdjust="spacing">${arco}</textPath></text>
              </svg>
              <div class="sello__c"><b>${limpiar(CL.selloNum || '1983')}</b><span>${limpiar(CL.selloTxt || '')}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>`;

    /* ── IMPACTO + SELLOS ── */
    const impacto = `
    <section class="sec sec--noche impacto" id="impacto" data-shape="ondas" data-lado="0" data-esc="1.35" data-alfa=".35" data-nav>
      <div class="wrap">
        <ul class="cifras">
          ${(D.impacto || []).map((c, i) => `
            <li class="cifra" data-rev style="--i:${i}">
              <b class="cifra__n"><span data-count="${esc(c.valor)}" data-plano="${c.formato === 'plano' ? 1 : 0}">0</span><sup>${esc(c.sufijo)}</sup></b>
              <span class="cifra__e">${esc(c.etiqueta)}</span>
            </li>`).join('')}
        </ul>
        <div class="sellos">
          <div class="sellos__cab">
            <p class="eyebrow" data-rev><i></i>${limpiar((T.sellos || {}).eyebrow || 'Lo que nos respalda')}</p>
            <h3 class="tit tit--m split">${limpiar((T.sellos || {}).titulo || 'Nuestro sello de trabajo')}</h3>
          </div>
          <ol class="sellos__lista">
            ${(D.sellos || []).map((s, i) => `
              <li class="sello-it" data-rev>
                <h4>${limpiar(s.titulo)}</h4>
                <p>${limpiar(s.texto)}</p>
              </li>`).join('')}
          </ol>
          <div class="sellos__valores">
            ${(D.valores || []).map((v, i) => `
              <article class="guia" data-rev style="--i:${i}">
                <span class="guia__ico">${ico(v.icono, 24)}</span>
                <div><h4>${limpiar(v.titulo)}</h4><p>${limpiar(v.texto)}</p></div>
              </article>`).join('')}
          </div>
        </div>
      </div>
    </section>`;

    /* ── CAUSAS ── */
    const CA = T.causas || {};
    const causas = `
    <section class="sec sec--papel causas" id="causas" data-nav>
      <div class="wrap">
        ${cabecera(CA.eyebrow || 'Nuestro trabajo', CA.titulo || '', CA.lead)}
        <div class="causas__cuerpo">
          <div class="causas__panel" id="causaPanel" aria-live="polite">
            <div class="causas__aro"><svg viewBox="0 0 24 24" class="causas__ico" id="causaIco" fill="none" stroke="currentColor" stroke-width=".7" stroke-linecap="round" stroke-linejoin="round"></svg></div>
            <h3 class="causas__tit" id="causaTit"></h3>
            <p class="causas__txt" id="causaTxt"></p>
            <div class="causas__barra"><i id="causaBarra"></i></div>
          </div>
          <ul class="causas__lista" id="causaLista" role="tablist" aria-label="Causas">
            ${(D.causas || []).map((c, i) => `
              <li>
                <button class="causa" role="tab" data-i="${i}" aria-selected="${i === 0}" data-cursor="Ver">
                  <span class="causa__t">${limpiar(c.titulo)}</span>
                  <span class="causa__i">${ico(c.icono, 22)}</span>
                  <span class="causa__f">${flecha(18)}</span>
                </button>
                <div class="causa__cuerpo"><p>${limpiar(c.texto)}</p></div>
              </li>`).join('')}
          </ul>
        </div>
      </div>
    </section>`;

    /* ── PROYECTOS (pista horizontal fijada) ── */
    const PR = T.proyectos || {};
    const proyectos = `
    <section class="proy" id="proyectos" data-nav>
      <div class="proy__fijo">
        <div class="proy__cab wrap">
          ${cabecera(PR.eyebrow || 'Proyectos', PR.titulo || '', PR.lead, 'sec__cab--fila')}
        </div>
        <div class="proy__vista" data-cursor="Arrastra">
          <div class="proy__pista" id="proyPista">
            ${(D.proyectos || []).slice(0, 4).map((p, i) => {
              const foto = fotoReal(p.imagen);
              return `
              <article class="pcard${p.ancho ? ' pcard--ancho' : ''}${foto ? '' : ' pcard--sinfoto'}" data-tilt style="--h:${(i * 47) % 360}">
                ${foto ? `
                <div class="pcard__vis pcard__vis--foto">
                  <img src="${esc(foto)}" alt="${esc(p.titulo)}" loading="lazy"${/^[\d.]+%\s+[\d.]+%$/.test(p.foco || '') ? ` style="object-position:${p.foco}"` : ''}>
                  <span class="pcard__luz"></span>
                </div>` : ''}
                <div class="pcard__cuerpo">
                  <span class="pcard__ico">${ico(iconoDeProyecto(p.tag), 24)}</span>
                  <span class="chip">${limpiar(p.tag)}</span>
                  <h3>${limpiar(p.titulo)}</h3>
                  <p>${limpiar(p.texto)}</p>
                  <a class="link-f" href="${esc(p.enlace && p.enlace !== '#contacto' ? p.enlace : 'trabajo.html?id=' + encodeURIComponent(p.id || slugDe(p.titulo)))}">${p.enlace && p.enlace !== '#contacto' ? 'Quiero saber más' : 'Leer la historia'} ${flecha(15)}</a>
                </div>
              </article>`;
            }).join('')}
            <div class="pcard pcard--fin"><b>Hay mucho más en terreno</b><a class="btn btn--oro mag" href="trabajo-en-terreno.html"><span>Ver más trabajo en terreno</span>${flecha(16)}</a></div>
          </div>
        </div>
        <div class="proy__pie wrap"><div class="proy__barra"><i id="proyBarra"></i></div><span class="proy__ayuda">Recorre los proyectos</span></div>
      </div>
    </section>`;

    /* ── VALORES + CITA ── */
    const VA = T.valores || {};
    const valores = `
    <section class="cita sec--noche" data-shape="ondas" data-lado="0" data-esc="1.5" data-alfa=".2">
      <div class="wrap">
        <blockquote>
          <p class="cita__t lit">${limpiar(VA.cita || '')}</p>
          <footer data-rev>— ${limpiar(VA.citaAutor || '')}</footer>
        </blockquote>
      </div>
    </section>`;

    /* ── NOTICIAS ── */
    const NO = T.noticiasSec || {};
    const maxN = 4;
    const notasHtml = noticias.slice(0, maxN).map((n, i) => {
      const f = n.fecha ? new Date(n.fecha) : null;
      const cuando = f && !isNaN(f) ? `${f.getDate()} ${MES3[f.getMonth()]} ${f.getFullYear()}` : '';
      const resumen = texto(n.resumen).slice(0, i === 0 ? 220 : 130).trim();
      return `
        <a class="nota${i === 0 ? ' nota--grande' : ''}" href="${esc(n.enlace)}"${/^https?:/i.test(n.enlace || '') ? ' target="_blank" rel="noopener"' : ''} data-rev data-tilt>
          <span class="nota__img"><img src="${esc(n.imagen || 'assets/img/noticias-respaldo.jpg')}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(!this.dataset.r){this.dataset.r=1;this.src='assets/img/noticias-respaldo.jpg'}else{this.remove()}"><i class="nota__mono">${esc(texto(n.fuente).slice(0, 1))}</i></span>
          <span class="nota__meta"><b class="${n.tipo === 'oficial' ? 'ofi' : ''}">${esc(n.fuente)}</b>${cuando ? `<time>${cuando}</time>` : ''}</span>
          <h3>${esc(n.titulo)}</h3>
          ${resumen ? `<p>${esc(resumen)}…</p>` : ''}
          <span class="nota__leer">Leer ${flecha(14)}</span>
        </a>`;
    }).join('');
    const noticiasSec = `
    <section class="sec sec--papel noticias" id="noticias" data-nav>
      <div class="wrap">
        ${cabecera(NO.eyebrow || 'Actualidad', NO.titulo || '', NO.lead)}
        ${notasHtml ? `<div class="notas">${notasHtml}</div>
        ${noticias.length > maxN ? `<div class="notas__todo"><a class="btn btn--oro mag" href="noticias.html"><span>Ver todas las noticias</span>${flecha(16)}</a></div>` : ''}` : '<p class="vacio">Pronto publicaremos novedades.</p>'}
      </div>
    </section>`;

    /* ── ARTÍCULOS ── */
    const AR = T.articulosSec || {};
    const arts = (D.articulos || []).filter((a) => texto(a.titulo).trim());
    const articulosHtml = arts.slice(0, 6).map((a) => {
      const f = a.fecha ? new Date(a.fecha + 'T12:00:00') : null;
      const cuando = f && !isNaN(f) ? `${f.getDate()} ${MES3[f.getMonth()]} ${f.getFullYear()}` : '';
      const foto = fotoReal(a.imagen) || 'assets/img/noticias-respaldo.jpg';
      const idA = a.id || slugDe(a.titulo);
      return `
        <a class="nota" href="articulo.html?id=${encodeURIComponent(idA)}" data-rev data-tilt>
          <span class="nota__img"><img src="${esc(foto)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="object-position:50% 50%"onerror="if(!this.dataset.r){this.dataset.r=1;this.src='assets/img/noticias-respaldo.jpg'}else{this.remove()}">${a.video ? '<i class="nota__play" aria-hidden="true"></i>' : ''}</span>
          <span class="nota__meta"><b>${esc(texto(a.tag) || 'Artículo')}</b>${cuando ? `<time>${cuando}</time>` : ''}</span>
          <h3>${limpiar(a.titulo)}</h3>
          ${a.texto ? `<p>${esc(texto(a.texto).slice(0, 150))}${texto(a.texto).length > 150 ? '…' : ''}</p>` : ''}
          <span class="nota__leer">Leer artículo ${flecha(14)}</span>
        </a>`;
    }).join('');
    const articulosSec = arts.length ? `
    <section class="sec sec--noche articulos" id="articulos" data-nav>
      <div class="wrap">
        ${cabecera(AR.eyebrow || 'Para leer', AR.titulo || 'Blog Leones Antumalal', AR.lead)}
        <div class="notas">${articulosHtml}</div>
      </div>
    </section>` : '';

    /* ── AGENDA ── */
    const AG = T.agendaSec || {};
    const hoyAg = new Date();
    const agendaSec = `
    <section class="sec sec--noche agenda" id="agenda" data-shape="ondas" data-lado="1" data-esc="1.2" data-alfa=".35" data-nav>
      <div class="wrap">
        ${cabecera(AG.eyebrow || 'Agenda', AG.titulo || '', AG.lead)}
        <div class="agenda__grid">
          <div class="agenda__cal" data-rev>
            <div class="agenda__cal-cab">
              <button type="button" class="agenda__nav" data-dir="-1" aria-label="Mes anterior" disabled>&lsaquo;</button>
              <h3 id="calTitulo">${MESES[hoyAg.getMonth()]} ${hoyAg.getFullYear()}</h3>
              <button type="button" class="agenda__nav" data-dir="1" aria-label="Mes siguiente">&rsaquo;</button>
            </div>
            <div class="agenda__cal-sem">${NOMBRE_DIA_MINI.map((d) => `<span>${d}</span>`).join('')}</div>
            <div class="agenda__cal-dias" id="calDias">${htmlDias(agenda.todos || agenda, hoyAg.getFullYear(), hoyAg.getMonth(), null)}</div>
            <p class="agenda__cal-nota"><i></i>Toca un día marcado para ver su actividad</p>
          </div>
          <ol class="agenda__lista" id="agendaLista">${agenda.slice(0, 5).map(htmlEvento).join('')}</ol>
        </div>
        <p class="agenda__fuentes" data-rev>Fechas del distrito y de Lions International, actualizadas automáticamente desde
          <a href="https://leonest4.cl/" target="_blank" rel="noopener">Lions Distrito T4</a> y
          <a href="${(D.redes && D.redes.lionsOficial) || 'https://www.lionsclubs.org/es'}" target="_blank" rel="noopener">Lions Clubs International</a>.</p>
      </div>
    </section>`;

    /* ── DIRECTORIO ── */
    const DI = T.directivaSec || {};
    const directorio = `
    <section class="sec sec--noche directorio" id="directorio" data-shape="ondas" data-lado="-1" data-esc="1.3" data-alfa=".2" data-nav>
      <div class="wrap">
        ${cabecera(DI.eyebrow || 'Quiénes lideran', DI.titulo || '', DI.lead)}
        <div class="dir__grid">
          ${(D.directiva || []).map((m, i) => {
            const foto = fotoReal(m.foto);
            return `
            <article class="miembro" data-rev data-tilt style="--i:${i}">
              <div class="miembro__foto">
                ${foto ? `<img src="${esc(foto)}" alt="${esc(m.nombre)}" loading="lazy">` : `<img class="miembro__escudo" src="assets/img/lions-international.png" alt="">`}
              </div>
              <h3>${limpiar(m.nombre)}</h3>
              <p>${limpiar(m.cargo)}</p>
            </article>`;
          }).join('')}
        </div>
      </div>
    </section>`;

    /* ── TESTIMONIOS ── */
    const TE = T.testimoniosSec || {};
    const tests = D.testimonios || [];
    const testimonios = `
    <section class="sec sec--azul test" id="testimonios" data-nav>
      <div class="wrap">
        ${cabecera(TE.eyebrow || 'Testimonios', TE.titulo || '')}
        <div class="test__caja" id="testCaja">
          <span class="test__comilla" aria-hidden="true">“</span>
          <div class="test__citas">
            ${tests.map((t, i) => `
              <figure class="tcita${i === 0 ? ' on' : ''}" data-i="${i}" ${i ? 'aria-hidden="true"' : ''}>
                <blockquote>${limpiar(t.texto)}</blockquote>
                <figcaption>${fotoReal(t.foto) ? `<span class="tcita__av tcita__av--foto"><img src="${esc(fotoReal(t.foto))}" alt="${esc(texto(t.autor))}" loading="lazy"></span>` : `<span class="tcita__av">${esc(t.iniciales)}</span>`}<span><b>${limpiar(t.autor)}</b><small>${limpiar(t.detalle)}</small></span></figcaption>
              </figure>`).join('')}
          </div>
          <div class="test__ctrl">
            <div class="test__puntos" id="testPuntos">${tests.map((t, i) => `<button class="${i === 0 ? 'on' : ''}" data-i="${i}" aria-label="Testimonio ${i + 1}"><i></i></button>`).join('')}</div>
            <div class="test__bts">
              <button class="rbtn" id="testPrev" aria-label="Anterior"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg></button>
              <button class="rbtn" id="testNext" aria-label="Siguiente">${flecha(18)}</button>
            </div>
          </div>
        </div>
      </div>
    </section>`;

    /* ── LLAMADO A SOCIO ── */
    const CT = T.cta || {};
    const cta = `
    <section class="sec sec--noche cta" id="unete" data-shape="corazon" data-lado="0" data-esc="1.15" data-alfa=".45" data-nav>
      <div class="wrap cta__in">
        <p class="eyebrow eyebrow--c" data-rev><i></i>${limpiar(CT.eyebrow || 'Hazte socio')}</p>
        <h2 class="cta__t split">${limpiar(CT.titulo || '')}</h2>
        <p class="cta__lead" data-rev>${limpiar(CT.lead || '')}</p>
        <div class="cta__btns" data-rev>
          <a class="btn btn--oro btn--lg mag" href="#contacto" data-motivo="Quiero ser socio"><span>${limpiar(CT.btn1 || 'Quiero postular')}</span>${flecha(18)}</a>
        </div>
        <a class="link-f" data-rev href="https://www.lionsclubs.org/es/start-our-approach/club-locator" target="_blank" rel="noopener">¿No eres de Temuco? Busca tu club Lions más cercano ${flecha(15)}</a>
      </div>
    </section>`;

    /* ── DONAR ── */
    const DO = T.dona || {};
    const dona = `
    <section class="sec sec--papel dona" id="dona" data-nav>
      <div class="wrap">
        ${cabecera(DO.eyebrow || 'Colabora', DO.titulo || '', DO.lead)}
        ${(D.donaEventos || []).length ? `
        <div class="gala" data-rev>
          <div class="gala__cab"><h3>${limpiar(DO.eventosTitulo || 'Actividades que hacemos cada año')}</h3>${DO.eventosLead ? `<p>${limpiar(DO.eventosLead)}</p>` : ''}</div>
          <div class="gala__grid">
            ${D.donaEventos.map((e) => {
              const afiche = fotoReal(e.imagen);
              const enlExt = /^https?:/i.test(e.enlace || '');
              const detalles = [e.lugar, e.precio].filter((x) => texto(x).trim());
              return `
              <article class="gala__it${e.venta ? ' gala__it--venta' : ''}${afiche ? ' gala__it--afiche' : ''}">
                ${afiche
                  ? `<a class="gala__afiche" href="${esc(afiche)}" target="_blank" rel="noopener" aria-label="Ver afiche de ${esc(e.titulo)}"><img src="${esc(afiche)}" alt="Afiche de ${esc(e.titulo)}" loading="lazy"></a>`
                  : `<span class="gala__ico">${ico(e.icono, 26)}</span>`}
                <div class="gala__cuerpo">
                  <div class="gala__chips">${e.venta ? '<span class="gala__venta">A la venta</span>' : ''}<span class="gala__mes">${limpiar(e.mes)}</span></div>
                  <h4>${limpiar(e.titulo)}</h4>
                  <p>${limpiar(e.texto)}</p>
                  ${detalles.length ? `<ul class="gala__det">${detalles.map((d) => `<li>${limpiar(d)}</li>`).join('')}</ul>` : ''}
                  <div class="gala__acc">
                    ${e.enlace ? `<a class="btn btn--oro btn--sm" href="${esc(e.enlace)}"${enlExt ? ' target="_blank" rel="noopener"' : ''}><span>${limpiar(e.enlaceTexto || (e.venta ? 'Comprar ahora' : 'Más información'))}</span></a>` : ''}
                    ${(D.redes && D.redes.instagram) ? `<a class="gala__ig" href="${esc(D.redes.instagram)}" target="_blank" rel="noopener" aria-label="Instagram del club, @${esc((D.redes && D.redes.instagramUser) || '')}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg><span>Instagram</span></a>` : ''}
                    <button type="button" class="gala__compartir" data-compartir="${esc(texto(e.titulo))}" data-comp-mes="${esc(texto(e.mes))}">Compartir ${flecha(14)}</button>
                  </div>
                </div>
              </article>`;
            }).join('')}
          </div>
        </div>` : ''}
        <div class="dona__grid dona__grid--solo">
          <div class="ops">
            ${(D.donaOps || []).map((o, i) => {
              const ext = /^https?:/i.test(o.enlace || '');
              const cuerpo = `<span class="op__i">${ico(o.icono, 26)}</span>
                <div><h3>${limpiar(o.titulo)}</h3><p>${limpiar(o.texto)}</p>${o.enlace ? `<span class="op__go">${limpiar(o.enlaceTexto || 'Saber más')} ${flecha(15)}</span>` : ''}</div>`;
              return o.enlace
                ? `<a class="op op--link" data-rev style="--i:${i}" href="${o.enlace}"${ext ? ' target="_blank" rel="noopener"' : ''}${o.motivo ? ` data-motivo="${o.motivo}"` : ''}>${cuerpo}</a>`
                : `<article class="op" data-rev style="--i:${i}">${cuerpo}</article>`;
            }).join('')}
          </div>
        </div>
      </div>
    </section>`;

    /* ── PREGUNTAS ── */
    const FA = T.faq || {};
    const faq = `
    <section class="sec sec--papel faq" id="faq" data-nav>
      <div class="wrap faq__in">
        ${cabecera(FA.eyebrow || 'Dudas', FA.titulo || '')}
        <div class="faq__lista">
          ${(D.faq || []).map((q, i) => `
            <div class="fq" data-rev>
              <button class="fq__b" aria-expanded="false" aria-controls="fq${i}" id="fqb${i}"><span class="fq__q">${limpiar(q.pregunta)}</span><i class="mas"></i></button>
              <div class="fq__r" id="fq${i}" role="region" aria-labelledby="fqb${i}"><div><p>${limpiar(q.respuesta)}</p></div></div>
            </div>`).join('')}
        </div>
      </div>
    </section>`;

    /* ── CONTACTO ── */
    const CO = T.contactoSec || {};
    const contacto = `
    <section class="sec sec--noche contacto" id="contacto" data-shape="ondas" data-lado="-1" data-esc=".9" data-alfa=".35" data-nav>
      <div class="wrap">
        ${cabecera(CO.eyebrow || 'Contacto', CO.titulo || '', CO.lead)}
        <div class="contacto__grid">
          <div class="datos" data-rev>
            ${C.email ? `<a class="dato" href="mailto:${esc(C.email)}"><span>Correo</span><b>${esc(C.email)}</b></a>` : ''}
            ${R.instagram ? `<a class="dato" href="${esc(R.instagram)}" target="_blank" rel="noopener"><span>Instagram</span><b>@${esc(R.instagramUser || 'leonestemuco_antumalal')}</b></a>` : ''}
          </div>
          <form class="form" id="form" novalidate data-rev>
            <div class="campo"><input id="fNombre" name="nombre" required autocomplete="name" placeholder=" "><label for="fNombre">Tu nombre</label><i></i></div>
            <div class="fila2">
              <div class="campo"><input id="fTel" name="telefono" type="tel" autocomplete="tel" placeholder=" "><label for="fTel">Teléfono</label><i></i></div>
              <div class="campo"><input id="fEmail" name="email" type="email" required autocomplete="email" placeholder=" "><label for="fEmail">Correo</label><i></i></div>
            </div>
            <div class="campo campo--sel"><select id="fMotivo" name="motivo"><option>Quiero ser socio</option><option>Solicito ayuda</option><option>Quiero donar o auspiciar</option><option>Voluntariado profesional</option><option>Prensa o difusión</option><option>Otro</option></select><label for="fMotivo">Motivo</label><i></i></div>
            ${(() => {
              const ops = texto((D.formulario || {}).origenes).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
              return ops.length ? `<div class="campo campo--sel"><select id="fOrigen" name="origen"><option value="">Selecciona una opción (opcional)</option>${ops.map((o) => `<option>${esc(o)}</option>`).join('')}</select><label for="fOrigen">${limpiar((T.contactoSec || {}).origenPregunta || '¿Cómo conociste el club?')}</label><i></i></div>` : '';
            })()}
            <div class="campo"><textarea id="fMsg" name="mensaje" rows="4" required placeholder=" "></textarea><label for="fMsg">Cuéntanos brevemente…</label><i></i></div>
            <button class="btn btn--oro btn--lg mag" type="submit"><span>Enviar mensaje</span>${flecha(18)}</button>
            <p class="form__msg" id="formMsg" role="status"></p>
          </form>
        </div>
      </div>
    </section>`;

    /* ── PIE ── */
    const redes = [['Instagram', R.instagram], ['Facebook', R.facebook], ['YouTube', R.youtube], ['Lions International', R.lionsOficial], ['e-Clubhouse', R.sitioEclubhouse]]
      .filter((r) => r[1]).map((r) => `<a href="${esc(r[1])}" target="_blank" rel="noopener">${r[0]}</a>`).join('');
    const pie = `
    <footer class="pie sec--noche">
      <div class="pie__gigante" aria-hidden="true"><span>Nosotros</span><span>Servimos</span></div>
      <div class="wrap pie__in">
        <div class="pie__marca">
          <img src="assets/img/lions-international.png" alt="" width="56" height="56">
          <p>${limpiar((T.footer || {}).texto || '')}</p>
        </div>
        <div class="pie__redes">${redes}</div>
        <div class="pie__fin">
          <span>© ${new Date().getFullYear()} ${esc(D.identidad ? D.identidad.nombre : 'Club de Leones Temuco Antumalal')}. Todos los derechos reservados. · <a class="pie__admin" href="admin.html">Panel del club</a></span>
          <button class="pie__arriba" id="arriba">Volver arriba <i>${flecha(14)}</i></button>
        </div>
        <a class="sello-web" href="https://websquevenden.cl" target="_blank" rel="noopener">Sitio creado por <b>Websquevenden.cl</b></a>
      </div>
    </footer>`;

    return hero + marquesina + club + impacto + causas + proyectos + valores + noticiasSec + agendaSec + directorio + testimonios + cta + dona + faq + contacto + pie;
  }

  /* ═══════════════ DIVISIÓN DE TEXTO EN PALABRAS ═══════════════
     Envuelve cada palabra en una "máscara" para poder animarla, sin perder
     el formato interno (<em>, <strong>…). */
  function dividir(el) {
    const nodos = [];
    const rec = (n) => { n.childNodes.forEach((h) => (h.nodeType === 3 ? nodos.push(h) : rec(h))); };
    rec(el);
    let ultimo = null, terminoEnEspacio = true;   // para pegar la puntuación a la palabra anterior
    nodos.forEach((n) => {
      const partes = n.textContent.split(/(\s+)/);
      const frag = document.createDocumentFragment();
      partes.forEach((p, k) => {
        if (!p) return;
        if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); terminoEnEspacio = true; return; }
        if (k <= 1 && !terminoEnEspacio && ultimo && !/^\s/.test(n.textContent)) {
          ultimo.textContent += p; terminoEnEspacio = false; return;   // ej. el "." tras un <strong>
        }
        const w = document.createElement('span'); w.className = 'w';
        const i = document.createElement('span'); i.className = 'wi'; i.textContent = p;
        w.appendChild(i); frag.appendChild(w);
        ultimo = i; terminoEnEspacio = false;
      });
      n.replaceWith(frag);
    });
    return $$('.wi', el);
  }

  /* ═══════════════ ARRANQUE ═══════════════ */
  let lenis = null;

  async function arrancar() {
    // la página siempre empieza arriba, con su carga y su entrada
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    scrollTo(0, 0);
    document.documentElement.classList.add('js');
    if (!HAY_GSAP) document.documentElement.classList.add('sin-gsap');

    /* La carga real: datos + tipografías + escena 3D, todo a la vez */
    const app = $('#app');
    const progreso = { v: 0 };
    const pintarCarga = () => {
      $('#cargaN').textContent = Math.round(progreso.v);
      $('#cargaTrazo').style.strokeDashoffset = 339.3 * (1 - progreso.v / 100);
    };
    if (HAY_GSAP) G.to(progreso, { v: 88, duration: 2, ease: 'power2.out', onUpdate: pintarCarga });

    const glCanvas = $('#gl');
    const tareas = [
      cargarDatos(),
      (document.fonts && document.fonts.load ? Promise.all([document.fonts.load('400 200px "Instrument Serif"'), document.fonts.load('italic 400 40px "Instrument Serif"'), document.fonts.load('600 16px "Instrument Sans"')]).catch(() => 0) : Promise.resolve()),
      window.LeonesGL && !window.__MINIMAL ? window.LeonesGL.init(glCanvas).catch(() => false) : Promise.resolve(false)
    ];
    const limite = new Promise((r) => setTimeout(r, 9000, 'tiempo'));
    const [datos, , glOk] = await Promise.race([Promise.all(tareas), limite.then(() => Promise.all(tareas.map((t) => Promise.race([t, Promise.resolve(null)]))))]);

    const { D, noticias, distrito } = datos || (await tareas[0]);
    const agenda = calcularAgenda(D, distrito);
    window.__agendaTodos = agenda.todos;
    app.innerHTML = plantillas(D, noticias, agenda);
    if (!glOk) document.body.classList.add('sin-gl');
    else window.LeonesGL.figura('ondas', true);

    _D = D;
    iniciar(D);
    document.body.classList.add('listo');

    // cierra la pantalla de carga
    const cerrar = () => {
      document.body.classList.remove('cargando');
      if (lenis) lenis.start();
      entradaHero(glOk);
      if (HAY_GSAP && window.ScrollTrigger) ScrollTrigger.refresh();
    };
    if (!HAY_GSAP) { progreso.v = 100; pintarCarga(); $('#carga').remove(); cerrar(); return; }
    G.killTweensOf(progreso);
    G.to(progreso, {
      v: 100, duration: 0.5, ease: 'power1.out', onUpdate: pintarCarga,
      onComplete: () => {
        const tl = G.timeline({ onComplete: () => $('#carga') && $('#carga').remove() });
        tl.to('.carga__centro, .carga__n, .carga__lema', { opacity: 0, y: -14, duration: 0.5, ease: 'power2.in', stagger: 0.05 }, 0.15)
          .to('.carga__tel--a', { yPercent: -101, duration: 1.05, ease: 'expo.inOut' }, 0.7)
          .to('.carga__tel--b', { yPercent: 101, duration: 1.05, ease: 'expo.inOut' }, 0.7)
          .add(cerrar, 0.95);
      }
    });
  }

  /* ═══════════════ ENTRADA DEL HERO ═══════════════ */
  function entradaHero(glOk) {
    const cfg = { lado: 1, esc: 1.3, alfa: 0.4, ym: 0.58, escm: 0.5 };
    if (glOk) window.LeonesGL.ir('ondas', cfg);
    countUp($('.hero__statn'), 1.8, 0.9);
    if (!HAY_GSAP || MOV_RED) return;
    const tl = G.timeline({ defaults: { ease: 'expo.out' } });
    tl.to('.hero__t .wi', { yPercent: 0, duration: 1.4, stagger: 0.07 }, 0)
      .to('[data-hero="pill"]', { opacity: 1, y: 0, duration: 1 }, 0.1)
      .to('[data-hero="sub"]', { opacity: 1, y: 0, duration: 1.1 }, 0.55)
      .to('[data-hero="cta"] > *', { opacity: 1, y: 0, duration: 1, stagger: 0.1 }, 0.75)
      .to('[data-hero="pie"]', { opacity: 1, y: 0, duration: 1.1 }, 1)
      .to('.cab', { yPercent: 0, opacity: 1, duration: 1.1 }, 0.6)
      .to('.riel', { opacity: 1, duration: 1 }, 1.2);
  }

  function countUp(el, dur = 1.6, delay = 0) {
    if (!el) return;
    const fin = parseFloat(el.dataset.count) || 0;
    const plano = el.dataset.plano === '1';
    const fmt = (v) => (plano ? String(Math.round(v)) : Math.round(v).toLocaleString('es-CL'));
    if (!HAY_GSAP || MOV_RED) { el.textContent = fmt(fin); return; }
    const o = { v: 0 };
    G.to(o, { v: fin, duration: dur, delay, ease: 'power3.out', onUpdate: () => (el.textContent = fmt(o.v)) });
  }

  /* ═══════════════ INTERACCIÓN ═══════════════ */
  function iniciar(D) {
    /* Menús */
    $('#cabNav').innerHTML = NAV.map(([id, t]) => `<a href="${destinoNav(id)}" data-link="${id}"><span>${t}</span></a>`).join('');
    $('#menuNav').innerHTML = NAV.concat([['unete', 'Súmate']]).map(([id, t], i) => `<a href="${destinoNav(id)}" style="--i:${i}"><span>${t}</span></a>`).join('');
    const C = D.contacto || {}, R = D.redes || {};
    $('#menuLado').innerHTML = `
      <p class="eyebrow"><i></i>Escríbenos</p>
      ${C.email ? `<a href="mailto:${esc(C.email)}">${esc(C.email)}</a>` : ''}
      <p class="menu__h">${esc(C.horario || '')}</p>
      <div class="menu__redes">${R.instagram ? `<a href="${esc(R.instagram)}" target="_blank" rel="noopener">Instagram</a>` : ''}${R.lionsOficial ? `<a href="${esc(R.lionsOficial)}" target="_blank" rel="noopener">Lions</a>` : ''}</div>`;
    $('#riel').innerHTML = RIEL.filter(([id]) => $('#' + id)).map(([id, t]) => `<a href="#${id}" data-riel="${id}" aria-label="${t}"><i></i><span>${t}</span></a>`).join('');

    if (HAY_GSAP && window.ScrollTrigger) G.registerPlugin(ScrollTrigger);

    scrollSuave();
    cabeceraYMenu();
    if (PUNTERO_FINO) cursor();
    magnetos();
    inclinacion();
    causasInteractivas();
    agendaInteractiva(window.__agendaTodos);
    ajustarPantallas();
    faq();
    testimonios();
    formulario(D);
    copiar();
    compartir(D);
    $('#arriba').addEventListener('click', () => irA(0));

    if (!HAY_GSAP || !window.ScrollTrigger) return;
    estadosIniciales();
    animaciones();
    escenaPorSeccion();
  }

  /* ── Scroll suave y anclas ── */
  function irA(destino, opts) {
    if (lenis) lenis.scrollTo(destino, Object.assign({ duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) }, opts));
    else if (typeof destino === 'number') scrollTo({ top: destino, behavior: 'smooth' });
    else destino.scrollIntoView({ behavior: 'smooth' });
  }
  function scrollSuave() {
    if (window.Lenis && !MOV_RED) {
      lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95 });
      lenis.stop();
      if (HAY_GSAP && window.ScrollTrigger) {
        lenis.on('scroll', ScrollTrigger.update);
        G.ticker.add((t) => lenis.raf(t * 1000));
        G.ticker.lagSmoothing(0);
      } else {
        const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      }
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const el = $(id);
      if (!el) return;
      e.preventDefault();
      if (a.dataset.motivo) { const s = $('#fMotivo'); if (s) s.value = a.dataset.motivo; }
      cerrarMenu();
      irA(el, { offset: id === '#proyectos' ? 0 : 0 });
    });
  }

  /* ── Cabecera (se esconde al bajar), progreso y menú ── */
  let cerrarMenu = () => {};
  function cabeceraYMenu() {
    const cab = $('#cab'), barra = $('#progreso'), menu = $('#menu'), burger = $('#burger');
    let ultimo = 0;
    const alScroll = (y, lim) => {
      cab.classList.toggle('cab--fondo', y > 40);
      if (y > ultimo + 6 && y > 400 && !menu.classList.contains('abierto')) cab.classList.add('cab--oculta');
      else if (y < ultimo - 6) cab.classList.remove('cab--oculta');
      ultimo = y;
      barra.style.transform = `scaleX(${lim > 0 ? Math.min(1, y / lim) : 0})`;
    };
    const leer = () => alScroll(lenis ? lenis.scroll : scrollY, document.documentElement.scrollHeight - innerHeight);
    if (lenis) lenis.on('scroll', leer); else addEventListener('scroll', leer, { passive: true });
    leer();

    const abrir = () => {
      menu.classList.add('abierto'); menu.setAttribute('aria-hidden', 'false');
      burger.setAttribute('aria-expanded', 'true'); burger.classList.add('on');
      document.body.classList.add('menu-abierto'); cab.classList.remove('cab--oculta');
      if (lenis) lenis.stop();
    };
    cerrarMenu = () => {
      if (!menu.classList.contains('abierto')) return;
      menu.classList.remove('abierto'); menu.setAttribute('aria-hidden', 'true');
      burger.setAttribute('aria-expanded', 'false'); burger.classList.remove('on');
      document.body.classList.remove('menu-abierto');
      if (lenis) lenis.start();
    };
    burger.addEventListener('click', () => (menu.classList.contains('abierto') ? cerrarMenu() : abrir()));
    addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarMenu(); });
  }

  /* ── Cursor propio (solo con mouse) ── */
  function cursor() {
    const c = $('#cursor'), txt = $('.cursor__aro span', c);
    document.body.classList.add('con-cursor');
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
    addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; c.classList.add('vis'); }, { passive: true });
    document.addEventListener('pointerleave', () => c.classList.remove('vis'));
    const bucle = () => {
      rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
      c.style.setProperty('--x', x + 'px'); c.style.setProperty('--y', y + 'px');
      c.style.setProperty('--rx', rx + 'px'); c.style.setProperty('--ry', ry + 'px');
      requestAnimationFrame(bucle);
    };
    bucle();
    document.addEventListener('pointerover', (e) => {
      const t = e.target.closest('a, button, [data-cursor], input, select, textarea, summary');
      c.classList.toggle('hover', !!t);
      const et = t && t.closest('[data-cursor]');
      txt.textContent = et ? et.dataset.cursor : '';
      c.classList.toggle('etiqueta', !!(et && et.dataset.cursor));
    });
    document.addEventListener('pointerdown', () => c.classList.add('click'));
    document.addEventListener('pointerup', () => c.classList.remove('click'));
  }

  /* ── Botones magnéticos ── */
  function magnetos() {
    if (!PUNTERO_FINO || !HAY_GSAP || MOV_RED) return;
    $$('.mag').forEach((el) => {
      const fx = G.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1,.5)' });
      const fy = G.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1,.5)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        fx((e.clientX - (r.left + r.width / 2)) * 0.28);
        fy((e.clientY - (r.top + r.height / 2)) * 0.36);
      });
      el.addEventListener('pointerleave', () => { fx(0); fy(0); });
    });
  }

  /* ── Inclinación 3D y brillo que sigue al mouse ── */
  function inclinacion() {
    if (!PUNTERO_FINO) return;
    $$('[data-tilt]').forEach((el) => {
      let raf = 0;
      el.addEventListener('pointermove', (e) => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          el.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
          el.style.setProperty('--my', (py * 100).toFixed(1) + '%');
          if (!MOV_RED) {
            el.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg');
            el.style.setProperty('--rx', ((0.5 - py) * 9).toFixed(2) + 'deg');
          }
        });
      });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
    });
  }

  /* ── Estados iniciales de las animaciones ── */
  function estadosIniciales() {
    if (MOV_RED) return;
    $$('.split').forEach((el) => dividir(el));
    $$('.lit').forEach((el) => dividir(el));
    G.set('.hero__t .wi', { yPercent: 115 });
    G.set(['[data-hero="pill"]', '[data-hero="sub"]', '[data-hero="pie"]'], { opacity: 0, y: 30 });
    G.set('[data-hero="cta"] > *', { opacity: 0, y: 30 });
    G.set('.cab', { yPercent: -120, opacity: 0 });
    G.set('.riel', { opacity: 0 });
    G.set('.split:not(.hero__t) .wi', { yPercent: 115 });
    G.set('.lit .wi', { opacity: 1 });
    G.set('[data-rev]', { opacity: 0, y: 46 });
  }

  /* ── Animaciones por scroll ── */
  function animaciones() {
    // títulos: las palabras suben desde su máscara
    $$('.split:not(.hero__t)').forEach((el) => {
      const ws = $$('.wi', el);
      if (MOV_RED) return;
      G.to(ws, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.055, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });

    // elementos que entran
    if (!MOV_RED) {
      ScrollTrigger.batch('[data-rev]', {
        start: 'top 90%', once: true,
        onEnter: (els) => G.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.09, overwrite: 'auto', onComplete: () => G.set(els.filter((e) => e.hasAttribute('data-tilt')), { clearProps: 'transform' }) })
      });
    }

    // contadores
    $$('[data-count]').forEach((el) => {
      if (el.classList.contains('hero__statn')) return;
      ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => countUp(el, 2.1) });
    });

    // sello giratorio
    G.to('.sello__giro', { rotate: 360, ease: 'none', scrollTrigger: { trigger: '.club', start: 'top bottom', end: 'bottom top', scrub: 0.8 } });

    // texto gigante del pie: se llena de oro al llegar
    G.fromTo('.pie__gigante span', { yPercent: 40, opacity: 0.1 }, { yPercent: 0, opacity: 1, stagger: 0.12, ease: 'none', scrollTrigger: { trigger: '.pie', start: 'top 90%', end: 'top 25%', scrub: 0.5 } });

    // marquesina: velocidad lenta y constante
    const pista = $('.marq__pista');
    if (pista && !MOV_RED) {
      G.to(pista, { xPercent: -33.3333, ease: 'none', duration: 140, repeat: -1 });
    }

    // proyectos: pista horizontal fijada (solo escritorio)
    const mm = G.matchMedia();
    mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
      const pistaP = $('#proyPista'), vista = $('.proy__vista'), barra = $('#proyBarra');
      if (!pistaP) return;
      const dist = () => Math.max(0, pistaP.scrollWidth - vista.clientWidth + 48);
      G.to(pistaP, {
        x: () => -dist(), ease: 'none',
        scrollTrigger: {
          trigger: '.proy', start: 'top top', end: () => '+=' + dist(), pin: '.proy__fijo', scrub: 0.7,
          invalidateOnRefresh: true, anticipatePin: 1,
          onUpdate: (s) => { barra.style.transform = `scaleX(${s.progress})`; }
        }
      });
    });
    // móvil: barra sigue el arrastre horizontal
    const vistaM = $('.proy__vista');
    if (vistaM) vistaM.addEventListener('scroll', () => {
      if (innerWidth > 900) return;
      const m = vistaM.scrollWidth - vistaM.clientWidth;
      $('#proyBarra').style.transform = `scaleX(${m > 0 ? vistaM.scrollLeft / m : 0})`;
    }, { passive: true });

    // cifras: pequeña cascada
    G.utils.toArray('.cifra').forEach((el) => {
      G.to(el, { yPercent: -8, ease: 'none', scrollTrigger: { trigger: '.cifras', start: 'top bottom', end: 'bottom top', scrub: 1.2 } });
    });

    // gira la escena con el scroll
    if (window.LeonesGL) ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (s) => window.LeonesGL.scroll(s.progress) });
  }

  /* ── La figura 3D que corresponde a cada sección ── */
  function escenaPorSeccion() {
    const GLx = window.LeonesGL;
    const secs = $$('[data-shape]');
    if (GLx) {
      secs.forEach((s) => {
        const cfg = { lado: parseFloat(s.dataset.lado || 0), esc: parseFloat(s.dataset.esc || 1), alfa: parseFloat(s.dataset.alfa || 1), y: parseFloat(s.dataset.y || 0), ym: parseFloat(s.dataset.ym || 0), escm: parseFloat(s.dataset.escm || 1.05) };
        ScrollTrigger.create({
          trigger: s, start: 'top 55%', end: 'bottom 55%',
          onToggle: (self) => { if (self.isActive && !document.body.classList.contains('cargando')) GLx.ir(s.dataset.shape, cfg); }
        });
      });
      // la escena solo se dibuja cuando hay una sección oscura a la vista
      const visibles = new Set();
      const io = new IntersectionObserver((es) => {
        es.forEach((e) => (e.isIntersecting ? visibles.add(e.target) : visibles.delete(e.target)));
        GLx.pausar(visibles.size === 0);
      }, { threshold: 0 });
      secs.forEach((s) => io.observe(s));
      $$('.sec--noche').forEach((s) => io.observe(s));
    }
    // riel lateral
    $$('[data-nav]').forEach((s) => {
      ScrollTrigger.create({
        trigger: s, start: 'top 50%', end: 'bottom 50%',
        onToggle: (self) => {
          if (!self.isActive) return;
          $$('.riel a').forEach((a) => a.classList.toggle('on', a.dataset.riel === s.id));
          $$('.cab__nav a').forEach((a) => a.classList.toggle('on', a.dataset.link === s.id));
          $('#riel').classList.toggle('sobre-papel', s.classList.contains('sec--papel'));
        }
      });
    });
    // en secciones claras la cabecera y el riel cambian de tinta
    $$('.sec--papel').forEach((s) => ScrollTrigger.create({
      trigger: s, start: 'top 60px', end: 'bottom 60px',
      onToggle: (self) => { document.body.classList.toggle('sobre-papel', self.isActive); }
    }));
  }

  /* ── Causas: panel que cambia (y se recorre solo) ── */
  /* Cada sección llena una pantalla: se agranda el contenido hasta que ocupe todo el alto visible. */
  function ajustarPantallas() {
    const ESC = matchMedia('(min-width: 900px) and (min-height: 560px)');
    let espera = 0;
    const aplicar = () => {
      const secs = $$('main .sec');
      secs.forEach((sec) => {
        const w = sec.querySelector(':scope > .wrap');
        if (!w) return;
        if (!ESC.matches) { w.style.zoom = ''; return; }
        const tope = innerHeight + 1;
        let lo = 0.5, hi = ({ testimonios: 1.08, dona: 1.12, unete: 1.15 })[sec.id] || 1.32;
        w.style.zoom = lo;
        if (sec.getBoundingClientRect().height > tope) return;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          w.style.zoom = mid;
          if (sec.getBoundingClientRect().height > tope) hi = mid; else lo = mid;
        }
        w.style.zoom = lo;
      });
      if (window.ScrollTrigger) ScrollTrigger.refresh();
    };
    const luego = () => { clearTimeout(espera); espera = setTimeout(aplicar, 150); };
    addEventListener('resize', luego);
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(aplicar, 400));
    setTimeout(aplicar, 1500);
    // si el contenido cambia después (textos que rotan, datos que llegan), se reajusta
    if (window.ResizeObserver) {
      let intentos = 0;
      const ro = new ResizeObserver(() => {
        const pasa = $$('main .sec').some((sec) => ESC.matches && sec.getBoundingClientRect().height > innerHeight + 2);
        if (pasa && intentos < 8) { intentos++; luego(); }
      });
      $$('main .sec').forEach((sec) => ro.observe(sec));
      addEventListener('resize', () => { intentos = 0; });
    }
  }

  function causasInteractivas() {
    const lista = $('#causaLista'); if (!lista) return;
    const causas = D_CAUSAS();
    const btns = $$('.causa', lista);
    let actual = -1, timer = null, pausa = false;
    const barra = $('#causaBarra');
    const DUR = 6;

    function poner(i, manual) {
      if (i === actual) return;
      actual = i;
      const c = causas[i];
      btns.forEach((b, k) => { b.setAttribute('aria-selected', k === i); b.parentElement.classList.toggle('on', k === i); });
      const ico = $('#causaIco');
      ico.innerHTML = ((window.ICONOS || {})[c.icono] || window.ICONOS.corazonSolo).d;
      const partes = $$('path, circle, line, rect, polyline', ico);
      partes.forEach((p) => { p.setAttribute('pathLength', '1'); p.style.strokeDasharray = '1'; p.style.strokeDashoffset = '1'; });
      $('#causaTit').innerHTML = limpiar(c.titulo);
      $('#causaTxt').innerHTML = limpiar(c.texto);
      if (HAY_GSAP && !MOV_RED) {
        G.fromTo(partes, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut', stagger: 0.08 });
        G.fromTo(['#causaTit', '#causaTxt'], { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.8, ease: 'expo.out', stagger: 0.07 });
        G.fromTo('.causas__aro', { rotate: -25, scale: 0.92 }, { rotate: 0, scale: 1, duration: 1.2, ease: 'expo.out' });
        G.killTweensOf(barra);
        G.fromTo(barra, { scaleX: 0 }, { scaleX: 1, duration: DUR, ease: 'none', onComplete: () => { if (!pausa) poner((actual + 1) % causas.length); } });
      } else {
        partes.forEach((p) => (p.style.strokeDashoffset = '0'));
      }
    }
    btns.forEach((b, i) => {
      b.addEventListener('click', () => poner(i, true));
      b.addEventListener('focus', () => poner(i, true));
    });
    poner(0);
    // el ciclo automático se pausa al interactuar
    const caja = $('.causas__cuerpo');
    caja.addEventListener('pointerenter', () => { pausa = true; if (HAY_GSAP) G.killTweensOf(barra); });
    caja.addEventListener('pointerleave', () => { pausa = false; if (HAY_GSAP && !MOV_RED) G.fromTo(barra, { scaleX: 0 }, { scaleX: 1, duration: DUR, ease: 'none', onComplete: () => { if (!pausa) poner((actual + 1) % causas.length); } }); });
  }
  let _D = null;
  const D_CAUSAS = () => (_D || {}).causas || [];

  /* ── Preguntas frecuentes ── */
  function faq() {
    $$('.fq__b').forEach((b) => b.addEventListener('click', () => {
      const abierto = b.getAttribute('aria-expanded') === 'true';
      $$('.fq__b').forEach((o) => { o.setAttribute('aria-expanded', 'false'); o.parentElement.classList.remove('on'); });
      if (!abierto) { b.setAttribute('aria-expanded', 'true'); b.parentElement.classList.add('on'); }
      if (window.ScrollTrigger) setTimeout(() => ScrollTrigger.refresh(), 520);
    }));
  }

  /* ── Testimonios ── */
  function testimonios() {
    const citas = $$('.tcita'), puntos = $$('#testPuntos button');
    if (!citas.length) return;
    let i = 0, timer = null, encima = false;
    const DUR = 8000;
    function ir(n) {
      const nuevo = (n + citas.length) % citas.length;
      if (nuevo === i && citas[i].classList.contains('on')) return;
      const viejo = citas[i];
      i = nuevo;
      citas.forEach((c, k) => { c.setAttribute('aria-hidden', k !== i); });
      puntos.forEach((p, k) => p.classList.toggle('on', k === i));
      const nueva = citas[i];
      if (HAY_GSAP && !MOV_RED) {
        // se cancela cualquier cambio a medias y se oculta todo lo que no sea el testimonio que sale o el que entra
        G.killTweensOf(citas);
        citas.forEach((c) => { if (c !== viejo && c !== nueva) { c.classList.remove('on'); G.set(c, { opacity: 0, y: 0 }); } });
        G.to(viejo, { opacity: 0, y: -24, duration: 0.35, ease: 'power2.in', onComplete: () => viejo.classList.remove('on') });
        nueva.classList.add('on');
        // el nuevo entra recién cuando el anterior ya desapareció: nunca se ven dos juntos
        G.fromTo(nueva, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, delay: 0.4, ease: 'expo.out' });
      } else { citas.forEach((c) => c.classList.remove('on')); nueva.classList.add('on'); }
      reiniciar();
    }
    function reiniciar() {
      clearTimeout(timer);
      puntos.forEach((p) => p.style.removeProperty('--dur'));
      const p = puntos[i]; if (p) { p.style.setProperty('--dur', DUR + 'ms'); }
      if (!encima && !MOV_RED) timer = setTimeout(() => ir(i + 1), DUR);
    }
    $('#testNext').addEventListener('click', () => ir(i + 1));
    $('#testPrev').addEventListener('click', () => ir(i - 1));
    puntos.forEach((p, k) => p.addEventListener('click', () => ir(k)));
    const caja = $('#testCaja');
    caja.addEventListener('pointerenter', () => { encima = true; clearTimeout(timer); caja.classList.add('pausa'); });
    caja.addEventListener('pointerleave', () => { encima = false; caja.classList.remove('pausa'); reiniciar(); });
    // deslizar con el dedo
    let x0 = null;
    caja.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    caja.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) ir(i + (dx < 0 ? 1 : -1)); x0 = null; });
    reiniciar();
  }

  /* ── Copiar datos bancarios ── */
  function compartir(D) {
    document.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-compartir]'); if (!b) return;
      const url = location.href.split('#')[0] + '#dona';
      const club = (D.identidad && D.identidad.nombre) || 'Club de Leones Temuco Antumalal';
      const mes = b.dataset.compMes ? ' (' + b.dataset.compMes.toLowerCase() + ')' : '';
      const invitacion = '¡Te invitamos a la actividad «' + b.dataset.compartir + '» del ' + club + mes + '! Participa y apoya las causas del club.';
      const datos = { title: b.dataset.compartir + ' · ' + club, text: invitacion, url };
      const aviso = (t) => { const o = b.innerHTML; b.textContent = t; setTimeout(() => { b.innerHTML = o; }, 2200); };
      if (navigator.share) { try { await navigator.share(datos); } catch { /* el usuario canceló */ } return; }
      try { await navigator.clipboard.writeText(invitacion + '\n' + url); aviso('Texto y enlace copiados'); }
      catch { window.prompt('Copia este enlace para compartir:', url); }
    });
  }
  function copiar() {
    $$('.copiar').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(b.dataset.copia); }
      catch { const t = document.createElement('textarea'); t.value = b.dataset.copia; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      b.classList.add('ok'); setTimeout(() => b.classList.remove('ok'), 1600);
    }));
  }

  /* ── Formulario ── */
  function formulario(D) {
    const f = $('#form'); if (!f) return;
    const msg = $('#formMsg');
    const C = D.contacto || {};
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (id) => f.elements[id].value.trim();
      const datos = { nombre: v('nombre'), telefono: v('telefono'), email: v('email'), motivo: v('motivo'), mensaje: v('mensaje') };
      if (f.elements.origen) datos.origen = v('origen');
      let ok = true;
      ['nombre', 'email', 'mensaje'].forEach((k) => {
        const el = f.elements[k]; const mal = !datos[k] || (k === 'email' && !/^\S+@\S+\.\S+$/.test(datos[k]));
        el.closest('.campo').classList.toggle('error', mal); if (mal) ok = false;
      });
      msg.className = 'form__msg';
      if (!ok) { msg.textContent = 'Revisa los campos marcados.'; msg.classList.add('mal'); return; }
      const endpoint = D.formulario && D.formulario.endpoint;
      if (endpoint) {
        try {
          const r = await fetch(endpoint, { method: (D.formulario.metodo || 'POST'), headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(Object.assign({ _subject: "Nuevo mensaje desde clta.cl", _template: "table" }, datos)) });
          if (!r.ok) throw new Error();
          msg.textContent = '¡Gracias! Recibimos tu mensaje y te responderemos pronto.'; msg.classList.add('bien'); f.reset();
        } catch { msg.textContent = 'No pudimos enviarlo. Escríbenos al correo info@clta.cl.'; msg.classList.add('mal'); }
      } else {
        const correo = texto(C.email) || "info@clta.cl";
        const t = `${datos.mensaje}

${datos.nombre}${datos.telefono ? " · " + datos.telefono : ""} · ${datos.email}${datos.origen ? `

Cómo conocí el club: ${datos.origen}` : ""}`;
        window.location.href = `mailto:${correo}?subject=${encodeURIComponent(datos.motivo)}&body=${encodeURIComponent(t)}`;
        msg.textContent = "Abrimos tu correo con el mensaje listo para enviar."; msg.classList.add("bien");
      }
    });
    $$('.campo input, .campo textarea').forEach((el) => el.addEventListener('input', () => el.closest('.campo').classList.remove('error')));
  }

  arrancar().catch((e) => {
    console.error('[rediseño]', e);
    document.body.classList.remove('cargando');
    const c = $('#carga'); if (c) c.remove();
  });
})();
