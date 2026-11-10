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
      }).then(() => { if (typeof refrescarVivo === 'function') refrescarVivo(); });
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
    let b = ALMACEN.leerChico('borrador', null);
    /* Protección: si el sitio se publicó desde otro lugar (o por otra persona) DESPUÉS de empezar este borrador,
       publicar el borrador viejo pisaría esos cambios. Se avisa y se recomienda usar lo publicado. */
    if (b) {
      const igual = JSON.stringify(Object.assign({}, normalizar(clonar(b)), { actualizado: null })) === JSON.stringify(Object.assign({}, ESTADO.datos, { actualizado: null }));
      const viejo = String(b.actualizado || '') !== String(contenido.actualizado || '');
      if (!igual && viejo) {
        const usarPublicado = confirm(['Ojo: la página se publicó con cambios más nuevos que el borrador guardado en este computador.', '', 'Si sigues con el borrador viejo y publicas, esos cambios nuevos se perderían.', '', 'Aceptar = abrir lo que está publicado (recomendado).', 'Cancelar = seguir con mi borrador viejo.'].join(String.fromCharCode(10)));
        if (usarPublicado) { olvidarBorrador(); b = null; }
      }
    }
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

  /* Redacción en la línea del club: crónica en primera persona, como la cuenta un socio.
     Convierte lo que viene del reporte de Lions («ENTREGA DE CAJAS…», «Se realiza…») en un borrador legible. */
  function oracion(t) {
    t = String(t || '').replace(/\s+/g, ' ').replace(/^[\s"',]+|[\s"',]+$/g, '');
    const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '');
    const mayus = letras.length > 6 && (t.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length / letras.length) > 0.6;
    if (mayus) t = t.toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function enPrimeraPersona(t) {
    return oracion(t)
      .replace(/^Se hace entrega de /i, 'Entregamos ').replace(/^Se hace entrega a /i, 'Entregamos a ').replace(/^Se hacen entrega /i, 'Entregamos ')
      .replace(/^Se entrega(n)?/i, 'Entregamos').replace(/^Se realiza(n)?/i, 'Realizamos')
      .replace(/^Se efectúa(n)?/i, 'Realizamos').replace(/^Entrega de /i, 'Entregamos ')
      .replace(/^Se dona(n)?/i, 'Donamos').replace(/^Donación de/i, 'Donamos');
  }

  function leerActividadesLions(textoCSV) {
    const filas = analizarCSV(textoCSV);
    if (filas.length < 2) return { validas: [], ignoradas: 0 };
    const enc = filas[0].map((h) => h.trim().toLowerCase());
    const col = (pista) => enc.findIndex((h) => h.includes(pista));
    const iId = col('identifica'), iTitulo = col('tulo'), iFin = col('finaliz'),
          iTipo = col('actividades de servicio'), iCausa = col('causa'),
          iDesc = col('descrip'), iBenef = col('beneficiad'), iOrg = col('organizaci');

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
      const desc = iDesc >= 0 ? (f[iDesc] || '').trim() : '';
      const benef = iBenef >= 0 ? parseInt(f[iBenef], 10) : NaN;
      const org = iOrg >= 0 ? (f[iOrg] || '').trim() : '';
      validas.push({
        idLions: (f[iId] || '').trim(),
        tag: causaEs,
        titulo: oracion(titulo),
        texto: desc ? enPrimeraPersona(desc).slice(0, 260) : '',
        lugar: org && org.length <= 60 && !/^[\d.]+$/.test(org) ? oracion(org) : '',
        personas: benef > 0 ? String(benef) : '',
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
          const ya = resultado[i];
          const editada = !!(ya.cuerpo || ya.texto);      /* lo ya redactado a mano no se toca */
          resultado[i] = Object.assign({}, ya, editada ? { fecha: v.fecha } : { titulo: v.titulo, tag: v.tag, fecha: v.fecha });
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
      <button type="button" class="btn btn--oro btn--grande rep__nuevo" data-nuevo>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        ${esc(def.textoNuevo || 'Agregar')}
      </button>
      <div class="lista"></div>`;

    const lista = $('.lista', caja);
    const cuenta = $('.cuenta', caja);
    let abierto = -1;

    function datos() { return obtener(def.ruta, []) || []; }

    function guardar(nuevos) { asignar(def.ruta, nuevos); }

    /* Las listas con fecha (proyectos, artículos, actividades) quedan siempre ordenadas por fecha.
       Proyectos y artículos: lo más reciente primero. Actividades: lo más próximo primero. */
    const porFecha = !!(def.nuevo && 'fecha' in def.nuevo);
    const conFoto = !!(def.nuevo && 'imagen' in def.nuevo);   /* proyectos y artículos: se ve la foto en la lista */
    const ascendente = def.ruta === 'agenda.eventos';
    const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const fechaBonita = (f) => { const m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? (+m[3]) + ' ' + MES3[+m[2] - 1] + ' ' + m[1] : 'sin fecha'; };
    function ordenarPorFecha() {
      if (!porFecha) return;
      const ds = datos();
      const clave = (x) => String((x && x.fecha) || '');
      const orden = ds.map((x, i) => [x, i]).sort((a, b) => {
        const ka = clave(a[0]), kb = clave(b[0]);
        if (ka === kb) return a[1] - b[1];
        if (!ka) return -1; if (!kb) return 1;           /* sin fecha, arriba, para que se vea y se complete */
        return ascendente ? (ka < kb ? -1 : 1) : (ka < kb ? 1 : -1);
      });
      if (!orden.some(([, i], k) => i !== k)) return;
      const abiertoObj = abierto >= 0 ? ds[abierto] : null;
      const nuevos = orden.map(([x]) => x);
      abierto = abiertoObj ? nuevos.indexOf(abiertoObj) : -1;
      guardar(nuevos);
    }

    function pintar() {
      ordenarPorFecha();
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
        const visible = def.visible ? it[def.visible] !== false : true;
        if (!visible) el.className += ' item--oculto';
        el.innerHTML = `
          <div class="item__fila">
            <button type="button" class="item__cab">
              <span class="item__n">${i + 1}</span>
              ${conFoto ? (resolverImagen(it.imagen) ? `<img class="item__foto" src="${esc(resolverImagen(it.imagen))}" alt="" loading="lazy">` : '<span class="item__foto item__foto--falta">Sin foto</span>') : ''}
              ${porFecha ? `<span class="item__f${it.fecha ? '' : ' item__f--falta'}">${esc(fechaBonita(it.fecha))}</span>` : ''}
              <span class="item__t">${titulo ? esc(titulo) : '<em>Sin título</em>'}</span>
              <svg class="item__flecha" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>
            </button>
            <span class="item__acc">
              <button type="button" class="btn btn--linea btn--sm" data-editar>${i === abierto ? '✔ Cerrar' : '✏️ Editar'}</button>
              <button type="button" class="btn btn--peligro btn--sm" data-quitarfila>🗑 Quitar</button>
            </span>
            ${def.visible ? `<label class="item__ver" title="Marcado: se ve en la página. Desmarcado: queda guardada pero oculta."><input type="checkbox" ${visible ? 'checked' : ''}><span>${visible ? 'En la página' : 'Oculta'}</span></label>` : ''}
          </div>
          <div class="item__cuerpo"></div>`;
        $('[data-editar]', el).addEventListener('click', () => { abierto = (abierto === i) ? -1 : i; pintar(); if (abierto === i) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
        $('[data-quitarfila]', el).addEventListener('click', () => {
          const nombre = (def.titulo ? def.titulo(it, i) : '') || 'esta ficha';
          if (!confirm('¿Quitar «' + nombre + '»?' + String.fromCharCode(10, 10) + 'Dejará de verse en la página cuando publiques. Si solo quieres esconderla por un tiempo, mejor desmarca «En la página».')) return;
          const l = clonar(datos()); l.splice(i, 1);
          abierto = -1; guardar(l); pintar(); aviso('Quitado. Toca «Publicar» para que se note en la página.', 'ok');
        });
        if (def.visible) {
          $('.item__ver input', el).addEventListener('change', (ev) => {
            asignar(`${def.ruta}.${i}.${def.visible}`, ev.target.checked);
            pintar();
          });
        }

        const cuerpo = $('.item__cuerpo', el);
        if (i === abierto) {
          def.campos.forEach((c) => cuerpo.appendChild(campo(
            Object.assign({}, c, { alCambiar: pintarTitulo }), `${def.ruta}.${i}`
          )));

          const pie = document.createElement('div');
          pie.className = 'item__pie';
          pie.innerHTML = `
            ${porFecha ? '<span class="item__orden">Se ordena sola por la fecha</span>' : `<button type="button" class="btn btn--linea" data-mover="-1" ${i === 0 ? 'disabled' : ''}>↑ Subir</button>
            <button type="button" class="btn btn--linea" data-mover="1" ${i === items.length - 1 ? 'disabled' : ''}>↓ Bajar</button>`}
            <button type="button" class="btn btn--linea" data-duplicar>Duplicar</button>
            <button type="button" class="btn btn--peligro" data-borrar>🗑 Quitar</button>
            <button type="button" class="btn btn--oro btn--grande" data-listo style="margin-left:auto">✔ Listo</button>`;
          cuerpo.appendChild(pie);

          $('[data-listo]', pie).addEventListener('click', () => { abierto = -1; pintar(); aviso('Guardado. Toca «Publicar» cuando quieras que se vea en la página.', 'ok'); });
          $('[data-borrar]', pie).addEventListener('click', () => {
            if (!confirm('¿Quitar esta ficha? No se puede deshacer.')) return;
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
      const nuevo = clonar(def.nuevo);
      if (nuevo && 'fecha' in nuevo && !nuevo.fecha) nuevo.fecha = new Date().toISOString().slice(0, 10); /* hoy, para que salga primero */
      l.push(nuevo);
      abierto = l.length - 1;
      guardar(l); pintar();
      const ab = lista.querySelector('.item.abierto') || lista.lastElementChild;
      if (ab) ab.scrollIntoView({ behavior: 'smooth', block: 'center' });
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


  /* Frase corta y clara bajo el título de cada sección, para quien usa poco el computador */
  const FACIL = {
    inicio: 'Aquí ves lo más importante y puedes empezar lo que necesites.',
    mensajes: 'Aquí están los mensajes que la gente escribió en la página. Puedes leerlos y reenviarlos a un socio.',
    socios: 'Tus listas de personas e instituciones: socios, municipalidad, empresas, prensa… Para escribirles, saludar en fechas importantes y cuidar la relación con cada uno.',
    informes: 'Aquí sacas informes del club para imprimir, o listas para abrir en Excel.',
    ayuda: 'Una guía corta, con los pasos de siempre, para usar este panel.',
    ajustes: 'Cambia el tamaño de la letra y los colores del panel, para verlo más cómodo.',
    publicar: 'Aquí publicas tus cambios y guardas una copia de respaldo por seguridad.',
    agenda: 'El calendario de actividades del club: reuniones, operativos, cenas y más. Lo que agregues aquí se ve en la página.',
    portada: 'Lo primero que ve la gente al entrar a la página. Cambia los textos y la foto principal.',
    proyectos: 'Cada vez que el club ayuda en terreno, se cuenta aquí con fotos. Cada proyecto tiene su propia página.',
    articulos: 'El blog del club: textos más largos que el club escribe, como entrevistas o reflexiones.',
    directiva: 'Las personas que dirigen el club este período, con su cargo y foto. Se actualiza una vez al año.',
    testimonios: 'Lo que dicen quienes recibieron ayuda del club.',
    faq: 'Las preguntas que más hacen y sus respuestas. Escribe la pregunta y, debajo, la respuesta.',
    'club-datos': 'El nombre del club y su frase. Si lo cambias aquí, se cambia en toda la página a la vez.',
    contacto: 'Teléfono, correo y dirección del club. Es lo que la gente usa para comunicarse.',
    redes: 'Escribe la dirección de cada red social. Si dejas una en blanco, ese ícono no se muestra.',
    donaciones: 'Los datos del banco para que la gente pueda donar. Revísalos bien antes de publicar.',
    quienes: 'La historia del club. Puedes cambiar los textos y la foto.',
    causas: 'Las áreas de ayuda del club. Cada una lleva un título y una explicación corta.',
    sellos: 'La franja azul con lo que respalda al club. Se cambia rara vez.',
    impacto: 'Los números grandes de la página, como «familias ayudadas». Usa solo cifras que el club pueda respaldar.',
    valores: 'Los valores y la frase final que se ven en la página.',
    unete: 'El aviso que invita a las personas a hacerse socias.',
    aportar: 'Cómo se puede ayudar al club: donaciones y actividades solidarias, como un bingo o una paella.',
    'contacto-sec': 'Los textos que rodean al cuadro para escribirle al club.',
    pie: 'El texto del final de la página, abajo de todo.',
    noticias: 'Las noticias se traen solas desde la prensa y Lions. No hay que hacer nada aquí.',
    instagram: 'Las fotos de Instagram que se muestran en la página.'
  };


  /* Nombres claros y una línea de ayuda para cada parte de «Editar mi página web» */
  const NAVFACIL = {
    socios:         ['Contactos', 'Socios, aliados y autoridades: listas y saludos'],
    inicio:         ['Inicio', 'Lo más importante de un vistazo'],
    mensajes:       ['Mensajes', 'Lo que la gente escribió en la página'],
    informes:       ['Informes', 'Documentos para imprimir o abrir en Excel'],
    ayuda:          ['Ayuda', 'Guía paso a paso para usar el panel'],
    ajustes:        ['Ajustes', 'Letra, colores e historial de cambios'],
    publicar:       ['Publicar y respaldos', 'Subir tus cambios y guardar una copia de seguridad'],
    'club-datos':   ['Nombre y lema del club', 'El nombre y la frase que identifican al club'],
    contacto:       ['Teléfono y correo', 'Cómo pueden comunicarse con el club'],
    redes:          ['Redes sociales', 'Los enlaces a Instagram, Facebook y otras'],
    donaciones:     ['Cuenta para donar', 'Los datos del banco para recibir ayuda'],
    portada:        ['Portada', 'Lo primero que se ve al entrar a la página'],
    quienes:        ['Quiénes somos', 'La historia del club y para qué existe'],
    causas:         ['Causas que apoyamos', 'Las áreas de ayuda: salud, vista, niños…'],
    sellos:         ['Franja azul de respaldo', 'Lo que respalda y da confianza al club'],
    impacto:        ['Números del club', 'Cifras de la ayuda entregada'],
    proyectos:      ['Editar terrenos', 'Agregar o cambiar lo que hicimos en terreno'],
    articulos:      ['Editar blog', 'Escribir o cambiar artículos del club'],
    agenda:         ['Editar agenda', 'Agregar, cambiar o quitar actividades'],
    valores:        ['Valores del club', 'Las frases y principios del club'],
    directiva:      ['Editar directiva', 'Los cargos del club (una vez al año)'],
    testimonios:    ['Testimonios', 'Lo que dicen las personas ayudadas'],
    unete:          ['Invitación a ser socio', 'El aviso para que más gente se sume'],
    aportar:        ['Cómo ayudar', 'Donaciones y actividades solidarias'],
    faq:            ['Preguntas frecuentes', 'Las dudas más comunes y sus respuestas'],
    'contacto-sec': ['Cuadro para escribirnos', 'El formulario de contacto de la página'],
    pie:            ['Final de la página', 'El texto que va al pie, abajo de todo'],
    noticias:       ['Noticias automáticas', 'Se actualizan solas, no hay que hacer nada'],
    instagram:      ['Fotos de Instagram', 'Las fotos del club que se muestran']
  };

  /* Guía paso a paso para las partes que más se editan */
  const GUIA = {
    socios: ['Arriba ves las próximas fechas importantes (Navidad, Año Nuevo…). Toca «Preparar saludo».', 'Elige a qué listas les llega y el correo ya viene escrito; puedes cambiarlo.', 'Para una lista nueva (por ejemplo «Municipalidad»), toca «＋ Nueva lista».', 'Dentro de la lista, toca «＋ Agregar contacto» o sube un Excel.'],
    agenda: ['Toca «＋ Agregar una actividad», o toca un día vacío del calendario.', 'Escribe qué se hace, el día y la hora.', 'Toca «💾 Guardar».', 'Para cambiar o borrar una, toca ✏️ Cambiar o 🗑 Quitar.', 'Al terminar, toca «Publicar» (arriba a la derecha).'],
    articulos: ['Toca el botón amarillo «＋ Agregar artículo».', 'Escribe el título, el resumen y el texto completo.', 'Agrega una foto (se ve en la lista y en la página).', 'Toca «✔ Listo».', 'Al terminar, toca «Publicar» (arriba a la derecha).'],
    proyectos: ['Toca el botón amarillo «＋ Agregar proyecto».', 'Escribe el título, la fecha y cuenta lo que se hizo, en primera persona («Fuimos…», «Entregamos…»).', 'Agrega las fotos.', 'Toca «✔ Listo».', 'Al terminar, toca «Publicar» (arriba a la derecha).'],
    directiva: ['Esto se cambia una vez al año, cuando asume una nueva directiva.', 'Toca ✏️ Editar en la persona que cambia el cargo, y escribe el nombre nuevo y su foto.', 'Para sumar a alguien, toca «＋ Agregar integrante».', 'Al terminar, toca «Publicar» (arriba a la derecha).']
  };

  const GRUPO_FACIL = {
    'Datos del club': 'Datos del club',
    'Contenido de la página': 'Partes de la página (textos y fotos)',
    'Conexiones': 'Cosas que se actualizan solas'
  };

  const SECCIONES = [

    /* ───────────────────────────── INICIO ───────────────────────────── */
    { id: 'inicio', grupo: 'Administración', nombre: 'Inicio', ico: ICO.inicio,
      titulo: 'Inicio',
      bajada: 'Un vistazo rápido al club, a la página y a lo que falta por completar.',
      pintar: panelInicio },

    { id: 'mensajes', grupo: 'Administración', nombre: 'Mensajes', ico: ICO.tel,
      titulo: 'Mensajes de la página',
      bajada: 'Lo que la gente escribe en el cuadro de contacto. Puedes reenviarlo a un socio, responder o descargarlo en Excel.',
      pintar: panelMensajes },

    { id: 'socios', grupo: 'Administración', nombre: 'Contactos', ico: ICO.gente,
      titulo: 'Contactos',
      bajada: 'La lista de socios, los cumpleaños y el envío de correos o WhatsApp a varios a la vez.',
      pintar: panelContactos },

    { id: 'informes', grupo: 'Administración', nombre: 'Informes', ico: ICO.diario,
      titulo: 'Informes y descargas',
      bajada: 'Informe del club listo para imprimir o guardar en PDF, y listados para abrir en Excel.',
      pintar: panelInformes },

    { id: 'ayuda', grupo: 'Administración', nombre: 'Ayuda', ico: ICO.duda,
      titulo: 'Cómo usar este panel',
      bajada: 'Cuatro pasos, siempre los mismos.',
      pintar: panelAyuda },

    { id: 'ajustes', grupo: 'Administración', nombre: 'Ajustes', ico: ICO.club,
      titulo: 'Ajustes',
      bajada: 'Deja el panel a tu gusto: letras más grandes, otros colores y la lista de socios para reenviar mensajes.',
      pintar: panelAjustes },

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
          { tipo: 'email', ruta: 'contacto.email', etiqueta: 'Correo electrónico', marca: 'info@clta.cl' },
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

    { id: 'proyectos', grupo: 'Administración', nombre: 'Proyectos', ico: ICO.grid,
      titulo: 'Proyectos',
      bajada: 'Las tarjetas con foto de "Lo que hacemos en terreno". En la portada se ven las primeras 4; todas quedan en la página de archivo por mes (trabajo-en-terreno.html), así no se pierde el trabajo de meses pasados.',
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
            { tipo: 'fecha', ruta: 'fecha', etiqueta: 'Fecha de la actividad', ayuda: 'Sirve para ordenar el archivo histórico por mes. El carrusel de la portada muestra los 4 primeros de esta lista; <b>los demás no se pierden</b>: quedan en la página «Trabajo en terreno».' },
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

    { id: 'articulos', grupo: 'Administración', nombre: 'Blog', ico: ICO.diario,
      titulo: 'Blog Leones Antumalal',
      bajada: 'Textos más largos del club: entrevistas, testimonios y reflexiones. Cada artículo puede llevar un video de YouTube. Se ven en la portada y tienen su propia página.',
      tarjetas: [
        { titulo: 'Encabezado', campos: [
          { tipo: 'texto', ruta: 'textos.articulosSec.eyebrow', etiqueta: 'Palabra pequeña de arriba' },
          { tipo: 'texto', ruta: 'textos.articulosSec.titulo', etiqueta: 'Título' },
          { tipo: 'area', ruta: 'textos.articulosSec.lead', etiqueta: 'Bajada', filas: 2 }
        ] },
        { repetidor: {
          ruta: 'articulos', etiqueta: 'Artículos', textoNuevo: 'Agregar artículo',
          titulo: (it) => it.titulo,
          nuevo: { tag: 'Artículo', titulo: 'Nuevo artículo', texto: '', fecha: '', autor: '', imagen: '', video: '', videoCredito: '', cuerpo: '', cita: '' },
          campos: [
            { tipo: 'texto', ruta: 'titulo', etiqueta: 'Título del artículo' },
            { tipo: 'fecha', ruta: 'fecha', etiqueta: 'Fecha de publicación' },
            { tipo: 'texto', ruta: 'tag', etiqueta: 'Etiqueta', ayuda: 'La palabra chica sobre el título: "Entrevista", "Video", "Opinión"…' },
            { tipo: 'texto', ruta: 'autor', etiqueta: 'Autor (opcional)', marca: 'Nombre y apellido',
              ayuda: 'Si lo escribes, el artículo muestra «Por …» bajo el título. <b>Si lo dejas vacío, el artículo se publica sin firma.</b>' },
            { tipo: 'area', ruta: 'texto', etiqueta: 'Resumen (bajada)', filas: 3, ayuda: 'Dos líneas que se ven en la tarjeta de la portada y bajo el título.' },
            { tipo: 'imagen', ruta: 'imagen', etiqueta: 'Foto de portada', clave: 'articulo', ancho: 1400, pordefecto: '',
              ayuda: 'Si el artículo lleva video y dejas la foto vacía, se usa la imagen del club.' },
            { tipo: 'texto', ruta: 'video', etiqueta: 'Video de YouTube (opcional)', marca: 'https://www.youtube.com/watch?v=…',
              ayuda: 'Pega la dirección del video tal como aparece en YouTube. Se verá dentro del artículo.' },
            { tipo: 'texto', ruta: 'videoCredito', etiqueta: 'Crédito del video (opcional)', marca: 'Video: nombre del canal, publicado el …' },
            { tipo: 'area', ruta: 'cuerpo', etiqueta: 'El artículo completo', filas: 12,
              ayuda: '<b>Deja una línea en blanco entre párrafos.</b> Se recomienda un tono formal y basarse solo en hechos que se puedan respaldar.' },
            { tipo: 'texto', ruta: 'cita', etiqueta: 'Frase destacada (opcional)', ayuda: 'Una frase corta que se muestra grande a la mitad del artículo.' }
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

    { id: 'agenda', grupo: 'Administración', nombre: 'Agenda', ico: ICO.cal,
      titulo: 'Agenda',
      bajada: 'Como un calendario: toca un día para agregar una actividad y toca una actividad para cambiarla.',
      pintar: panelAgendaAdmin },

    { id: 'directiva', grupo: 'Administración', nombre: 'Directorio', ico: ICO.gente,
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
      bajada: 'Los textos de la sección de donaciones.',
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
          visible: 'visible',
          ayuda: 'Marca el cuadrado «En la página» para mostrarla y desmárcalo para ocultarla sin borrarla. Cuando una actividad salga a la venta: activa "Ya está a la venta", pon la fecha, el lugar, el precio, el enlace para comprar y el afiche. Aparece destacada en el sitio.',
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
    { id: 'publicar', grupo: 'Administración', nombre: 'Publicar y respaldos', ico: ICO.subir,
      titulo: 'Publicar, respaldar y restaurar',
      bajada: 'Aquí se publican los cambios, se guarda una copia de seguridad y se cambia la clave del panel.',
      pintar: panelPublicar }
  ];

  /* ═══════════════════════════════════════════════════════════════
     7. PANELES ESPECIALES
     ═══════════════════════════════════════════════════════════════ */

  /* ─── Inicio: revisión de pendientes ─── */
  function panelAyuda(lienzo) {
    /* Guía de uso: va primero, para quien administra el sitio */
    const ayuda = document.createElement('div');
    ayuda.className = 'tarjeta';
    ayuda.innerHTML = `
      <div class="tarjeta__cab"><div>
        <h3>Cómo usar este panel</h3>
        <p>Cuatro pasos, siempre los mismos.</p>
      </div></div>
      <div class="paso"><span class="paso__n">1</span><div class="paso__txt">
        <b>Elige qué quieres cambiar</b>En el menú de la izquierda toca la sección
        (por ejemplo <em>Proyectos</em> o <em>Agenda</em>).</div></div>
      <div class="paso"><span class="paso__n">2</span><div class="paso__txt">
        <b>Escribe o agrega</b>Cambia los textos y las fotos. Para algo nuevo usa el botón
        <em>Agregar</em>, que está arriba de cada lista. Lo que ya no quieras mostrar,
        desmárcalo en <em>En la página</em> o elimínalo.</div></div>
      <div class="paso"><span class="paso__n">3</span><div class="paso__txt">
        <b>Mira cómo queda</b>Toca <em>Vista previa</em> (arriba a la derecha). Se abre el sitio
        con tus cambios, <u>solo para ti</u>: nadie más los ve todavía.</div></div>
      <div class="paso"><span class="paso__n">4</span><div class="paso__txt">
        <b>Publica</b>Si todo se ve bien, toca el botón amarillo <em>Publicar</em>.
        Recién ahí los cambios se ven en la página del club, para todos.</div></div>
      <div class="aviso aviso--info" style="margin-top:12px"><div><b>Tranquilidad:</b>
        mientras no publiques, la página no cambia. Tus cambios se guardan solos en este
        computador, y si te equivocas puedes descartarlos desde <em>Publicar y respaldos</em>.</div></div>`;
    lienzo.appendChild(ayuda);
  }

  function panelInicio(lienzo) {
    /* Pantalla de inicio pensada para personas mayores: pocas opciones, grandes, con una frase que explica cada una */
    lienzo.classList.add('panel--inicio');   /* en pantallas anchas: visitas a un lado y botones al otro */
    const cabP = lienzo.querySelector('.panel__cab'); if (cabP) cabP.remove();   /* el saludo es lo primero que se ve */
    const nombre = (leerPref().nombre || '').trim();
    const h = new Date().getHours();
    const saludo = h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
    const cab = document.createElement('div');
    cab.className = 'inicio__saludo';
    const FRASES = ['«Nosotros servimos.» Ese es el lema de todos los Leones del mundo.',
      'Cada gesto de ayuda, por pequeño que sea, cambia el día de alguien.',
      'Servir juntos nos hace más fuertes como club y como comunidad.',
      'Hoy es un buen día para contar lo bueno que hace el club.',
      '«No puedes llegar muy lejos hasta que empiezas a hacer algo por alguien más.» Melvin Jones, fundador de los Leones.',
      'Lo que el club hace en terreno merece que todos lo conozcan.',
      'Un León no mira desde lejos: se acerca y ayuda.',
      'Gracias por dedicar tu tiempo a servir a los demás.'];
    const frase = FRASES[Math.floor(Date.now() / 86400000) % FRASES.length];
    cab.innerHTML = `<h3>${saludo}${nombre ? ', ' + esc(nombre) : ''}</h3><p class="inicio__frase">🦁 ${esc(frase)}</p><p>Toca lo que quieras hacer. Todo se explica paso a paso.</p>`;
    lienzo.appendChild(cab);
    tarjetaVisitas(lienzo);   /* y enseguida, cuánta gente visita la página */

    const aviso = document.createElement('div');
    aviso.id = 'inicioAviso';
    lienzo.appendChild(aviso);
    const pintarAviso = () => {
      aviso.innerHTML = ESTADO.sucio
        ? `<div class="inicio__alerta"><span aria-hidden="true">⚠️</span><div><b>Tienes cambios sin publicar.</b> La página del club todavía no los muestra. Toca «Publicar» cuando termines.</div><button type="button" class="btn btn--grande" data-pub-inicio="1">🚀 Publicar mis cambios</button></div>`
        : `<div class="inicio__alerta inicio__alerta--ok"><span aria-hidden="true">✅</span><div><b>Todo está publicado.</b> La página del club muestra lo último que escribiste.</div></div>`;
    };
    pintarAviso();
    aviso.addEventListener('click', (e) => { if (e.target.closest('[data-pub-inicio]')) abrirPublicar(); });

    /* Cumpleaños de hoy: aviso para saludar a los socios */
    const cumpleCaja = document.createElement('div');
    aviso.appendChild(cumpleCaja);
    const prox0 = proximasOcasiones().filter((x) => x.dias <= 10)[0];
    if (prox0) {
      const caja2 = document.createElement('div');
      caja2.className = 'inicio__alerta inicio__alerta--fecha';
      caja2.innerHTML = `<span aria-hidden="true">${prox0.o.ico}</span><div><b>${esc(prox0.o.nombre)}: ${textoDias(prox0.dias)}.</b> Es un buen momento para enviar un saludo a tus socios, autoridades y aliados.</div><button type="button" class="btn btn--grande" data-ir-cont="1">Preparar saludos</button>`;
      caja2.querySelector('button').addEventListener('click', () => ir('socios'));
      aviso.appendChild(caja2);
    }
    cargarSocios().then(() => {
      const hoyD = new Date();
      const deHoy = SOCIOS.filter((x) => { const c = cumple(x); return c && c.d === hoyD.getDate() && c.m === hoyD.getMonth() + 1; });
      if (!deHoy.length) return;
      cumpleCaja.innerHTML = deHoy.map((x) => {
        const wa = numWa(x.m);
        return `<div class="inicio__alerta inicio__alerta--cumple"><span aria-hidden="true">🎂</span><div><b>¡Hoy cumple años ${esc(nombreSocio(x))}!</b> Es un buen día para enviarle un saludo${wa ? '' : ' (no tiene un celular válido en la lista)'}.</div>
          ${wa ? `<a class="btn btn--grande" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(textoCumple(x))}">💬 Saludar por WhatsApp</a>` : '<button type="button" class="btn btn--linea btn--grande" data-ir-socios="1">Ver socios</button>'}</div>`;
      }).join('');
      cumpleCaja.querySelectorAll('[data-ir-socios]').forEach((b) => b.addEventListener('click', () => ir('socios')));
    }).catch(() => {});
  }

  /* Salir del panel: cierra la sesión (en el sitio, también la de Cloudflare Access) */
  function salirDelPanel() {
    const aviso2 = ESTADO.sucio ? String.fromCharCode(10, 10) + 'Ojo: tienes cambios sin publicar. Quedan guardados en este computador y los verás al volver a entrar.' : '';
    if (!confirm('¿Quieres salir del panel?' + aviso2)) return;
    try { sessionStorage.removeItem('accesoReintento'); } catch (e) { /* sin almacenamiento */ }
    window.__saliendo = true;   /* el borrador ya está guardado en este computador: no hace falta frenar la salida */
    if (/(^|\.)clta\.cl$/.test(location.hostname)) location.href = 'https://twilight-wave-97b6.cloudflareaccess.com/cdn-cgi/access/logout';
    else location.reload();
  }

  /* Letra más grande: pasa por 100 %, 115 % y 130 % y se acuerda de la elección en este computador */
  function cambiarLetra() {
    const p = leerPref();
    const sig = p.letra >= 130 ? 100 : p.letra >= 115 ? 130 : 115;
    guardarPref(Object.assign(p, { letra: sig }));
    aplicarPref();
    aviso(sig === 100 ? 'Letra normal.' : 'Letra más grande (' + sig + ' %). Toca de nuevo para agrandar más o volver.', 'ok');
  }

  /* ═══════════════════════════════════════════════════════════════
     VISITAS, MENSAJES Y AJUSTES (usan la base de datos del publicador)
     ═══════════════════════════════════════════════════════════════ */

  /* Llama al publicador. Devuelve null si todavía no está conectado (por ejemplo, al probar en el computador). */
  async function api(ruta, cuerpo) {
    try {
      const r = await fetch(ruta, cuerpo === undefined ? { cache: 'no-store' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.ok ? j : null;
    } catch { return null; }
  }
  const SIN_CONEXION = `<div class="aviso aviso--info"><div><b>Esta parte todavía no está conectada.</b>
    Para ver las visitas y los mensajes hay que activar la base de datos del sitio (se hace una sola vez, ver
    <code>docs/VISITAS-Y-MENSAJES.md</code>). Mientras tanto, los mensajes siguen llegando al correo del club como siempre.</div></div>`;

  const fechaHora = (t) => new Date(t).toLocaleString('es-CL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const csvCelda = (c) => '"' + String(c == null ? '' : c).replace(/<[^>]*>/g, '').replace(/"/g, '""') + '"';
  const bajarCsv = (nombre, cab, filas) => descargar(nombre, '﻿' + [cab, ...filas].map((f) => f.map(csvCelda).join(';')).join('\r\n'), 'text/csv;charset=utf-8');

  /* ─── Preferencias de este computador (apariencia del panel) ─── */
  const ACENTOS = {
    azul:    ['Azul León', '#00338D', '#1E56B3'],
    verde:   ['Verde', '#1B6B43', '#2E8B5A'],
    granate: ['Granate', '#8A1F3D', '#B03455'],
    violeta: ['Violeta', '#55307F', '#7447A8'],
    grafito: ['Gris oscuro', '#2F3A4A', '#4A586C']
  };
  const PREF0 = { acento: 'azul', letra: 100, compacto: false, inicio: 'inicio', nombre: '', vivo: false, pasos: true };
  const leerPref = () => { try { return Object.assign({}, PREF0, JSON.parse(localStorage.getItem('antumalal.pref') || '{}')); } catch { return Object.assign({}, PREF0); } };
  const guardarPref = (p) => { try { localStorage.setItem('antumalal.pref', JSON.stringify(p)); } catch { /* ignorar */ } };
  function aplicarPref() {
    const p = leerPref(), raiz = document.documentElement;
    const a = ACENTOS[p.acento] || ACENTOS.azul;
    raiz.style.setProperty('--azul', a[1]);
    raiz.style.setProperty('--azul-claro', a[2]);
    raiz.style.zoom = p.letra === 100 ? '' : String(p.letra / 100);
    document.body.classList.toggle('compacto', !!p.compacto);
    const nom = document.querySelector('.lateral__marca b');
    if (nom) nom.textContent = p.nombre || 'Leones Temuco Antumalal';
  }

  /* ─── Ajustes guardados en el servidor: miembros para reenviar mensajes ─── */
  let AJ = { miembros: [], firma: '' };
  async function cargarAjustes() {
    const r = await api('/api/ajustes');
    if (r && r.ajustes) AJ = Object.assign({ miembros: [], firma: '' }, r.ajustes);
    else { try { AJ = Object.assign(AJ, JSON.parse(localStorage.getItem('antumalal.aj') || '{}')); } catch { /* ignorar */ } }
    return !!r;
  }
  async function guardarAjustes() {
    try { localStorage.setItem('antumalal.aj', JSON.stringify(AJ)); } catch { /* ignorar */ }
    return !!(await api('/api/ajustes', { ajustes: AJ }));
  }

  /* ─── Contador de visitas (arriba del Resumen) ─── */
  function tarjetaVisitas(lienzo) {
    const t = document.createElement('div');
    t.className = 'tarjeta tarjeta--visitas';
    t.innerHTML = '<div class="tarjeta__cab"><div><h3>👁 ¿Cuánta gente visita la página?</h3><p>Las personas que entraron a la página del club.</p></div></div><div id="visBody"><p class="nota-res">Cargando…</p></div>';
    lienzo.appendChild(t);
    api('/api/resumen').then((r) => {
      const c = t.querySelector('#visBody');
      if (!r) { c.innerHTML = SIN_CONEXION; return; }
      const SEC = { '#club': 'El Club', '#impacto': 'Cifras de impacto', '#causas': 'Causas', '#proyectos': 'Proyectos', '#noticias': 'Noticias', '#agenda': 'Agenda',
        '#directorio': 'Directorio', '#testimonios': 'Testimonios', '#unete': 'Hazte socio', '#dona': 'Colabora y dona', '#faq': 'Preguntas frecuentes', '#contacto': 'Contacto' };
      const nomRuta = (x) => { if (x === '/' || /index/.test(x)) return 'Portada'; const t = x.replace(/^\//, '').replace(/\.html$/, '').replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
      /* barras verticales con etiqueta */
      const barras = (vals, etq, tit) => { const m = Math.max(1, ...vals.map((v) => v[1])); return `<div class="barras" role="img" aria-label="${tit}">${vals.map(([k, n]) => `<i style="height:${Math.max(3, Math.round(n / m * 100))}%" title="${esc(k)}: ${n}"></i>`).join('')}</div><div class="barras__et">${etq}</div>`; };
      /* barras horizontales (secciones, páginas, orígenes) */
      const hbar = (lista, nombre) => { const m = Math.max(1, ...lista.map((x) => x.n)); return lista.length ? `<ul class="hbar">${lista.map((x) => `<li><span>${esc(nombre(x))}</span><i style="width:${Math.max(4, Math.round(x.n / m * 100))}%"></i><b>${x.n}</b></li>`).join('')}</ul>` : '<p class="nota-res">Aún no hay datos.</p>'; };

      const mapa = Object.fromEntries(r.porDia.map((x) => [x.dia, x.n]));
      const dias = [];
      for (let i = 29; i >= 0; i--) { const dia = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }); dias.push([dia, mapa[dia] || 0]); }
      const horas = Array.from({ length: 24 }, (_, h) => [h + ':00', (r.porHora.find((x) => x.hora === h) || {}).n || 0]);
      const horaTop = horas.reduce((a, b) => (b[1] > a[1] ? b : a), ['—', 0]);
      const NSEM = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const sem = r.semana.map((n, i) => [NSEM[i], n]);
      const semTop = sem.reduce((a, b) => (b[1] > a[1] ? b : a), ['—', 0]);
      const pais = (cod) => { if (!cod) return ''; try { return new Intl.DisplayNames(['es'], { type: 'region' }).of(cod) || cod; } catch (e) { return cod; } };
      const lugar = (x) => [x.ciudad, pais(x.pais)].filter(Boolean).join(', ') || 'Sin dato';
      const fh = (t) => new Date(t).toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const completa = `<div class="vis">
        ${r.desdeDia ? `<p class="nota-res">🔄 Contador en cero desde el <b>${esc(fechaLarga(r.desdeDia))}</b>. El historial sigue guardado (abajo).</p>` : ''}
        <div class="resumen vis__kpis">
          <div class="resumen__caja"><b>${r.hoyN}</b><span>Hoy</span></div>
          <div class="resumen__caja"><b>${r.d7}</b><span>7 días</span></div>
          <div class="resumen__caja"><b>${r.d30}</b><span>30 días</span></div>
          <div class="resumen__caja"><b>${r.unicos30}</b><span>Dispositivos (30 días)</span></div>
          <div class="resumen__caja"><b>${r.total}</b><span>Desde el inicio</span></div>
        </div>
        <p class="nota-res vis__nota">Cada dispositivo o conexión cuenta una sola vez cada 7 días.</p>
        <div class="vis__fila vis__fila--2">
          <div><h4 class="vis-t">Visitas por día · 30 días</h4>${barras(dias, '<span>hace 30 días</span><span>hoy</span>', 'Visitas por día')}</div>
          <div><h4 class="vis-t">⏰ A qué hora${horaTop[1] ? ' · punta ' + horaTop[0] : ''}</h4>${barras(horas, '<span>0</span><span>6</span><span>12</span><span>18</span><span>23 h</span>', 'Visitas por hora')}</div>
        </div>
        <div class="vis__fila vis__fila--3">
          <div><h4 class="vis-t">🌎 País</h4>${hbar(r.paises || [], (x) => pais(x.pais))}</div>
          <div><h4 class="vis-t">🏙 Ciudad</h4>${hbar(r.ciudades || [], (x) => x.ciudad + (x.pais && x.pais !== 'CL' ? ' (' + pais(x.pais) + ')' : ''))}</div>
          <div><h4 class="vis-t">🔗 De dónde llegan</h4>${hbar(r.origenes, (x) => x.ref)}</div>
        </div>
        <h4 class="vis-t">🕒 Últimas visitas</h4>
        ${r.ultimas.length ? `<div class="tabla-vis"><div class="fv fv--cab"><span>Fecha y hora</span><span>Ciudad y país</span><span>Llegó desde</span></div>${r.ultimas.slice(0, 8).map((x) => `<div class="fv"><span>${esc(fh(x.t))}</span><span>${esc(lugar(x))}</span><span>${esc(x.ref || 'Directo')}</span></div>`).join('')}</div>` : '<p class="nota-res">Aún no hay visitas registradas.</p>'}
        <details class="vis-hist"><summary>Ver más detalle (días de la semana, secciones, páginas e historial)</summary>
          <div class="vis__fila vis__fila--2">
            <div><h4 class="vis-t">📅 Día de la semana</h4>${barras(sem, '<span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span>', 'Visitas por día de la semana')}
              <p class="nota-res">${semTop[1] ? 'Se visita más los <b>' + semTop[0].toLowerCase() + '</b> (90 días).' : 'Aún no hay datos.'}</p></div>
            <div><h4 class="vis-t">📄 Páginas más abiertas</h4>${hbar(r.paginas, (x) => nomRuta(x.ruta))}</div>
          </div>
          <h4 class="vis-t">📍 Qué parte de la portada se mira más</h4>${hbar(r.secciones, (x) => SEC[x.ruta] || x.ruta)}
          <h4 class="vis-t">📚 Historial completo</h4>
          ${r.historico && r.historico.total ? `
          <p class="nota-res"><b>${r.historico.total}</b> visitas${r.historico.primera ? ' desde el ' + esc(fechaLarga(r.historico.primera)) : ''}.
          ${(r.historico.reinicios || []).length ? 'Reinicios: ' + r.historico.reinicios.map((x) => esc(fechaLarga(x.dia))).join(', ') + '.' : ''}</p>
          ${barras(r.historico.porMes.map((x) => [x.mes, x.n]), r.historico.porMes.length > 1 ? '<span>' + esc(r.historico.porMes[0].mes) + '</span><span>' + esc(r.historico.porMes[r.historico.porMes.length - 1].mes) + '</span>' : '<span>' + esc((r.historico.porMes[0] || {}).mes || '') + '</span>', 'Visitas por mes, historial completo')}`
          : '<p class="nota-res">Aún no hay historial.</p>'}
        </details></div>`;

      /* Vista simple: pensada para leer de un vistazo, con letra grande y frases claras */
      const plural = (n, uno, varios) => (n === 1 ? uno : varios);
      const ult7 = dias.slice(-7);
      const DS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const max7 = Math.max(1, ...ult7.map((x) => x[1]));
      const top3 = (r.ciudades || []).slice(0, 3);
      const semDia = semTop[1] ? semTop[0].toLowerCase() + (/s$/.test(semTop[0]) ? '' : 's') : '';
      const PER = [['hoy', r.hoyN, 'hoy'], ['sem', r.d7, 'esta semana'], ['mes', r.d30, 'este mes']];
      const frasePer = (n, txt) => `${plural(n, 'persona entró', 'personas entraron')} ${txt} a la página`;
      const simple = `<div class="vs">
        <div class="vs__per" role="group" aria-label="Período">${PER.map((x, k) => `<button type="button" data-per="${k}" class="${k === 0 ? 'on' : ''}">${x[2].charAt(0).toUpperCase() + x[2].slice(1)}</button>`).join('')}</div>
        <div class="vs__gran"><b id="vsNum">${r.hoyN}</b><span id="vsFrase">${frasePer(r.hoyN, 'hoy')}</span></div>
        <h4 class="vs__t">Los últimos 7 días</h4>
        <div class="vs__barras">${ult7.map((x, k) => `<div><i class="${k === 6 ? 'hoy' : ''}" style="height:${Math.max(6, Math.round(x[1] / max7 * 100))}%"></i><b>${x[1]}</b></div>`).join('')}</div>
        <div class="vs__dias">${ult7.map((x, k) => `<span class="${k === 6 ? 'hoy' : ''}">${k === 6 ? 'Hoy' : DS[new Date(x[0] + 'T12:00:00').getDay()]}</span>`).join('')}</div>
        <div class="vs__cols">
          <div class="vs__caja"><h4>📍 ¿Desde dónde entran?</h4>${top3.length ? top3.map((x) => `<p class="vs__l"><span>${esc(x.ciudad)}${x.pais && x.pais !== 'CL' ? ', ' + esc(pais(x.pais)) : ''}</span><b>${x.n}</b></p>`).join('') : '<p class="vs__vacio">Todavía no hay datos. Se irán sumando con las próximas visitas.</p>'}</div>
          <div class="vs__caja"><h4>⏰ ¿Cuándo entran?</h4>${horaTop[1] ? `<p>La mayoría entra <b>a las ${esc(horaTop[0])}</b>.</p>` : ''}${semDia ? `<p>Se visita más los <b>${esc(semDia)}</b>.</p>` : ''}${horaTop[1] || semDia ? '' : '<p class="vs__vacio">Todavía no hay datos.</p>'}</div>
        </div>
      </div>`;
      const pone = (modo) => {
        try { localStorage.setItem('antumalal.visVista', modo); } catch (e) { /* sin guardar */ }
        c.innerHTML = `<div class="vs__sw"><button type="button" id="visCambia">${modo === 'simple' ? '🔎 Ver más detalle' : '← Volver a la vista simple'}</button></div>` + (modo === 'simple' ? simple : completa);
        c.querySelector('#visCambia').onclick = () => pone(modo === 'simple' ? 'completa' : 'simple');
        c.querySelectorAll('[data-per]').forEach((b) => b.onclick = () => {
          const x = PER[+b.dataset.per];
          c.querySelectorAll('[data-per]').forEach((o) => o.classList.toggle('on', o === b));
          c.querySelector('#vsNum').textContent = x[1];
          c.querySelector('#vsFrase').textContent = frasePer(x[1], x[2]);
        });
      };
      let modo0 = 'simple'; try { modo0 = localStorage.getItem('antumalal.visVista') || 'simple'; } catch (e) { /* simple */ }
      pone(modo0);
    });
  }

  /* ─── Mensajes del formulario de contacto ─── */
  /* Etiquetas con color: [texto, fondo] */
  const ETQ = { 'Pendiente': ['#9A4A00', '#FFE8C2'], 'En seguimiento': ['#1D4ED8', '#DCE8FF'], 'Respondido': ['#0B6B45', '#D4F3E4'], 'Urgente': ['#B42318', '#FFD9D5'],
    'Quiero ser socio': ['#6D28D9', '#EBE3FF'], 'Donación': ['#8A5A00', '#FFF0B3'], 'Consulta': ['#374151', '#E5E7EB'], 'Prensa': ['#0E7490', '#CDF2FA'] };
  const ETIQUETAS = Object.keys(ETQ);
  const chipEtq = (t, solido) => { const c = ETQ[t] || ['#374151', '#E5E7EB']; return solido ? `background:${c[0]};color:#fff;border-color:${c[0]}` : `background:${c[1]};color:${c[0]};border-color:${c[0]}`; };
  const fechaLarga = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); const ML = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']; return m ? (+m[3]) + ' de ' + ML[+m[2] - 1] + ' de ' + m[1] : String(iso || ''); };
  async function panelMensajes(lienzo) {
    const caja = document.createElement('div');
    lienzo.appendChild(caja);
    caja.innerHTML = '<p class="nota-res">Cargando mensajes…</p>';
    const [r] = await Promise.all([api('/api/mensajes'), cargarAjustes(), cargarSocios()]);
    if (!r) { caja.innerHTML = SIN_CONEXION; return; }
    let todos = r.mensajes, filtro = 'activos', abierto = null, filtroEtq = '';

    const pintar = () => {
      const lista = todos.filter((m) => (filtro === 'todos' ? true : filtro === 'archivados' ? m.estado === 'archivado' : m.estado !== 'archivado') && (!filtroEtq || m.etiqueta === filtroEtq));
      const nuevos = todos.filter((m) => m.estado === 'nuevo').length;
      pintarInsignia(nuevos);
      caja.innerHTML = `
        <div class="tarjeta">
          <div class="tarjeta__cab"><div><h3>${nuevos ? `Tienes ${nuevos} mensaje${nuevos === 1 ? '' : 's'} sin leer` : 'No tienes mensajes sin leer'}</h3>
            <p>Son los que la gente escribe en el cuadro «Contáctanos» de la página. También llegan al correo del club.</p></div>
            <button class="btn btn--linea" id="msgExcel" type="button">⬇ Descargar en Excel</button></div>
          <div class="filtros">${[['activos', 'Por atender'], ['archivados', 'Archivados'], ['todos', 'Todos']].map(([k, n]) => `<button type="button" class="btn ${filtro === k ? '' : 'btn--linea'} btn--sm" data-f="${k}">${n}</button>`).join('')}
            <select id="msgFiltroEtq" aria-label="Filtrar por etiqueta" style="padding:8px 12px;border:1px solid var(--g-borde);border-radius:10px;font:inherit"><option value="">Todas las etiquetas</option>${ETIQUETAS.map((t) => `<option ${filtroEtq === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>
        </div>
        ${lista.length ? lista.map((m) => `
        <div class="tarjeta msg ${m.estado === 'nuevo' ? 'msg--nuevo' : ''}" data-id="${m.id}">
          <div class="msg__cab"><b>${esc(m.nombre)}</b>${m.estado === 'nuevo' ? '<span class="etq etq--nuevo">Nuevo</span>' : ''}${m.etiqueta ? `<span class="etq etq--tag" style="${chipEtq(m.etiqueta, true)}">● ${esc(m.etiqueta)}</span>` : ''}${m.estado === 'archivado' ? '<span class="etq">Archivado</span>' : ''}<span class="msg__fecha">${esc(fechaHora(m.t))}</span></div>
          <div class="msg__datos">${m.motivo ? `<span>📌 ${esc(m.motivo)}</span>` : ''}<span>✉ <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>${m.telefono ? `<span>📞 <a href="tel:${esc(m.telefono)}">${esc(m.telefono)}</a></span>` : ''}${m.origen ? `<span>🔎 Nos conoció por: ${esc(m.origen)}</span>` : ''}</div>
          <p class="msg__texto">${esc(m.mensaje).replace(/\n/g, '<br>')}</p>
          ${m.nota ? `<div class="msg__nota">💬 <b>Comentario:</b> ${esc(m.nota).replace(/\n/g, '<br>')}</div>` : ''}
          ${abierto === m.id ? `<div class="msg__etq">
            <b>Etiqueta</b>
            <div class="opc">${ETIQUETAS.map((t) => `<button type="button" class="chip-etq${m.etiqueta === t ? ' on' : ''}" style="${chipEtq(t, m.etiqueta === t)}" data-tag="${esc(t)}">${m.etiqueta === t ? '✓ ' : ''}${esc(t)}</button>`).join('')}${m.etiqueta ? '<button type="button" class="btn btn--linea btn--sm" data-tag="">✕ Quitar etiqueta</button>' : ''}</div>
            <label class="campo__et">Comentario (solo lo ve quien entra al panel)<textarea id="msgNota" rows="2" placeholder="Ej.: Llamé a la persona el lunes; quedó de venir a la sesión.">${esc(m.nota || '')}</textarea></label>
            <div class="msg__acc"><button class="btn btn--sm" data-a="guardarnota" type="button">💾 Guardar comentario</button><button class="btn btn--linea btn--sm" data-a="cerrarcl" type="button">Cerrar</button></div>
          </div>` : ''}
          ${m.reenvios.length ? `<div class="msg__rev">${m.reenvios.map((x) => `↪ Reenviado el ${esc(fechaHora(x.t))} a ${esc(x.para)}${x.comentario ? ` — «${esc(x.comentario)}»` : ''}`).join('<br>')}</div>` : ''}
          <div class="msg__acc">
            <button class="btn btn--sm" data-a="reenviar" type="button">↪ Reenviar a un socio</button>
            <button class="btn btn--linea btn--sm" data-a="clasificar" type="button">🏷 Etiqueta y comentario</button>
            <a class="btn btn--linea btn--sm" href="mailto:${esc(m.email)}?subject=${encodeURIComponent('Re: ' + (m.motivo || 'Tu mensaje al Club de Leones'))}">✉ Responder</a>
            ${m.estado === 'nuevo' ? '<button class="btn btn--linea btn--sm" data-a="leido" type="button">✓ Marcar como leído</button>' : ''}
            ${m.estado !== 'archivado' ? '<button class="btn btn--linea btn--sm" data-a="archivar" type="button">🗂 Archivar</button>' : '<button class="btn btn--linea btn--sm" data-a="desarchivar" type="button">↩ Volver a Por atender</button>'}
            <button class="btn btn--linea btn--sm" data-a="borrar" type="button">🗑 Borrar</button>
          </div>
        </div>`).join('') : '<div class="tarjeta"><p class="nota-res">No hay mensajes en esta lista.</p></div>'}`;
    };
    pintar();

    const cambiar = async (m, accion, extra) => {
      const ok = await api('/api/mensajes', Object.assign({ id: m.id, accion }, extra || {}));
      if (!ok) aviso('No se pudo guardar. Revisa tu conexión e inténtalo otra vez.', 'mal');
      return !!ok;
    };

    caja.addEventListener('change', (e) => { if (e.target.id === 'msgFiltroEtq') { filtroEtq = e.target.value; pintar(); } });
    caja.addEventListener('click', async (e) => {
      const f = e.target.closest('[data-f]');
      if (f) { filtro = f.dataset.f; pintar(); return; }
      if (e.target.closest('#msgExcel')) {
        bajarCsv('mensajes-' + new Date().toISOString().slice(0, 10) + '.csv',
          ['Fecha', 'Nombre', 'Correo', 'Teléfono', 'Motivo', 'Mensaje', 'Cómo nos conoció', 'Estado', 'Etiqueta', 'Comentario', 'Reenviado a / comentario'],
          todos.map((m) => [fechaHora(m.t), m.nombre, m.email, m.telefono, m.motivo, m.mensaje, m.origen, m.estado, m.etiqueta || '', m.nota || '',
            m.reenvios.map((x) => x.para + (x.comentario ? ' (' + x.comentario + ')' : '')).join(' | ')]));
        return;
      }
      const tg = e.target.closest('[data-tag]');
      if (tg) {
        const m = todos.find((x) => x.id === +tg.closest('.msg').dataset.id);
        if (m && await cambiar(m, 'etiqueta', { etiqueta: tg.dataset.tag })) { m.etiqueta = tg.dataset.tag; pintar(); }
        return;
      }
      const b = e.target.closest('[data-a]'); if (!b) return;
      const m = todos.find((x) => x.id === +b.closest('.msg').dataset.id); if (!m) return;
      const a = b.dataset.a;
      if (a === 'clasificar') { abierto = abierto === m.id ? null : m.id; pintar(); return; }
      if (a === 'cerrarcl') { abierto = null; pintar(); return; }
      if (a === 'guardarnota') {
        const txt = b.closest('.msg').querySelector('#msgNota').value.trim();
        if (await cambiar(m, 'nota', { nota: txt })) { m.nota = txt; abierto = null; pintar(); aviso('Comentario guardado.', 'ok'); }
        return;
      }
      if (a === 'leido' && await cambiar(m, 'estado', { estado: 'leido' })) { m.estado = 'leido'; pintar(); }
      else if (a === 'archivar' && await cambiar(m, 'estado', { estado: 'archivado' })) { m.estado = 'archivado'; pintar(); }
      else if (a === 'desarchivar' && await cambiar(m, 'estado', { estado: 'leido' })) { m.estado = 'leido'; pintar(); }
      else if (a === 'borrar') {
        if (!confirm('¿Borrar este mensaje para siempre?\n\nSi solo quieres sacarlo de la lista, mejor usa «Archivar».')) return;
        if (await cambiar(m, 'borrar')) { todos = todos.filter((x) => x !== m); pintar(); }
      } else if (a === 'reenviar') {
        ventanaReenviar(m, async (para, comentario, seguir) => {
          await cambiar(m, 'reenvio', { para, comentario });
          m.reenvios.push({ t: Date.now(), para, comentario }); if (m.estado === 'nuevo') m.estado = 'leido';
          if (seguir) {
            /* queda anotado en el comentario a quién se envió y para qué, y se marca «En seguimiento» */
            const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
            const linea = '↪ ' + fecha + ': se envió a ' + para + (comentario ? ' — ' + comentario.replace(/[.\s]+$/, '') : '') + '.';
            const nota = (m.nota ? m.nota + '\n' : '') + linea;
            if (await cambiar(m, 'nota', { nota })) m.nota = nota;
            if (m.etiqueta !== 'Respondido' && m.etiqueta !== 'Urgente' && await cambiar(m, 'etiqueta', { etiqueta: 'En seguimiento' })) m.etiqueta = 'En seguimiento';
          }
          pintar();
        });
      }
    });
  }

  /* Ventana para reenviar un mensaje a uno o varios socios, con un comentario */
  function ventanaReenviar(m, alTerminar) {
    const v = document.createElement('div');
    v.className = 'modalx';
    const deSocios = (SOCIOS || []).filter((x) => x.c).map((x) => ({ nombre: nombreSocio(x), cargo: '', correo: x.c }));
    const miembros = [...(AJ.miembros || []).filter((x) => x.correo), ...deSocios.filter((x) => !(AJ.miembros || []).some((y) => y.correo === x.correo))];
    v.innerHTML = `<div class="modalx__caja" role="dialog" aria-modal="true" aria-label="Reenviar mensaje">
      <h3>Reenviar el mensaje de ${esc(m.nombre)}</h3>
      <p class="nota-res">1. Marca a quién se lo quieres mandar.</p>
      ${miembros.length ? miembros.map((x, i) => `<label class="chk"><input type="checkbox" data-i="${i}"> <span><b>${esc(x.nombre)}</b>${x.cargo ? ' · ' + esc(x.cargo) : ''}<small>${esc(x.correo)}</small></span></label>`).join('')
        : '<p class="aviso aviso--info" style="margin:6px 0">Todavía no hay socios guardados. Agrégalos en <b>Ajustes</b>, o escribe un correo aquí abajo.</p>'}
      <label class="campo__et">Otro correo (opcional)<input type="email" id="rvOtro" placeholder="nombre@correo.cl"></label>
      <p class="nota-res" style="margin-top:12px">2. Escribe un comentario para quien lo recibe (opcional).</p>
      <textarea id="rvCom" rows="3" placeholder="Ej.: Hector, ¿puedes responderle a esta persona esta semana?"></textarea>
      <label class="chk"><input type="checkbox" id="rvSeg" checked> <span><b>Dejar anotado el seguimiento</b><small>Pone la etiqueta «En seguimiento» y escribe en el comentario a quién se lo enviaste.</small></span></label>
      <p class="nota-res">3. Elige cómo enviarlo. Se abrirá tu correo o WhatsApp con todo escrito; tú solo das «Enviar».</p>
      <div class="msg__acc">
        <button class="btn" id="rvMail" type="button">✉ Abrir en mi correo</button>
        <button class="btn btn--linea" id="rvWa" type="button">💬 Enviar por WhatsApp</button>
        <button class="btn btn--linea" id="rvCopiar" type="button">📋 Copiar el texto</button>
        <button class="btn btn--linea" id="rvCerrar" type="button">Cancelar</button>
      </div></div>`;
    document.body.appendChild(v);
    const elegidos = () => [...v.querySelectorAll('[data-i]:checked')].map((c) => miembros[+c.dataset.i]);
    const correos = () => [...elegidos().map((x) => x.correo), ...(v.querySelector('#rvOtro').value.trim() ? [v.querySelector('#rvOtro').value.trim()] : [])];
    const texto = () => {
      const com = v.querySelector('#rvCom').value.trim();
      return (com ? com + '\n\n' : '') + '— Mensaje recibido en la página del club —\n' +
        'De: ' + m.nombre + ' (' + m.email + (m.telefono ? ', ' + m.telefono : '') + ')\n' + (m.motivo ? 'Motivo: ' + m.motivo + '\n' : '') +
        'Fecha: ' + fechaHora(m.t) + '\n\n' + m.mensaje + (AJ.firma ? '\n\n' + AJ.firma : '');
    };
    const cerrar = () => v.remove();
    const registrar = () => alTerminar(correos().join(', '), v.querySelector('#rvCom').value.trim(), v.querySelector('#rvSeg').checked);
    const hay = () => { if (!correos().length) { aviso('Marca al menos a una persona o escribe un correo.', 'mal'); return false; } return true; };
    v.addEventListener('click', async (e) => {
      if (e.target === v || e.target.id === 'rvCerrar') return cerrar();
      if (e.target.id === 'rvMail' && hay()) {
        const asunto = 'Mensaje de ' + m.nombre + ' desde la página del Club';
        window.location.href = 'mailto:' + correos().join(',') + '?subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(texto());
        await registrar(); cerrar();
      } else if (e.target.id === 'rvWa') {
        window.open('https://wa.me/?text=' + encodeURIComponent(texto()), '_blank', 'noopener');
        await alTerminar([...elegidos().map((x) => x.nombre)].join(', ') || 'un socio (WhatsApp)', v.querySelector('#rvCom').value.trim(), v.querySelector('#rvSeg').checked); cerrar();
      } else if (e.target.id === 'rvCopiar') {
        try { await navigator.clipboard.writeText(texto()); aviso('Texto copiado. Pégalo donde quieras.', 'ok'); } catch { aviso('No se pudo copiar.', 'mal'); }
      }
    });
  }

  /* Numerito de mensajes sin leer junto a «Mensajes» en el menú */
  function pintarInsignia(n) {
    const b = document.querySelector('.nav__b[data-ir="mensajes"]');
    if (!b) return;
    let i = b.querySelector('.insignia');
    if (!n) { if (i) i.remove(); return; }
    if (!i) { i = document.createElement('em'); i.className = 'insignia'; b.appendChild(i); }
    i.textContent = n > 99 ? '99+' : n;
  }
  function revisarMensajesNuevos() { api('/api/resumen').then((r) => { if (r) pintarInsignia(r.nuevos); }); }

  /* ─── Agenda como calendario (estilo Google Calendar) ─── */
  function panelAgendaAdmin(lienzo) {
    const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const p2 = (n) => String(n).padStart(2, '0');
    const isoDe = (f) => f.getFullYear() + '-' + p2(f.getMonth() + 1) + '-' + p2(f.getDate());
    const deIso = (iso) => { const x = String(iso || '').split('-').map(Number); return x.length === 3 && x[0] ? new Date(x[0], x[1] - 1, x[2]) : null; };
    const cfg = () => { if (!ESTADO.datos.agenda) ESTADO.datos.agenda = {}; return ESTADO.datos.agenda; };
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let vista = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    let distrito = [];

    const lunes = (a, m, cual) => { const d = new Date(a, m, 1); return new Date(a, m, 1 + ((8 - d.getDay()) % 7) + (cual === 2 ? 7 : 21)); };
    const sesionesDelMes = (anio, mes) => {
      const c = cfg(), out = [];
      if (c.auto === false) return out;
      for (let k = -1; k <= 1; k++) {
        const b = new Date(anio, mes + k, 1);
        [2, 4].forEach((cual) => {
          const f0 = lunes(b.getFullYear(), b.getMonth(), cual), iso = isoDe(f0);
          const ex = (c.excepciones && c.excepciones[iso]) || {};
          let f = f0; const nf = deIso(ex.fecha); if (nf) f = nf;
          if (f.getFullYear() !== anio || f.getMonth() !== mes) return;
          out.push({ tipo: 'sesion', iso, f, suspendida: ex.realiza === false, hora: ex.hora || c.hora || '20:30 h', lugar: ex.lugar || c.lugar || '',
            titulo: ex.titulo || (cual === 2 ? (c.tituloSegundo || 'Sesión ordinaria') : (c.tituloCuarto || 'Sesión ordinaria y trabajo de comisiones')) });
        });
      }
      return out;
    };
    const itemsDelMes = (anio, mes) => {
      const out = sesionesDelMes(anio, mes);
      (cfg().eventos || []).forEach((e, i) => { const f = deIso(e.fecha); if (f && f.getFullYear() === anio && f.getMonth() === mes) out.push({ tipo: 'evento', idx: i, f, titulo: e.titulo || 'Actividad', hora: e.hora || '', detalle: e.texto || '', abierto: e.abierto }); });
      distrito.forEach((e) => { const f = deIso(e.fecha); if (f && f.getFullYear() === anio && f.getMonth() === mes) out.push({ tipo: 'distrito', f, titulo: e.titulo || 'Distrito T4', hora: e.hora || '' }); });
      return out;
    };
    const horaCorta = (h) => { const m = String(h || '').match(/(\d{1,2}:\d{2})/); return m ? m[1] : ''; };

    /* ── estructura: igual a la agenda de la página (calendario redondo a la izquierda, actividades a la derecha) ── */
    const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const DIA_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    let diaSel = null;
    const marco = document.createElement('div');
    marco.className = 'ag';
    marco.innerHTML = `
      <div class="ag__barra">
        <button type="button" class="ag__btn ag__btn--oro" data-c="nuevo">＋ Agregar una actividad</button>
        <button type="button" class="ag__btn" data-c="ics" title="Para abrirlo en Google Calendar u otro calendario">⬇ Bajar calendario</button>
        <button type="button" class="ag__btn" data-c="pub">↑ Publicar</button>
      </div>
      <div class="ag__grid">
        <div class="ag__cal">
          <div class="ag__cab">
            <button type="button" class="ag__nav" data-c="ant" aria-label="Mes anterior">‹</button>
            <h3 id="calMes"></h3>
            <button type="button" class="ag__nav" data-c="sig" aria-label="Mes siguiente">›</button>
          </div>
          <div class="ag__sem"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
          <div class="ag__dias" id="calGrid"></div>
          <p class="ag__nota"><i></i> Día con actividades. Toca un día vacío para agregar algo ahí.</p>
          <button type="button" class="ag__btn" data-c="hoy" style="margin-top:6px">Ir a hoy</button>
        </div>
        <ul class="ag__lista" id="agLista"></ul>
      </div>`;
    lienzo.appendChild(marco);

    const pintar = () => {
      const anio = vista.getFullYear(), mes = vista.getMonth();
      marco.querySelector('#calMes').textContent = MESES[mes] + ' ' + anio;
      const items = itemsDelMes(anio, mes).sort((a, b) => (a.f - b.f) || horaCorta(a.hora).localeCompare(horaCorta(b.hora)));
      const con = new Set(items.map((x) => x.f.getDate()));
      const n = new Date(anio, mes + 1, 0).getDate(), off = (vista.getDay() + 6) % 7;
      let h = '<span></span>'.repeat(off);
      for (let d = 1; d <= n; d++) {
        const f = new Date(anio, mes, d), cls = [f.getTime() === hoy.getTime() ? 'hoy' : '', con.has(d) ? 'con' : '', diaSel === d ? 'sel' : ''].join(' ').trim();
        h += `<button type="button" class="${cls}" data-dia="${isoDe(f)}" data-n="${d}" aria-label="${d} de ${MESES[mes]}${con.has(d) ? ': ver actividades' : ': agregar actividad'}">${d}</button>`;
      }
      marco.querySelector('#calGrid').innerHTML = h;

      const lista = diaSel ? items.filter((x) => x.f.getDate() === diaSel) : items;
      marco.querySelector('#agLista').innerHTML = lista.length ? lista.map((x) => {
        const tipo = x.tipo === 'sesion' ? 'Sesión del club' : x.tipo === 'distrito' ? 'Distrito T4' : (x.abierto === false ? 'Solo socios' : 'Abierta a la comunidad');
        const detalle = x.tipo === 'sesion' ? x.lugar : (x.detalle || '');
        return `<li class="ag__ev${x.suspendida ? ' susp' : ''}" data-t="${x.tipo}" data-i="${x.tipo === 'evento' ? x.idx : x.iso || ''}" tabindex="0" role="button" aria-label="${esc(x.titulo)}: cambiar">
          <div class="ag__f"><b>${p2(x.f.getDate())}</b><span>${MES3[x.f.getMonth()]} ${x.f.getFullYear()}</span></div>
          <div class="ag__c"><h4>${esc(x.titulo)}${x.suspendida ? ' <em>(suspendida)</em>' : ''}</h4>${detalle ? `<p>${esc(detalle)}</p>` : ''}
            <div class="ag__h"><span>${DIA_L[x.f.getDay()]}</span>${x.hora ? `<b>${esc(x.hora)}</b>` : ''}</div>
            <span class="ag__tag${x.tipo === 'evento' && x.abierto !== false ? ' abierto' : ''}">${tipo}</span></div>
          <span class="ag__ed">${x.tipo === 'distrito' ? '' : '✏️ Cambiar'}${x.tipo === 'evento' ? `<button type="button" class="ag__quitar" data-bor="${x.idx}">🗑 Quitar</button>` : ''}</span>
        </li>`;
      }).join('') : `<li class="ag__vacio">${diaSel ? 'No hay actividades ese día.' : 'No hay actividades registradas en ' + MESES[mes] + '.'}<br><button type="button" class="ag__btn ag__btn--oro" data-c="nuevo" style="margin-top:12px">＋ Agregar una actividad</button></li>`;
    };
    pintar();

    /* La agenda del Distrito T4 también se ve en la página; aquí es solo de lectura */
    fetch('data/agenda-distrito.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && Array.isArray(j.eventos)) { distrito = j.eventos; pintar(); } }).catch(() => {});

    /* ── ventana para agregar / cambiar ── */
    const ventana = (html) => {
      const v = document.createElement('div');
      v.className = 'modalx';
      v.innerHTML = `<div class="modalx__caja" role="dialog" aria-modal="true">${html}</div>`;
      document.body.appendChild(v);
      v.addEventListener('click', (e) => { if (e.target === v || e.target.dataset.x === 'cerrar') v.remove(); });
      return v;
    };
    const rangoHora = (h) => { const m = String(h || '').match(/(\d{1,2}:\d{2})(?:\s*a\s*(\d{1,2}:\d{2}))?/); return m ? [m[1].padStart(5, '0'), (m[2] || '').padStart(m[2] ? 5 : 0, '0')] : ['', '']; };
    const armarHora = (d, a) => (d ? (a ? d + ' a ' + a + ' h' : d + ' h') : '');
    const urlGoogle = (t, iso, hora, lugar, detalle) => {
      const [d, a] = rangoHora(hora), dia = iso.replace(/-/g, '');
      let fechas;
      if (d) { const fin = a || (p2(Math.min(23, +d.slice(0, 2) + 2)) + d.slice(2)); fechas = dia + 'T' + d.replace(':', '') + '00/' + dia + 'T' + fin.replace(':', '') + '00'; }
      else { const sig = deIso(iso); sig.setDate(sig.getDate() + 1); fechas = dia + '/' + isoDe(sig).replace(/-/g, ''); }
      return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(t) + '&dates=' + fechas + '&location=' + encodeURIComponent(lugar || '') + '&details=' + encodeURIComponent(detalle || '') + '&ctz=America/Santiago';
    };

    const formEvento = (idx, isoInicial) => {
      const lista = cfg().eventos || [];
      const e = idx >= 0 ? lista[idx] : { fecha: isoInicial, titulo: '', texto: '', hora: '', abierto: true, enlace: '', enlaceTexto: '' };
      const [hd, ha] = rangoHora(e.hora);
      const v = ventana(`
        <h3>${idx >= 0 ? 'Cambiar la actividad' : 'Nueva actividad'}</h3>
        <label class="campo__et">¿Qué se hace?<input type="text" id="evT" value="${esc(e.titulo)}" placeholder="Ej.: Operativo médico, Cena aniversario" style="width:100%"></label>
        <div class="dos-c">
          <label class="campo__et">Día<input type="date" id="evF" value="${esc(e.fecha)}"></label>
          <label class="campo__et">Desde las<input type="time" id="evD" value="${esc(hd)}"></label>
          <label class="campo__et">Hasta las (opcional)<input type="time" id="evA" value="${esc(ha)}"></label>
        </div>
        <label class="campo__et">¿Dónde y de qué se trata? (opcional)<textarea id="evX" rows="3" placeholder="Lugar y una breve descripción">${esc(e.texto || '')}</textarea></label>
        <label class="chk"><input type="checkbox" id="evO" ${e.abierto !== false ? 'checked' : ''}> <span><b>Abierta a la comunidad</b><small>Si no la marcas, aparece como «Solo socios».</small></span></label>
        <details style="margin:6px 0"><summary style="cursor:pointer;font-weight:600">Agregar un enlace (opcional)</summary>
          <label class="campo__et">Dirección del enlace<input type="text" id="evL" value="${esc(e.enlace || '')}" placeholder="https://…"></label>
          <label class="campo__et">Texto del botón<input type="text" id="evLT" value="${esc(e.enlaceTexto || '')}" placeholder="Ej.: Comprar entradas"></label></details>
        <div class="msg__acc">
          <button class="btn" data-x="guardar" type="button">💾 Guardar</button>
          ${idx >= 0 ? '<a class="btn btn--linea" data-x="google" target="_blank" rel="noopener" href="#">📅 Agregar a mi Google Calendar</a><button class="btn btn--linea" data-x="borrar" type="button">🗑 Borrar</button>' : ''}
          <button class="btn btn--linea" data-x="cerrar" type="button">Cancelar</button>
        </div>`);
      const leer = () => ({ titulo: v.querySelector('#evT').value.trim(), fecha: v.querySelector('#evF').value, hora: armarHora(v.querySelector('#evD').value, v.querySelector('#evA').value),
        texto: v.querySelector('#evX').value.trim(), abierto: v.querySelector('#evO').checked, enlace: v.querySelector('#evL').value.trim(), enlaceTexto: v.querySelector('#evLT').value.trim() });
      const g = v.querySelector('[data-x=google]');
      if (g) g.addEventListener('mouseenter', () => { const d = leer(); g.href = urlGoogle(d.titulo || 'Actividad del club', d.fecha || e.fecha, d.hora, d.texto, 'Club de Leones Temuco Antumalal'); });
      v.addEventListener('click', (ev) => {
        const a = ev.target.dataset.x;
        if (a === 'guardar') {
          const d = leer();
          if (!d.titulo) { aviso('Escribe qué actividad es.', 'mal'); return; }
          if (!deIso(d.fecha)) { aviso('Elige el día.', 'mal'); return; }
          const l = clonar(cfg().eventos || []);
          if (idx >= 0) l[idx] = Object.assign({}, l[idx], d); else l.push(d);
          asignar('agenda.eventos', l);
          const f = deIso(d.fecha); vista = new Date(f.getFullYear(), f.getMonth(), 1);
          v.remove(); pintar(); aviso('Actividad guardada. Toca «Publicar» cuando quieras que se vea en la página.', 'ok');
        } else if (a === 'borrar' && confirm('¿Borrar esta actividad?')) {
          const l = clonar(cfg().eventos || []); l.splice(idx, 1); asignar('agenda.eventos', l); v.remove(); pintar();
        }
      });
    };

    const formSesion = (iso) => {
      const c = cfg(), ex = (c.excepciones && c.excepciones[iso]) || {};
      const base = sesionesDelMes(deIso(ex.fecha || iso).getFullYear(), deIso(ex.fecha || iso).getMonth()).find((s) => s.iso === iso);
      if (!base) return;
      const [hd] = rangoHora(base.hora);
      const v = ventana(`
        <h3>${esc(base.titulo)}</h3>
        <p class="nota-res">Sesión que se repite sola (2.º y 4.º lunes de cada mes). Aquí cambias solo esta fecha; las demás no se tocan.</p>
        <label class="chk"><input type="checkbox" id="seR" ${base.suspendida ? '' : 'checked'}> <span><b>Se realiza esta sesión</b><small>Desmárcala si se suspende (feriado, por ejemplo).</small></span></label>
        <div class="dos-c">
          <label class="campo__et">Día<input type="date" id="seF" value="${esc(isoDe(base.f))}"></label>
          <label class="campo__et">Hora<input type="time" id="seH" value="${esc(hd)}"></label>
        </div>
        <label class="campo__et">Lugar<input type="text" id="seL" value="${esc(base.lugar)}" style="width:100%"></label>
        <div class="msg__acc">
          <button class="btn" data-x="guardar" type="button">💾 Guardar</button>
          <button class="btn btn--linea" data-x="reset" type="button">↺ Dejarla como siempre</button>
          <button class="btn btn--linea" data-x="cerrar" type="button">Cancelar</button>
        </div>`);
      v.addEventListener('click', (ev) => {
        const a = ev.target.dataset.x;
        if (a !== 'guardar' && a !== 'reset') return;
        const exc = clonar(c.excepciones || {});
        if (a === 'reset') delete exc[iso];
        else {
          const n = {}; const realiza = v.querySelector('#seR').checked, f = v.querySelector('#seF').value, hh = v.querySelector('#seH').value, l = v.querySelector('#seL').value.trim();
          if (!realiza) n.realiza = false;
          if (f && f !== iso) n.fecha = f;
          if (hh && armarHora(hh, '') !== (c.hora || '20:30 h')) n.hora = armarHora(hh, '');
          if (l && l !== (c.lugar || '')) n.lugar = l;
          if (Object.keys(n).length) exc[iso] = n; else delete exc[iso];
        }
        asignar('agenda.excepciones', exc); v.remove(); pintar();
      });
    };

    /* ── clics del calendario ── */
    marco.addEventListener('click', (e) => {
      const c = e.target.closest('[data-c]');
      if (c) {
        const a = c.dataset.c;
        if (a === 'hoy') { vista = new Date(hoy.getFullYear(), hoy.getMonth(), 1); diaSel = null; }
        else if (a === 'ant') { vista = new Date(vista.getFullYear(), vista.getMonth() - 1, 1); diaSel = null; }
        else if (a === 'sig') { vista = new Date(vista.getFullYear(), vista.getMonth() + 1, 1); diaSel = null; }
        else if (a === 'nuevo') return formEvento(-1, diaSel ? isoDe(new Date(vista.getFullYear(), vista.getMonth(), diaSel)) : isoDe(hoy));
        else if (a === 'pub') return abrirPublicar();
        else if (a === 'ics') return bajarIcs();
        return pintar();
      }
      const bor = e.target.closest('[data-bor]');
      if (bor) {
        const l = clonar(cfg().eventos || []), ev = l[+bor.dataset.bor] || {};
        if (!confirm('¿Quitar la actividad «' + (ev.titulo || 'sin título') + '» de la agenda?')) return;
        l.splice(+bor.dataset.bor, 1); asignar('agenda.eventos', l); pintar();
        aviso('Actividad quitada. Toca «Publicar» para que se note en la página.', 'ok');
        return;
      }
      const fila = e.target.closest('.ag__ev');
      if (fila) {
        if (fila.dataset.t === 'evento') formEvento(+fila.dataset.i);
        else if (fila.dataset.t === 'sesion') formSesion(fila.dataset.i);
        else aviso('Esta actividad viene del calendario del Distrito T4 y se actualiza sola.', 'ok');
        return;
      }
      const dia = e.target.closest('[data-dia]');
      if (dia) {
        const n = +dia.dataset.n;
        if (dia.classList.contains('con')) { diaSel = diaSel === n ? null : n; pintar(); }
        else formEvento(-1, dia.dataset.dia);
      }
    });
    marco.addEventListener('keydown', (e) => { const f = e.target.closest && e.target.closest('.ag__ev'); if (f && e.target === f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); f.click(); } });

    /* ── calendario para Google Calendar (archivo .ics) ── */
    const bajarIcs = () => {
      const esc2 = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
      const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Club de Leones Temuco Antumalal//Agenda//ES', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Club de Leones Temuco Antumalal'];
      const agregar = (uid, titulo, iso, hora, lugar, detalle) => {
        const [d, a] = rangoHora(hora), dia = iso.replace(/-/g, '');
        L.push('BEGIN:VEVENT', 'UID:' + uid + '@clta.cl', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', 'SUMMARY:' + esc2(titulo));
        if (d) { const fin = a || (p2(Math.min(23, +d.slice(0, 2) + 2)) + d.slice(2)); L.push('DTSTART;TZID=America/Santiago:' + dia + 'T' + d.replace(':', '') + '00', 'DTEND;TZID=America/Santiago:' + dia + 'T' + fin.replace(':', '') + '00'); }
        else { const s = deIso(iso); s.setDate(s.getDate() + 1); L.push('DTSTART;VALUE=DATE:' + dia, 'DTEND;VALUE=DATE:' + isoDe(s).replace(/-/g, '')); }
        if (lugar) L.push('LOCATION:' + esc2(lugar));
        if (detalle) L.push('DESCRIPTION:' + esc2(detalle));
        L.push('END:VEVENT');
      };
      (cfg().eventos || []).forEach((e, i) => { if (deIso(e.fecha)) agregar('evento-' + i + '-' + e.fecha, e.titulo || 'Actividad', e.fecha, e.hora, e.texto, ''); });
      for (let k = 0; k < 12; k++) { const b = new Date(hoy.getFullYear(), hoy.getMonth() + k, 1); sesionesDelMes(b.getFullYear(), b.getMonth()).filter((s) => !s.suspendida).forEach((s) => agregar('sesion-' + s.iso, s.titulo, isoDe(s.f), s.hora, s.lugar, '')); }
      L.push('END:VCALENDAR');
      descargar('agenda-club-leones.ics', L.join('\r\n'), 'text/calendar;charset=utf-8');
      aviso('Calendario descargado. En Google Calendar: Configuración → Importar y exportar → Importar.', 'ok');
    };

    /* ── opciones avanzadas (encabezado, lista, sesiones) ── */
    const mas = document.createElement('details');
    mas.className = 'tarjeta';
    mas.innerHTML = '<summary style="cursor:pointer;font-weight:600;font-size:1.05rem">⚙ Más opciones de la agenda (títulos, hora y lugar de las sesiones, lista)</summary><div id="agMas" style="margin-top:14px"></div>';
    lienzo.appendChild(mas);
    mas.addEventListener('toggle', () => { if (mas.open) { const c = mas.querySelector('#agMas'); c.innerHTML = ''; panelAgenda(c); } else pintar(); });
  }

  /* ─── Ajustes y personalización ─── */
  async function panelAjustes(lienzo) {
    const p = leerPref();
    const conectado = await cargarAjustes();

    /* Historial de cambios de la página (publicaciones hechas desde el panel) */
    const histCaja = document.createElement('div');
    histCaja.className = 'tarjeta';
    histCaja.innerHTML = '<div class="tarjeta__cab"><div><h3>📜 Historial de cambios de la página</h3><p>Lo último que se publicó en la página del club: cuándo, quién y qué cambió.</p></div></div><div id="histBody"><p class="nota-res">Cargando…</p></div>';
    lienzo.appendChild(histCaja);
    api('/api/historial').then((r) => {
      const c = histCaja.querySelector('#histBody');
      if (!r) { c.innerHTML = '<p class="nota-res">El historial solo se ve cuando el panel está abierto desde <b>clta.cl/admin.html</b> con tu cuenta.</p>'; return; }
      const fh2 = (t) => new Date(t).toLocaleString('es-CL', { timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      c.innerHTML = r.items && r.items.length ? `<ol class="hist">${r.items.map((x) => `<li>
        <div class="hist__cab"><b>${esc(fh2(x.fecha))}</b>${x.quien ? `<span>Publicó: ${esc(x.quien)}</span>` : ''}</div>
        ${x.cambios && x.cambios.length ? `<ul>${x.cambios.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="nota-res">Se publicaron cambios en la página.</p>'}
      </li>`).join('')}</ol>` : '<p class="nota-res">Todavía no hay publicaciones registradas.</p>';
    });

    const apariencia = document.createElement('div');
    apariencia.className = 'tarjeta';
    apariencia.innerHTML = `
      <div class="tarjeta__cab"><div><h3>🎨 Cómo se ve el panel</h3><p>Estos cambios son solo para este computador. No modifican la página del club.</p></div></div>
      <div class="ajuste"><b>Tamaño de las letras</b>
        <div class="opc">${[[100, 'Normal'], [115, 'Grande'], [130, 'Muy grande']].map(([v, n]) => `<button type="button" class="btn ${p.letra === v ? '' : 'btn--linea'}" data-letra="${v}">${n}</button>`).join('')}</div></div>
      <div class="ajuste"><b>Color del panel</b>
        <div class="opc">${Object.entries(ACENTOS).map(([k, a]) => `<button type="button" class="color ${p.acento === k ? 'on' : ''}" data-acento="${k}" style="background:${a[1]}" aria-label="${a[0]}" title="${a[0]}">${p.acento === k ? '✓' : ''}</button>`).join('')}</div></div>
      <div class="ajuste"><b>Claro u oscuro</b>
        <div class="opc"><button type="button" class="btn btn--linea" data-tema="claro">☀ Claro</button><button type="button" class="btn btn--linea" data-tema="oscuro">🌙 Oscuro</button></div></div>
      <div class="ajuste"><b>Nombre que aparece arriba del menú</b>
        <input type="text" id="pfNombre" value="${esc(p.nombre)}" placeholder="Leones Temuco Antumalal"></div>
      <label class="chk"><input type="checkbox" id="pfCompacto" ${p.compacto ? 'checked' : ''}> <span><b>Menú más compacto</b><small>Botones del menú más juntos, para ver más opciones sin bajar.</small></span></label>
      <label class="chk"><input type="checkbox" id="pfVivo" ${p.vivo ? 'checked' : ''}> <span><b>Abrir la vista previa al entrar</b><small>Se mostrará sola cuando edites la página.</small></span></label>
      <div class="ajuste"><b>Sección con la que se abre el panel</b>
        <select id="pfInicio">${SECCIONES.map((s) => `<option value="${s.id}" ${p.inicio === s.id ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select></div>
      <div class="msg__acc"><button class="btn btn--linea" id="pfReset" type="button">↺ Volver a como venía</button></div>`;
    lienzo.appendChild(apariencia);

    const cambiarPref = (cambio) => { const n = Object.assign(leerPref(), cambio); guardarPref(n); aplicarPref(); return n; };
    apariencia.addEventListener('click', (e) => {
      const l = e.target.closest('[data-letra]'), a = e.target.closest('[data-acento]'), t = e.target.closest('[data-tema]');
      if (l) { cambiarPref({ letra: +l.dataset.letra }); panelAjustesRepintar(); }
      if (a) { cambiarPref({ acento: a.dataset.acento }); panelAjustesRepintar(); }
      if (t) { if ((document.documentElement.getAttribute('data-tema') === 'oscuro') !== (t.dataset.tema === 'oscuro')) $('#btnTema').click(); }
      if (e.target.id === 'pfReset' && confirm('¿Volver el panel a como venía de fábrica?')) { guardarPref(Object.assign({}, PREF0)); aplicarPref(); panelAjustesRepintar(); }
    });
    apariencia.querySelector('#pfNombre').addEventListener('input', (e) => cambiarPref({ nombre: e.target.value.trim() }));
    apariencia.querySelector('#pfCompacto').addEventListener('change', (e) => cambiarPref({ compacto: e.target.checked }));
    apariencia.querySelector('#pfVivo').addEventListener('change', (e) => { cambiarPref({ vivo: e.target.checked }); lsVivo.poner(e.target.checked); });
    apariencia.querySelector('#pfInicio').addEventListener('change', (e) => cambiarPref({ inicio: e.target.value }));
    const panelAjustesRepintar = () => pintarSeccion();

    /* Socios para reenviar mensajes */
    const socios = document.createElement('div');
    socios.className = 'tarjeta';
    const pintarSocios = () => {
      socios.innerHTML = `
        <div class="tarjeta__cab"><div><h3>👥 Socios para reenviar mensajes</h3>
          <p>Los mensajes de la página se pueden reenviar a estos correos con un clic. ${conectado ? 'Se guardan en el servidor, solo los ve quien entra al panel.' : 'Por ahora se guardan en este computador.'}</p></div></div>
        ${(AJ.miembros || []).map((x, i) => `
        <div class="fila-socio" data-i="${i}">
          <input type="text" data-k="nombre" value="${esc(x.nombre)}" placeholder="Nombre" aria-label="Nombre">
          <input type="text" data-k="cargo" value="${esc(x.cargo || '')}" placeholder="Cargo (opcional)" aria-label="Cargo">
          <input type="email" data-k="correo" value="${esc(x.correo)}" placeholder="correo@ejemplo.cl" aria-label="Correo">
          <button class="btn btn--linea btn--sm" data-q="${i}" type="button" aria-label="Quitar">✕ Quitar</button>
        </div>`).join('') || '<p class="nota-res">Aún no hay socios en la lista.</p>'}
        <div class="msg__acc">
          <button class="btn btn--linea" id="soAgregar" type="button">＋ Agregar un socio</button>
          <button class="btn btn--linea" id="soDirectiva" type="button">Traer nombres del directorio</button>
        </div>
        <label class="campo__et" style="margin-top:14px">Firma al final de los mensajes reenviados (opcional)
          <textarea id="soFirma" rows="2" placeholder="Ej.: Club de Leones Temuco Antumalal · info@clta.cl">${esc(AJ.firma || '')}</textarea></label>
        <div class="msg__acc"><button class="btn" id="soGuardar" type="button">💾 Guardar socios</button></div>`;
    };
    pintarSocios();
    lienzo.appendChild(socios);
    const leerFilas = () => { AJ.miembros = [...socios.querySelectorAll('.fila-socio')].map((f) => ({ nombre: f.querySelector('[data-k=nombre]').value.trim(), cargo: f.querySelector('[data-k=cargo]').value.trim(), correo: f.querySelector('[data-k=correo]').value.trim() })); AJ.firma = (socios.querySelector('#soFirma') || {}).value || ''; };
    socios.addEventListener('click', async (e) => {
      if (e.target.id === 'soAgregar') { leerFilas(); AJ.miembros.push({ nombre: '', cargo: '', correo: '' }); pintarSocios(); }
      else if (e.target.id === 'soDirectiva') {
        leerFilas();
        (ESTADO.datos.directiva || []).forEach((d) => { if (d.nombre && !AJ.miembros.some((x) => x.nombre === d.nombre)) AJ.miembros.push({ nombre: d.nombre, cargo: d.cargo || '', correo: '' }); });
        pintarSocios(); aviso('Se agregaron los nombres. Falta escribir el correo de cada uno.', 'ok');
      } else if (e.target.dataset.q !== undefined) { leerFilas(); AJ.miembros.splice(+e.target.dataset.q, 1); pintarSocios(); }
      else if (e.target.id === 'soGuardar') {
        leerFilas();
        const mal = AJ.miembros.find((x) => x.correo && !/^\S+@\S+\.\S+$/.test(x.correo));
        if (mal) { aviso('El correo de «' + (mal.nombre || 'una fila') + '» no parece válido.', 'mal'); return; }
        AJ.miembros = AJ.miembros.filter((x) => x.nombre || x.correo);
        const ok = await guardarAjustes(); pintarSocios();
        aviso(ok ? 'Listo, socios guardados.' : 'Se guardaron en este computador (el servidor aún no está conectado).', ok ? 'ok' : 'mal');
      }
    });

    /* Enlace a cambiar la clave / respaldos */
    const mas = document.createElement('div');
    mas.className = 'tarjeta';
    mas.innerHTML = `<div class="tarjeta__cab"><div><h3>🔐 Clave, copias de seguridad y publicación</h3><p>Está todo junto en una sola sección.</p></div>
      <button class="btn btn--linea" type="button" id="irPub">Ir a «Publicar y respaldos»</button></div>`;
    mas.querySelector('#irPub').addEventListener('click', () => ir('publicar'));
    lienzo.appendChild(mas);

    /* Reiniciar: dejar el contador y los datos en cero, por ejemplo al entregar el panel */
    const rei = document.createElement('div');
    rei.className = 'tarjeta tarjeta--peligro';
    rei.innerHTML = `
      <div class="tarjeta__cab"><div><h3>🧹 Reiniciar datos del panel</h3>
        <p>Sirve para empezar de cero, por ejemplo cuando se entrega el panel al club. <b>No toca la página</b> (textos, fotos, proyectos, agenda) y <b>el historial de visitas y mensajes se conserva</b> para las estadísticas.</p></div></div>
      <label class="chk"><input type="checkbox" data-rei="visitas"> <span><b>Contador de visitas (poner en cero desde hoy)</b><small>El contador y los gráficos parten de cero, pero <b>el historial completo se guarda</b> y se puede ver en «Historial completo».</small></span></label>
      <label class="chk"><input type="checkbox" data-rei="mensajes"> <span><b>Mensajes recibidos (archivar todos)</b><small>Los deja en «Archivados». No se borra nada: siguen ahí, con sus etiquetas y comentarios.</small></span></label>
      <label class="chk"><input type="checkbox" data-rei="socios"> <span><b>Lista de socios</b><small>Borra el listado que subiste desde el Excel de MyLCI.</small></span></label>
      <label class="chk"><input type="checkbox" data-rei="ajustes"> <span><b>Socios para reenviar y firma</b><small>Borra la lista de correos de Ajustes y la firma de los reenvíos.</small></span></label>
      <label class="chk"><input type="checkbox" data-rei="apariencia"> <span><b>Apariencia de este computador</b><small>Letra, color y demás preferencias vuelven a como venían.</small></span></label>
      <div class="msg__acc"><button class="btn btn--peligro" id="reiBtn" type="button">Reiniciar lo marcado</button></div>
      <p class="nota-res">La lista de socios y los correos de Ajustes sí se borran por completo; si los quieres guardar, descarga antes el Excel desde Socios.</p>`;
    lienzo.appendChild(rei);
    rei.querySelector('#reiBtn').addEventListener('click', async () => {
      const que = [...rei.querySelectorAll('[data-rei]:checked')].map((c) => c.dataset.rei);
      if (!que.length) { aviso('Marca primero lo que quieres reiniciar.', 'mal'); return; }
      const nombres = { visitas: 'el contador de visitas (queda en cero desde hoy; el historial se guarda)', mensajes: 'todos los mensajes (se archivan, no se borran)', socios: 'la lista de socios', ajustes: 'los socios para reenviar y la firma', apariencia: 'la apariencia de este computador' };
      const lista = que.map((k) => '• ' + nombres[k]).join(String.fromCharCode(10));
      if (!confirm('Vas a reiniciar:' + String.fromCharCode(10) + lista + String.fromCharCode(10) + String.fromCharCode(10) + '¿Seguir?')) return;
      const servidor = que.filter((k) => k !== 'apariencia');
      let ok = true;
      if (servidor.length) ok = !!(await api('/api/reiniciar', { que: servidor }));
      if (que.includes('socios')) { SOCIOS = []; try { localStorage.removeItem('antumalal.socios'); } catch { /* ignorar */ } }
      if (que.includes('ajustes')) { AJ = { miembros: [], firma: '' }; try { localStorage.removeItem('antumalal.aj'); } catch { /* ignorar */ } }
      if (que.includes('apariencia')) { guardarPref(Object.assign({}, PREF0)); aplicarPref(); }
      if (que.includes('mensajes')) pintarInsignia(0);
      aviso(ok ? 'Listo: se reinició lo que marcaste.' : 'Se limpió en este computador, pero el servidor no respondió. Inténtalo de nuevo.', ok ? 'ok' : 'mal');
      pintarSeccion();
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     SOCIOS: lista del club, cumpleaños y envío de correos / WhatsApp
     Los datos personales NUNCA van al repositorio público: se guardan en la base
     privada del publicador (detrás de Cloudflare Access) o, si aún no está conectada,
     solo en este computador.
     ═══════════════════════════════════════════════════════════════ */
  let SOCIOS = [];
  const nombreSocio = (s) => ((s.n || '') + ' ' + (s.a || '')).replace(/\s+/g, ' ').trim();
  const soloNum = (t) => String(t || '').replace(/[^\d]/g, '');
  /* Número chileno para wa.me: 56 + 9 dígitos. Acepta «56-9-92633932», «+56 9 …», «9 …» */
  function numWa(t) {
    let n = soloNum(t);
    if (n.startsWith('560')) n = '56' + n.slice(3);           /* «56-09-9978…» trae un 0 de más */
    else if (n.startsWith('0')) n = n.replace(/^0+/, '');
    if (n.length === 9 && n[0] === '9') n = '56' + n;
    return /^569\d{8}$/.test(n) ? n : '';
  }
  /* Por qué un número no sirve para WhatsApp, en palabras simples */
  const motivoSinWa = (s) => (!soloNum(s.m) ? 'no tiene celular en la lista' : 'el celular «' + s.m + '» está incompleto o mal escrito');
  async function cargarSocios() {
    const r = await api('/api/socios');
    if (r && Array.isArray(r.socios)) SOCIOS = r.socios;
    else { try { SOCIOS = JSON.parse(localStorage.getItem('antumalal.socios') || '[]'); } catch { SOCIOS = []; } }
    return !!r;
  }
  async function guardarSocios() {
    try { localStorage.setItem('antumalal.socios', JSON.stringify(SOCIOS)); } catch { /* ignorar */ }
    return !!(await api('/api/socios', { socios: SOCIOS }));
  }
  const cargarScript = (src) => new Promise((ok, mal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = mal; document.head.appendChild(s); });

  /* Lee el Excel que se baja de MyLCI («Member Detail Information») */
  async function leerExcelSocios(archivo) {
    if (!window.XLSX) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const wb = window.XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
    const filas = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    const h = filas.findIndex((f) => f.some((c) => /^Contacto: Nombre$/i.test(String(c).trim())));
    if (h < 0) throw new Error('No parece el listado de socios (falta la columna «Contacto: Nombre»).');
    const cab = filas[h].map((c) => String(c).trim().toLowerCase());
    const col = (re) => cab.findIndex((c) => re.test(c));
    const cols = { n: col(/^contacto: nombre$/), a: col(/^contacto: apellidos$/), m: col(/^contacto: móvil$/), t: col(/^contacto: teléfono particular$/),
      f: col(/^contacto: fecha de nacimiento$/), i: col(/^fecha de ingreso/), e: col(/^categoría de afiliación/), p: col(/^programa$/), id: col(/^contacto: número de identificación/) };
    const correos = cab.map((c, i) => (/^contacto: correo electrónico/.test(c) ? i : -1)).filter((i) => i >= 0);
    const val = (f, c) => (c >= 0 ? String(f[c] || '').replace(/<[^>]*>/g, '').trim() : '');
    const lista = filas.slice(h + 1).filter((f) => val(f, cols.n) || val(f, cols.a)).map((f) => ({
      id: val(f, cols.id), n: val(f, cols.n), a: val(f, cols.a),
      c: (correos.map((i) => String(f[i] || '').trim()).find((x) => /^\S+@\S+\.\S+$/.test(x)) || '').toLowerCase(),
      m: val(f, cols.m), t: val(f, cols.t), f: val(f, cols.f), i: val(f, cols.i), e: val(f, cols.e), p: val(f, cols.p)
    }));
    if (!lista.length) throw new Error('El archivo no trae socios.');
    return lista;
  }
  /* «dd-mm-aaaa» → { d, m } */
  const cumple = (s) => { const x = String(s.f || '').match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/); return x ? { d: +x[1], m: +x[2] } : null; };
  const textoCumple = (s) => '¡Feliz cumpleaños, ' + ((s.n || '').split(' ')[0] || 'amigo León') + '! Te saludamos de parte de todo el Club de Leones Temuco Antumalal. Que tengas un día muy lindo. 🦁';
  const MES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  async function panelSocios(lienzo) {
    const caja = document.createElement('div');
    lienzo.appendChild(caja);
    caja.innerHTML = '<p class="nota-res">Cargando socios…</p>';
    const conectado = await cargarSocios();
    let buscar = '', estado = 'Activo', sel = new Set();

    const visibles = () => SOCIOS.filter((s) => (estado === 'todos' || s.e === estado) &&
      (!buscar || (nombreSocio(s) + ' ' + s.c).toLowerCase().includes(buscar.toLowerCase())));

    const pintar = () => {
      const lista = visibles();
      const estados = [...new Set(SOCIOS.map((s) => s.e).filter(Boolean))];
      const hoy = new Date(), mes = hoy.getMonth() + 1;
      const cumples = SOCIOS.filter((s) => { const c = cumple(s); return c && c.m === mes; }).sort((a, b) => cumple(a).d - cumple(b).d);
      const marcados = SOCIOS.filter((s) => sel.has(s.id || nombreSocio(s)));
      caja.innerHTML = `
      <div class="tarjeta">
        <div class="tarjeta__cab"><div><h3>${SOCIOS.length ? SOCIOS.length + ' socios en la lista' : 'Aún no hay socios cargados'}</h3>
          <p>${SOCIOS.length ? SOCIOS.filter((s) => s.c).length + ' tienen correo · ' + SOCIOS.filter((s) => numWa(s.m)).length + ' tienen WhatsApp.' : 'Sube el Excel que se baja de MyLCI («Member Detail Information»).'}
          ${conectado ? ' Los datos quedan guardados en la base privada del club.' : ' Por ahora quedan guardados solo en este computador.'}</p></div></div>
        <div class="msg__acc">
          <label class="btn" style="cursor:pointer">⬆ ${SOCIOS.length ? 'Actualizar la lista (Excel)' : 'Subir el Excel de socios'}<input type="file" id="soArchivo" accept=".xlsx,.xls,.csv" hidden></label>
          ${SOCIOS.length ? '<button class="btn btn--linea" id="soBajar" type="button">⬇ Descargar en Excel</button>' : ''}
        </div>
        <p class="nota-res">🔒 Los datos de los socios son privados: no se publican en la página ni en GitHub.</p>
      </div>
      ${SOCIOS.length ? `
      <div class="tarjeta">
        <div class="tarjeta__cab"><div><h3>🎂 Cumpleaños de ${MES_L[mes - 1]}</h3><p>Un saludo a tiempo hace mucho por el club.</p></div></div>
        ${cumples.length ? `<div class="msg__acc" style="margin:0 0 8px"><button class="btn" id="soSaludarTodos" type="button">🎉 Saludar a todos (${cumples.length})</button></div>
        <ul class="chequeo">${cumples.map((s) => { const c = cumple(s), esHoy = c.d === hoy.getDate();
          const wa = numWa(s.m);
          return `<li><span class="marca" data-ok="si">${esHoy ? '🎉' : '🎂'}</span><span class="txt"><b>${esc(nombreSocio(s))}</b><span>${c.d} de ${MES_L[mes - 1]}${esHoy ? ' · ¡es hoy!' : ''}${wa ? '' : ' · <em>sin WhatsApp: ' + esc(motivoSinWa(s)) + '</em>'}</span></span>
            ${wa ? `<a class="btn btn--linea btn--sm" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(textoCumple(s))}">💬 Saludar</a>`
              : (s.c ? `<a class="btn btn--linea btn--sm" href="mailto:${esc(s.c)}?subject=${encodeURIComponent('¡Feliz cumpleaños!')}&body=${encodeURIComponent(textoCumple(s))}">✉ Saludar por correo</a>` : '')}</li>`; }).join('')}</ul>` : '<p class="nota-res">Nadie cumple años este mes.</p>'}
      </div>
      <div class="tarjeta">
        <div class="tarjeta__cab"><div><h3>✉ Escribir a los socios</h3><p>Marca a quién (o usa «Marcar todos los que se ven») y elige cómo enviarlo.</p></div></div>
        <div class="filtros">
          <input type="search" id="soBuscar" placeholder="Buscar por nombre o correo" value="${esc(buscar)}" style="max-width:280px">
          <select id="soEstado" aria-label="Estado"><option value="todos">Todos</option>${estados.map((e) => `<option ${estado === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select>
          <button class="btn btn--linea btn--sm" id="soTodos" type="button">Marcar todos los que se ven</button>
          <button class="btn btn--linea btn--sm" id="soNinguno" type="button">Quitar marcas</button>
        </div>
        <div class="msg__acc" style="margin-bottom:6px">
          <button class="btn" id="soCorreo" type="button" ${marcados.length ? '' : 'disabled'}>✉ Correo a los marcados (${marcados.length})</button>
          <button class="btn btn--linea" id="soWa" type="button" ${marcados.length ? '' : 'disabled'}>💬 WhatsApp a los marcados</button>
        </div>
        <div class="tabla-socios">${lista.map((s) => { const k = s.id || nombreSocio(s); return `
          <label class="fila-so"><input type="checkbox" data-k="${esc(k)}" ${sel.has(k) ? 'checked' : ''}>
            <span class="fs-n"><b>${esc(nombreSocio(s))}</b><small>${esc(s.e || '')}${s.p && s.p !== 'Regular' ? ' · ' + esc(s.p) : ''}</small></span>
            <span class="fs-c">${s.c ? esc(s.c) : '<em>sin correo</em>'}</span>
            <span class="fs-m">${esc(s.m || s.t || '')}</span></label>`; }).join('') || '<p class="nota-res">No hay socios con ese filtro.</p>'}</div>
      </div>` : ''}`;
    };
    pintar();

    const marcadosAhora = () => SOCIOS.filter((s) => sel.has(s.id || nombreSocio(s)));
    caja.addEventListener('change', async (e) => {
      if (e.target.id === 'soArchivo') {
        const f = e.target.files[0]; if (!f) return;
        try {
          const lista = await leerExcelSocios(f);
          if (SOCIOS.length && !confirm('Se reemplazará la lista actual (' + SOCIOS.length + ' socios) por la del archivo (' + lista.length + ' socios). ¿Seguir?')) return;
          SOCIOS = lista; sel.clear();
          const ok = await guardarSocios();
          aviso(ok ? 'Listo: ' + lista.length + ' socios guardados.' : lista.length + ' socios cargados (guardados solo en este computador, el servidor aún no está conectado).', ok ? 'ok' : 'mal');
          pintar();
        } catch (err) { aviso(err.message || 'No se pudo leer el archivo.', 'mal'); }
      } else if (e.target.id === 'soEstado') { estado = e.target.value; pintar(); }
      else if (e.target.dataset.k !== undefined) {
        e.target.checked ? sel.add(e.target.dataset.k) : sel.delete(e.target.dataset.k);
        const n = sel.size; const b1 = caja.querySelector('#soCorreo'), b2 = caja.querySelector('#soWa');
        b1.disabled = b2.disabled = !n; b1.textContent = '✉ Correo a los marcados (' + n + ')';
      }
    });
    caja.addEventListener('input', (e) => { if (e.target.id === 'soBuscar') { buscar = e.target.value; const pos = e.target.selectionStart; pintar(); const n = caja.querySelector('#soBuscar'); n.focus(); n.setSelectionRange(pos, pos); } });
    caja.addEventListener('click', (e) => {
      const id = e.target.id;
      if (id === 'soSaludarTodos') { const m = new Date().getMonth() + 1; ventanaWhatsApp(SOCIOS.filter((s) => { const c = cumple(s); return c && c.m === m; }).sort((a, b) => cumple(a).d - cumple(b).d), '¡Feliz cumpleaños, {nombre}! Te saludamos de parte de todo el Club de Leones Temuco Antumalal. Que tengas un día muy lindo. 🦁'); }
      else if (id === 'soTodos') { visibles().forEach((s) => sel.add(s.id || nombreSocio(s))); pintar(); }
      else if (id === 'soNinguno') { sel.clear(); pintar(); }
      else if (id === 'soBajar') bajarCsv('socios-' + new Date().toISOString().slice(0, 10) + '.csv', ['Nombre', 'Apellidos', 'Correo', 'Móvil', 'Teléfono', 'Cumpleaños', 'Ingreso', 'Estado', 'Tipo'], SOCIOS.map((s) => [s.n, s.a, s.c, s.m, s.t, s.f, s.i, s.e, s.p]));
      else if (id === 'soCorreo') ventanaCorreoMasivo(marcadosAhora());
      else if (id === 'soWa') ventanaWhatsApp(marcadosAhora());
    });
  }


  /* ═══════════════════════════════════════════════════════════════
     CONTACTOS: varias listas (socios, aliados, autoridades, empresas…), fechas importantes y saludos
     ═══════════════════════════════════════════════════════════════ */
  let CONT = { listas: [] };
  async function cargarContactos() {
    const r = await api('/api/contactos');
    if (r && r.contactos && Array.isArray(r.contactos.listas)) CONT = r.contactos;
    else { try { CONT = JSON.parse(localStorage.getItem('antumalal.contactos') || '{"listas":[]}'); } catch { CONT = { listas: [] }; } }
    if (!Array.isArray(CONT.listas)) CONT = { listas: [] };
    return !!r;
  }
  async function guardarContactos() {
    try { localStorage.setItem('antumalal.contactos', JSON.stringify(CONT)); } catch { /* ignorar */ }
    return !!(await api('/api/contactos', { contactos: CONT }));
  }

  /* Fechas importantes para saludar, con un mensaje listo para cada una */
  const FIRMA = 'Con afecto,' + String.fromCharCode(10) + 'Club de Leones Temuco Antumalal';
  const enNesimo = (a, m, dow, n) => { const d = new Date(a, m, 1); return new Date(a, m, 1 + ((7 + dow - d.getDay()) % 7) + (n - 1) * 7); };
  const OCASIONES = [
    { id: 'ano', nombre: 'Año Nuevo', ico: '🎆', fecha: (a) => new Date(a, 0, 1), asunto: 'Feliz año nuevo',
      texto: 'Estimados amigos:' + String.fromCharCode(10, 10) + 'En nombre del Club de Leones Temuco Antumalal les deseamos un año nuevo lleno de salud, alegría y buenos proyectos. Gracias por acompañarnos y por creer en el servicio a la comunidad. Esperamos seguir trabajando juntos este año.' + String.fromCharCode(10, 10) },
    { id: 'mujer', nombre: 'Día Internacional de la Mujer', ico: '💐', fecha: (a) => new Date(a, 2, 8), asunto: 'Un saludo en el Día de la Mujer',
      texto: 'Estimadas y estimados:' + String.fromCharCode(10, 10) + 'En el Día Internacional de la Mujer, el Club de Leones Temuco Antumalal envía un cariñoso saludo y reconoce el aporte de todas las mujeres que construyen comunidad cada día.' + String.fromCharCode(10, 10) },
    { id: 'madre', nombre: 'Día de la Madre', ico: '🌷', fecha: (a) => enNesimo(a, 4, 0, 2), asunto: 'Feliz Día de la Madre',
      texto: 'Estimados amigos:' + String.fromCharCode(10, 10) + 'El Club de Leones Temuco Antumalal les envía un afectuoso saludo en el Día de la Madre. Que sea una jornada de cariño junto a la familia.' + String.fromCharCode(10, 10) },
    { id: 'lions', nombre: 'Aniversario de Lions Clubs International', ico: '🦁', fecha: (a) => new Date(a, 5, 7), asunto: 'Aniversario de Lions Clubs International',
      texto: 'Estimados amigos:' + String.fromCharCode(10, 10) + 'Este 7 de junio se celebra un nuevo aniversario de Lions Clubs International, la mayor organización de servicio del mundo. Gracias por ser parte de lo que hacemos en Temuco y la Araucanía: «Nosotros servimos».' + String.fromCharCode(10, 10) },
    { id: 'padre', nombre: 'Día del Padre', ico: '👔', fecha: (a) => enNesimo(a, 5, 0, 3), asunto: 'Feliz Día del Padre',
      texto: 'Estimados amigos:' + String.fromCharCode(10, 10) + 'El Club de Leones Temuco Antumalal les envía un cordial saludo en el Día del Padre. Que lo disfruten junto a quienes más quieren.' + String.fromCharCode(10, 10) },
    { id: 'patrias', nombre: 'Fiestas Patrias', ico: '🇨🇱', fecha: (a) => new Date(a, 8, 18), asunto: 'Felices Fiestas Patrias',
      texto: 'Estimados amigos:' + String.fromCharCode(10, 10) + 'El Club de Leones Temuco Antumalal les desea unas muy felices Fiestas Patrias, en familia y con mucho cariño por nuestro país. Cuidémonos y celebremos con responsabilidad.' + String.fromCharCode(10, 10) },
    { id: 'navidad', nombre: 'Navidad', ico: '🎄', fecha: (a) => new Date(a, 11, 25), asunto: 'Feliz Navidad',
      texto: 'Estimados amigos:' + String.fromCharCode(10, 10) + 'En estas fiestas, el Club de Leones Temuco Antumalal les desea una Navidad llena de paz, unión y esperanza. Agradecemos de corazón su apoyo durante este año, que nos permitió ayudar a más familias de nuestra región.' + String.fromCharCode(10, 10) }
  ];
  const OCASIONES_LIBRES = [
    { id: 'gracias', nombre: 'Agradecimiento por su apoyo', ico: '🙏', asunto: 'Gracias por su apoyo al Club de Leones',
      texto: 'Estimados amigos:' + String.fromCharCode(10, 10) + 'Queremos agradecer sinceramente su apoyo al Club de Leones Temuco Antumalal. Gracias a personas e instituciones como ustedes podemos seguir ayudando a quienes más lo necesitan.' + String.fromCharCode(10, 10) },
    { id: 'invita', nombre: 'Invitación a una actividad del club', ico: '📅', asunto: 'Invitación del Club de Leones Temuco Antumalal',
      texto: 'Estimados amigos:' + String.fromCharCode(10, 10) + 'Los invitamos cordialmente a nuestra próxima actividad: [escribe aquí qué, cuándo y dónde]. Será un gusto contar con su presencia.' + String.fromCharCode(10, 10) }
  ];
  /* próxima vez que llega la fecha (hoy cuenta) y cuántos días faltan */
  const proximaDe = (o) => {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let f = o.fecha(hoy.getFullYear()); f.setHours(0, 0, 0, 0);
    if (f < hoy) { f = o.fecha(hoy.getFullYear() + 1); f.setHours(0, 0, 0, 0); }
    return { f, dias: Math.round((f - hoy) / 86400000) };
  };
  const proximasOcasiones = () => OCASIONES.map((o) => Object.assign({ o }, proximaDe(o))).sort((a, b) => a.dias - b.dias);
  const textoDias = (d) => (d === 0 ? '¡es hoy!' : d === 1 ? 'mañana' : 'en ' + d + ' días');

  /* Une la lista de socios (MyLCI) con las demás, para elegir a quién escribir */
  const comoContacto = (c) => ({ id: c.id, n: c.nombre, a: '', c: c.correo, m: c.celular, e: c.cargo, p: c.org, trato: c.trato });

  async function panelContactos(lienzo) {
    const caja = document.createElement('div');
    lienzo.appendChild(caja);
    caja.innerHTML = '<p class="nota-res">Cargando contactos…</p>';
    const conectado = await cargarContactos();
    await cargarSocios();
    let activa = 'socios';

    const nuevoId = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const listaActiva = () => CONT.listas.find((l) => l.id === activa);
    const hoyIso = () => new Date().toISOString().slice(0, 10);
    const modal = (html) => {
      const v = document.createElement('div');
      v.className = 'modalx';
      v.innerHTML = `<div class="modalx__caja" role="dialog" aria-modal="true">${html}</div>`;
      document.body.appendChild(v);
      v.addEventListener('click', (e) => { if (e.target === v || e.target.dataset.x === 'cerrar') v.remove(); });
      return v;
    };
    const guardar = async (msg) => { const ok = await guardarContactos(); if (msg) aviso(ok ? msg : msg + ' (guardado solo en este computador: el servidor no respondió)', ok ? 'ok' : 'mal'); };

    /* Elegir a qué lista(s) escribir para una fecha importante o un mensaje libre */
    const elegirDestino = (o) => {
      const opciones = [{ id: 'socios', nombre: 'Socios', n: SOCIOS.filter((x) => x.c).length }].concat(CONT.listas.map((l) => ({ id: l.id, nombre: l.nombre, n: l.contactos.filter((x) => x.correo).length })));
      const v = modal(`<h3>${o.ico} ${esc(o.nombre)}</h3>
        <p class="nota-res">Elige a quién le llega este saludo. Los correos van en copia oculta: nadie ve los de los demás.</p>
        <div class="chequeo" style="margin:8px 0">${opciones.map((x) => `<label class="chk"><input type="checkbox" data-lista="${esc(x.id)}" ${x.n ? '' : 'disabled'}> <span><b>${esc(x.nombre)}</b><small>${x.n} con correo</small></span></label>`).join('')}</div>
        <div class="msg__acc"><button class="btn" data-x="seguir" type="button">Escribir el correo</button><button class="btn btn--linea" data-x="cerrar" type="button">Cancelar</button></div>`);
      v.addEventListener('click', (e) => {
        if (e.target.dataset.x !== 'seguir') return;
        const ids = [...v.querySelectorAll('[data-lista]:checked')].map((c) => c.dataset.lista);
        if (!ids.length) { aviso('Marca al menos una lista.', 'mal'); return; }
        let destinatarios = [], marcar = [];
        ids.forEach((id) => {
          if (id === 'socios') destinatarios.push(...SOCIOS);
          else { const l = CONT.listas.find((z) => z.id === id); if (l) { destinatarios.push(...l.contactos.map(comoContacto)); marcar.push(l); } }
        });
        v.remove();
        ventanaCorreoMasivo(destinatarios, { asunto: o.asunto, texto: o.texto + FIRMA, ico: o.ico, estilo: 'festivo',
          alEnviar: () => { marcar.forEach((l) => l.contactos.forEach((x) => { if (x.correo) x.ultimo = hoyIso(); })); guardarContactos(); } });
      });
    };

    const pintar = () => {
      const prox = proximasOcasiones();
      const pie = prox.slice(0, 3);
      caja.innerHTML = `
      <div class="tarjeta">
        <div class="tarjeta__cab"><div><h3>📅 Fechas importantes para saludar</h3><p>Un saludo a tiempo cuida la relación con socios, autoridades, empresas y aliados. Toca una fecha y el mensaje ya viene escrito; tú lo puedes cambiar.</p></div></div>
        <ul class="chequeo">${pie.map((x) => `<li><span class="marca" data-ok="si">${x.o.ico}</span><span class="txt"><b>${esc(x.o.nombre)}</b><span>${x.f.getDate()} de ${MES_L[x.f.getMonth()]} · ${textoDias(x.dias)}</span></span>
          <button class="btn btn--sm" data-oca="${esc(x.o.id)}" type="button">✉ Preparar saludo</button></li>`).join('')}</ul>
        <details class="vis-hist"><summary>Ver todas las fechas y otros mensajes</summary>
          <ul class="chequeo">${prox.slice(3).map((x) => `<li><span class="marca" data-ok="si">${x.o.ico}</span><span class="txt"><b>${esc(x.o.nombre)}</b><span>${x.f.getDate()} de ${MES_L[x.f.getMonth()]}</span></span>
            <button class="btn btn--linea btn--sm" data-oca="${esc(x.o.id)}" type="button">✉ Preparar</button></li>`).join('')}
          ${OCASIONES_LIBRES.map((o) => `<li><span class="marca" data-ok="si">${o.ico}</span><span class="txt"><b>${esc(o.nombre)}</b><span>Para cuando tú quieras</span></span>
            <button class="btn btn--linea btn--sm" data-oca="${esc(o.id)}" type="button">✉ Preparar</button></li>`).join('')}</ul></details>
      </div>
      <div class="tarjeta">
        <div class="tarjeta__cab"><div><h3>📚 Mis listas</h3><p>Cada lista es un grupo de personas a quienes escribir: socios, municipalidad, empresas, prensa… Crea las que necesites.${conectado ? '' : ' Por ahora se guardan solo en este computador.'}</p></div></div>
        <div class="listas__tabs">
          <button type="button" class="chip-lista ${activa === 'socios' ? 'on' : ''}" data-lista-ir="socios">👥 Socios <small>${SOCIOS.length}</small></button>
          ${CONT.listas.map((l) => `<button type="button" class="chip-lista ${activa === l.id ? 'on' : ''}" data-lista-ir="${esc(l.id)}">🤝 ${esc(l.nombre)} <small>${l.contactos.length}</small></button>`).join('')}
          <button type="button" class="chip-lista chip-lista--nueva" data-nueva-lista="1">＋ Nueva lista</button>
        </div>
      </div>
      <div id="contCuerpo"></div>`;
      const cuerpo = caja.querySelector('#contCuerpo');
      if (activa === 'socios') panelSocios(cuerpo);
      else { const l = listaActiva(); if (l) pintarLista(cuerpo, l); else { activa = 'socios'; pintar(); } }
    };

    /* ── una lista de contactos (no socios) ── */
    const pintarLista = (cuerpo, l) => {
      let buscar = '', sel = new Set();
      const visibles = () => l.contactos.filter((c) => !buscar || [c.nombre, c.org, c.cargo, c.correo].join(' ').toLowerCase().includes(buscar.toLowerCase()));
      const dibuja = () => {
        const lista = visibles();
        const marcados = l.contactos.filter((c) => sel.has(c.id));
        cuerpo.innerHTML = `
        <div class="tarjeta">
          <div class="tarjeta__cab"><div><h3>${esc(l.nombre)}</h3><p>${l.contactos.length} contacto${l.contactos.length === 1 ? '' : 's'} · ${l.contactos.filter((c) => c.correo).length} con correo · ${l.contactos.filter((c) => numWa(c.celular)).length} con WhatsApp</p></div></div>
          <div class="msg__acc">
            <button class="btn btn--oro btn--grande" data-c="nuevo" type="button">＋ Agregar contacto</button>
            <label class="btn btn--linea" style="cursor:pointer">⬆ Subir un Excel o CSV<input type="file" data-c="archivo" accept=".xlsx,.xls,.csv" hidden></label>
            ${l.contactos.length ? '<button class="btn btn--linea" data-c="bajar" type="button">⬇ Descargar en Excel</button>' : ''}
            <button class="btn btn--linea" data-c="renombrar" type="button">✏️ Cambiar nombre de la lista</button>
            <button class="btn btn--peligro" data-c="borrarlista" type="button">🗑 Quitar esta lista</button>
          </div>
          <p class="nota-res">🔒 Estos datos son privados: no se publican en la página ni en GitHub. Para subir un Excel, las columnas pueden llamarse: Nombre, Organización, Cargo, Correo, Celular.</p>
        </div>
        ${l.contactos.length ? `<div class="tarjeta">
          <div class="tarjeta__cab"><div><h3>✉ Escribir a esta lista</h3><p>Marca a quién (o a todos) y elige cómo enviarlo.</p></div></div>
          <div class="filtros"><input type="search" data-c="buscar" placeholder="Buscar por nombre, organización o correo" value="${esc(buscar)}" style="max-width:320px">
            <button class="btn btn--linea btn--sm" data-c="todos" type="button">Marcar todos los que se ven</button>
            <button class="btn btn--linea btn--sm" data-c="ninguno" type="button">Quitar marcas</button></div>
          <div class="msg__acc" style="margin-bottom:6px">
            <button class="btn" data-c="correo" type="button" ${marcados.length ? '' : 'disabled'}>✉ Correo a los marcados (${marcados.length})</button>
            <button class="btn btn--linea" data-c="wa" type="button" ${marcados.length ? '' : 'disabled'}>💬 WhatsApp a los marcados</button>
          </div>
          <div class="tabla-socios">${lista.map((c) => `
            <div class="fila-so fila-so--c"><input type="checkbox" data-k="${esc(c.id)}" ${sel.has(c.id) ? 'checked' : ''} aria-label="Marcar a ${esc(c.nombre)}">
              <span class="fs-n"><b>${esc(c.nombre)}</b><small>${esc([c.cargo, c.org].filter(Boolean).join(' · '))}</small></span>
              <span class="fs-c">${c.correo ? esc(c.correo) : '<em>sin correo</em>'}</span>
              <span class="fs-m">${esc(c.celular || '')}${c.ultimo ? `<small> · Último saludo: ${esc(c.ultimo)}</small>` : ''}</span>
              <button class="btn btn--linea btn--sm" data-c="editar" data-id="${esc(c.id)}" type="button">✏️ Editar</button></div>`).join('') || '<p class="nota-res">No hay contactos con ese filtro.</p>'}</div>
        </div>` : `<div class="tarjeta"><p class="vacio">Esta lista está vacía. Toca <b>«＋ Agregar contacto»</b> o sube un Excel con tus contactos.</p></div>`}`;
      };
      dibuja();

      const formContacto = (c) => {
        const nuevo = !c; c = c || { id: nuevoId(), nombre: '', org: '', cargo: '', correo: '', celular: '', trato: '', notas: '', ultimo: '' };
        const v = modal(`<h3>${nuevo ? 'Nuevo contacto' : 'Editar contacto'}</h3>
          <label class="campo__et">Nombre de la persona o institución<input type="text" id="ctN" value="${esc(c.nombre)}" placeholder="Ej.: María González" style="width:100%"></label>
          <div class="dos-c">
            <label class="campo__et">Organización (opcional)<input type="text" id="ctO" value="${esc(c.org)}" placeholder="Ej.: Municipalidad de Temuco"></label>
            <label class="campo__et">Cargo (opcional)<input type="text" id="ctC" value="${esc(c.cargo)}" placeholder="Ej.: Alcaldesa"></label>
          </div>
          <div class="dos-c">
            <label class="campo__et">Correo<input type="email" id="ctE" value="${esc(c.correo)}" placeholder="nombre@correo.cl"></label>
            <label class="campo__et">Celular (para WhatsApp)<input type="tel" id="ctM" value="${esc(c.celular)}" placeholder="+56 9 1234 5678"></label>
          </div>
          <label class="campo__et">Cómo se le saluda en WhatsApp (opcional)<input type="text" id="ctT" value="${esc(c.trato)}" placeholder="Ej.: Alcaldesa González" style="width:100%"></label>
          <label class="campo__et">Notas (opcional)<textarea id="ctX" rows="3" placeholder="Algo que conviene recordar de esta relación">${esc(c.notas)}</textarea></label>
          <div class="msg__acc"><button class="btn" data-x="guardar" type="button">💾 Guardar</button>
            ${nuevo ? '' : '<button class="btn btn--peligro" data-x="borrar" type="button">🗑 Quitar</button>'}
            <button class="btn btn--linea" data-x="cerrar" type="button">Cancelar</button></div>`);
        v.addEventListener('click', async (e) => {
          const a = e.target.dataset.x;
          if (a === 'guardar') {
            const n = v.querySelector('#ctN').value.trim(), correo = v.querySelector('#ctE').value.trim();
            if (!n) { aviso('Escribe el nombre.', 'mal'); return; }
            if (correo && !/^\S+@\S+\.\S+$/.test(correo)) { aviso('Ese correo no parece correcto. Revísalo.', 'mal'); return; }
            Object.assign(c, { nombre: n, org: v.querySelector('#ctO').value.trim(), cargo: v.querySelector('#ctC').value.trim(), correo, celular: v.querySelector('#ctM').value.trim(), trato: v.querySelector('#ctT').value.trim(), notas: v.querySelector('#ctX').value.trim() });
            if (nuevo) l.contactos.push(c);
            v.remove(); dibuja(); guardar('Contacto guardado');
          } else if (a === 'borrar' && confirm('¿Quitar a «' + c.nombre + '» de esta lista?')) {
            l.contactos = l.contactos.filter((z) => z.id !== c.id); sel.delete(c.id); v.remove(); dibuja(); guardar('Contacto quitado');
          }
        });
      };

      const leerArchivo = async (archivo) => {
        if (!window.XLSX) await cargarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const wb = window.XLSX.read(await archivo.arrayBuffer(), { type: 'array' });
        const filas = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
        const cab = (filas[0] || []).map((x) => String(x).trim().toLowerCase());
        const col = (re) => cab.findIndex((x) => re.test(x));
        const ix = { n: col(/^(nombre|name|contacto)/), o: col(/organizaci|empresa|instituci|entidad/), c: col(/^cargo|puesto/), e: col(/correo|e-?mail/), m: col(/celular|m[oó]vil|tel[eé]fono|whatsapp/) };
        if (ix.n < 0) throw new Error('No encontré la columna «Nombre» en la primera fila del archivo.');
        const val = (f, i) => (i >= 0 ? String(f[i] || '').trim() : '');
        return filas.slice(1).filter((f) => val(f, ix.n)).map((f) => ({ id: nuevoId(), nombre: val(f, ix.n), org: val(f, ix.o), cargo: val(f, ix.c), correo: val(f, ix.e).toLowerCase(), celular: val(f, ix.m), trato: '', notas: '', ultimo: '' }));
      };

      cuerpo.onclick = async (e) => {
        const b = e.target.closest('[data-c]'); const a = b && b.dataset.c;
        if (a === 'nuevo') formContacto(null);
        else if (a === 'editar') formContacto(l.contactos.find((c) => c.id === b.dataset.id));
        else if (a === 'todos') { visibles().forEach((c) => sel.add(c.id)); dibuja(); }
        else if (a === 'ninguno') { sel.clear(); dibuja(); }
        else if (a === 'bajar') bajarCsv('contactos-' + l.nombre.toLowerCase().replace(/[^a-z0-9áéíóúñ]+/g, '-') + '-' + hoyIso() + '.csv', ['Nombre', 'Organización', 'Cargo', 'Correo', 'Celular', 'Notas', 'Último saludo'], l.contactos.map((c) => [c.nombre, c.org, c.cargo, c.correo, c.celular, c.notas, c.ultimo]));
        else if (a === 'correo') ventanaCorreoMasivo(l.contactos.filter((c) => sel.has(c.id)).map(comoContacto), { alEnviar: () => { l.contactos.forEach((c) => { if (sel.has(c.id) && c.correo) c.ultimo = hoyIso(); }); guardarContactos(); } });
        else if (a === 'wa') ventanaWhatsApp(l.contactos.filter((c) => sel.has(c.id)).map(comoContacto));
        else if (a === 'renombrar') { const n = (prompt('Nuevo nombre de la lista:', l.nombre) || '').trim(); if (n) { l.nombre = n.slice(0, 60); pintar(); guardar('Nombre cambiado'); } }
        else if (a === 'borrarlista') {
          if (confirm('¿Quitar la lista «' + l.nombre + '» con sus ' + l.contactos.length + ' contactos? No se puede deshacer.')) { CONT.listas = CONT.listas.filter((z) => z.id !== l.id); activa = 'socios'; pintar(); guardar('Lista quitada'); }
        }
      };
      cuerpo.onchange = async (e) => {
        if (e.target.dataset.c === 'archivo') {
          const f = e.target.files[0]; if (!f) return;
          try {
            const nuevos = await leerArchivo(f);
            if (!nuevos.length) { aviso('El archivo no trae contactos.', 'mal'); return; }
            const conocidos = new Set(l.contactos.map((c) => (c.correo || c.nombre).toLowerCase()));
            const agregar = nuevos.filter((c) => !conocidos.has((c.correo || c.nombre).toLowerCase()));
            l.contactos.push(...agregar); dibuja();
            guardar(agregar.length + ' contactos agregados' + (nuevos.length - agregar.length ? ' (' + (nuevos.length - agregar.length) + ' ya estaban)' : ''));
          } catch (err) { aviso(err.message || 'No se pudo leer el archivo.', 'mal'); }
        } else if (e.target.dataset.k !== undefined) {
          e.target.checked ? sel.add(e.target.dataset.k) : sel.delete(e.target.dataset.k);
          const n = sel.size; cuerpo.querySelectorAll('[data-c=correo],[data-c=wa]').forEach((x) => { x.disabled = !n; });
          const bc = cuerpo.querySelector('[data-c=correo]'); if (bc) bc.textContent = '✉ Correo a los marcados (' + n + ')';
        }
      };
      cuerpo.oninput = (e) => { if (e.target.dataset.c === 'buscar') { buscar = e.target.value; const pos = e.target.selectionStart; dibuja(); const n = cuerpo.querySelector('[data-c=buscar]'); n.focus(); n.setSelectionRange(pos, pos); } };
    };

    caja.addEventListener('click', (e) => {
      const oca = e.target.closest('[data-oca]');
      if (oca) { const o = OCASIONES.concat(OCASIONES_LIBRES).find((x) => x.id === oca.dataset.oca); if (o) elegirDestino(o); return; }
      const ir2 = e.target.closest('[data-lista-ir]');
      if (ir2) { activa = ir2.dataset.listaIr; pintar(); return; }
      if (e.target.closest('[data-nueva-lista]')) {
        const v = modal(`<h3>Nueva lista</h3>
          <p class="nota-res">Elige un tipo para empezar rápido, o escribe tu propio nombre.</p>
          <div class="opc" style="margin:6px 0 10px">${['Aliados estratégicos', 'Municipalidad y autoridades', 'Empresas y donantes', 'Prensa y medios', 'Colegios e instituciones', 'Voluntarios'].map((n) => `<button type="button" class="btn btn--linea btn--sm" data-pre="${esc(n)}">${esc(n)}</button>`).join('')}</div>
          <label class="campo__et">Nombre de la lista<input type="text" id="nlN" placeholder="Ej.: Aliados estratégicos" style="width:100%"></label>
          <div class="msg__acc"><button class="btn" data-x="crear" type="button">Crear la lista</button><button class="btn btn--linea" data-x="cerrar" type="button">Cancelar</button></div>`);
        v.addEventListener('click', (ev) => {
          const pre = ev.target.closest('[data-pre]'); if (pre) { v.querySelector('#nlN').value = pre.dataset.pre; return; }
          if (ev.target.dataset.x === 'crear') {
            const n = v.querySelector('#nlN').value.trim();
            if (!n) { aviso('Escribe un nombre para la lista.', 'mal'); return; }
            const l = { id: nuevoId(), nombre: n.slice(0, 60), contactos: [] };
            CONT.listas.push(l); activa = l.id; v.remove(); pintar(); guardar('Lista creada');
          }
        });
      }
    });

    pintar();
  }

  /* Correo con diseño de los Leones (azul y dorado, con logo). Se arma con estilos dentro de cada etiqueta,
     que es lo único que entienden Gmail y los demás programas de correo. */
  const SITIO = 'https://clta.cl';
  function correoConDiseno(estilo, { titulo, texto, ico }) {
    const c = (ESTADO.datos && ESTADO.datos.contacto) || {};
    const nombreClub = (ESTADO.datos && ESTADO.datos.identidad && ESTADO.datos.identidad.nombre) || 'Club de Leones Temuco Antumalal';
    const parrafos = String(texto || '').split(/\n{2,}/).map((t) => t.trim()).filter(Boolean)
      .map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#1B2338">${esc(t).replace(/\n/g, '<br>')}</p>`).join('');
    const logo = `<img src="${SITIO}/assets/img/lions-international.png" alt="Lions" width="64" height="64" style="display:block;border:0;width:64px;height:64px">`;
    const cabecera = estilo === 'festivo'
      ? `<tr><td align="center" style="background:#FFCD00;padding:30px 24px 22px">
           <div style="font-size:54px;line-height:1">${ico || '🦁'}</div>
           <div style="font:700 28px/1.2 Georgia,'Times New Roman',serif;color:#00338D;margin-top:10px">${esc(titulo || nombreClub)}</div>
           <div style="font:600 13px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#00338D;margin-top:8px">${esc(nombreClub)}</div></td></tr>`
      : `<tr><td style="background:#00338D;padding:20px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
           <td width="76" valign="middle">${logo}</td>
           <td valign="middle" style="font:700 20px/1.25 Georgia,'Times New Roman',serif;color:#FFFFFF">${esc(nombreClub)}<br><span style="font:600 12px Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#FFCD00">Nosotros servimos</span></td></tr></table></td></tr>
         <tr><td style="background:#FFCD00;height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>`;
    const titular = estilo === 'festivo' ? '' : (titulo ? `<h1 style="margin:0 0 18px;font:700 26px/1.25 Georgia,'Times New Roman',serif;color:#00338D">${esc(titulo)}</h1>` : '');
    const datos = [c.telefono && 'Tel. ' + esc(c.telefono), c.email && esc(c.email), c.direccion && esc(c.direccion)].filter(Boolean).join(' &nbsp;·&nbsp; ');
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F7;padding:20px 8px"><tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
        ${cabecera}
        <tr><td style="padding:30px 32px 10px">${titular}${parrafos}</td></tr>
        <tr><td style="padding:0 32px 28px"><div style="border-top:2px solid #FFCD00;padding-top:16px;font:15px/1.5 Georgia,'Times New Roman',serif;color:#00338D">🦁 <b>${esc(nombreClub)}</b><br><span style="font:13px Arial,sans-serif;color:#5B6478">Lions Clubs International · Distrito T-4</span></div></td></tr>
        <tr><td style="background:#001B4D;padding:16px 24px;text-align:center;font:12px/1.6 Arial,sans-serif;color:#C9D4F0">${datos ? datos + '<br>' : ''}<a href="${SITIO}" style="color:#FFCD00;text-decoration:none;font-weight:700">clta.cl</a></td></tr>
      </table></td></tr></table>`;
  }

  /* Correo a varios contactos: van en copia oculta (CCO) para que nadie vea los correos de los demás */
  function ventanaCorreoMasivo(lista, opts) {
    opts = opts || {};
    const con = lista.filter((s) => s.c), sin = lista.filter((s) => !s.c);
    const v = document.createElement('div');
    v.className = 'modalx';
    v.innerHTML = `<div class="modalx__caja modalx__caja--ancha" role="dialog" aria-modal="true" aria-label="Correo a los contactos">
      <h3>Correo a ${con.length} contacto${con.length === 1 ? '' : 's'}</h3>
      ${sin.length ? `<p class="aviso aviso--info" style="margin:6px 0">${sin.length} no tiene${sin.length === 1 ? '' : 'n'} correo y no se incluye${sin.length === 1 ? '' : 'n'}: ${esc(sin.map(nombreSocio).join(', '))}.</p>` : ''}
      <label class="campo__et">Asunto<input type="text" id="cmAsunto" placeholder="Ej.: Sesión del lunes 23" style="width:100%"></label>
      <label class="campo__et">Mensaje<textarea id="cmTexto" rows="6" placeholder="Estimados amigos:&#10;&#10;…"></textarea></label>
      <label class="campo__et">Diseño del correo
        <select id="cmDis" style="width:100%">
          <option value="lions">Lions: azul y dorado, con logo (recomendado)</option>
          <option value="festivo">Festivo: banner dorado grande con el nombre de la fecha</option>
          <option value="simple">Texto sencillo, sin diseño</option>
        </select></label>
      <div id="cmVista" class="cm__vista" aria-label="Así se verá el correo"></div>
      <p class="nota-res" id="cmNota"></p>
      <div id="cmDirecto" class="cm__directo oculto">
        <p class="nota-res"><b>Envío directo:</b> cada persona recibe su propio correo con el diseño, sin pegar nada. Puedes escribir <b>{nombre}</b> en el mensaje y se cambia por el nombre de cada uno.</p>
        <div class="msg__acc">
          <button class="btn btn--oro btn--grande" id="cmEnviar" type="button">📨 Enviar ahora a ${con.length}</button>
          <button class="btn btn--linea btn--grande" id="cmPrueba" type="button">Enviarme una prueba primero</button>
        </div>
      </div>
      <p class="nota-res" id="cmSinServicio" hidden>Para enviar sin pegar nada hay que conectar el servicio de correos (se hace una sola vez, ver <code>docs/CORREOS.md</code>). Mientras tanto puedes usar los botones de abajo.</p>
      <div class="msg__acc">
        <button class="btn btn--linea btn--grande" id="cmGmail" type="button">✉ Abrir en Gmail</button>
        <button class="btn btn--linea" id="cmMail" type="button">Abrir en mi programa de correo</button>
        <button class="btn btn--linea" id="cmCopiarDis" type="button">📋 Copiar el correo con diseño</button>
        <button class="btn btn--linea" id="cmCopiar" type="button">📋 Copiar las direcciones</button>
        <button class="btn btn--linea" id="cmCerrar" type="button">Cancelar</button>
      </div></div>`;
    document.body.appendChild(v);
    if (opts.asunto) v.querySelector('#cmAsunto').value = opts.asunto;
    if (opts.texto) v.querySelector('#cmTexto').value = opts.texto;
    if (opts.ico && /festiv/.test(opts.estilo || 'festivo')) v.querySelector('#cmDis').value = 'festivo';
    const dat = () => ({ cco: con.map((s) => s.c).join(','), asunto: v.querySelector('#cmAsunto').value.trim(), texto: v.querySelector('#cmTexto').value, dis: v.querySelector('#cmDis').value });
    const htmlActual = () => { const d = dat(); return d.dis === 'simple' ? '' : correoConDiseno(d.dis, { titulo: d.asunto, texto: d.texto, ico: opts.ico }); };
    const pintaVista = () => {
      const d = dat(), h = htmlActual();
      v.querySelector('#cmVista').innerHTML = h || '<p class="nota-res">Se enviará como texto sencillo.</p>';
      v.querySelector('#cmNota').innerHTML = h
        ? 'Con diseño: se <b>copia el correo</b> y se abre Gmail. En el cuerpo del correo, <b>toca y pega con Ctrl+V</b> (en el celular, mantén apretado y elige «Pegar»). Los correos van en <b>copia oculta</b>.'
        : 'Los correos van en <b>copia oculta</b>: cada persona ve solo su propio mensaje, no las direcciones de los demás.';
    };
    pintaVista();
    api('/api/correo-estado').then((r) => {
      if (r && r.configurado) v.querySelector('#cmDirecto').classList.remove('oculto');
      else if (r) v.querySelector('#cmSinServicio').hidden = false;
    });
    const enviarDirecto = async (prueba) => {
      const d = dat();
      if (!d.asunto) { aviso('Escribe el asunto.', 'mal'); return; }
      if (!d.texto.trim()) { aviso('Escribe el mensaje.', 'mal'); return; }
      if (!prueba && !confirm('Se enviará este correo a ' + con.length + ' persona' + (con.length === 1 ? '' : 's') + '.' + String.fromCharCode(10, 10) + '¿Enviar ahora? No se puede deshacer.')) return;
      const b = v.querySelector(prueba ? '#cmPrueba' : '#cmEnviar'); const txt0 = b.textContent; b.disabled = true; b.textContent = 'Enviando…';
      try {
        const resp = await fetch('/api/enviar-correo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          asunto: d.asunto, texto: d.texto, html: htmlActual(), prueba: !!prueba,
          destinos: con.map((x) => ({ correo: x.c, nombre: x.trato || (x.n || '').split(' ')[0] || '' })) }) });
        const j = await resp.json().catch(() => ({}));
        if (!resp.ok || !j.ok) { aviso(j.error || 'No se pudo enviar. Inténtalo de nuevo.', 'mal'); }
        else if (prueba) aviso('Listo: te enviamos una prueba a tu correo. Revísala y, si está bien, envía a todos.', 'ok');
        else { aviso('Listo: se enviaron ' + j.enviados + ' correos. Hoy van ' + j.hoy + ' de ' + j.limite + '.', 'ok'); if (opts.alEnviar) opts.alEnviar(); v.remove(); }
      } catch { aviso('No hay conexión con el servidor de correos.', 'mal'); }
      b.disabled = false; b.textContent = txt0;
    };
    v.addEventListener('click', (e) => { if (e.target.id === 'cmEnviar') enviarDirecto(false); else if (e.target.id === 'cmPrueba') enviarDirecto(true); });
    v.addEventListener('input', pintaVista);
    v.addEventListener('change', pintaVista);
    const copiarDiseno = async () => {
      const h = htmlActual(); if (!h) return true;
      const plano = dat().texto;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([h], { type: 'text/html' }), 'text/plain': new Blob([plano], { type: 'text/plain' }) })]);
        return true;
      } catch {
        try { const r = document.createRange(); r.selectNodeContents(v.querySelector('#cmVista')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); const ok = document.execCommand('copy'); sel.removeAllRanges(); return ok; } catch { return false; }
      }
    };
    v.addEventListener('click', async (e) => {
      const id = e.target.id;
      if (e.target === v || id === 'cmCerrar') return v.remove();
      if (id === 'cmCopiarDis') { aviso((await copiarDiseno()) ? 'Correo copiado. Pégalo en el cuerpo de tu correo con Ctrl+V.' : 'No se pudo copiar. Intenta de nuevo.', 'ok'); return; }
      if (!con.length) return;
      const { cco, asunto, texto, dis } = dat();
      if ((id === 'cmGmail' || id === 'cmMail') && opts.alEnviar) opts.alEnviar();
      const conDiseno = dis !== 'simple';
      if (conDiseno && (id === 'cmGmail' || id === 'cmMail')) {
        const ok = await copiarDiseno();
        aviso(ok ? 'Correo con diseño copiado. En Gmail, toca el cuerpo del correo y pega con Ctrl+V.' : 'No se pudo copiar el diseño; usa el botón «Copiar el correo con diseño».', ok ? 'ok' : 'mal');
      }
      const cuerpo = conDiseno ? '' : texto;
      if (id === 'cmGmail') window.open('https://mail.google.com/mail/?view=cm&fs=1&bcc=' + encodeURIComponent(cco) + '&su=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo), '_blank', 'noopener');
      else if (id === 'cmMail') window.location.href = 'mailto:?bcc=' + encodeURIComponent(cco) + '&subject=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
      else if (id === 'cmCopiar') { try { await navigator.clipboard.writeText(con.map((s) => s.c).join(', ')); aviso('Direcciones copiadas. Pégalas en «CCO» de tu correo.', 'ok'); } catch { aviso('No se pudo copiar.', 'mal'); } }
    });
  }

  /* WhatsApp: no permite envíos masivos automáticos, así que se abre un chat por persona, con el mensaje ya escrito */
  function ventanaWhatsApp(lista, textoInicial) {
    const v = document.createElement('div');
    v.className = 'modalx';
    v.innerHTML = `<div class="modalx__caja" role="dialog" aria-modal="true" aria-label="WhatsApp a los socios">
      <h3>WhatsApp a ${lista.length} socio${lista.length === 1 ? '' : 's'}</h3>
      <label class="campo__et">Mensaje (puedes usar <b>{nombre}</b> para poner el nombre de cada uno)
        <textarea id="waTexto" rows="5">${esc(textoInicial || 'Hola {nombre}, te escribimos del Club de Leones Temuco Antumalal. ')}</textarea></label>
      <p class="nota-res">WhatsApp no deja mandar mensajes masivos de una vez. Toca el botón de cada persona: se abre su chat con el mensaje listo y tú solo das «Enviar». Los ya enviados quedan marcados.</p>
      <div class="lista-wa">${lista.map((s, i) => { const w = numWa(s.m); return `<div class="fila-wa"><span><b>${esc(nombreSocio(s))}</b><small>${w ? '+' + w : esc(motivoSinWa(s))}</small></span>${w ? `<button class="btn btn--linea btn--sm" data-i="${i}" type="button">💬 Enviar</button>` : (s.c ? `<button class="btn btn--linea btn--sm" data-m="${i}" type="button">✉ Por correo</button>` : '')}</div>`; }).join('')}</div>
      <div class="msg__acc"><button class="btn btn--linea" id="waCerrar" type="button">Cerrar</button></div></div>`;
    document.body.appendChild(v);
    v.addEventListener('click', (e) => {
      if (e.target === v || e.target.id === 'waCerrar') return v.remove();
      const bm = e.target.closest('[data-m]');
      if (bm) { const s = lista[+bm.dataset.m]; const txt = v.querySelector('#waTexto').value.replace(/\{nombre\}/gi, (s.trato || (s.n || '').split(' ')[0])); window.location.href = 'mailto:' + s.c + '?subject=' + encodeURIComponent('Un saludo del Club de Leones') + '&body=' + encodeURIComponent(txt); bm.textContent = '✓ Abierto'; return; }
      const b = e.target.closest('[data-i]'); if (!b) return;
      const s = lista[+b.dataset.i];
      const txt = v.querySelector('#waTexto').value.replace(/\{nombre\}/gi, (s.trato || (s.n || '').split(' ')[0]));
      window.open('https://wa.me/' + numWa(s.m) + '?text=' + encodeURIComponent(txt), '_blank', 'noopener');
      b.textContent = '✓ Enviado'; b.disabled = true;
    });
  }

  /* ─── Informes ─── */
  function panelInformes(lienzo) {
    const d = ESTADO.datos;
    const hoyIso = new Date().toISOString().slice(0, 10);
    const fcorta = (iso) => { const f = new Date(String(iso).slice(0, 10) + 'T00:00'); return isNaN(f) ? (iso || '') : f.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }); };
    const quitaHtml = (t) => String(t == null ? '' : t).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
    const csv = (cab, filas) => '﻿' + [cab, ...filas].map((f) => f.map((c) => '"' + quitaHtml(c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const eventos = () => [...((d.agenda && d.agenda.eventos) || [])].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));

    const informe = () => {
      const w = window.open('', '_blank');
      if (!w) { aviso('El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio y vuelve a intentar.', 'error'); return; }
      const fila = (a, b) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;
      const proyectos = [...(d.proyectos || [])].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
      w.document.write(`<!doctype html><html lang="es"><meta charset="utf-8"><title>Informe ${esc(d.identidad.nombre)}</title>
<style>body{font:14px/1.5 system-ui,Segoe UI,sans-serif;color:#14213d;max-width:820px;margin:30px auto;padding:0 20px}
h1{font-size:24px;margin:14px 0 0}h2{font-size:16px;border-bottom:2px solid #f2b705;padding-bottom:4px;margin:26px 0 8px}
.k{display:flex;gap:10px;flex-wrap:wrap}.k div{flex:1;min-width:120px;border:1px solid #d7dbe5;border-radius:10px;padding:10px}.k b{display:block;font-size:22px}
table{width:100%;border-collapse:collapse}td{padding:5px 6px;border-bottom:1px solid #e5e8ef;vertical-align:top}td:first-child{width:34%;font-weight:600}
small{color:#5b6478}button{padding:8px 16px;border:0;border-radius:8px;background:#f2b705;font-weight:700;cursor:pointer}@media print{button{display:none}}</style>
<button onclick="print()">Imprimir / guardar como PDF</button>
<h1>${esc(d.identidad.nombre)}</h1><small>${esc(d.identidad.distrito || '')} · Informe generado el ${esc(fcorta(hoyIso))}</small>
<h2>Cifras del club</h2><div class="k">${(d.impacto || []).map((c) => `<div><b>${esc(String(c.valor))}${esc(c.sufijo || '')}</b>${esc(c.etiqueta)}</div>`).join('')}</div>
<h2>Directorio</h2><table>${(d.directiva || []).map((m) => fila(m.cargo, m.nombre)).join('')}</table>
<h2>Actividades de la agenda</h2><table>${eventos().map((e) => fila(fcorta(e.fecha) + (e.hora ? ' · ' + e.hora : ''), quitaHtml(e.titulo))).join('') || fila('—', 'Sin actividades cargadas')}</table>
<h2>Proyectos y trabajo realizado</h2><table>${proyectos.map((p) => fila(p.fecha ? fcorta(p.fecha) : (p.tag || ''), quitaHtml(p.titulo))).join('')}</table>
<h2>Contacto</h2><table>${fila('Correo', d.contacto.email || '—')}${fila('Teléfono', d.contacto.telefono || '—')}${fila('Sede', d.contacto.direccion || '—')}</table>
</html>`);
      w.document.close();
    };

    const items = [
      { t: 'Informe del club', p: 'Cifras, directorio, actividades y proyectos en una hoja lista para imprimir o guardar como PDF.', b: 'Abrir informe', f: informe },
      { t: 'Actividades (Excel)', p: 'Todas las actividades de la agenda con fecha, hora y detalle.', b: 'Descargar',
        f: () => descargar('actividades-' + hoyIso + '.csv', csv(['Fecha', 'Hora', 'Actividad', 'Detalle'], eventos().map((e) => [e.fecha, e.hora || '', e.titulo, e.texto || ''])), 'text/csv;charset=utf-8') },
      { t: 'Proyectos (Excel)', p: 'Los proyectos y el trabajo en terreno publicados en la página.', b: 'Descargar',
        f: () => descargar('proyectos-' + hoyIso + '.csv', csv(['Fecha', 'Categoría', 'Proyecto', 'Descripción'], (d.proyectos || []).map((p) => [p.fecha || '', p.tag || '', p.titulo, p.texto || ''])), 'text/csv;charset=utf-8') },
      { t: 'Directorio (Excel)', p: 'Cargos y nombres del directorio actual.', b: 'Descargar',
        f: () => descargar('directorio-' + hoyIso + '.csv', csv(['Cargo', 'Nombre'], (d.directiva || []).map((m) => [m.cargo, m.nombre])), 'text/csv;charset=utf-8') }
    ];
    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta';
    tarjeta.innerHTML = `<div class="tarjeta__cab"><div><h3>Qué quieres sacar</h3><p>Los archivos .csv se abren directo en Excel.</p></div></div>
      <ul class="chequeo">${items.map((x, i) => `<li><span class="txt"><b>${esc(x.t)}</b><span>${esc(x.p)}</span></span>
        <button type="button" class="btn btn--linea btn--sm" data-inf="${i}">${esc(x.b)}</button></li>`).join('')}</ul>`;
    tarjeta.addEventListener('click', (e) => { const b = e.target.closest('[data-inf]'); if (b) items[+b.dataset.inf].f(); });
    lienzo.appendChild(tarjeta);
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
    const apilarCab = () => lienzo.appendChild(cab); /* el encabezado va al final */

    /* Próximas 3 sesiones fijas: se pueden renombrar, cambiar de hora/lugar o suspender una sola fecha */
    const MESES_L = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const DIAS_L = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const lunesDe = (a, m, cual) => {
      const d = new Date(a, m, 1);
      return new Date(a, m, 1 + ((8 - d.getDay()) % 7) + (cual === 2 ? 7 : 21));
    };
    const hoyL = new Date(); hoyL.setHours(0, 0, 0, 0);
    const proximas = [];
    for (let m = 0; m < 12 && proximas.length < 3; m++) {
      const b0 = new Date(hoyL.getFullYear(), hoyL.getMonth() + m, 1);
      [2, 4].forEach((cual) => {
        const f = lunesDe(b0.getFullYear(), b0.getMonth(), cual);
        if (f >= hoyL && proximas.length < 3) proximas.push({ f, cual });
      });
    }
    const prox = document.createElement('div');
    prox.className = 'tarjeta';
    prox.innerHTML = `
      <div class="tarjeta__cab"><div>
        <h3>Próximas sesiones del club</h3>
        <p>Cambia solo lo que haga falta. Si una sesión no se hace, apaga «Se realiza esta sesión».</p>
      </div></div>`;
    if (obtener('agenda.auto', true) === false) {
      const av = document.createElement('div');
      av.className = 'aviso aviso--ojo';
      av.innerHTML = '<div><b>Las sesiones fijas están ocultas en la página.</b>Para mostrarlas, activa «Mostrar las sesiones automáticas» en los ajustes de abajo.</div>';
      prox.appendChild(av);
    }
    proximas.forEach(({ f, cual }) => {
      const iso = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
      const base = 'agenda.excepciones.' + iso + '.';
      const defTitulo = cual === 2 ? (obtener('agenda.tituloSegundo', '') || 'Sesión ordinaria')
                                   : (obtener('agenda.tituloCuarto', '') || 'Sesión ordinaria y trabajo de comisiones');
      const fila = document.createElement('div');
      fila.className = 'sesion';
      fila.innerHTML = `<div class="sesion__fecha"><b>${f.getDate()}</b><span>${DIAS_L[f.getDay()]} · ${MESES_L[f.getMonth()]} ${f.getFullYear()}</span></div><div class="sesion__campos"></div>`;
      const cont = fila.querySelector('.sesion__campos');
      [
        { tipo: 'switch', ruta: base + 'realiza', etiqueta: 'Se realiza esta sesión', pordefecto: true },
        { tipo: 'fecha', ruta: base + 'fecha', etiqueta: 'Fecha', ayuda: 'Déjela vacía si es el lunes de siempre. Si se adelanta o atrasa (por ejemplo por un feriado), elija el día nuevo.' },
        { tipo: 'texto', ruta: base + 'hora', etiqueta: 'Hora', marca: obtener('agenda.hora', '') || '20:30 h', ayuda: 'Escriba solo si cambia.' },
        { tipo: 'texto', ruta: base + 'titulo', etiqueta: 'Nombre', marca: defTitulo },
        { tipo: 'texto', ruta: base + 'lugar', etiqueta: 'Lugar', marca: obtener('agenda.lugar', '') }
      ].forEach((c) => cont.appendChild(campo(c)));
      const entradaFecha = cont.querySelector('input[type=date]');
      if (entradaFecha) {
        const pintarFecha = () => {
          const v = entradaFecha.value ? new Date(entradaFecha.value + 'T12:00:00') : f;
          if (isNaN(v)) return;
          fila.querySelector('.sesion__fecha b').textContent = v.getDate();
          fila.querySelector('.sesion__fecha span').textContent = `${DIAS_L[v.getDay()]} · ${MESES_L[v.getMonth()]} ${v.getFullYear()}`;
        };
        entradaFecha.addEventListener('input', pintarFecha);
        entradaFecha.addEventListener('change', pintarFecha);
        pintarFecha();
      }
      prox.appendChild(fila);
    });
    lienzo.appendChild(prox);

    const fijas = document.createElement('details');
    fijas.className = 'tarjeta tarjeta--plegable';
    fijas.innerHTML = `
      <summary class="tarjeta__cab"><div>
        <h3>Ajustes de todas las sesiones fijas</h3>
        <p>Solo si quiere cambiar el nombre, la hora o el lugar de TODAS las sesiones del 2° y 4° lunes.</p>
      </div></summary>`;
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
        { tipo: 'switch', ruta: 'abierto', etiqueta: 'Abierta a la comunidad', pordefecto: true, ayuda: '<b>Encendido:</b> puede venir cualquier persona (operativos, cenas). En la página dice «Abierta a la comunidad». <b>Apagado:</b> es una sesión solo para socios y en la página dice «Solo socios».' },
        { tipo: 'area', ruta: 'texto', etiqueta: 'Detalle', filas: 2, ayuda: 'Dónde es, qué hay que llevar. Si lo dejas vacío usa el lugar de las sesiones.' },
        { tipo: 'texto', ruta: 'hora', etiqueta: 'Hora', marca: '10:00 h' },
        { tipo: 'texto', ruta: 'enlace', etiqueta: 'Enlace (opcional)', ayuda: 'Por ejemplo el link para comprar entradas o inscribirse. Dirección web completa (https://…).' },
        { tipo: 'texto', ruta: 'enlaceTexto', etiqueta: 'Texto del enlace', marca: 'Comprar entradas' }
      ]
    }));
    apilarCab();
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

  /* El menú tiene dos bloques plegables: uno para administrar e informarse y otro para cambiar la página */
  const BLOQUES = [
    { id: 'admin', titulo: 'Administración e informes', grupos: ['Administración'],
      orden: ['inicio', 'mensajes', 'socios', 'agenda', 'articulos', 'proyectos', 'directiva', 'informes', 'ayuda', 'ajustes', 'publicar'] },
    { id: 'web',   titulo: 'Editar mi página web', grupos: ['Datos del club', 'Contenido de la página', 'Conexiones'] }
  ];

  function abrirBloque(el, abrir) {
    el.classList.toggle('cerrado', !abrir);
    const h = el.querySelector('.bloque__cab');
    if (h) h.setAttribute('aria-expanded', String(abrir));
    try { localStorage.setItem('antumalal.bloque.' + el.dataset.bloque, abrir ? '1' : '0'); } catch { /* sin almacenamiento */ }
  }

  function pintarNav() {
    const nav = $('#nav');
    nav.innerHTML = '';

    /* Buscador: escribe una palabra y se muestran solo las secciones que la tienen */
    const PALABRAS = {
      agenda: 'calendario evento actividad reunión fecha hora sesión cena operativo',
      articulos: 'blog artículo noticia texto escribir entrevista',
      proyectos: 'terreno terrenos proyecto foto fotos ayuda trabajo hicimos',
      directiva: 'presidente secretario tesorero cargo integrante junta directorio',
      mensajes: 'correo contacto formulario escribieron responder',
      socios: 'miembros lista cumpleaños whatsapp excel',
      informes: 'reporte imprimir pdf excel descargar',
      ajustes: 'letra tamaño color historial cambios claro oscuro',
      publicar: 'respaldo copia seguridad subir clave',
      ayuda: 'guía pasos cómo usar',
      inicio: 'visitas resumen principal',
      portada: 'inicio principal foto título', contacto: 'teléfono correo dirección whatsapp', redes: 'instagram facebook youtube enlaces',
      quienes: 'historia club somos', causas: 'salud vista niños ayuda', impacto: 'cifras números', faq: 'preguntas respuestas dudas',
      testimonios: 'opiniones frases', unete: 'socio sumarse', aportar: 'donar donaciones bingo paella', 'club-datos': 'nombre lema identidad'
    };
    const buscador = document.createElement('div');
    buscador.className = 'buscador';
    buscador.innerHTML = '<label class="solo-lectores" for="navBuscar">Buscar una sección</label>'
      + '<input type="search" id="navBuscar" placeholder="🔍 Buscar una sección…" autocomplete="off" aria-label="Buscar una sección del panel">'
      + '<p class="buscador__vacio oculto">No encontré nada con esa palabra. Prueba con otra, por ejemplo «blog», «agenda» o «fotos».</p>';
    nav.appendChild(buscador);
    const quitaTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const filtrar = () => {
      const q = quitaTildes(buscador.querySelector('input').value).trim();
      const botones = nav.querySelectorAll('.nav__b');
      let hay = 0;
      botones.forEach((b) => {
        const texto = quitaTildes(b.textContent + ' ' + (PALABRAS[b.dataset.ir] || ''));
        const ok = !q || q.split(/\s+/).every((w) => texto.includes(w));
        b.classList.toggle('oculto', !ok);
        if (ok) hay++;
      });
      nav.classList.toggle('buscando', !!q);
      nav.querySelectorAll('.bloque').forEach((bl) => { if (q) bl.classList.remove('cerrado'); });
      nav.querySelectorAll('.bloque__explica, .lateral__grupo, #btnSalir').forEach((e) => e.classList.toggle('oculto', !!q));
      buscador.querySelector('.buscador__vacio').classList.toggle('oculto', !(q && !hay));
    };
    buscador.querySelector('input').addEventListener('input', filtrar);
    buscador.querySelector('input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const primero = nav.querySelector('.nav__b:not(.oculto)'); if (primero) { primero.click(); } }
      if (e.key === 'Escape') { e.target.value = ''; filtrar(); }
    });

    const salir = document.createElement('button');
    salir.type = 'button'; salir.className = 'atajo atajo--salir'; salir.id = 'btnSalir';
    salir.innerHTML = '<span>🚪</span>Salir del panel';
    salir.addEventListener('click', salirDelPanel);
    BLOQUES.forEach((bl) => {
      let secs = SECCIONES.filter((s) => bl.grupos.includes(s.grupo) && s.id !== 'donaciones');
      if (bl.orden) secs = bl.orden.map((id) => secs.find((s) => s.id === id)).filter(Boolean);
      if (!secs.length) return;
      const caja = document.createElement('div');
      caja.className = 'bloque';
      caja.dataset.bloque = bl.id;
      const cab = document.createElement('button');
      cab.type = 'button';
      cab.className = 'bloque__cab';
      cab.innerHTML = `<span>${esc(bl.titulo)}</span><i aria-hidden="true">▾</i>`;
      cab.addEventListener('click', () => abrirBloque(caja, caja.classList.contains('cerrado')));
      caja.appendChild(cab);

      const cuerpo = document.createElement('div');
      cuerpo.className = 'bloque__cuerpo';
      if (bl.id === 'web') {
        const ex = document.createElement('p');
        ex.className = 'bloque__explica';
        ex.textContent = 'Aquí cambias lo que la gente lee y ve en la página del club. Elige la parte que quieres cambiar.';
        cuerpo.appendChild(ex);
      }
      let grupoActual = '';
      secs.forEach((s) => {
        /* los subtítulos solo se muestran cuando el bloque tiene varios grupos */
        if (bl.grupos.length > 1 && s.grupo !== grupoActual) {
          grupoActual = s.grupo;
          const g = document.createElement('div');
          g.className = 'lateral__grupo';
          g.textContent = GRUPO_FACIL[grupoActual] || grupoActual;
          cuerpo.appendChild(g);
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nav__b' + (s.id === ESTADO.seccion ? ' activo' : '');
        b.dataset.ir = s.id;
        const nf = NAVFACIL[s.id];
        b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
          stroke-linecap="round" stroke-linejoin="round">${s.ico}</svg><span>${nf ? `<b>${esc(nf[0])}</b><small>${esc(nf[1])}</small>` : esc(s.nombre)}</span>`;
        b.addEventListener('click', () => ir(s.id));
        cuerpo.appendChild(b);
      });
      caja.appendChild(cuerpo);
      nav.appendChild(caja);

      let guardado = null;
      try { guardado = localStorage.getItem('antumalal.bloque.' + bl.id); } catch { /* ignorar */ }
      const conActivo = secs.some((s) => s.id === ESTADO.seccion);
      abrirBloque(caja, conActivo || guardado !== '0');
    });
    nav.appendChild(salir);
  }

  function ir(id) {
    ESTADO.seccion = id;
    const bq = document.getElementById('navBuscar'); if (bq && bq.value) { bq.value = ''; bq.dispatchEvent(new Event('input')); }
    document.body.classList.remove('menu-abierto');
    $$('.nav__b').forEach((b) => b.classList.toggle('activo', b.dataset.ir === id));
    const bl = document.querySelector('.nav__b.activo'); const caja = bl && bl.closest('.bloque'); if (caja && caja.classList.contains('cerrado')) abrirBloque(caja, true);
    pintarSeccion();
    window.scrollTo({ top: 0 });
    try { history.replaceState(null, '', '#' + id); } catch { /* file:// no siempre deja */ }
    actualizarVivoVista();
  }

  /* ═══════════════════════════════════════════════════════════════
     VISTA PREVIA EN VIVO (panel lateral con la página, como en Caramelo Alegre)
     Solo aparece en las secciones de «Mi página web». Se actualiza sola al editar.
     ═══════════════════════════════════════════════════════════════ */
  const ANCLAS = { portada: 'inicio', quienes: 'club', causas: 'causas', impacto: 'impacto', proyectos: 'proyectos',
    articulos: 'articulos', agenda: 'agenda', directiva: 'directorio', testimonios: 'testimonios', unete: 'unete',
    aportar: 'dona', donaciones: 'dona', faq: 'faq', 'contacto-sec': 'contacto', contacto: 'contacto', noticias: 'noticias' };
  const lsVivo = { leer() { try { return localStorage.getItem('antumalal.vivo') === '1'; } catch { return false; } },
                   poner(v) { try { localStorage.setItem('antumalal.vivo', v ? '1' : '0'); } catch { /* ignorar */ } } };
  let vivoAbierto = false, vivoAncla = null, vivoInicializado = false;

  function seccionEsWeb() {
    const s = SECCIONES.find((x) => x.id === ESTADO.seccion);
    return !!s && (s.grupo !== 'Administración' || ['agenda', 'articulos', 'proyectos', 'directiva'].includes(s.id));
  }
  function cargarVivo(conservar) {
    const f = $('#vFrame');
    if (!f) return;
    let y = 0;
    if (conservar && vivoAncla === ESTADO.seccion) { try { y = f.contentWindow.scrollY || 0; } catch { /* otra página */ } }
    vivoAncla = ESTADO.seccion;
    const ancla = ANCLAS[ESTADO.seccion];
    /* La página arma su contenido con JavaScript: se espera a que exista la sección antes de ir a ella */
    f.onload = () => {
      engancharEdicion(f);
      let intentos = 0;
      const ir = () => {
        try {
          const w = f.contentWindow;
          if (y) { w.scrollTo(0, y); return; }
          const el = ancla && w.document.getElementById(ancla);
          if (el) { w.scrollTo(0, el.getBoundingClientRect().top + w.scrollY - 70); return; }
        } catch { return; }
        if (++intentos < 20) setTimeout(ir, 200);
      };
      ir();
    };
    f.src = 'index.html?borrador=1&vivo=' + Date.now() + (!conservar && ancla ? '#' + ancla : '');
  }
  function pintarVivo() {
    const web = seccionEsWeb();
    $('#vivo').hidden = !(web && vivoAbierto);
    $('#vTab').hidden = !web || vivoAbierto;
    $('#vTab').setAttribute('aria-expanded', String(vivoAbierto));
    document.body.classList.toggle('conVivo', web && vivoAbierto);
  }
  function actualizarVivoVista() {
    pintarVivo();
    if (vivoAbierto && seccionEsWeb() && vivoAncla !== ESTADO.seccion) cargarVivo(false);
  }
  let tVivo = null;
  function refrescarVivo() {
    if (!vivoAbierto || !seccionEsWeb() || !$('#vAuto').checked || edicionAbierta()) return;
    clearTimeout(tVivo);
    tVivo = setTimeout(() => cargarVivo(true), 250);
  }
  /* ── Tocar un texto de la vista previa para editarlo ahí mismo ── */
  const normTxt = (t) => String(t == null ? '' : t).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[*_]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const OMITIR = /^(imagen|imagenes|imagenClaves|enlace|foto|icono|ico|id|fecha|mapaEmbed|endpoint|metodo|actualizado|version)$/i;
  function buscarTexto(objeto, ruta, buscado, salida) {
    if (salida.length > 3 || objeto == null) return;
    if (typeof objeto === 'string') {
      if (objeto.length >= 2 && objeto.length <= 800 && normTxt(objeto) === buscado) salida.push(ruta);
      return;
    }
    if (typeof objeto !== 'object') return;
    Object.keys(objeto).forEach((k) => { if (!OMITIR.test(k)) buscarTexto(objeto[k], ruta ? ruta + '.' + k : k, buscado, salida); });
  }
  /* Quitar / agregar una tarjeta de una lista (proyectos, causas, directorio…) */
  let deshacerTarjeta = null, tDeshacer = null;
  function accionTarjeta(accion, it) {
    const lista = obtener(it.arr, null);
    if (!Array.isArray(lista) || !lista[it.idx] && lista[it.idx] !== '') return;
    const copia = clonar(lista);
    if (accion === 'quitar') {
      const quitado = copia.splice(it.idx, 1)[0];
      asignar(it.arr, copia);
      deshacerTarjeta = { arr: it.arr, idx: it.idx, quitado };
      $('#vUndo').hidden = false;
      clearTimeout(tDeshacer); tDeshacer = setTimeout(() => { $('#vUndo').hidden = true; deshacerTarjeta = null; }, 9000);
    } else {
      const nuevo = clonar(copia[it.idx]);
      if (nuevo && typeof nuevo === 'object') {
        ['titulo', 'nombre', 'pregunta'].forEach((k) => { if (typeof nuevo[k] === 'string') nuevo[k] += ' (nuevo)'; });
        if (nuevo.id) nuevo.id = 'n' + Date.now().toString(36);
      }
      copia.splice(it.idx + 1, 0, nuevo);
      asignar(it.arr, copia);
      aviso('Se agregó una tarjeta copia. Tócala en la vista previa para cambiar sus textos.', 'ok');
    }
    cargarVivo(true);
  }
  function deshacerQuitar() {
    if (!deshacerTarjeta) return;
    const { arr, idx, quitado } = deshacerTarjeta;
    const copia = clonar(obtener(arr, []));
    copia.splice(idx, 0, quitado);
    asignar(arr, copia);
    deshacerTarjeta = null; $('#vUndo').hidden = true;
    cargarVivo(true);
  }

  let edicion = null; /* { ruta, el } */
  const edicionAbierta = () => !!edicion;

  function cerrarEdicion() {
    if (!edicion) return;
    const el = edicion.el;
    try { el.removeAttribute('data-ed-sel'); } catch { /* ignorar */ }
    edicion = null;
    $('#vEd').hidden = true;
    refrescarVivo();
  }
  function abrirEdicion(ruta, el) {
    if (edicion) { try { edicion.el.removeAttribute('data-ed-sel'); } catch { /* ignorar */ } }
    edicion = { ruta, el };
    el.setAttribute('data-ed-sel', '1');
    const caja = $('#vEdTexto');
    caja.value = String(obtener(ruta, ''));
    $('#vEdRuta').textContent = ruta.replace(/\./g, ' › ');
    $('#vEd').hidden = false;
    caja.focus();
  }
  function engancharEdicion(f) {
    let d;
    try { d = f.contentDocument; } catch { return; }
    if (!d || !d.head || d.__edEnganchado) return;
    d.__edEnganchado = true;
    const est = d.createElement('style');
    est.textContent = 'body.ed-on h1:hover,body.ed-on h2:hover,body.ed-on h3:hover,body.ed-on h4:hover,body.ed-on p:hover,body.ed-on blockquote:hover,body.ed-on li:hover,body.ed-on .btn:hover,body.ed-on footer span:hover{outline:2px dashed #f2b705!important;outline-offset:3px;cursor:text!important}[data-ed-sel]{outline:3px solid #0b2e83!important;outline-offset:3px;background:rgba(242,183,5,.18)!important}';
    d.head.appendChild(est);
    const marcar = () => d.body && d.body.classList.toggle('ed-on', $('#vEditar').checked);
    marcar();
    /* Barra flotante sobre cada tarjeta repetida: quitar o agregar con un clic */
    const barra = d.createElement('div');
    barra.id = 'ed-barra';
    barra.style.cssText = 'position:absolute;z-index:99999;display:none;gap:6px;font:600 13px system-ui,sans-serif';
    barra.innerHTML = '<button data-a="quitar" style="all:unset;cursor:pointer;background:#b42318;color:#fff;padding:6px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3)">✕ Quitar</button>'
      + '<button data-a="agregar" style="all:unset;cursor:pointer;background:#0b2e83;color:#fff;padding:6px 10px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.3)">＋ Agregar otro</button>';
    d.body.appendChild(barra);
    let actual = null;
    const firma = (n) => n.tagName + '.' + (typeof n.className === 'string' ? n.className.split(/\s+/)[0] : '');
    const cajaDe = (el) => {
      for (let n = el, i = 0; n && n !== d.body && i < 9; n = n.parentElement, i++) {
        if (n.tagName === 'SECTION' || !n.parentElement) break;
        const hermanos = [...n.parentElement.children].filter((h) => firma(h) === firma(n));
        if (hermanos.length >= 2) return n;
      }
      return null;
    };
    const itemDe = (caja) => {
      for (const t of caja.querySelectorAll('h1,h2,h3,h4,p,span,b,strong,figcaption,small')) {
        const buscado = normTxt(t.textContent);
        if (!buscado) continue;
        const hallados = [];
        buscarTexto(ESTADO.datos, '', buscado, hallados);
        for (const ruta of hallados) {
          const partes = ruta.split('.');
          let i = partes.length - 1;
          while (i >= 0 && !/^\d+$/.test(partes[i])) i--;
          if (i > 0) return { arr: partes.slice(0, i).join('.'), idx: parseInt(partes[i], 10) };
        }
      }
      return null;
    };
    d.addEventListener('mouseover', (e) => {
      if (!$('#vEditar').checked) { barra.style.display = 'none'; return; }
      if (e.target.closest && e.target.closest('#ed-barra')) return;
      const caja = e.target.nodeType === 1 ? cajaDe(e.target) : null;
      const it = caja && itemDe(caja);
      if (!it) { barra.style.display = 'none'; actual = null; return; }
      actual = it;
      const r = caja.getBoundingClientRect();
      barra.style.display = 'flex';
      barra.style.top = (r.top + d.defaultView.scrollY + 8) + 'px';
      barra.style.left = Math.max(4, r.right + d.defaultView.scrollX - barra.offsetWidth - 8) + 'px';
    });
    d.addEventListener('click', (e) => {
      const bt = e.target.closest && e.target.closest('#ed-barra button');
      if (!bt) return;
      e.preventDefault(); e.stopPropagation();
      barra.style.display = 'none';
      if (actual) accionTarjeta(bt.dataset.a, actual);
    }, true);
    d.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('#ed-barra')) return;
      if (!$('#vEditar').checked) return;
      e.preventDefault(); e.stopPropagation();
      let el = e.target.nodeType === 1 ? e.target : e.target.parentElement;
      for (let i = 0; el && i < 5 && el !== d.body; i++, el = el.parentElement) {
        const buscado = normTxt(el.textContent);
        if (!buscado) continue;
        const hallados = [];
        buscarTexto(ESTADO.datos, '', buscado, hallados);
        if (hallados.length) { abrirEdicion(hallados[0], el); return; }
      }
      /* No es un texto editable directo: se lleva a la sección que corresponde */
      const sec = (e.target.closest && e.target.closest('section[id]')) || null;
      const id = sec && Object.keys(ANCLAS).find((k) => ANCLAS[k] === sec.id);
      cerrarEdicion();
      if (id) { aviso('Eso se cambia en la sección «' + SECCIONES.find((x) => x.id === id).nombre + '» del menú.', 'ok'); ir(id); }
      else aviso('Eso no se puede editar tocándolo. Búscalo en el menú de la izquierda.', 'ok');
    }, true);
    $('#vEditar')._marcar = marcar;
  }

  function iniciarVivo() {
    if (vivoInicializado || !$('#vTab')) return;
    vivoInicializado = true;
    vivoAbierto = window.innerWidth >= 1100 && lsVivo.leer();
    $('#vTab').addEventListener('click', () => { vivoAbierto = true; if (window.innerWidth >= 1100) lsVivo.poner(true); pintarVivo(); cargarVivo(false); });
    $('#vOcul').addEventListener('click', () => { cerrarEdicion(); vivoAbierto = false; lsVivo.poner(false); pintarVivo(); });
    $('#vAct').addEventListener('click', () => { guardarBorrador(); cargarVivo(true); });
    $('#vDisp').addEventListener('click', () => $('#vMarco').classList.toggle('movil'));
    $('#vEditar').addEventListener('change', () => { try { $('#vFrame').contentDocument.body.classList.toggle('ed-on', $('#vEditar').checked); } catch { /* ignorar */ } if (!$('#vEditar').checked) cerrarEdicion(); });
    $('#vEdTexto').addEventListener('input', () => {
      if (!edicion) return;
      const v = $('#vEdTexto').value;
      asignar(edicion.ruta, v);                     /* queda en el borrador */
      try { edicion.el.textContent = v.replace(/<[^>]*>/g, '').replace(/[*]/g, ''); } catch { /* ignorar */ } /* se ve al instante */
    });
    $('#vEdCerrar').addEventListener('click', cerrarEdicion);
    $('#vUndoBtn').addEventListener('click', deshacerQuitar);
    $('#vEdTexto').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); cerrarEdicion(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && vivoAbierto && window.innerWidth < 1100) { vivoAbierto = false; pintarVivo(); } });
    pintarVivo();
    if (vivoAbierto && seccionEsWeb()) cargarVivo(false);
  }

  function pintarSeccion() {
    const s = SECCIONES.find((x) => x.id === ESTADO.seccion) || SECCIONES[0];
    const nomFacil = NAVFACIL[s.id] ? NAVFACIL[s.id][0] : s.titulo;
    $('#barraTitulo').textContent = nomFacil;

    const lienzo = $('#lienzo');
    lienzo.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'panel activo';
    panel.innerHTML = `<div class="panel__cab">
      <h2>${esc(nomFacil)}</h2>
      ${(FACIL[s.id] || s.bajada) ? `<p>${FACIL[s.id] || s.bajada}</p>` : ''}
      ${GUIA[s.id] ? '<div class="panel__guia"><b>Cómo se hace, paso a paso</b><ol>' + GUIA[s.id].map((t) => '<li>' + esc(t) + '</li>').join('') + '</ol></div>' : ''}
      ${NAVFACIL[s.id] && !GUIA[s.id] && s.grupo !== 'Administración' ? '<p class="panel__pista">💡 Cambia lo que quieras. Al terminar, toca <b>Publicar</b> (arriba a la derecha) para que se vea en la página. Si no publicas, la página no cambia.</p>' : ''}
    </div>`;
    lienzo.appendChild(panel);

    if (s.pintar) { s.pintar(panel); return; }

    /* Lo que se edita a diario va primero; el encabezado de la sección queda al final */
    const rango = (t) => (['Encabezado', 'Textos'].includes(t.titulo) ? 2 : t.repetidor ? 0 : 1);
    [...(s.tarjetas || [])].sort((a, b) => rango(a) - rango(b)).forEach((t) => {
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

  /* ─── Publicar con la cuenta (sin token) ─── */
  async function publicarConCuenta() {
    const salida = $('#cuentaSalida');
    const boton = $('#btnCuentaPublicar');
    boton.disabled = true;
    salida.innerHTML = mensaje('info', 'Publicando…', 'Subiendo los cambios a la página.');
    try {
      const r = await fetch('/api/publicar', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivos: archivos().map((f) => ({ ruta: f.ruta, texto: f.texto })) })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || ('Error ' + r.status));
      marcarPublicado();
      salida.innerHTML = mensaje('ok', '¡Publicado!',
        'Los cambios ya están en camino: en uno o dos minutos se ven en clta.cl (recarga con Ctrl + F5).');
      aviso('Cambios publicados.');
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

    aplicarPref();
    const prefs = leerPref();
    /* Al entrar al panel siempre se ve primero el Inicio, sin importar dónde se quedó la vez anterior */
    ESTADO.seccion = 'inicio';
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignorar */ }
    pintarNav();
    revisarMensajesNuevos();
    pintarSeccion();
    pintarEstado();
    iniciarVivo();

    $('#btnPublicar').addEventListener('click', abrirPublicar);
    $('#btnMenu').addEventListener('click', () => document.body.classList.toggle('menu-abierto'));
    $$('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrarPublicar));
    $('#veloPublicar').addEventListener('click', (e) => { if (e.target.id === 'veloPublicar') cerrarPublicar(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarPublicar(); });

    $$('#pestanasPublicar button').forEach((b) => b.addEventListener('click', () => {
      $$('#pestanasPublicar button').forEach((o) => o.classList.toggle('activo', o === b));
      $('#tabDescargar').classList.toggle('oculto', b.dataset.tab !== 'descargar');
      $('#tabGithub').classList.toggle('oculto', b.dataset.tab !== 'github');
      $('#tabCuenta').classList.toggle('oculto', b.dataset.tab !== 'cuenta');
    }));

    // Si la persona entró con su correo (Cloudflare Access), se publica sin token.
    fetch('/api/sesion', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.email) return;
        $('#cuentaCorreo').textContent = ' como ' + j.email;
        $('#pestanaCuenta').classList.remove('oculto');
        $('#pestanaCuenta').click();
        const pg = document.querySelector('#pestanasPublicar [data-tab="github"]');
        if (pg) pg.classList.add('oculto');
      })
      .catch(() => { /* sin sesión: quedan los otros métodos */ });
    $('#btnCuentaPublicar').addEventListener('click', publicarConCuenta);

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
      if (!ESTADO.sucio || window.__saliendo) return;
      e.preventDefault();
      e.returnValue = '';
    });

    // La vista previa siempre debe abrir el borrador más reciente.
    const bSalir = $('#btnSalirBarra'); if (bSalir) bSalir.addEventListener('click', salirDelPanel);
    const bLetra = $('#btnLetra'); if (bLetra) bLetra.addEventListener('click', cambiarLetra);
    $('#btnVista').addEventListener('click', () => {
      ALMACEN.guardarChico('borrador', ESTADO.datos);
      ALMACEN.guardarChico('borradorIg', ESTADO.instagram);
      ALMACEN.guardar('imagenes', ESTADO.imagenes).catch(() => {});
    });
  }

  // Si la persona ya entró con su correo (Cloudflare Access), no hace falta una segunda clave.
  fetch('/api/sesion', { credentials: 'same-origin', cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { if (j && j.email) { try { sessionStorage.removeItem('accesoReintento'); } catch (e) {} entrar(); } else sinSesion(); })
    .catch(sinSesion);

  // En clta.cl el panel solo se abre con la sesión del correo. Si el navegador mostró una copia guardada
  // sin pasar por Cloudflare, se pide la página de nuevo (una sola vez) para que aparezca el ingreso por correo.
  function sinSesion() {
    const enSitio = /(^|\.)clta\.cl$/.test(location.hostname);
    let probado = false;
    try { probado = !!sessionStorage.getItem('accesoReintento'); } catch (e) { probado = true; }
    if (enSitio && !probado) {
      try { sessionStorage.setItem('accesoReintento', '1'); } catch (e) { /* sin almacenamiento */ }
      location.replace('/admin.html?r=' + Date.now());
      return;
    }
    iniciarCandado();
  }
})();
