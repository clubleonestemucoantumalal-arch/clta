/* =========================================================================
   FUSION.JS — APLICAR LOS CAMBIOS DEL PANEL SOBRE LO YA PUBLICADO
   -------------------------------------------------------------------------
   Al publicar, el panel no debe reemplazar el sitio con su borrador: debe
   tomar lo que está publicado AHORA y aplicarle solo los cambios hechos en
   este panel. Se compara con tres versiones:

     base   = lo publicado cuando se empezó a editar (punto de partida)
     mio    = lo que hay en este panel
     actual = lo publicado ahora mismo (puede traer cambios de otra persona)

   Reglas:
     · Lo que solo cambió otra persona (o el asistente), se conserva.
     · Lo que solo cambié yo, se aplica.
     · Si ambos cambiaron lo mismo, gana lo mío.
     · Lo que yo quité (y estaba en la base) se quita; lo que otra persona
       agregó y yo no conozco, se conserva.
     · Sin base (borrador antiguo) NUNCA se borra nada: se juntan ambos lados.
   ========================================================================= */
(function (raiz) {
  'use strict';

  const esObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* Identidad de un elemento de una lista, para reconocerlo aunque cambie de lugar */
  function clave(x) {
    if (!esObj(x)) return 'v:' + JSON.stringify(x);
    if (x.idLions) return 'l:' + x.idLions;
    if (x.id) return 'i:' + x.id;
    if (x.titulo) return 't:' + x.titulo + '|' + (x.fecha || '');
    if (x.nombre) return 'n:' + x.nombre;
    return 'j:' + JSON.stringify(x);
  }

  function mapa(lista) {
    const m = new Map();
    for (const x of lista) {
      const k = clave(x);
      if (m.has(k)) return null;       // claves repetidas: no se puede reconocer cada elemento
      m.set(k, x);
    }
    return m;
  }

  function fusionarLista(base, mio, actual) {
    const bM = base === undefined ? new Map() : mapa(base);
    const mM = mapa(mio), aM = mapa(actual);
    if (!mM || !aM || !bM) {            // listas sin identidad clara: se trata como un solo valor
      if (base !== undefined && igual(mio, base)) return actual;
      return mio;
    }
    const hayBase = base !== undefined;
    const sale = new Set();
    const res = new Map();

    for (const [k, m] of mM) {
      if (aM.has(k)) {
        res.set(k, fusionar(bM.get(k), m, aM.get(k)));
      } else if (bM.has(k)) {
        /* otra persona lo quitó: se quita, salvo que yo lo haya modificado */
        if (!igual(m, bM.get(k))) res.set(k, m); else sale.add(k);
      } else {
        res.set(k, m);                  // lo agregué yo
      }
    }
    for (const [k, a] of aM) {
      if (mM.has(k)) continue;
      /* yo lo quité: se quita, salvo que otra persona lo haya modificado. Sin base se conserva. */
      if (hayBase && bM.has(k)) { if (!igual(a, bM.get(k))) res.set(k, a); }
      else res.set(k, a);               // lo agregó otra persona
    }

    /* Orden: el de este panel; lo nuevo de otra persona se coloca junto a su vecino en lo publicado */
    const orden = [...mM.keys()].filter((k) => res.has(k));
    const nuevos = [...aM.keys()].filter((k) => res.has(k) && !mM.has(k));
    const aKeys = [...aM.keys()];
    for (const k of nuevos) {
      let pos = -1;
      for (let i = aKeys.indexOf(k) - 1; i >= 0; i--) {
        const p = orden.indexOf(aKeys[i]);
        if (p >= 0) { pos = p; break; }
      }
      orden.splice(pos + 1, 0, k);
    }
    return orden.map((k) => res.get(k));
  }

  function fusionar(base, mio, actual) {
    if (mio === undefined) return actual;
    if (actual === undefined) return mio;
    if (esObj(mio) && esObj(actual)) return fusionarObjeto(esObj(base) ? base : undefined, mio, actual);
    if (Array.isArray(mio) && Array.isArray(actual)) return fusionarLista(Array.isArray(base) ? base : undefined, mio, actual);
    if (igual(mio, actual)) return mio;
    if (base !== undefined && igual(mio, base)) return actual;   // yo no lo toqué
    return mio;                                                    // lo toqué yo
  }

  function fusionarObjeto(base, mio, actual) {
    const hayBase = base !== undefined;
    const b = base || {};
    const claves = [...Object.keys(actual), ...Object.keys(mio).filter((k) => !(k in actual))];
    const out = {};
    for (const k of claves) {
      const enM = k in mio, enA = k in actual, enB = hayBase && k in b;
      if (enM && enA) { out[k] = fusionar(b[k], mio[k], actual[k]); continue; }
      if (enM) {                         // falta en lo publicado
        if (enB && igual(mio[k], b[k])) continue;   // otra persona lo quitó y yo no lo toqué
        out[k] = mio[k]; continue;
      }
      // falta en mi panel
      if (enB && igual(actual[k], b[k])) continue;  // yo lo quité y nadie más lo tocó
      if (enB) continue;                 // yo lo quité (otra persona lo modificó): gana la quita
      out[k] = actual[k];                // lo agregó otra persona
    }
    return out;
  }

  /* Resumen en palabras de lo que trajo la fusión desde lo publicado */
  function resumen(mio, fusionado) {
    const partes = [];
    const nombre = { proyectos: 'proyectos de terreno', articulos: 'artículos', aliados: 'aliados', directiva: 'directiva', testimonios: 'testimonios' };
    for (const k of Object.keys(nombre)) {
      const a = Array.isArray(mio && mio[k]) ? mio[k] : [], f = Array.isArray(fusionado && fusionado[k]) ? fusionado[k] : [];
      const ka = new Set(a.map(clave)), kf = new Set(f.map(clave));
      const mas = [...kf].filter((x) => !ka.has(x)).length;
      if (mas) partes.push(mas + ' de ' + nombre[k]);
    }
    return partes;
  }

  const API = { fusionar, resumen, clave };
  raiz.FUSION = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
