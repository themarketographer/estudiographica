/* Zona 0 · timbre. Pregunta "¿hay algo nuevo?" a una dirección que la red de Netlify guarda 2 minutos
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
    check: function () {
      if (!key) return Promise.resolve(null);
      return fetch('/api/zona0/ping/' + key, { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return d && d.ok ? d : null; })
        .catch(function () { return null; });
    }
  };
})();
