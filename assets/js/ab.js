/* Pruebas A/B para sitios estáticos. Ver ecosistema/ab-kit/README.md.
   AB.variant('id-de-prueba')        devuelve 'a' o 'b', siempre la misma para el mismo visitante, y anota la visita.
   AB.convert('whatsapp')            anota la conversión (una por visitante y prueba) en las pruebas activas de esta página. */
(function (w) {
  'use strict';
  var active = {}, LS = null;
  try { LS = w.localStorage; LS.setItem('ab:t', '1'); LS.removeItem('ab:t'); } catch (e) { LS = null; }
  var bot = !LS || navigator.webdriver || /bot|crawl|spider|lighthouse|headless|preview/i.test(navigator.userAgent);

  function vid() {
    var v = LS.getItem('ab:vid');
    if (!v) { v = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); LS.setItem('ab:vid', v); }
    return v;
  }
  // Cada evento se manda una sola vez por visitante: la marca queda en localStorage y el servidor además ignora repetidos.
  function send(test, variant, ev) {
    var flag = 'ab:s:' + test + ':' + ev;
    if (bot || LS.getItem(flag)) return;
    LS.setItem(flag, '1');
    var body = JSON.stringify({ t: test, v: variant, e: ev, vid: vid() });
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon('/.netlify/functions/ab-event', body))) {
        fetch('/.netlify/functions/ab-event', { method: 'POST', body: body, keepalive: true });
      }
    } catch (e) {}
    try { if (w.gtag) w.gtag('event', 'ab_' + ev.split(':')[0], { ab_test: test, ab_variant: variant }); } catch (e) {}
  }

  w.AB = {
    variant: function (test, variants) {
      variants = variants || ['a', 'b'];
      if (bot) return variants[0];
      // ?ab=id-de-prueba:b fuerza una variante para revisarla sin contar como visita.
      var forced = (location.search.match(/[?&]ab=([a-z0-9-]+):([a-z])/) || []);
      if (forced[1] === test && variants.indexOf(forced[2]) > -1) return forced[2];
      var v = LS.getItem('ab:' + test);
      if (variants.indexOf(v) < 0) { v = variants[Math.floor(Math.random() * variants.length)]; LS.setItem('ab:' + test, v); }
      active[test] = v;
      send(test, v, 'view');
      return v;
    },
    convert: function (goal) {
      for (var t in active) send(t, active[t], 'convert:' + (goal || 'principal'));
    },
    active: active
  };
})(window);
