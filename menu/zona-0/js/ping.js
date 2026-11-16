/* Zona 0 · timbre. Pregunta "¿hay algo nuevo?" a una dirección que la red de Netlify guarda 10 minutos
   y borra sola cuando entra un pedido o cambia uno. Esas visitas no gastan llamadas a funciones.
   Z0Ping.check() devuelve { v, open }, o null si no hay timbre (entonces la pantalla consulta de la forma clásica, más lenta). */
(function () {
  'use strict';
  var key = '';
  function hex(buf) { return [].map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  window.Z0Ping = {
    setToken: function (t) {
      key = '';
      if (!t || !window.crypto || !crypto.subtle) return Promise.resolve();
      return crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t).trim())).then(function (b) { key = hex(b); }).catch(function () {});
    },
    /* Decide qué hacer tras preguntar al timbre. st = { v, full, at, settle } (estado de la pantalla), p = respuesta del timbre.
       Netlify puede tardar hasta ~60 s en mostrar datos recién guardados, así que después de cada cambio se sigue consultando cada 15 s durante 65 s.
       Devuelve '' (nada), 'load' (traer lo nuevo) o 'full' (recargar todo, cada 5 min por seguridad; 15 min si el local está cerrado). */
    plan: function (st, p) {
      var now = Date.now(), changed = p.v !== st.v;
      if (changed) st.settle = now + 65000;
      if (now - st.full >= (p.open === false ? 900000 : 300000)) return 'full';
      if (changed || (now < st.settle && now - st.at >= 14000)) return 'load';
      return '';
    },
    done: function (st, p, plan) { st.v = p.v; st.at = Date.now(); if (plan === 'full') st.full = st.at; },
    check: function () {
      if (!key) return Promise.resolve(null);
      return fetch('/api/zona0/ping/' + key, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return d && d.ok ? d : null; })
        .catch(function () { return null; });
    }
  };
})();
