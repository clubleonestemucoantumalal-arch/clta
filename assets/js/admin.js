/* =========================================================================
   ADMIN.JS — PANEL DE ADMINISTRACIÓN
   Club de Leones Temuco Antumalal
   -------------------------------------------------------------------------
   Qué hace:
     1. Lee lo que hoy está publicado (data/contenido.json, data/imagenes.json
        y data/instagram.json).
     2. Lo muestra en formularios en español para editarlo sin tocar código.
     3. Guarda un borrador en este navegador mientras se trabaja.
     4. Al "Publicar", entrega los archivos listos (descarga) o los sube solo
        a GitHub.

   No hay servidor ni base de datos: el sitio sigue siendo archivos estáticos.
   ========================================================================= */
(() => {
  'use strict';

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];

  /* ═══════════════════════════════════════════════════════════════
     0. UTILIDADES
     ═══════════════════════════════════════════════════════════════ */

  const esc = (v) => String(v == null ? '' : v)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Lee y escribe usando rutas tipo "textos.hero.titulo". El prefijo "ig:"
     apunta al archivo de Instagram en vez del de contenido. */
  function raiz(ruta) {
    return ruta.startsWith('ig:') ? { obj: ESTADO.instagram, camino: ruta.slice(3) }
                                  : { obj: ESTADO.datos,     camino: ruta };
  }

  function obtener(ruta, porDefecto) {
    const { obj, camino } = raiz(ruta);
    const v = camino.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    return v === undefined || v === null ? porDefecto : v;
  }

  function asignar(ruta, valor) {
    const { obj, camino } = raiz(ruta);
    const partes = camino.split('.');
    const ultima = partes.pop();
    let cursor = obj;
    partes.forEach((k) => {
      if (typeof cursor[k] !== 'object' || cursor[k] === null) cursor[k] = {};
      cursor = cursor[k];
    });
    cursor[ultima] = valor;
    ensuciar();
  }

  const clonar = (o) => JSON.parse(JSON.stringify(o));

  function aviso(texto, tipo) {
    const caja = $('#tostadas');
    const t = document.createElement('div');
    t.className = 'tostada';
    t.dataset.t = tipo || 'ok';
    const ico = tipo === 'mal'
      ? '<path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/>'
      : '<path d="m5 13 4 4L19 7"/>';
    t.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"
      stroke-linecap="round" stroke-linejoin="round">${ico}</svg><span>${esc(texto)}</span>`;
    caja.appendChild(t);
    setTimeout(() => {
      t.style.transition = 'opacity .3s, transform .3s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(() => t.remove(), 320);
    }, 3400);
  }

  const pesar = (bytes) => bytes < 1024 ? bytes + ' B'
    : bytes < 1048576 ? (bytes / 1024).toFixed(0) + ' KB'
    : (bytes / 1048576).toFixed(1) + ' MB';

  const pesoTexto = (s) => new Blob([s]).size;

  /* ═══════════════════════════════════════════════════════════════
     1. ESTADO
     ═══════════════════════════════════════════════════════════════ */

  const ESTADO = {
    datos: null,        // data/contenido.json
    imagenes: {},       // data/imagenes.json  (fotos subidas, ya comprimidas)
    instagram: null,    // data/instagram.json
    huellaPublicada: '',// cómo estaba todo la última vez que se publicó
    seccion: 'inicio',
    sucio: false
  };

  /* Resumen de todo el contenido, para saber si hay algo sin publicar.
     De las fotos basta con sus nombres: una vez creadas no cambian. */
  function huella() {
    return JSON.stringify([
      Object.assign({}, ESTADO.datos, { actualizado: null }),
      ESTADO.instagram,
      Object.keys(ESTADO.imagenes).sort()
    ]);
  }

  function ensuciar() {
    ESTADO.sucio = huella() !== ESTADO.huellaPublicada;
    pintarEstado();
    guardarBorrador();
  }

  function pintarEstado() {
    const el = $('#estado');
    if (!el) return;
    el.dataset.e = ESTADO.sucio ? 'sucio' : 'limpio';
    el.lastElementChild.textContent = ESTADO.sucio ? 'Cambios sin publicar' : 'Todo publicado';
  }

  /* El borrador se guarda SIEMPRE, también después de publicar. Así, si alguien
     descarga los archivos y todavía no los sube al servidor, al volver a abrir
     el panel su trabajo sigue ahí en vez de aparecer perdido. */
  let tempGuardado = null;
  function guardarBorrador() {
    clearTimeout(tempGuardado);
    tempGuardado = setTimeout(() => {
      const ok = ALMACEN.guardarChico('borrador', ESTADO.datos)
              && ALMACEN.guardarChico('borradorIg', ESTADO.instagram);
      if (!ok) aviso('No se pudo guardar el borrador en este navegador.', 'mal');
      ALMACEN.guardar('imagenes', ESTADO.imagenes).catch(() => {
        aviso('Las fotos no cupieron en el borrador. Publica pronto.', 'mal');
      });
    }, 420);
  }

  function olvidarBorrador() {
    ALMACEN.borrarChico('borrador');
    ALMACEN.borrarChico('borradorIg');
    ALMACEN.borrar('imagenes');
  }

  /* ═══════════════════════════════════════════════════════════════
     2. CANDADO DE ENTRADA
     ═══════════════════════════════════════════════════════════════ */

  async function resumir(texto) {
    // Nunca se guarda la clave tal cual, sino su huella.
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('leones::' + texto));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Navegador sin criptografía disponible: huella simple de respaldo.
      let h = 5381;
      for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) | 0;
      return 'simple' + (h >>> 0).toString(16);
    }
  }

  function iniciarCandado() {
    const guardada = ALMACEN.leerChico('clave', null);
    const primeraVez = !guardada;

    if (primeraVez) {
      $('#entradaSub').textContent = 'Primera vez: crea la clave con la que entrarás al panel.';
      $('#claveRepetirCampo').classList.remove('oculto');
      $('#entradaBtn').textContent = 'Crear clave y entrar';
      $('#clave').placeholder = 'Elige una clave';
      $('#clave').autocomplete = 'new-password';
    }

    $('#formEntrada').addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = $('#clave').value;
      const error = (m) => {
        $('#entradaErrorTxt').textContent = m;
        $('#entradaError').classList.remove('oculto');
      };
      $('#entradaError').classList.add('oculto');

      if (primeraVez) {
        if (val.length < 4) return error('La clave debe tener al menos 4 caracteres.');
        if (val !== $('#claveRepetir').value) return error('Las dos claves no coinciden.');
        ALMACEN.guardarChico('clave', await resumir(val));
        return entrar();
      }

      if (await resumir(val) !== guardada) return error('Clave incorrecta. Inténtalo de nuevo.');
      entrar();
    });

    $('#clave').focus();
  }

  function entrar() {
    $('#entrada').remove();
    $('#app').classList.remove('oculto');
    arrancar();
  }

  /* ═══════════════════════════════════════════════════════════════
     3. CARGA DE DATOS
     ═══════════════════════════════════════════════════════════════ */

  const bajarJson = (url) => fetch(url, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  async function cargar() {
    const [contenido, imagenes, ig] = await Promise.all([
      bajarJson('data/contenido.json'),
      bajarJson('data/imagenes.json'),
      bajarJson('data/instagram.json')
    ]);

    if (!contenido) {
      // Puede pasar al abrir admin.html con doble clic (sin servidor).
      $('#lienzo').innerHTML = `
        <div class="aviso aviso--mal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
          <span>
            <b>No se pudo leer data/contenido.json</b>
            El panel necesita un servidor local para leer los archivos del sitio.
            Abre una terminal en la carpeta del proyecto, escribe
            <code>npm run dev</code> y entra a
            <a href="http://localhost:5544/admin.html">http://localhost:5544/admin.html</a>.
          </span>
        </div>`;
      throw new Error('sin contenido');
    }

    ESTADO.datos = normalizar(contenido);
    ESTADO.instagram = ig || { usuario: '', perfil: '', seguidores: 0, publicaciones: [] };
    ESTADO.imagenes = imagenes && typeof imagenes === 'object' ? imagenes : {};
    delete ESTADO.imagenes._comentario;

    // Así está el sitio en línea ahora mismo: sirve de referencia para saber
    // si lo que hay en pantalla tiene cambios sin publicar.
    ESTADO.huellaPublicada = huella();

    // ¿Quedó trabajo a medio hacer la última vez?
    const b = ALMACEN.leerChico('borrador', null);
    if (b) {
      const bIg = ALMACEN.leerChico('borradorIg', null);
      const bImg = await ALMACEN.leer('imagenes');
      ESTADO.datos = normalizar(b);
      if (bIg) ESTADO.instagram = bIg;
      if (bImg) ESTADO.imagenes = bImg;
    }

    ESTADO.sucio = huella() !== ESTADO.huellaPublicada;
  }

  /* Rellena lo que pudiera faltar (por ejemplo al restaurar una copia vieja),
     para que ninguna sección del panel se caiga por una llave ausente. */
  function normalizar(d) {
    const listas = ['impacto', 'causas', 'sellos', 'proyectos', 'valores',
                    'directiva', 'testimonios', 'faq', 'donaOps', 'donaEventos', 'clubFirma'];
    listas.forEach((k) => { if (!Array.isArray(d[k])) d[k] = []; });

    const objetos = ['identidad', 'contacto', 'redes', 'formulario', 'noticias',
                     'instagram', 'donaciones', 'textos', 'imagenClaves'];
    objetos.forEach((k) => {
      if (typeof d[k] !== 'object' || d[k] === null || Array.isArray(d[k])) d[k] = {};
    });

    if (typeof d.agenda !== 'object' || d.agenda === null) d.agenda = {};
    if (!Array.isArray(d.agenda.eventos)) d.agenda.eventos = [];
    if (!Array.isArray(d.textos.marquesina)) d.textos.marquesina = [];
    return d;
  }

  /* ═══════════════════════════════════════════════════════════════
     4. CAMPOS DE FORMULARIO
     ═══════════════════════════════════════════════════════════════ */

  let contadorId = 0;
  const nuevoId = () => 'c' + (++contadorId);

  /* Cada tipo de campo devuelve un elemento ya conectado a los datos. */
  function campo(def, prefijo) {
    const ruta = prefijo ? prefijo + '.' + def.ruta : def.ruta;
    const caja = document.createElement('div');
    caja.className = 'campo';
    const id = nuevoId();
    const etiqueta = def.etiqueta
      ? `<label for="${id}">${esc(def.etiqueta)}</label>` : '';
    const ayuda = def.ayuda ? `<span class="ayuda">${def.ayuda}</span>` : '';

    switch (def.tipo) {

      case 'switch': {
        caja.innerHTML = `
          <label class="switch">
            <input type="checkbox" id="${id}">
            <span class="switch__pista"></span>
            <span class="switch__txt">${esc(def.etiqueta)}</span>
          </label>${ayuda}`;
        const inp = $('input', caja);
        inp.checked = !!obtener(ruta, def.pordefecto);
        inp.addEventListener('change', () => asignar(ruta, inp.checked));
        break;
      }

      case 'select': {
        caja.innerHTML = `${etiqueta}<select id="${id}">${
          def.opciones.map((o) => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('')
        }</select>${ayuda}`;
        const sel = $('select', caja);
        sel.value = obtener(ruta, def.opciones[0].v);
        sel.addEventListener('change', () => asignar(ruta, sel.value));
        break;
      }

      case 'area':
      case 'rico': {
        const rico = def.tipo === 'rico';
        caja.innerHTML = `
          ${etiqueta}
          ${rico ? `<div class="rico__barra">
            <button type="button" class="rico__b" data-envolver="strong"><b>Negrita</b></button>
            <button type="button" class="rico__b" data-envolver="em"><i>Cursiva</i></button>
            <button type="button" class="rico__b" data-envolver="br">Salto de línea</button>
          </div>` : ''}
          <textarea id="${id}" rows="${def.filas || 3}" placeholder="${esc(def.marca || '')}"></textarea>
          ${rico ? '<div class="rico__vista"></div>' : ''}
          ${ayuda}`;
        const ta = $('textarea', caja);
        ta.value = obtener(ruta, '');
        const vista = $('.rico__vista', caja);
        const refrescar = () => { if (vista) vista.innerHTML = ta.value; };
        refrescar();
        ta.addEventListener('input', () => { asignar(ruta, ta.value); refrescar(); if (def.alCambiar) def.alCambiar(); });
        $$('[data-envolver]', caja).forEach((b) => b.addEventListener('click', () => {
          envolver(ta, b.dataset.envolver);
          asignar(ruta, ta.value); refrescar();
        }));
        break;
      }

      case 'chips': {
        caja.innerHTML = `${etiqueta}
          <div class="chips"></div>
          <div style="display:flex; gap:7px">
            <input type="text" id="${id}" placeholder="${esc(def.marca || 'Escribe y presiona Enter')}">
            <button type="button" class="btn btn--linea btn--sm" data-agregar>Agregar</button>
          </div>${ayuda}`;
        const cont = $('.chips', caja);
        const inp = $('input', caja);
        const pintar = () => {
          const lista = obtener(ruta, []) || [];
          cont.innerHTML = lista.map((t, i) =>
            `<span class="chip">${esc(t)}<button type="button" data-quitar="${i}" aria-label="Quitar">&times;</button></span>`).join('')
            || '<span class="ayuda">Todavía no hay nada en esta lista.</span>';
        };
        const agregar = () => {
          const v = inp.value.trim();
          if (!v) return;
          asignar(ruta, [...(obtener(ruta, []) || []), v]);
          inp.value = ''; pintar();
        };
        pintar();
        $('[data-agregar]', caja).addEventListener('click', agregar);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } });
        cont.addEventListener('click', (e) => {
          const b = e.target.closest('[data-quitar]');
          if (!b) return;
          const lista = [...(obtener(ruta, []) || [])];
          lista.splice(+b.dataset.quitar, 1);
          asignar(ruta, lista); pintar();
        });
        break;
      }

      case 'parrafos': {
        caja.innerHTML = `${etiqueta}<div class="parrafos"></div>
          <button type="button" class="btn btn--linea btn--sm" data-agregar style="margin-top:8px">
            + Agregar párrafo</button>${ayuda}`;
        const cont = $('.parrafos', caja);
        const pintar = () => {
          const lista = obtener(ruta, []) || [];
          cont.innerHTML = '';
          lista.forEach((txt, i) => {
            const fila = document.createElement('div');
            fila.style.cssText = 'display:flex; gap:7px; margin-bottom:7px; align-items:flex-start';
            fila.innerHTML = `
              <textarea rows="3" style="flex:1"></textarea>
              <button type="button" class="btn btn--peligro btn--sm" data-quitar="${i}" aria-label="Quitar párrafo">&times;</button>`;
            const ta = $('textarea', fila);
            ta.value = txt;
            ta.addEventListener('input', () => {
              const l = [...(obtener(ruta, []) || [])];
              l[i] = ta.value;
              asignar(ruta, l);
            });
            cont.appendChild(fila);
          });
          if (!lista.length) cont.innerHTML = '<div class="vacio">Sin párrafos.</div>';
        };
        pintar();
        $('[data-agregar]', caja).addEventListener('click', () => {
          asignar(ruta, [...(obtener(ruta, []) || []), '']); pintar();
        });
        cont.addEventListener('click', (e) => {
          const b = e.target.closest('[data-quitar]');
          if (!b) return;
          const l = [...(obtener(ruta, []) || [])];
          l.splice(+b.dataset.quitar, 1);
          asignar(ruta, l); pintar();
        });
        break;
      }

      case 'icono': {
        caja.innerHTML = `${etiqueta}<div class="iconos"></div>${ayuda}`;
        const cont = $('.iconos', caja);
        const actual = obtener(ruta, 'corazonSolo');
        Object.entries(window.ICONOS).forEach(([clave, ico]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'iconos__b' + (clave === actual ? ' activo' : '');
          b.title = ico.nombre;
          b.setAttribute('aria-label', ico.nombre);
          b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ico.d}</svg>`;
          b.addEventListener('click', () => {
            $$('.iconos__b', cont).forEach((o) => o.classList.remove('activo'));
            b.classList.add('activo');
            asignar(ruta, clave);
          });
          cont.appendChild(b);
        });
        break;
      }

      case 'imagen': {
        caja.innerHTML = `${etiqueta}
          <div class="foto">
            <div class="foto__vista"><span>Sin foto</span></div>
            <div class="foto__acc">
              <input type="file" accept="image/*" hidden>
              <button type="button" class="btn btn--linea btn--sm" data-subir>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
                Subir foto
              </button>
              <button type="button" class="btn btn--peligro btn--sm" data-quitar>Quitar foto</button>
              <span class="foto__peso"></span>
            </div>
          </div>${ayuda}`;

        const vista = $('.foto__vista', caja);
        const archivo = $('input[type=file]', caja);
        const peso = $('.foto__peso', caja);

        const pintar = () => {
          const ref = obtener(ruta, def.pordefecto || '');
          const src = resolverImagen(ref);
          if (src) {
            vista.innerHTML = `<img src="${esc(src)}" alt="">`;
            const subida = String(ref).startsWith('img:');
            peso.innerHTML = subida
              ? `Foto subida · <b>${pesar(pesoTexto(ESTADO.imagenes[String(ref).slice(4)] || ''))}</b>`
              : `Archivo del sitio · <b>${esc(ref)}</b>`;
          } else {
            vista.innerHTML = '<span>Sin foto</span>';
            peso.textContent = '';
          }
        };

        $('[data-subir]', caja).addEventListener('click', () => archivo.click());
        archivo.addEventListener('change', async () => {
          const f = archivo.files[0];
          if (!f) return;
          try {
            const clave = (def.clave || ruta.replace(/[^a-z0-9]+/gi, '-')) + '-' + Date.now().toString(36);
            const dato = await comprimir(f, def.ancho || 1600);
            const anterior = obtener(ruta, '');
            if (String(anterior).startsWith('img:')) delete ESTADO.imagenes[String(anterior).slice(4)];
            ESTADO.imagenes[clave] = dato;
            asignar(ruta, 'img:' + clave);
            pintar();
            aviso('Foto lista (' + pesar(pesoTexto(dato)) + ').');
          } catch (err) {
            aviso('No se pudo procesar esa imagen.', 'mal');
          }
          archivo.value = '';
        });

        $('[data-quitar]', caja).addEventListener('click', () => {
          const anterior = obtener(ruta, '');
          if (String(anterior).startsWith('img:')) delete ESTADO.imagenes[String(anterior).slice(4)];
          asignar(ruta, def.pordefecto || '');
          pintar();
        });

        pintar();
        break;
      }

      default: {  // texto, url, email, tel, numero, fecha
        const tipos = { numero: 'number', url: 'url', email: 'email', tel: 'tel', fecha: 'date' };
        caja.innerHTML = `${etiqueta}<input type="${tipos[def.tipo] || 'text'}" id="${id}"
          placeholder="${esc(def.marca || '')}">${ayuda}`;
        const inp = $('input', caja);
        inp.value = obtener(ruta, def.tipo === 'numero' ? 0 : '');
        inp.addEventListener('input', () => {
          asignar(ruta, def.tipo === 'numero' ? (parseInt(inp.value, 10) || 0) : inp.value);
          if (def.alCambiar) def.alCambiar();
        });
      }
    }

    return caja;
  }

  /* Envuelve el texto seleccionado de un textarea con una etiqueta. */
  function envolver(ta, etiqueta) {
    const i = ta.selectionStart, f = ta.selectionEnd;
    if (etiqueta === 'br') {
      ta.setRangeText('<br>', i, f, 'end');
    } else {
      const sel = ta.value.slice(i, f) || 'texto';
      ta.setRangeText(`<${etiqueta}>${sel}</${etiqueta}>`, i, f, 'end');
    }
    ta.focus();
    ta.dispatchEvent(new Event('input'));
  }

  function resolverImagen(ref) {
    const r = String(ref || '');
    if (!r) return '';
    if (r.startsWith('img:')) return ESTADO.imagenes[r.slice(4)] || '';
    return r;
  }

  /* ─── Comprimir fotos antes de guardarlas ───
     Las cámaras de teléfono entregan archivos de 3 a 8 MB. Para la web no
     hacen falta: se reducen a un ancho razonable y se guardan en WebP
     (o JPEG si el navegador es antiguo). */
  async function comprimir(file, maxAncho) {
    const bitmap = await cargarImagen(file);
    const escala = Math.min(1, maxAncho / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * escala));
    const h = Math.max(1, Math.round(bitmap.height * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = w; lienzo.height = h;
    const ctx = lienzo.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);          // fondo blanco para PNG con transparencia
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();

    let url = lienzo.toDataURL('image/webp', 0.82);
    if (!url.startsWith('data:image/webp')) url = lienzo.toDataURL('image/jpeg', 0.82);
    return url;
  }

  function cargarImagen(file) {
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(() => createImageBitmap(file))
        .catch(() => viaEtiqueta(file));
    }
    return viaEtiqueta(file);
  }

  function viaEtiqueta(file) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); ok(img); };
      img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('imagen ilegible')); };
      img.src = url;
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     4b. IMPORTAR ACTIVIDADES DESDE EL PORTAL DE LIONS
     -------------------------------------------------------------------------
     Lee el CSV que se descarga con el botón "Descargar Excel" en
     https://lionsinternational.my.site.com/s/manage-my-activities y crea
     tarjetas en "Proyectos". Las reuniones internas (tipo "Meeting") se
     descartan: solo interesan donaciones y proyectos de servicio.
     ═══════════════════════════════════════════════════════════════ */

  const CAUSA_LIONS_ES = {
    'youth': 'Juventud',
    'disaster relief': 'Auxilio en casos de desastre',
    'vision': 'Visión',
    'other humanitarian service': 'Otro servicio humanitario',
    'childhood cancer': 'Cáncer infantil',
    'hunger': 'Hambre',
    'diabetes': 'Diabetes',
    'environment': 'Medio ambiente'
    // "administration" (reuniones y trámites internos) se ignora a propósito.
  };

  /* Parser CSV simple: entiende comillas, comas dentro de campos y "" escapadas. */
  function analizarCSV(texto) {
    if (texto.charCodeAt(0) === 0xFEFF) texto = texto.slice(1); // BOM
    const filas = [];
    let fila = [], campo = '', enComillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i], sig = texto[i + 1];
      if (enComillas) {
        if (c === '"' && sig === '"') { campo += '"'; i++; }
        else if (c === '"') enComillas = false;
        else campo += c;
      } else if (c === '"') enComillas = true;
      else if (c === ',') { fila.push(campo); campo = ''; }
      else if (c === '\r') { /* se ignora */ }
      else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else campo += c;
    }
    if (campo.length || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter((f) => f.length > 1 || f[0] !== '');
  }

  function leerActividadesLions(textoCSV) {
    const filas = analizarCSV(textoCSV);
    if (filas.length < 2) return { validas: [], ignoradas: 0 };
    const enc = filas[0].map((h) => h.trim().toLowerCase());
    const col = (pista) => enc.findIndex((h) => h.includes(pista));
    const iId = col('identifica'), iTitulo = col('tulo'), iFin = col('finaliz'),
          iTipo = col('actividades de servicio'), iCausa = col('causa');

    const validas = [];
    let ignoradas = 0;
    filas.slice(1).forEach((f) => {
      if (!f[iTitulo]) return;
      const tipo = (f[iTipo] || '').trim().toLowerCase();
      const causaEn = (f[iCausa] || '').trim().toLowerCase();
      const causaEs = CAUSA_LIONS_ES[causaEn];
      if ((tipo !== 'donation' && tipo !== 'service_project') || !causaEs) { ignoradas++; return; }
      const titulo = f[iTitulo].replace(/^[\s",]+|[\s",]+$/g, '');
      if (!titulo) { ignoradas++; return; }
      validas.push({
        idLions: (f[iId] || '').trim(),
        tag: causaEs,
        titulo,
        texto: '',
        imagen: 'assets/img/fotos/proyecto-1.svg',
        enlace: '#contacto',
        ancho: false,
        fecha: (f[iFin] || '').trim()
      });
    });
    return { validas, ignoradas };
  }

  function pintarImportadorLions(caja) {
    caja.innerHTML = `
      <div class="tarjeta__cab"><div>
        <h3>Importar actividades desde Lions</h3>
        <p>Entra a <a href="https://lionsinternational.my.site.com/s/manage-my-activities" target="_blank" rel="noopener">Manage My Activities</a>,
        haz clic en <b>«Descargar Excel»</b> y sube aquí ese archivo. Se crea una tarjeta de proyecto por cada
        donación o proyecto de servicio (las reuniones internas se ignoran). Después completa la descripción
        y la foto de cada tarjeta más abajo: el archivo no las trae.</p>
      </div></div>
      <div class="campo"><input type="file" id="lionsArchivo" accept=".csv"></div>
      <div id="lionsResumen"></div>
      <button type="button" class="btn btn--oro btn--sm oculto" id="lionsConfirmar" style="margin-top:10px">Agregar a Proyectos</button>`;

    let pendientes = null;

    $('#lionsArchivo', caja).addEventListener('change', async (e) => {
      const archivo = e.target.files[0];
      const resumen = $('#lionsResumen', caja), btn = $('#lionsConfirmar', caja);
      btn.classList.add('oculto');
      pendientes = null;
      if (!archivo) { resumen.innerHTML = ''; return; }

      const texto = await archivo.text();
      const { validas, ignoradas } = leerActividadesLions(texto);
      const actuales = obtener('proyectos', []) || [];
      const nuevas = validas.filter((v) => !actuales.some((a) => a.idLions === v.idLions));
      const actualizables = validas.filter((v) => actuales.some((a) => a.idLions === v.idLions));

      if (!validas.length) {
        resumen.innerHTML = `<div class="aviso aviso--mal" style="margin-top:10px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>
          <span>No se reconoció ninguna actividad en ese archivo. Revisa que sea el CSV descargado directo del portal de Lions.</span></div>`;
        return;
      }

      resumen.innerHTML = `<div class="aviso aviso--ok" style="margin-top:10px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>
        <span><b>${nuevas.length} actividad${nuevas.length === 1 ? '' : 'es'} nueva${nuevas.length === 1 ? '' : 's'}</b> para agregar
        ${actualizables.length ? `, ${actualizables.length} ya existían (se actualiza su título/causa)` : ''}.
        ${ignoradas ? `${ignoradas} fila${ignoradas === 1 ? '' : 's'} se ignoraron por ser reuniones u otro tipo interno.` : ''}</span></div>`;

      pendientes = validas;
      btn.classList.remove('oculto');
    });

    $('#lionsConfirmar', caja).addEventListener('click', () => {
      if (!pendientes) return;
      const actuales = obtener('proyectos', []) || [];
      const porId = new Map(actuales.map((p, i) => [p.idLions, i]));
      const resultado = actuales.slice();
      const nuevas = [];
      let agregados = 0, actualizados = 0;
      pendientes.forEach((v) => {
        if (v.idLions && porId.has(v.idLions)) {
          const i = porId.get(v.idLions);
          resultado[i] = Object.assign({}, resultado[i], { titulo: v.titulo, tag: v.tag, fecha: v.fecha });
          actualizados++;
        } else {
          nuevas.push(v);
          agregados++;
        }
      });
      const final = nuevas.concat(resultado);
      asignar('proyectos', final);
      aviso(`Listo: ${agregados} agregadas, ${actualizados} actualizadas. Revisa la descripción y la foto de cada una.`, 'ok');
      pintarSeccion();
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     5. BLOQUES REPETIBLES
     ═══════════════════════════════════════════════════════════════ */

  function repetidor(def) {
    const caja = document.createElement('div');
    caja.className = 'tarjeta';
    caja.innerHTML = `
      <div class="tarjeta__cab">
        <div>
          <h3>${esc(def.etiqueta)}</h3>
          ${def.ayuda ? `<p>${def.ayuda}</p>` : ''}
        </div>
        <span class="cuenta"></span>
      </div>
      <div class="lista"></div>
      <button type="button" class="btn btn--linea btn--sm" data-nuevo style="margin-top:10px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        ${esc(def.textoNuevo || 'Agregar')}
      </button>`;

    const lista = $('.lista', caja);
    const cuenta = $('.cuenta', caja);
    let abierto = -1;

    function datos() { return obtener(def.ruta, []) || []; }

    function guardar(nuevos) { asignar(def.ruta, nuevos); }

    function pintar() {
      const items = datos();
      cuenta.textContent = items.length + (items.length === 1 ? ' ficha' : ' fichas');
      lista.innerHTML = '';

      if (!items.length) {
        lista.innerHTML = `<div class="vacio">${esc(def.vacio || 'Todavía no hay nada aquí. Usa el botón de abajo para agregar.')}</div>`;
        return;
      }

      items.forEach((it, i) => {
        const el = document.createElement('div');
        el.className = 'item' + (i === abierto ? ' abierto' : '');
        const titulo = def.titulo ? def.titulo(it, i) : ('Ficha ' + (i + 1));
        el.innerHTML = `
          <button type="button" class="item__cab">
            <span class="item__n">${i + 1}</span>
            <span class="item__t">${titulo ? esc(titulo) : '<em>Sin título</em>'}</span>
            <svg class="item__flecha" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
          </button>
          <div class="item__cuerpo"></div>`;

        const cuerpo = $('.item__cuerpo', el);
        if (i === abierto) {
          def.campos.forEach((c) => cuerpo.appendChild(campo(
            Object.assign({}, c, { alCambiar: pintarTitulo }), `${def.ruta}.${i}`
          )));

          const pie = document.createElement('div');
          pie.className = 'item__pie';
          pie.innerHTML = `
            <button type="button" class="btn btn--linea" data-mover="-1" ${i === 0 ? 'disabled' : ''}>↑ Subir</button>
            <button type="button" class="btn btn--linea" data-mover="1" ${i === items.length - 1 ? 'disabled' : ''}>↓ Bajar</button>
            <button type="button" class="btn btn--linea" data-duplicar>Duplicar</button>
            <button type="button" class="btn btn--peligro" data-borrar style="margin-left:auto">Eliminar</button>`;
          cuerpo.appendChild(pie);

          $('[data-borrar]', pie).addEventListener('click', () => {
            if (!confirm('¿Eliminar esta ficha? No se puede deshacer.')) return;
            const l = clonar(datos()); l.splice(i, 1);
            abierto = -1; guardar(l); pintar();
          });
          $('[data-duplicar]', pie).addEventListener('click', () => {
            const l = clonar(datos()); l.splice(i + 1, 0, clonar(l[i]));
            abierto = i + 1; guardar(l); pintar();
          });
          $$('[data-mover]', pie).forEach((b) => b.addEventListener('click', () => {
            const d = +b.dataset.mover;
            const l = clonar(datos());
            if (i + d < 0 || i + d >= l.length) return;
            [l[i], l[i + d]] = [l[i + d], l[i]];
            abierto = i + d; guardar(l); pintar();
          }));
        }

        function pintarTitulo() {
          const t = def.titulo ? def.titulo(datos()[i] || {}, i) : '';
          $('.item__t', el).innerHTML = t ? esc(t) : '<em>Sin título</em>';
        }

        $('.item__cab', el).addEventListener('click', () => {
          abierto = (abierto === i) ? -1 : i;
          pintar();
        });

        lista.appendChild(el);
      });
    }

    $('[data-nuevo]', caja).addEventListener('click', () => {
      const l = clonar(datos());
      l.push(clonar(def.nuevo));
      abierto = l.length - 1;
      guardar(l); pintar();
      lista.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    pintar();
    return caja;
  }

  /* ═══════════════════════════════════════════════════════════════
     6. DEFINICIÓN DE LAS SECCIONES DEL PANEL
     ═══════════════════════════════════════════════════════════════ */

  const ICO = {
    inicio:  '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
    club:    '<path d="M12 2 3 7v6c0 5 3.8 8.7 9 9 5.2-.3 9-4 9-9V7l-9-5Z"/>',
    tel:     '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
    red:     '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z"/>',
    dona:    '<path d="M12 21c-4.5-2.7-8-6.4-8-11a5 5 0 0 1 8-3.5A5 5 0 0 1 20 10c0 4.6-3.5 8.3-8 11Z"/>',
    portada: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 15 5-4 4 3 3-2 6 5"/>',
    texto:   '<path d="M4 6h16M4 12h16M4 18h10"/>',
    grid:    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    numero:  '<path d="M8 4v16M16 4v16M4 9h16M4 15h16"/>',
    cal:     '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    gente:   '<circle cx="9" cy="8" r="3.2"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M17 6.5a3 3 0 0 1 0 5.6"/>',
    comilla: '<path d="M7 15a4 4 0 1 1 0-8v-2a6 6 0 0 0 0 12ZM18 15a4 4 0 1 1 0-8v-2a6 6 0 0 0 0 12Z"/>',
    duda:    '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.8-.9 1.4v.6M12 17h.01"/>',
    diario:  '<path d="M4 5a2 2 0 0 1 2-2h9v18H6a2 2 0 0 1-2-2Z"/><path d="M15 7h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-3M8 8h4M8 12h4M8 16h3"/>',
    camara:  '<rect x="2" y="2" width="20" height="20" rx="5.5"/><circle cx="12" cy="12" r="4"/>',
    subir:   '<path d="M12 16V4M7 9l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>'
  };

  const SECCIONES = [

    /* ───────────────────────────── INICIO ───────────────────────────── */
    { id: 'inicio', grupo: 'Sitio', nombre: 'Inicio', ico: ICO.inicio,
      titulo: 'Inicio',
      bajada: 'Un vistazo rápido a cómo está el sitio y qué falta por completar.',
      pintar: panelInicio },

    /* ─────────────────────── DATOS DEL CLUB ─────────────────────── */
    { id: 'club-datos', grupo: 'Datos del club', nombre: 'Identidad', ico: ICO.club,
      titulo: 'Datos del club',
      bajada: 'El nombre, el lema y los datos base. Aparecen en varios lugares del sitio a la vez.',
      tarjetas: [
        { titulo: 'Identificación', campos: [
          { tipo: 'texto', ruta: 'identidad.nombre', etiqueta: 'Nombre completo' },
          { tipo: 'texto', ruta: 'identidad.nombreCorto', etiqueta: 'Nombre corto' },
          { tipo: 'texto', ruta: 'identidad.lema', etiqueta: 'Lema' },
          { tipo: 'texto', ruta: 'identidad.lemaEn', etiqueta: 'Lema en inglés' },
          { tipo: 'texto', ruta: 'identidad.proposito', etiqueta: 'Propósito' }
        ] },
        { titulo: 'Origen y territorio', campos: [
          { tipo: 'fecha', ruta: 'identidad.fundacion', etiqueta: 'Fecha de fundación' },
          { tipo: 'texto', ruta: 'identidad.ciudad', etiqueta: 'Ciudad' },
          { tipo: 'texto', ruta: 'identidad.region', etiqueta: 'Región' },
          { tipo: 'texto', ruta: 'identidad.distrito', etiqueta: 'Distrito' }
        ] }
      ] },

    { id: 'contacto', grupo: 'Datos del club', nombre: 'Contacto', ico: ICO.tel,
      titulo: 'Contacto y ubicación',
      bajada: 'Estos datos alimentan la sección de contacto, el botón de WhatsApp y el pie de página.',
      tarjetas: [
        { titulo: 'Cómo nos ubican', campos: [
          { tipo: 'email', ruta: 'contacto.email', etiqueta: 'Correo electrónico', marca: 'leonestemucoantumalal@gmail.com' },
          { tipo: 'tel', ruta: 'contacto.telefono', etiqueta: 'Teléfono', marca: '+56 9 1234 5678' },
          { tipo: 'texto', ruta: 'contacto.whatsapp', etiqueta: 'WhatsApp',
            marca: '56912345678',
            ayuda: 'Solo números, con el código de país y <b>sin el signo +</b>. Ejemplo: <code>56912345678</code>.' },
          { tipo: 'area', ruta: 'contacto.whatsappMsg', etiqueta: 'Mensaje que aparece escrito al abrir WhatsApp', filas: 2 }
        ] },
        { titulo: 'Dónde nos reunimos', campos: [
          { tipo: 'texto', ruta: 'contacto.direccion', etiqueta: 'Dirección' },
          { tipo: 'texto', ruta: 'contacto.horario', etiqueta: 'Horario de las sesiones' },
          { tipo: 'url', ruta: 'contacto.mapaEmbed', etiqueta: 'Mapa de Google',
            ayuda: 'En Google Maps: busca el lugar → <b>Compartir</b> → <b>Insertar un mapa</b> → copia solo la dirección que aparece dentro de <code>src="…"</code>.' }
        ] }
      ] },

    { id: 'redes', grupo: 'Datos del club', nombre: 'Redes sociales', ico: ICO.red,
      titulo: 'Redes sociales',
      bajada: 'Los íconos del pie de página aparecen solo si la dirección está escrita. Deja en blanco la red que no usen.',
      tarjetas: [
        { titulo: 'Enlaces', campos: [
          { tipo: 'url', ruta: 'redes.instagram', etiqueta: 'Instagram', marca: 'https://www.instagram.com/…' },
          { tipo: 'texto', ruta: 'redes.instagramUser', etiqueta: 'Usuario de Instagram (sin @)' },
          { tipo: 'url', ruta: 'redes.facebook', etiqueta: 'Facebook' },
          { tipo: 'url', ruta: 'redes.youtube', etiqueta: 'YouTube' },
          { tipo: 'url', ruta: 'redes.sitioEclubhouse', etiqueta: 'Sitio en Lions e-Clubhouse' },
          { tipo: 'url', ruta: 'redes.lionsOficial', etiqueta: 'Sitio oficial de Lions' }
        ] }
      ] },

    { id: 'donaciones', grupo: 'Datos del club', nombre: 'Datos para donar', ico: ICO.dona,
      titulo: 'Datos bancarios',
      bajada: 'Aparecen en la sección "Formas de aportar", con un botón para copiarlos de un clic.',
      tarjetas: [
        { titulo: 'Cuenta del club', campos: [
          { tipo: 'texto', ruta: 'donaciones.titular', etiqueta: 'Titular de la cuenta' },
          { tipo: 'texto', ruta: 'donaciones.rut', etiqueta: 'RUT' },
          { tipo: 'texto', ruta: 'donaciones.banco', etiqueta: 'Banco' },
          { tipo: 'texto', ruta: 'donaciones.tipo', etiqueta: 'Tipo de cuenta' },
          { tipo: 'texto', ruta: 'donaciones.numero', etiqueta: 'Número de cuenta' },
          { tipo: 'email', ruta: 'donaciones.email', etiqueta: 'Correo de tesorería' }
        ] }
      ] },

    /* ─────────────────────────── CONTENIDO ─────────────────────────── */
    { id: 'portada', grupo: 'Contenido de la página', nombre: 'Portada', ico: ICO.portada,
      titulo: 'Portada',
      bajada: 'Lo primero que ve quien entra al sitio.',
      tarjetas: [
        { titulo: 'Foto de portada', ayuda: 'Se ve a pantalla completa. Ideal horizontal y bien iluminada (1920 × 1080).', campos: [
          { tipo: 'imagen', ruta: 'imagenClaves.hero', etiqueta: '', clave: 'hero', ancho: 1920,
            pordefecto: 'assets/img/fotos/hero.svg' }
        ] },
        { titulo: 'Textos', campos: [
          { tipo: 'rico', ruta: 'textos.hero.pill', etiqueta: 'Etiqueta de arriba', filas: 2 },
          { tipo: 'rico', ruta: 'textos.hero.titulo', etiqueta: 'Titular grande', filas: 3,
            ayuda: 'Lo que va entre <code>&lt;em&gt;</code> y <code>&lt;/em&gt;</code> se destaca con otro estilo.' },
          { tipo: 'area', ruta: 'textos.hero.sub', etiqueta: 'Párrafo de presentación', filas: 3 }
        ] },
        { titulo: 'Botones y cifra', campos: [
          { tipo: 'texto', ruta: 'textos.hero.btn1', etiqueta: 'Botón principal' },
          { tipo: 'texto', ruta: 'textos.hero.btn2', etiqueta: 'Botón secundario' },
          { tipo: 'numero', ruta: 'textos.hero.statValor', etiqueta: 'Número destacado' },
          { tipo: 'texto', ruta: 'textos.hero.statTexto', etiqueta: 'Texto bajo el número' }
        ] }
      ] },

    { id: 'quienes', grupo: 'Contenido de la página', nombre: 'El Club', ico: ICO.texto,
      titulo: 'El Club',
      bajada: 'La sección que cuenta la historia y el porqué del club.',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.club.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.club.titulo', etiqueta: 'Título de la sección' }
        ] },
        { titulo: 'Relato', ayuda: 'El primer párrafo se muestra un poco más grande que el resto.', campos: [
          { tipo: 'parrafos', ruta: 'textos.club.parrafos', etiqueta: 'Párrafos' }
        ] },
        { titulo: 'Sello sobre las fotos', campos: [
          { tipo: 'texto', ruta: 'textos.club.selloNum', etiqueta: 'Número grande' },
          { tipo: 'rico', ruta: 'textos.club.selloTxt', etiqueta: 'Texto del sello', filas: 2,
            ayuda: 'Usa <code>&lt;br&gt;</code> para cortar la línea.' }
        ] },
        { titulo: 'Fotos', ayuda: 'Tres fotos del club. La primera es la más grande.', campos: [
          { tipo: 'imagen', ruta: 'imagenClaves.sobre1', etiqueta: 'Foto principal', clave: 'sobre1', ancho: 1200, pordefecto: 'assets/img/fotos/sobre-1.svg' },
          { tipo: 'imagen', ruta: 'imagenClaves.sobre2', etiqueta: 'Foto 2', clave: 'sobre2', ancho: 900, pordefecto: 'assets/img/fotos/sobre-2.svg' },
          { tipo: 'imagen', ruta: 'imagenClaves.sobre3', etiqueta: 'Foto 3', clave: 'sobre3', ancho: 900, pordefecto: 'assets/img/fotos/sobre-3.svg' }
        ] }
      ] },

    { id: 'causas', grupo: 'Contenido de la página', nombre: 'Causas', ico: ICO.grid,
      titulo: 'Las causas que nos mueven',
      bajada: 'Las áreas de servicio del club. Cada una con su ícono.',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.causas.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.causas.titulo', etiqueta: 'Título' },
          { tipo: 'area', ruta: 'textos.causas.lead', etiqueta: 'Bajada', filas: 3 }
        ] },
        { repetidor: {
          ruta: 'causas', etiqueta: 'Causas', textoNuevo: 'Agregar causa',
          titulo: (it) => it.titulo,
          nuevo: { icono: 'corazonSolo', titulo: 'Nueva causa', texto: '' },
          campos: [
            { tipo: 'texto', ruta: 'titulo', etiqueta: 'Nombre de la causa' },
            { tipo: 'area', ruta: 'texto', etiqueta: 'Descripción', filas: 3 },
            { tipo: 'icono', ruta: 'icono', etiqueta: 'Ícono' }
          ] } }
      ] },

    { id: 'sellos', grupo: 'Contenido de la página', nombre: 'Sello de trabajo', ico: ICO.grid,
      titulo: 'Nuestro sello de trabajo',
      bajada: 'La franja azul con lo que respalda al club.',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.sellos.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.sellos.titulo', etiqueta: 'Título' }
        ] },
        { repetidor: {
          ruta: 'sellos', etiqueta: 'Sellos', textoNuevo: 'Agregar sello',
          titulo: (it) => it.titulo,
          nuevo: { titulo: 'Nuevo sello', texto: '' },
          campos: [
            { tipo: 'texto', ruta: 'titulo', etiqueta: 'Título' },
            { tipo: 'area', ruta: 'texto', etiqueta: 'Descripción', filas: 3 }
          ] } }
      ] },

    { id: 'impacto', grupo: 'Contenido de la página', nombre: 'Cifras de impacto', ico: ICO.numero,
      titulo: 'Cifras de impacto',
      bajada: 'Los números grandes que se animan al aparecer en pantalla. Conviene que sean cifras que el club pueda respaldar.',
      tarjetas: [
        { repetidor: {
          ruta: 'impacto', etiqueta: 'Cifras', textoNuevo: 'Agregar cifra',
          titulo: (it) => `${it.valor || 0}${it.sufijo || ''} · ${it.etiqueta || ''}`,
          nuevo: { valor: 0, sufijo: '+', etiqueta: 'Nueva cifra' },
          campos: [
            { tipo: 'numero', ruta: 'valor', etiqueta: 'Número' },
            { tipo: 'texto', ruta: 'sufijo', etiqueta: 'Símbolo al final', ayuda: 'Por ejemplo <code>+</code> o <code>%</code>. Déjalo vacío si no lleva.' },
            { tipo: 'texto', ruta: 'etiqueta', etiqueta: 'Qué mide' },
            { tipo: 'select', ruta: 'formato', etiqueta: 'Formato del número',
              opciones: [{ v: '', t: 'Con separador de miles (8.500)' }, { v: 'plano', t: 'Sin separador (1983, para años)' }] }
          ] } }
      ] },

    { id: 'proyectos', grupo: 'Contenido de la página', nombre: 'Proyectos', ico: ICO.grid,
      titulo: 'Proyectos',
      bajada: 'Las tarjetas con foto de "Lo que hacemos en terreno". En la portada se ven las primeras 8; todas quedan en la página de archivo por mes (trabajo-en-terreno.html), así no se pierde el trabajo de meses pasados.',
      tarjetas: [
        { pintar: pintarImportadorLions },
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.proyectos.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.proyectos.titulo', etiqueta: 'Título' },
          { tipo: 'area', ruta: 'textos.proyectos.lead', etiqueta: 'Bajada', filas: 2 }
        ] },
        { repetidor: {
          ruta: 'proyectos', etiqueta: 'Proyectos', textoNuevo: 'Agregar proyecto',
          titulo: (it) => it.titulo,
          nuevo: { tag: '', titulo: 'Nuevo proyecto', texto: '', fecha: '', cuerpo: '', lugar: '', personas: '', imagen: 'assets/img/fotos/proyecto-1.svg', enlace: '', ancho: false },
          campos: [
            { tipo: 'texto', ruta: 'titulo', etiqueta: 'Nombre del proyecto' },
            { tipo: 'fecha', ruta: 'fecha', etiqueta: 'Fecha de la actividad', ayuda: 'Sirve para ordenar el archivo histórico por mes. El carrusel de la portada muestra los primeros de esta lista; <b>los demás no se pierden</b>: quedan en la página «Trabajo en terreno».' },
            { tipo: 'texto', ruta: 'tag', etiqueta: 'Etiqueta', ayuda: 'La palabra chica sobre el título: "Salud visual", "Invierno"…' },
            { tipo: 'area', ruta: 'texto', etiqueta: 'Descripción', filas: 3 },
            { tipo: 'imagen', ruta: 'imagen', etiqueta: 'Foto', clave: 'proyecto', ancho: 1400,
              pordefecto: 'assets/img/fotos/proyecto-1.svg' },
            { tipo: 'texto', ruta: 'foco', etiqueta: 'Encuadre de la foto',
              ayuda: 'Qué parte de la foto se ve en el recuadro, como <code>50% 10%</code> (horizontal vertical). Con fotos verticales usa un vertical bajo (0%–20%) para que se vean las caras.' },
            { tipo: 'texto', ruta: 'lugar', etiqueta: 'Lugar (opcional)', marca: 'Hospital Regional de Temuco' },
            { tipo: 'texto', ruta: 'personas', etiqueta: 'Personas beneficiadas (opcional)', marca: '100' },
            { tipo: 'area', ruta: 'cuerpo', etiqueta: 'La historia completa (la que se lee al entrar)', filas: 9,
              ayuda: 'Escribe como una noticia. <b>Deja una línea en blanco entre párrafos.</b> Si lo dejas vacío, se muestra solo la descripción corta.' },
            { tipo: 'texto', ruta: 'cita', etiqueta: 'Frase destacada (opcional)', ayuda: 'Una frase corta que se muestra grande a la mitad de la historia.' },
            { tipo: 'imagen', ruta: 'foto2', etiqueta: 'Foto extra 1 (opcional)', clave: 'terreno', ancho: 1200, pordefecto: '' },
            { tipo: 'imagen', ruta: 'foto3', etiqueta: 'Foto extra 2 (opcional)', clave: 'terreno', ancho: 1200, pordefecto: '' },
            { tipo: 'imagen', ruta: 'foto4', etiqueta: 'Foto extra 3 (opcional)', clave: 'terreno', ancho: 1200, pordefecto: '' },
            { tipo: 'texto', ruta: 'enlace', etiqueta: 'Enlace distinto (opcional)',
              ayuda: 'Normalmente déjalo <b>vacío</b>: así la tarjeta abre la historia completa. Solo si quieres que lleve a otra página, pega la dirección completa.' },
            { tipo: 'switch', ruta: 'ancho', etiqueta: 'Ocupar el doble de ancho' }
          ] } }
      ] },

    { id: 'valores', grupo: 'Contenido de la página', nombre: 'Valores', ico: ICO.grid,
      titulo: 'Valores',
      bajada: 'Se muestran dentro de "Nuestro sello de trabajo" (sección de cifras). Aquí también se edita la cita del final.',
      tarjetas: [
        { repetidor: {
          ruta: 'valores', etiqueta: 'Valores', textoNuevo: 'Agregar valor',
          titulo: (it) => it.titulo,
          nuevo: { icono: 'corazonSolo', titulo: 'Nuevo valor', texto: '' },
          campos: [
            { tipo: 'texto', ruta: 'titulo', etiqueta: 'Nombre del valor' },
            { tipo: 'rico', ruta: 'texto', etiqueta: 'Descripción', filas: 3 },
            { tipo: 'icono', ruta: 'icono', etiqueta: 'Ícono' }
          ] } },
        { titulo: 'Cita de cierre', campos: [
          { tipo: 'rico', ruta: 'textos.valores.cita', etiqueta: 'Frase', filas: 3 },
          { tipo: 'texto', ruta: 'textos.valores.citaAutor', etiqueta: 'Quién la dijo' }
        ] }
      ] },

    { id: 'agenda', grupo: 'Contenido de la página', nombre: 'Agenda', ico: ICO.cal,
      titulo: 'Agenda',
      bajada: 'Las sesiones fijas se calculan solas y nunca quedan vencidas. Aquí puedes agregar además las actividades puntuales.',
      pintar: panelAgenda },

    { id: 'directiva', grupo: 'Contenido de la página', nombre: 'Directorio', ico: ICO.gente,
      titulo: 'Directorio del club',
      bajada: 'Quiénes encabezan el club este período.',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.directivaSec.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.directivaSec.titulo', etiqueta: 'Título' },
          { tipo: 'area', ruta: 'textos.directivaSec.lead', etiqueta: 'Bajada', filas: 2 }
        ] },
        { repetidor: {
          ruta: 'directiva', etiqueta: 'Integrantes', textoNuevo: 'Agregar integrante',
          titulo: (it) => `${it.nombre || 'Sin nombre'} · ${it.cargo || ''}`,
          nuevo: { nombre: '', cargo: '', foto: 'assets/img/fotos/directiva-1.svg' },
          campos: [
            { tipo: 'texto', ruta: 'nombre', etiqueta: 'Nombre y apellido' },
            { tipo: 'texto', ruta: 'cargo', etiqueta: 'Cargo' },
            { tipo: 'imagen', ruta: 'foto', etiqueta: 'Foto', clave: 'directiva', ancho: 700,
              pordefecto: 'assets/img/fotos/directiva-1.svg',
              ayuda: 'Se recorta en cuadrado. Un retrato de frente funciona mejor.' }
          ] } }
      ] },

    { id: 'testimonios', grupo: 'Contenido de la página', nombre: 'Testimonios', ico: ICO.comilla,
      titulo: 'Testimonios',
      bajada: 'El carrusel con la voz de la comunidad. Conviene usar testimonios reales y con permiso de quien los dio.',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.testimoniosSec.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.testimoniosSec.titulo', etiqueta: 'Título' }
        ] },
        { repetidor: {
          ruta: 'testimonios', etiqueta: 'Testimonios', textoNuevo: 'Agregar testimonio',
          titulo: (it) => it.autor,
          nuevo: { texto: '', autor: '', detalle: '', iniciales: '', foto: '' },
          campos: [
            { tipo: 'imagen', ruta: 'foto', etiqueta: 'Foto de la persona (opcional)', clave: 'testimonio', ancho: 400, pordefecto: '',
              ayuda: 'Si no subes foto, se muestra el círculo con las iniciales. Sube una foto solo si la persona lo autorizó.' },
            { tipo: 'area', ruta: 'texto', etiqueta: 'Lo que dijo', filas: 4 },
            { tipo: 'texto', ruta: 'autor', etiqueta: 'Quién lo dice' },
            { tipo: 'texto', ruta: 'detalle', etiqueta: 'Quién es', ayuda: '"Vecina de Padre Las Casas", "Socia desde 2019"…' },
            { tipo: 'texto', ruta: 'iniciales', etiqueta: 'Iniciales del círculo',
              ayuda: 'Déjalo vacío y se calculan solas con el nombre.' }
          ] } }
      ] },

    { id: 'unete', grupo: 'Contenido de la página', nombre: 'Hazte socio', ico: ICO.texto,
      titulo: 'Invitación a hacerse socio',
      bajada: 'La franja azul que invita a sumarse al club.',
      tarjetas: [
        { titulo: 'Textos', campos: [
          { tipo: 'texto', ruta: 'textos.cta.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.cta.titulo', etiqueta: 'Título' },
          { tipo: 'area', ruta: 'textos.cta.lead', etiqueta: 'Texto', filas: 3 },
          { tipo: 'texto', ruta: 'textos.cta.btn1', etiqueta: 'Botón principal' },
          { tipo: 'texto', ruta: 'textos.cta.btn2', etiqueta: 'Botón de WhatsApp' }
        ] }
      ] },

    { id: 'aportar', grupo: 'Contenido de la página', nombre: 'Formas de aportar', ico: ICO.dona,
      titulo: 'Formas de aportar',
      bajada: 'Los textos de la sección de donaciones. Los datos bancarios se editan en "Datos para donar".',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.dona.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.dona.titulo', etiqueta: 'Título' },
          { tipo: 'area', ruta: 'textos.dona.lead', etiqueta: 'Bajada', filas: 2 },
          { tipo: 'texto', ruta: 'textos.dona.subtitulo', etiqueta: 'Título del recuadro de la cuenta' },
          { tipo: 'area', ruta: 'textos.dona.nota', etiqueta: 'Nota bajo los datos bancarios', filas: 3 }
        ] },
        { titulo: 'Actividades que hacemos cada año', campos: [
          { tipo: 'texto', ruta: 'textos.dona.eventosTitulo', etiqueta: 'Título del bloque' },
          { tipo: 'area', ruta: 'textos.dona.eventosLead', etiqueta: 'Bajada', filas: 2 }
        ] },
        { repetidor: {
          ruta: 'donaEventos', etiqueta: 'Actividades solidarias (bingo, paella…)', textoNuevo: 'Agregar actividad',
          ayuda: 'Cuando una actividad salga a la venta: activa "Ya está a la venta", pon la fecha, el lugar, el precio, el enlace para comprar y el afiche. Aparece destacada en el sitio.',
          titulo: (it) => (it.venta ? '● ' : '') + (it.titulo || ''),
          nuevo: { icono: 'estrella', mes: '', titulo: 'Nueva actividad', texto: '', venta: false, lugar: '', precio: '', enlace: '', enlaceTexto: '', imagen: '' },
          campos: [
            { tipo: 'texto', ruta: 'titulo', etiqueta: 'Nombre' },
            { tipo: 'switch', ruta: 'venta', etiqueta: 'Ya está a la venta / con inscripciones abiertas', pordefecto: false },
            { tipo: 'texto', ruta: 'mes', etiqueta: 'Cuándo se hace', ayuda: 'Antes de tener fecha: "Mayo o junio". Cuando la tengas: "Sábado 30 de mayo, 20:00 h".' },
            { tipo: 'texto', ruta: 'lugar', etiqueta: 'Lugar (opcional)', marca: 'Centro de reuniones quincho Martin Lutero' },
            { tipo: 'texto', ruta: 'precio', etiqueta: 'Precio (opcional)', marca: 'Cartón $3.000 · Porción $8.000' },
            { tipo: 'area', ruta: 'texto', etiqueta: 'Descripción', filas: 3 },
            { tipo: 'texto', ruta: 'enlace', etiqueta: 'Enlace para comprar o inscribirse (opcional)', ayuda: 'Dirección web completa (https://…) o <code>#contacto</code> para llevar al formulario. Si lo dejas vacío no aparece el botón.' },
            { tipo: 'texto', ruta: 'enlaceTexto', etiqueta: 'Texto del botón', marca: 'Comprar entradas' },
            { tipo: 'imagen', ruta: 'imagen', etiqueta: 'Afiche o foto (opcional)', clave: 'gala', ancho: 900, pordefecto: '' },
            { tipo: 'icono', ruta: 'icono', etiqueta: 'Ícono (si no hay afiche)' }
          ] } },
        { repetidor: {
          ruta: 'donaOps', etiqueta: 'Otras formas de aportar', textoNuevo: 'Agregar forma de aportar',
          titulo: (it) => it.titulo,
          nuevo: { icono: 'mano', titulo: 'Nueva forma', texto: '' },
          campos: [
            { tipo: 'texto', ruta: 'titulo', etiqueta: 'Título' },
            { tipo: 'area', ruta: 'texto', etiqueta: 'Descripción', filas: 3 },
            { tipo: 'icono', ruta: 'icono', etiqueta: 'Ícono' },
            { tipo: 'texto', ruta: 'enlace', etiqueta: 'Adónde lleva al hacer clic',
              ayuda: 'Pon #contacto para llevar al formulario, o la dirección de una página (https://…). Vacío = sin enlace.' },
            { tipo: 'texto', ruta: 'enlaceTexto', etiqueta: 'Texto del botón' },
            { tipo: 'texto', ruta: 'motivo', etiqueta: 'Motivo que se marca en el formulario',
              ayuda: 'Solo si lleva al formulario. Debe ser igual a una opción de "Motivo": Quiero ser socio, Solicito ayuda, Quiero donar o auspiciar, Voluntariado profesional, Prensa o difusión, Otro.' }
          ] } }
      ] },

    { id: 'faq', grupo: 'Contenido de la página', nombre: 'Preguntas frecuentes', ico: ICO.duda,
      titulo: 'Preguntas frecuentes',
      bajada: 'El acordeón que responde las dudas más repetidas. Bien escrito, ahorra muchos mensajes.',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.faq.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.faq.titulo', etiqueta: 'Título' }
        ] },
        { repetidor: {
          ruta: 'faq', etiqueta: 'Preguntas', textoNuevo: 'Agregar pregunta',
          titulo: (it) => it.pregunta,
          nuevo: { pregunta: '', respuesta: '' },
          campos: [
            { tipo: 'texto', ruta: 'pregunta', etiqueta: 'Pregunta' },
            { tipo: 'rico', ruta: 'respuesta', etiqueta: 'Respuesta', filas: 4 }
          ] } }
      ] },

    { id: 'contacto-sec', grupo: 'Contenido de la página', nombre: 'Sección contacto', ico: ICO.tel,
      titulo: 'Sección de contacto',
      bajada: 'Los textos que rodean al formulario, y a dónde llegan los mensajes.',
      tarjetas: [
        { titulo: 'Textos', campos: [
          { tipo: 'texto', ruta: 'textos.contactoSec.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.contactoSec.titulo', etiqueta: 'Título' },
          { tipo: 'area', ruta: 'textos.contactoSec.lead', etiqueta: 'Bajada', filas: 3 }
        ] },
        { titulo: 'Pregunta «¿Cómo conociste el club?»',
          ayuda: 'El formulario le pregunta a quien escribe cómo se enteró del club. Sirve para saber qué canales funcionan mejor.',
          campos: [
            { tipo: 'texto', ruta: 'textos.contactoSec.origenPregunta', etiqueta: 'Pregunta', marca: '¿Cómo conociste el club?' },
            { tipo: 'area', ruta: 'formulario.origenes', etiqueta: 'Opciones (una por línea)', filas: 9,
              ayuda: 'Cada línea es una opción de la lista. Si borras todo, la pregunta no aparece en el formulario.' }
          ] },
        { titulo: 'A dónde llegan los mensajes',
          ayuda: 'Si dejas esto vacío, al enviar el formulario se abre WhatsApp con el mensaje ya escrito. Funciona bien y no requiere configurar nada.',
          campos: [
            { tipo: 'url', ruta: 'formulario.endpoint', etiqueta: 'Dirección del formulario',
              marca: 'https://formspree.io/f/xxxxxxx',
              ayuda: 'Para recibirlos por correo: crea una cuenta gratis en <a href="https://formspree.io" target="_blank" rel="noopener">Formspree</a> y pega aquí tu dirección.' }
          ] }
      ] },

    { id: 'pie', grupo: 'Contenido de la página', nombre: 'Pie de página', ico: ICO.texto,
      titulo: 'Pie de página',
      bajada: 'El texto de cierre bajo el escudo. Los íconos de redes salen de "Redes sociales".',
      tarjetas: [
        { titulo: 'Texto', campos: [
          { tipo: 'area', ruta: 'textos.footer.texto', etiqueta: 'Descripción del club', filas: 3 }
        ] },
        { titulo: 'Franja que se desplaza', ayuda: 'Las palabras que cruzan la pantalla bajo la portada.', campos: [
          { tipo: 'chips', ruta: 'textos.marquesina', etiqueta: 'Palabras' }
        ] }
      ] },

    /* ────────────────────────── CONEXIONES ────────────────────────── */
    { id: 'noticias', grupo: 'Conexiones', nombre: 'Noticias', ico: ICO.diario,
      titulo: 'Noticias',
      bajada: 'Las noticias se traen solas desde LION Magazine y la prensa. Aquí se ajusta cómo se muestran.',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.noticiasSec.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.noticiasSec.titulo', etiqueta: 'Título' },
          { tipo: 'area', ruta: 'textos.noticiasSec.lead', etiqueta: 'Bajada', filas: 3 }
        ] },
        { titulo: 'Cómo se muestran', campos: [
          { tipo: 'numero', ruta: 'noticias.maximo', etiqueta: 'Cuántas noticias mostrar' }
        ] },
        { aviso: {
          tipo: 'info',
          html: '<b>Las noticias se actualizan solas.</b> Si el sitio está en GitHub, una tarea automática las refresca dos veces al día (08:00 y 20:00). Si trabajas en tu computador, puedes actualizarlas cuando quieras con <code>npm run noticias</code>.' } }
      ] },

    { id: 'instagram', grupo: 'Conexiones', nombre: 'Instagram', ico: ICO.camara,
      titulo: 'Instagram',
      bajada: 'Instagram no deja leer un perfil sin permiso, así que hay dos caminos: conectarlo con un servicio o cargar las fotos a mano.',
      tarjetas: [
        { titulo: 'Conexión automática (recomendado)',
          ayuda: 'Con <a href="https://behold.so" target="_blank" rel="noopener">Behold.so</a> (gratis) las publicaciones aparecen solas y siempre al día. El paso a paso está en <a href="docs/CONECTAR-INSTAGRAM.md" target="_blank" rel="noopener">docs/CONECTAR-INSTAGRAM.md</a>.',
          campos: [
            { tipo: 'url', ruta: 'instagram.beholdUrl', etiqueta: 'Dirección del feed de Behold',
              marca: 'https://feeds.behold.so/XXXXXXXX' },
            { tipo: 'url', ruta: 'instagram.iframeUrl', etiqueta: 'O bien, widget de LightWidget / SnapWidget',
              ayuda: 'Solo si no usas Behold. Muestra el widget dentro de un recuadro.' },
            { tipo: 'numero', ruta: 'instagram.maximo', etiqueta: 'Cuántas publicaciones mostrar' }
          ] },
        { titulo: 'Datos del perfil', campos: [
          { tipo: 'texto', ruta: 'textos.instagram.usuario', etiqueta: 'Usuario que se muestra en la sección' },
          { tipo: 'numero', ruta: 'ig:seguidores', etiqueta: 'Seguidores' }
        ] },
        { repetidor: {
          ruta: 'ig:publicaciones', etiqueta: 'Publicaciones cargadas a mano',
          ayuda: 'Se usan solo si no conectaste Behold ni un widget.',
          textoNuevo: 'Agregar publicación',
          titulo: (it) => (it.texto || '').slice(0, 60),
          nuevo: { imagen: 'assets/img/fotos/ig-1.svg', enlace: '', texto: '' },
          campos: [
            { tipo: 'imagen', ruta: 'imagen', etiqueta: 'Foto', clave: 'ig', ancho: 900,
              pordefecto: 'assets/img/fotos/ig-1.svg' },
            { tipo: 'area', ruta: 'texto', etiqueta: 'Texto de la publicación', filas: 3 },
            { tipo: 'url', ruta: 'enlace', etiqueta: 'Enlace a la publicación en Instagram' }
          ] } }
      ] },

    /* ──────────────────────────── PANEL ──────────────────────────── */
    { id: 'publicar', grupo: 'Panel', nombre: 'Publicar y respaldos', ico: ICO.subir,
      titulo: 'Publicar, respaldar y restaurar',
      bajada: 'Aquí se publican los cambios, se guarda una copia de seguridad y se cambia la clave del panel.',
      pintar: panelPublicar }
  ];

  /* ═══════════════════════════════════════════════════════════════
     7. PANELES ESPECIALES
     ═══════════════════════════════════════════════════════════════ */

  /* ─── Inicio: revisión de pendientes ─── */
  function panelInicio(lienzo) {
    const d = ESTADO.datos;
    const fotosSubidas = Object.keys(ESTADO.imagenes).length;

    const resumen = document.createElement('div');
    resumen.className = 'resumen';
    resumen.innerHTML = [
      [d.proyectos.length, 'Proyectos'],
      [d.directiva.length, 'En el directorio'],
      [d.faq.length, 'Preguntas frecuentes'],
      [(d.agenda && d.agenda.eventos ? d.agenda.eventos.length : 0), 'Actividades en agenda'],
      [fotosSubidas, 'Fotos propias']
    ].map(([n, t]) => `<div class="resumen__caja"><b>${n}</b><span>${t}</span></div>`).join('');
    lienzo.appendChild(resumen);

    /* Revisiones: cada una dice si está lista y a qué sección ir. */
    const ficticio = (v, malos) => malos.some((m) => String(v || '').includes(m));
    const revisiones = [
      { ok: !ficticio(d.contacto.telefono, ['0000']) && !!d.contacto.telefono,
        t: 'Teléfono real del club', s: 'contacto',
        d: 'Hoy dice ' + (d.contacto.telefono || 'nada') + '.' },
      { ok: !ficticio(d.contacto.whatsapp, ['00000']) && !!d.contacto.whatsapp,
        t: 'WhatsApp real', s: 'contacto',
        d: 'Es el botón verde flotante y el destino del formulario.' },
      { ok: !ficticio(d.contacto.email, ['ejemplo']) && !!d.contacto.email,
        t: 'Correo de contacto', s: 'contacto', d: '' },
      { ok: !ficticio(d.donaciones.numero, ['000000']) && !ficticio(d.donaciones.rut, ['00.000']),
        t: 'Datos bancarios reales', s: 'donaciones',
        d: 'Mientras sean de ejemplo, nadie puede transferir.' },
      { ok: !d.directiva.some((m) => /nombre apellido/i.test(m.nombre || '')),
        t: 'Nombres del directorio', s: 'directiva',
        d: 'Todavía hay fichas que dicen "Nombre Apellido".' },
      { ok: !!(obtener('imagenClaves.hero', '') || '').startsWith('img:'),
        t: 'Foto de portada propia', s: 'portada',
        d: 'Hoy se ve una imagen de relleno con los colores del club.' },
      { ok: d.proyectos.some((p) => String(p.imagen || '').startsWith('img:')),
        t: 'Fotos reales en los proyectos', s: 'proyectos', d: '' },
      { ok: !!d.contacto.mapaEmbed && !/q=Temuco,\+La/.test(d.contacto.mapaEmbed),
        t: 'Mapa apuntando a la sede exacta', s: 'contacto',
        d: 'El mapa muestra Temuco en general, no el quincho Martin Lutero.' }
    ];

    const listos = revisiones.filter((r) => r.ok).length;

    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta';
    tarjeta.innerHTML = `
      <div class="tarjeta__cab">
        <div>
          <h3>Antes de mostrar el sitio</h3>
          <p>Lo que conviene completar para que la página deje de tener datos de ejemplo.</p>
        </div>
        <span class="cuenta">${listos} de ${revisiones.length}</span>
      </div>
      <ul class="chequeo">${revisiones.map((r) => `
        <li>
          <span class="marca" data-ok="${r.ok ? 'si' : 'no'}">${r.ok ? '✓' : '!'}</span>
          <span class="txt"><b>${esc(r.t)}</b>${r.ok ? '' : `<span>${esc(r.d)}</span>`}</span>
          ${r.ok ? '' : `<button type="button" class="btn btn--linea btn--sm" data-ir="${r.s}">Completar</button>`}
        </li>`).join('')}</ul>`;
    tarjeta.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ir]');
      if (b) ir(b.dataset.ir);
    });
    lienzo.appendChild(tarjeta);

    const ayuda = document.createElement('div');
    ayuda.className = 'tarjeta';
    ayuda.innerHTML = `
      <div class="tarjeta__cab"><div><h3>Cómo funciona esto</h3></div></div>
      <div class="paso"><span class="paso__n">1</span><div class="paso__txt">
        <b>Editas</b>Elige una sección en el menú de la izquierda y escribe. Se va guardando
        solo en este computador mientras trabajas.</div></div>
      <div class="paso"><span class="paso__n">2</span><div class="paso__txt">
        <b>Revisas</b>El botón <em>Vista previa</em> abre el sitio con tus cambios, tal como
        se verá. Nadie más los ve todavía.</div></div>
      <div class="paso"><span class="paso__n">3</span><div class="paso__txt">
        <b>Publicas</b>El botón amarillo <em>Publicar</em> deja los cambios en línea, para todos.</div></div>`;
    lienzo.appendChild(ayuda);
  }

  /* ─── Agenda ─── */
  function panelAgenda(lienzo) {
    const cab = document.createElement('div');
    cab.className = 'tarjeta';
    cab.innerHTML = '<div class="tarjeta__cab"><div><h3>Encabezado de la sección</h3></div></div>';
    [
      { tipo: 'texto', ruta: 'textos.agendaSec.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
      { tipo: 'texto', ruta: 'textos.agendaSec.titulo', etiqueta: 'Título' },
      { tipo: 'rico', ruta: 'textos.agendaSec.lead', etiqueta: 'Bajada', filas: 3 }
    ].forEach((c) => cab.appendChild(campo(c)));
    lienzo.appendChild(cab);

    const fijas = document.createElement('div');
    fijas.className = 'tarjeta';
    fijas.innerHTML = `
      <div class="tarjeta__cab"><div>
        <h3>Sesiones fijas</h3>
        <p>Se calculan solas: el 2° y 4° lunes de cada mes. Nunca aparecen fechas vencidas.</p>
      </div></div>`;
    [
      { tipo: 'switch', ruta: 'agenda.auto', etiqueta: 'Mostrar las sesiones automáticas', pordefecto: true },
      { tipo: 'texto', ruta: 'agenda.hora', etiqueta: 'Hora', marca: '20:30 h' },
      { tipo: 'texto', ruta: 'agenda.lugar', etiqueta: 'Lugar' },
      { tipo: 'texto', ruta: 'agenda.tituloSegundo', etiqueta: 'Nombre de la sesión del 2° lunes' },
      { tipo: 'texto', ruta: 'agenda.tituloCuarto', etiqueta: 'Nombre de la sesión del 4° lunes' },
      { tipo: 'numero', ruta: 'agenda.maximo', etiqueta: 'Cuántas fechas mostrar en total' }
    ].forEach((c) => fijas.appendChild(campo(c)));
    lienzo.appendChild(fijas);

    lienzo.appendChild(repetidor({
      ruta: 'agenda.eventos', etiqueta: 'Actividades puntuales',
      ayuda: 'Operativos, cenas, aniversarios. Se ordenan por fecha junto a las sesiones y <b>desaparecen solas cuando pasan</b>.',
      textoNuevo: 'Agregar actividad',
      vacio: 'No hay actividades puntuales cargadas. Solo se muestran las sesiones del 2° y 4° lunes.',
      titulo: (it) => `${it.fecha || 'sin fecha'} · ${it.titulo || ''}`,
      nuevo: { fecha: '', titulo: '', texto: '', hora: '', abierto: true },
      campos: [
        { tipo: 'fecha', ruta: 'fecha', etiqueta: 'Fecha' },
        { tipo: 'texto', ruta: 'titulo', etiqueta: 'Nombre de la actividad' },
        { tipo: 'area', ruta: 'texto', etiqueta: 'Detalle', filas: 2, ayuda: 'Dónde es, qué hay que llevar. Si lo dejas vacío usa el lugar de las sesiones.' },
        { tipo: 'texto', ruta: 'hora', etiqueta: 'Hora', marca: '10:00 h' },
        { tipo: 'texto', ruta: 'enlace', etiqueta: 'Enlace (opcional)', ayuda: 'Por ejemplo el link para comprar entradas o inscribirse. Dirección web completa (https://…).' },
        { tipo: 'texto', ruta: 'enlaceTexto', etiqueta: 'Texto del enlace', marca: 'Comprar entradas' },
        { tipo: 'switch', ruta: 'abierto', etiqueta: 'Abierta a la comunidad', pordefecto: true }
      ]
    }));
  }

  /* ─── Publicar y respaldos ─── */
  function panelPublicar(lienzo) {
    const t1 = document.createElement('div');
    t1.className = 'tarjeta';
    t1.innerHTML = `
      <div class="tarjeta__cab"><div>
        <h3>Publicar</h3>
        <p>Deja los cambios visibles para todo el mundo.</p>
      </div></div>
      <div id="pesoInfo" class="aviso aviso--info" style="margin-bottom:14px"></div>
      <div style="display:flex; flex-wrap:wrap; gap:8px">
        <button type="button" class="btn btn--oro" data-publicar>Publicar cambios</button>
        <a class="btn btn--linea" href="index.html?borrador=1" target="_blank" rel="noopener">Ver vista previa</a>
        <button type="button" class="btn btn--peligro" data-descartar style="margin-left:auto">Descartar cambios</button>
      </div>`;
    lienzo.appendChild(t1);
    $('[data-publicar]', t1).addEventListener('click', abrirPublicar);
    $('[data-descartar]', t1).addEventListener('click', descartar);
    pintarPeso($('#pesoInfo', t1));

    const t2 = document.createElement('div');
    t2.className = 'tarjeta';
    t2.innerHTML = `
      <div class="tarjeta__cab"><div>
        <h3>Copia de seguridad</h3>
        <p>Un solo archivo con todo: textos, fotos y publicaciones. Guárdalo de vez en cuando.</p>
      </div></div>
      <div style="display:flex; flex-wrap:wrap; gap:8px">
        <button type="button" class="btn btn--linea" data-respaldo>Descargar copia de seguridad</button>
        <button type="button" class="btn btn--linea" data-restaurar>Restaurar desde una copia</button>
        <input type="file" accept="application/json,.json" hidden>
      </div>`;
    lienzo.appendChild(t2);
    $('[data-respaldo]', t2).addEventListener('click', descargarRespaldo);
    $('[data-restaurar]', t2).addEventListener('click', () => $('input[type=file]', t2).click());
    $('input[type=file]', t2).addEventListener('change', (e) => restaurarRespaldo(e.target));

    const t3 = document.createElement('div');
    t3.className = 'tarjeta';
    t3.innerHTML = `
      <div class="tarjeta__cab"><div>
        <h3>Clave del panel</h3>
        <p>La clave con la que se entra aquí. Se guarda solo en este navegador.</p>
      </div></div>
      <div class="fila">
        <div class="campo"><label for="claveNueva">Clave nueva</label>
          <input type="password" id="claveNueva" autocomplete="new-password"></div>
        <div class="campo"><label for="claveNueva2">Repítela</label>
          <input type="password" id="claveNueva2" autocomplete="new-password"></div>
      </div>
      <button type="button" class="btn btn--linea btn--sm" data-clave style="margin-top:12px">Cambiar la clave</button>
      <div class="aviso aviso--ojo" style="margin:14px 0 0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
        <span>Cada computador tiene su propia clave, porque el sitio no tiene servidor donde
        guardarla. Para bloquear el panel de verdad, protégelo desde el hosting:
        <a href="docs/PANEL-ADMIN.md" target="_blank" rel="noopener">cómo hacerlo</a>.</span>
      </div>`;
    lienzo.appendChild(t3);
    $('[data-clave]', t3).addEventListener('click', async () => {
      const a = $('#claveNueva', t3).value, b = $('#claveNueva2', t3).value;
      if (a.length < 4) return aviso('La clave debe tener al menos 4 caracteres.', 'mal');
      if (a !== b) return aviso('Las dos claves no coinciden.', 'mal');
      ALMACEN.guardarChico('clave', await resumir(a));
      $('#claveNueva', t3).value = $('#claveNueva2', t3).value = '';
      aviso('Clave cambiada.');
    });
  }

  function pintarPeso(caja) {
    const contenido = JSON.stringify(ESTADO.datos);
    const imgs = JSON.stringify(ESTADO.imagenes);
    const total = pesoTexto(contenido) + pesoTexto(imgs);
    const pesado = pesoTexto(imgs) > 2.5 * 1024 * 1024;
    caja.className = 'aviso ' + (pesado ? 'aviso--ojo' : 'aviso--info');
    caja.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>
      <span>
        <b>Peso de los cambios: ${pesar(total)}</b>
        Textos ${pesar(pesoTexto(contenido))} · Fotos ${pesar(pesoTexto(imgs))}
        (${Object.keys(ESTADO.imagenes).length} subidas).
        ${pesado ? '<br><b>Las fotos están pesando mucho</b> y el sitio puede demorar en abrir. Conviene dejar solo las necesarias.' : ''}
      </span>`;
  }

  /* ═══════════════════════════════════════════════════════════════
     8. NAVEGACIÓN Y PINTADO
     ═══════════════════════════════════════════════════════════════ */

  function pintarNav() {
    const nav = $('#nav');
    nav.innerHTML = '';
    let grupoActual = '';
    SECCIONES.forEach((s) => {
      if (s.grupo !== grupoActual) {
        grupoActual = s.grupo;
        const g = document.createElement('div');
        g.className = 'lateral__grupo';
        g.textContent = grupoActual;
        nav.appendChild(g);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav__b' + (s.id === ESTADO.seccion ? ' activo' : '');
      b.dataset.ir = s.id;
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
        stroke-linecap="round" stroke-linejoin="round">${s.ico}</svg><span>${esc(s.nombre)}</span>`;
      b.addEventListener('click', () => ir(s.id));
      nav.appendChild(b);
    });
  }

  function ir(id) {
    ESTADO.seccion = id;
    document.body.classList.remove('menu-abierto');
    $$('.nav__b').forEach((b) => b.classList.toggle('activo', b.dataset.ir === id));
    pintarSeccion();
    window.scrollTo({ top: 0 });
    try { history.replaceState(null, '', '#' + id); } catch { /* file:// no siempre deja */ }
  }

  function pintarSeccion() {
    const s = SECCIONES.find((x) => x.id === ESTADO.seccion) || SECCIONES[0];
    $('#barraTitulo').textContent = s.titulo;

    const lienzo = $('#lienzo');
    lienzo.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'panel activo';
    panel.innerHTML = `<div class="panel__cab">
      <h2>${esc(s.titulo)}</h2>
      ${s.bajada ? `<p>${s.bajada}</p>` : ''}
    </div>`;
    lienzo.appendChild(panel);

    if (s.pintar) { s.pintar(panel); return; }

    (s.tarjetas || []).forEach((t) => {
      if (t.repetidor) { panel.appendChild(repetidor(t.repetidor)); return; }

      if (t.pintar) {
        const caja = document.createElement('div');
        caja.className = 'tarjeta';
        t.pintar(caja);
        panel.appendChild(caja);
        return;
      }

      if (t.aviso) {
        const a = document.createElement('div');
        a.className = 'aviso aviso--' + (t.aviso.tipo || 'info');
        a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg><span>${t.aviso.html}</span>`;
        panel.appendChild(a);
        return;
      }

      const caja = document.createElement('div');
      caja.className = 'tarjeta';
      caja.innerHTML = `<div class="tarjeta__cab"><div>
        <h3>${esc(t.titulo)}</h3>${t.ayuda ? `<p>${t.ayuda}</p>` : ''}
      </div></div>`;
      t.campos.forEach((c) => caja.appendChild(campo(c)));
      panel.appendChild(caja);
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     9. PUBLICAR
     ═══════════════════════════════════════════════════════════════ */

  /* Los archivos que se generan, tal como quedan en la carpeta data/ */
  function archivos() {
    const contenido = clonar(ESTADO.datos);
    contenido.actualizado = new Date().toISOString();

    const imagenes = Object.assign(
      { _comentario: 'Fotos subidas desde el panel de administración (admin.html). Se genera solo.' },
      ESTADO.imagenes
    );

    return [
      { ruta: 'data/contenido.json', texto: JSON.stringify(contenido, null, 2) },
      { ruta: 'data/imagenes.json',  texto: JSON.stringify(imagenes, null, 2) },
      { ruta: 'data/instagram.json', texto: JSON.stringify(ESTADO.instagram, null, 2) }
    ];
  }

  function descargar(nombre, texto, tipo) {
    const url = URL.createObjectURL(new Blob([texto], { type: tipo || 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function abrirPublicar() {
    const velo = $('#veloPublicar');
    velo.classList.add('abierto');

    const cont = $('#botonesDescarga');
    cont.innerHTML = '';
    archivos().forEach((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--linea btn--sm';
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 19h16"/></svg>
        ${f.ruta.split('/').pop()} <em style="font-weight:400; opacity:.7">${pesar(pesoTexto(f.texto))}</em>`;
      b.addEventListener('click', () => {
        descargar(f.ruta.split('/').pop(), f.texto);
        marcarPublicado();
      });
      cont.appendChild(b);
    });

    const todos = document.createElement('button');
    todos.type = 'button';
    todos.className = 'btn btn--sm';
    todos.textContent = 'Descargar los 3';
    todos.addEventListener('click', () => {
      archivos().forEach((f, i) => setTimeout(() => descargar(f.ruta.split('/').pop(), f.texto), i * 350));
      marcarPublicado();
    });
    cont.appendChild(todos);
  }

  function cerrarPublicar() { $('#veloPublicar').classList.remove('abierto'); }

  function marcarPublicado() {
    ESTADO.huellaPublicada = huella();
    ESTADO.sucio = false;
    pintarEstado();
    guardarBorrador();   // se conserva por si los archivos aún no llegan al servidor
  }

  /* ─── GitHub ─── */
  const b64 = (texto) => {
    const bytes = new TextEncoder().encode(texto);
    let bin = '';
    const trozo = 0x8000;
    for (let i = 0; i < bytes.length; i += trozo) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + trozo));
    }
    return btoa(bin);
  };

  async function publicarEnGitHub() {
    const usuario = $('#ghUsuario').value.trim();
    const repo    = $('#ghRepo').value.trim();
    const rama    = $('#ghRama').value.trim() || 'main';
    const token   = $('#ghToken').value.trim();
    const salida  = $('#ghSalida');
    const boton   = $('#btnGhPublicar');

    if (!usuario || !repo || !token) {
      salida.innerHTML = mensaje('mal', 'Faltan datos', 'Completa usuario, repositorio y token.');
      return;
    }

    ALMACEN.guardarChico('github', { usuario, repo, rama });
    if ($('#ghRecordar').checked) ALMACEN.guardarChico('githubToken', token);
    else ALMACEN.borrarChico('githubToken');

    boton.disabled = true;
    salida.innerHTML = mensaje('info', 'Publicando…', 'Subiendo los archivos a GitHub.');

    const cabeceras = {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    const base = `https://api.github.com/repos/${encodeURIComponent(usuario)}/${encodeURIComponent(repo)}/contents/`;

    try {
      for (const f of archivos()) {
        // 1. ¿El archivo ya existe? Se necesita su sha para reemplazarlo.
        let sha;
        const previo = await fetch(base + f.ruta + '?ref=' + encodeURIComponent(rama), { headers: cabeceras });
        if (previo.status === 401 || previo.status === 403) {
          throw new Error('El token no tiene permiso sobre este repositorio (necesita Contents: Read and write).');
        }
        if (previo.ok) sha = (await previo.json()).sha;

        // 2. Guardar
        const r = await fetch(base + f.ruta, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, cabeceras),
          body: JSON.stringify({
            message: 'Actualizar el sitio desde el panel de administración',
            content: b64(f.texto),
            branch: rama,
            sha
          })
        });

        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(`No se pudo guardar ${f.ruta}: ${err.message || r.status}`);
        }
      }

      marcarPublicado();
      salida.innerHTML = mensaje('ok', '¡Publicado!',
        'Los cambios están en GitHub. En uno o dos minutos se ven en clta.cl (recarga con Ctrl + F5).');
      aviso('Cambios publicados en GitHub.');
    } catch (e) {
      salida.innerHTML = mensaje('mal', 'No se pudo publicar', e.message);
    } finally {
      boton.disabled = false;
    }
  }

  function mensaje(tipo, titulo, texto) {
    return `<div class="aviso aviso--${tipo}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>
      <span><b>${esc(titulo)}</b>${esc(texto)}</span></div>`;
  }

  /* ─── Respaldos ─── */
  function descargarRespaldo() {
    const fecha = new Date().toISOString().slice(0, 10);
    descargar(`respaldo-leones-antumalal-${fecha}.json`, JSON.stringify({
      _tipo: 'respaldo-panel-leones-antumalal',
      fecha: new Date().toISOString(),
      contenido: ESTADO.datos,
      imagenes: ESTADO.imagenes,
      instagram: ESTADO.instagram
    }, null, 2));
    aviso('Copia de seguridad descargada.');
  }

  function restaurarRespaldo(input) {
    const f = input.files[0];
    if (!f) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const d = JSON.parse(lector.result);
        if (d._tipo !== 'respaldo-panel-leones-antumalal' || !d.contenido) {
          throw new Error('formato');
        }
        if (!confirm('Se reemplazará todo lo que hay ahora por el contenido de la copia. ¿Continuar?')) return;
        ESTADO.datos = d.contenido;
        ESTADO.imagenes = d.imagenes || {};
        if (d.instagram) ESTADO.instagram = d.instagram;
        ensuciar();
        pintarSeccion();
        aviso('Copia restaurada. Recuerda publicar para dejarla en línea.');
      } catch {
        aviso('Ese archivo no es una copia de seguridad válida.', 'mal');
      }
      input.value = '';
    };
    lector.readAsText(f);
  }

  function descartar() {
    if (!confirm('Se perderán todos los cambios que no publicaste y el sitio volverá a como está en línea. ¿Continuar?')) return;
    olvidarBorrador();
    location.reload();
  }

  /* ═══════════════════════════════════════════════════════════════
     10. ARRANQUE
     ═══════════════════════════════════════════════════════════════ */

  async function arrancar() {
    try {
      await cargar();
    } catch (e) {
      // cargar() ya muestra su propio mensaje cuando no encuentra el contenido.
      if (!$('#lienzo').innerHTML.trim()) {
        $('#lienzo').innerHTML = mensaje('mal', 'No se pudo abrir el panel',
          (e && e.message) || 'Error inesperado. Recarga la página e inténtalo de nuevo.');
      }
      return;
    }

    /* imagenClaves guarda las fotos fijas del HTML (portada, El Club). */
    if (!ESTADO.datos.imagenClaves) ESTADO.datos.imagenClaves = {};

    pintarNav();
    const desdeUrl = location.hash.slice(1);
    if (desdeUrl && SECCIONES.some((s) => s.id === desdeUrl)) ESTADO.seccion = desdeUrl;
    pintarSeccion();
    pintarEstado();

    $('#btnPublicar').addEventListener('click', abrirPublicar);
    $('#btnMenu').addEventListener('click', () => document.body.classList.toggle('menu-abierto'));
    $$('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarPublicar));
    $('#veloPublicar').addEventListener('click', (e) => { if (e.target.id === 'veloPublicar') cerrarPublicar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarPublicar(); });

    $$('#pestanasPublicar button').forEach((b) => b.addEventListener('click', () => {
      $$('#pestanasPublicar button').forEach((o) => o.classList.toggle('activo', o === b));
      $('#tabDescargar').classList.toggle('oculto', b.dataset.tab !== 'descargar');
      $('#tabGithub').classList.toggle('oculto', b.dataset.tab !== 'github');
    }));

    // Datos del club ya puestos: solo falta el token.
    const gh = ALMACEN.leerChico('github', null) ||
      { usuario: 'clubleonestemucoantumalal-arch', repo: 'clta', rama: 'main' };
    $('#ghUsuario').value = gh.usuario || '';
    $('#ghRepo').value = gh.repo || '';
    $('#ghRama').value = gh.rama || 'main';
    const tok = ALMACEN.leerChico('githubToken', '');
    if (tok) { $('#ghToken').value = tok; $('#ghRecordar').checked = true; }
    $('#btnGhPublicar').addEventListener('click', publicarEnGitHub);

    // Al salir con cambios sin publicar, el navegador pregunta.
    window.addEventListener('beforeunload', (e) => {
      if (!ESTADO.sucio) return;
      e.preventDefault();
      e.returnValue = '';
    });

    // La vista previa siempre debe abrir el borrador más reciente.
    $('#btnVista').addEventListener('click', () => {
      ALMACEN.guardarChico('borrador', ESTADO.datos);
      ALMACEN.guardarChico('borradorIg', ESTADO.instagram);
      ALMACEN.guardar('imagenes', ESTADO.imagenes).catch(() => {});
    });
  }

  iniciarCandado();
})();
