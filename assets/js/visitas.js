/* Cuenta una visita por página y por día en la base del club (sin cookies ni datos personales).
   No cuenta: la vista previa del panel, el computador del propio club (localhost) ni los robots. */
(function () {
  try {
    if (window.top !== window.self) return;
    if (/[?&](borrador|vivo)=/.test(location.search)) return;
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    if (localStorage.getItem('antumalal.sinConteo') === '1') return;
    var hoy = new Date().toISOString().slice(0, 10), ruta = location.pathname.replace(/index\.html$/, '') || '/';
    var marca = 'antumalal.v.' + ruta;
    if (localStorage.getItem(marca) === hoy) return;           /* una vez por página y por día */
    localStorage.setItem(marca, hoy);
    var vid = localStorage.getItem('antumalal.vid');
    if (!vid) { vid = Math.random().toString(36).slice(2, 12); localStorage.setItem('antumalal.vid', vid); }
    var cuerpo = JSON.stringify({ r: ruta, ref: document.referrer, v: vid });
    if (navigator.sendBeacon) navigator.sendBeacon('/p/visita', new Blob([cuerpo], { type: 'application/json' }));
    else fetch('/p/visita', { method: 'POST', body: cuerpo, keepalive: true, headers: { 'Content-Type': 'application/json' } });
  } catch (e) { /* el conteo nunca debe romper la página */ }
})();
