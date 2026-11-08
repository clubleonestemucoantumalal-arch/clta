/* Cuenta las visitas a la página del club, sin cookies ni datos personales.
   - Una visita por dispositivo y por día (aunque recargue o entre muchas veces).
   - Qué páginas y qué secciones de la portada se miran (una vez por dispositivo y por día).
   No cuenta: la vista previa del panel, el computador del propio club (localhost) ni los robots. */
(function () {
  try {
    if (window.top !== window.self) return;
    if (/[?&](borrador|vivo)=/.test(location.search)) return;
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    var LS = window.localStorage;
    if (LS.getItem('antumalal.sinConteo') === '1') return;

    var hoy = new Date().toISOString().slice(0, 10);
    var ruta = location.pathname.replace(/index\.html$/, '') || '/';
    var vid = LS.getItem('antumalal.vid');
    if (!vid) { vid = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); LS.setItem('antumalal.vid', vid); }

    /* Manda el dato una sola vez por día para cada «clave» (visita, página o sección) */
    function enviar(tipo, lugar) {
      var clave = 'antumalal.c.' + tipo + '.' + lugar;
      if (LS.getItem(clave) === hoy) return;
      LS.setItem(clave, hoy);
      var cuerpo = JSON.stringify({ tipo: tipo, r: lugar, ref: document.referrer, v: vid });
      if (navigator.sendBeacon) navigator.sendBeacon('/p/visita', new Blob([cuerpo], { type: 'application/json' }));
      else fetch('/p/visita', { method: 'POST', body: cuerpo, keepalive: true, headers: { 'Content-Type': 'application/json' } });
    }

    enviar('v', ruta);   /* la visita del dispositivo (cuenta 1 por día) */
    enviar('p', ruta);   /* la página que abrió */

    /* Secciones de la portada que realmente se miran */
    if (ruta === '/' && 'IntersectionObserver' in window) {
      var VER = ['club', 'impacto', 'causas', 'proyectos', 'noticias', 'agenda', 'directorio', 'testimonios', 'unete', 'dona', 'faq', 'contacto'];
      var visto = {};
      var obs = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting && !visto[e.target.id]) { visto[e.target.id] = 1; enviar('s', '#' + e.target.id); obs.unobserve(e.target); }
        });
      }, { threshold: 0.35 });
      var intentos = 0, t = setInterval(function () {
        /* la portada arma sus secciones con JavaScript: se esperan unos segundos */
        VER.forEach(function (id) { var el = document.getElementById(id); if (el && !el.__cuenta) { el.__cuenta = 1; obs.observe(el); } });
        if (++intentos > 25) clearInterval(t);
      }, 800);
    }
  } catch (e) { /* el conteo nunca debe romper la página */ }
})();
