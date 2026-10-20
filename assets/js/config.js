/* =========================================================================
   CONFIG.JS — PANEL DE CONTROL DEL SITIO
   -------------------------------------------------------------------------
   Este es el ÚNICO archivo que necesitas editar para cambiar datos de
   contacto, redes sociales, cifras de impacto y conexiones externas.
   No hace falta tocar el HTML ni el CSS.
   ========================================================================= */

window.CLUB = {

  /* ---------------------------------------------------------------
     1. IDENTIDAD DEL CLUB
     --------------------------------------------------------------- */
  identidad: {
    nombre:        "Club de Leones Temuco Antumalal",
    nombreCorto:   "Leones Antumalal",
    lema:          "Nosotros Servimos",
    lemaEn:        "We Serve",
    fundacion:     "1983-03-28",          // 28 de marzo de 1983 (dato oficial del club)
    ciudad:        "Temuco",
    region:        "La Araucanía, Chile",
    distrito:      "Distrito T-4 · Distrito Múltiple T Chile",
    proposito:     "Ir en ayuda del más necesitado."
  },

  /* ---------------------------------------------------------------
     2. CONTACTO
     Reemplaza los valores de ejemplo por los reales del club.
     --------------------------------------------------------------- */
  contacto: {
    email:      "leonestemucoantumalal@gmail.com",
    telefono:   "",
    whatsapp:   "",            // solo números, con código país, sin +
    whatsappMsg:"Hola, quiero información sobre el Club de Leones Temuco Antumalal",
    direccion:  "Centro de reuniones quincho Martin Lutero, Temuco",
    // Enlace de Google Maps para incrustar (reemplazar por la sede real)
    mapaEmbed:  "https://www.google.com/maps?q=Temuco,+La+Araucan%C3%ADa,+Chile&output=embed",
    horario:    "2° y 4° lunes de cada mes · 20:30 h"
  },

  /* ---------------------------------------------------------------
     3. REDES SOCIALES
     --------------------------------------------------------------- */
  redes: {
    instagram: "https://www.instagram.com/leonestemuco_antumalal/",
    instagramUser: "leonestemuco_antumalal",
    facebook:  "",
    youtube:   "",
    lionsOficial: "https://www.lionsclubs.org/es",
    sitioEclubhouse: "https://e-clubhouse.org/sites/temucoantumalal/"
  },

  /* ---------------------------------------------------------------
     4. FORMULARIOS
     Opciones (elige una y pon el endpoint):
       - Formspree  -> https://formspree.io/f/XXXXXXX
       - Netlify Forms -> deja "" y despliega en Netlify (ya viene el atributo)
       - Web3Forms  -> https://api.web3forms.com/submit
     Si queda vacío, el formulario abre WhatsApp con el mensaje redactado.
     --------------------------------------------------------------- */
  formulario: {
    endpoint: "",
    metodo:   "POST"
  },

  /* ---------------------------------------------------------------
     5. NOTICIAS — CONEXIÓN CON FUENTES OFICIALES
     Las noticias se generan con  scripts/fetch-noticias.mjs  hacia
     data/noticias.json (ver README). Aquí defines cómo se muestran
     y si además intenta una actualización en vivo desde el navegador.
     --------------------------------------------------------------- */
  noticias: {
    archivoLocal:  "data/noticias.json",  // generado por el script / GitHub Action
    maximo:        9,                     // cuántas mostrar en la home

    // Refresco en vivo desde el navegador (DESACTIVADO por defecto).
    // Requiere un proxy CORS de terceros: los públicos gratuitos fallan seguido
    // y ensucian la consola con errores. No hace falta: la GitHub Action ya
    // actualiza data/noticias.json dos veces al día.
    // Actívalo sólo si tienes tu propio proxy CORS confiable.
    actualizarEnVivo: false,
    proxyCors:     ""
  },

  /* ---------------------------------------------------------------
     6. INSTAGRAM — CONEXIÓN CON @leonestemuco_antumalal
     Instagram no permite leer un perfil sin API. Tienes 3 caminos,
     explicados en docs/CONECTAR-INSTAGRAM.md. Elige uno:

       A) behold.so  (RECOMENDADO, gratis, API oficial, sin marca de agua)
          Pega aquí la URL del feed JSON que te entrega Behold.
       B) LightWidget / SnapWidget / Elfsight (iframe)
          Pega aquí la URL del iframe.
       C) Sin conexión: se muestran las publicaciones de data/instagram.json
          (las cargas tú a mano). Es el modo por defecto.
     --------------------------------------------------------------- */
  instagram: {
    beholdUrl:   "",                      // A) ej: https://feeds.behold.so/XXXXXXXX
    iframeUrl:   "",                      // B) ej: https://lightwidget.com/widgets/XXXX.html
    archivoLocal:"data/instagram.json",   // C) respaldo curado
    maximo:      8
  },

  /* ---------------------------------------------------------------
     7. CIFRAS DE IMPACTO (contadores animados)
     Ajusta a las cifras reales del club.
     --------------------------------------------------------------- */
  impacto: [
    { valor: 1983, sufijo: "",  etiqueta: "Año de fundación",        formato: "plano" },
    { valor: 43,   sufijo: "+", etiqueta: "Años de servicio" },
    { valor: 35,   sufijo: "",  etiqueta: "Socios activos" },
    { valor: 120,  sufijo: "+", etiqueta: "Operativos realizados" },
    { valor: 8500, sufijo: "+", etiqueta: "Personas beneficiadas" }
  ],

  /* ---------------------------------------------------------------
     8. DATOS PARA DONACIONES
     --------------------------------------------------------------- */
  donaciones: {
    titular:  "Club de Leones Temuco Antumalal",
    rut:      "00.000.000-0",
    banco:    "Banco Estado",
    tipo:     "Cuenta Corriente",
    numero:   "000000000",
    email:    "leonestemucoantumalal@gmail.com"
  }
};
