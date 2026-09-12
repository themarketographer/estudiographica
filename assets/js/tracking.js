/**
 * tracking.js — Estudio Graphica
 * Módulo único de tracking (Meta Pixel + GA4) reusado en todas las páginas.
 *
 * IMPORTANTE: este archivo SOLO define funciones auxiliares.
 * La carga de fbq/gtag y el PageView van en un <script> inline en el <head>
 * de cada página (ver PIXEL_SNIPPET.html), porque deben ejecutarse lo antes
 * posible, antes de que este archivo externo termine de descargar.
 *
 * Uso en cualquier página, después de cargar fbq y gtag:
 *   EG.trackEvent('Lead', { content_name: 'Agendar reunión', origen: 'ads' });
 *   EG.trackClick('a.track-agendar', 'Lead', { origen: 'ads' });
 *
 * Deduplicación con CAPI (netlify/functions/cal-webhook.js):
 * el mismo event_id se genera aquí y SE DEBE reenviar en el metadata del
 * booking de Cal.com para que Meta deduplique el evento client-side (Pixel)
 * con el evento server-side (CAPI) y no cuente la conversión dos veces.
 * Ver sección "Deduplicación" más abajo.
 */

window.EG = window.EG || {};

(function (EG) {
  'use strict';

  // ─────────────────────────────────────────────
  // Utilidades
  // ─────────────────────────────────────────────

  // Genera un event_id único por evento. Se guarda en sessionStorage con
  // una clave por tipo de evento para poder reusarlo si el booking de Cal
  // ocurre en la misma sesión (necesario para la deduplicación con CAPI).
  function generateEventId(prefix) {
    var rand = Math.random().toString(36).slice(2, 10);
    var ts = Date.now();
    return (prefix || 'eg') + '_' + ts + '_' + rand;
  }

  // Lee el parámetro ?origen= de la URL actual (ads | organico).
  // Si no existe, asume 'organico' (tráfico sin parámetro = no vino de ads).
  function getOrigen() {
    var params = new URLSearchParams(window.location.search);
    return params.get('origen') || 'organico';
  }

  // Lee ?tipo= (sesion | plan) — solo relevante en páginas de precios/gracias.
  function getTipo() {
    var params = new URLSearchParams(window.location.search);
    return params.get('tipo') || null;
  }

  // ─────────────────────────────────────────────
  // fbp / fbc — para mejorar el Event Match Quality del CAPI
  // ─────────────────────────────────────────────
  // "_fbp" es la cookie que pone el propio Pixel de Meta en el navegador.
  // "_fbc" es la cookie que pone Meta cuando el visitante llega desde un
  // anuncio (o la reconstruimos desde ?fbclid= si la cookie aun no existe,
  // por ejemplo en el primer evento de la sesion). Estos dos valores son
  // las señales de coincidencia MAS fuertes para el evento server-side
  // (CAPI) — mucho mas confiables que solo correo/telefono — y hoy
  // cal-webhook.js -> capi.js NO las esta mandando. Se inyectan como
  // metadata[fbp] / metadata[fbc] al reservar, igual que eventId/origen.
  function getCookie(name) {
    try {
      var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (e) { return null; }
  }

  function getFbp() {
    return getCookie('_fbp');
  }

  function getFbc() {
    var fbc = getCookie('_fbc');
    if (fbc) return fbc;
    try {
      var params = new URLSearchParams(window.location.search);
      var fbclid = params.get('fbclid');
      if (fbclid) return 'fb.1.' + Date.now() + '.' + fbclid;
    } catch (e) { /* silencioso */ }
    return null;
  }

  // ─────────────────────────────────────────────
  // Envío de eventos (Pixel + GA4 en paralelo)
  // ─────────────────────────────────────────────

  function trackEvent(eventName, params) {
    params = params || {};
    var eventId = params.event_id || generateEventId(eventName.toLowerCase());

    // Meta Pixel
    try {
      if (typeof fbq === 'function') {
        fbq('track', eventName, params, { eventID: eventId });
      }
    } catch (e) { /* silencioso: el tracking nunca debe romper la UX */ }

    // GA4
    try {
      if (typeof gtag === 'function') {
        gtag('event', eventName, Object.assign({}, params, { event_id: eventId }));
      }
    } catch (e) { /* silencioso */ }

    // TikTok Pixel
    try {
      if (typeof ttq !== 'undefined' && ttq && typeof ttq.track === 'function') {
        ttq.track(eventName, Object.assign({}, params, { event_id: eventId }));
      }
    } catch (e) { /* silencioso */ }

    return eventId;
  }

  // Trackea un evento custom (no estándar de Meta) usando trackCustom.
  function trackCustomEvent(eventName, params) {
    params = params || {};
    var eventId = params.event_id || generateEventId(eventName.toLowerCase());
    try {
      if (typeof fbq === 'function') {
        fbq('trackCustom', eventName, params, { eventID: eventId });
      }
    } catch (e) { /* silencioso */ }
    try {
      if (typeof gtag === 'function') {
        gtag('event', eventName, Object.assign({}, params, { event_id: eventId }));
      }
    } catch (e) { /* silencioso */ }
    try {
      if (typeof ttq !== 'undefined' && ttq && typeof ttq.track === 'function') {
        ttq.track(eventName, Object.assign({}, params, { event_id: eventId }));
      }
    } catch (e) { /* silencioso */ }
    return eventId;
  }

  // Adjunta un listener de click a todos los elementos que matcheen el
  // selector, y dispara el evento indicado al hacer click.
  function trackClick(selector, eventName, extraParams, useCustom) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.addEventListener('click', function () {
        var params = Object.assign(
          { content_name: el.textContent.trim().slice(0, 80) },
          extraParams || {}
        );
        if (useCustom) trackCustomEvent(eventName, params);
        else trackEvent(eventName, params);
      });
    });
  }

  // ─────────────────────────────────────────────
  // Deduplicación con Cal.com + CAPI
  // ─────────────────────────────────────────────
  // Antes de abrir el widget de Cal, generamos un event_id y lo guardamos.
  // Lo inyectamos en la URL de Cal como parámetro "metadata[eventId]" —
  // Cal.com reenvía cualquier metadata[*] en el payload del webhook de
  // BOOKING_CREATED, así que cal-webhook.js puede leerlo y reusarlo al
  // llamar a sendCapiEvent(), logrando que Pixel (client-side) y CAPI
  // (server-side) manden el MISMO event_id → Meta deduplica automático.
  function prepareCalBooking(calNamespace, eventName) {
    var eventId = generateEventId(eventName.toLowerCase());
    try { sessionStorage.setItem('eg_last_event_id_' + calNamespace, eventId); } catch (e) {}
    return eventId;
  }

  // Lee el event_id guardado por prepareCalBooking() para un namespace de
  // Cal.com dado. Se usa en el listener de "bookingSuccessfulV2" del embed
  // (ver docs: cal.com/help/embedding/embed-events) para que el evento de
  // conversión real, disparado client-side en el momento exacto en que
  // Cal.com confirma la reserva, use el MISMO event_id que ya viaja en
  // metadata[eventId] hacia el webhook → CAPI. Mismo event_name + mismo
  // event_id = Meta lo deduplica en una sola conversión, no dos.
  function getLastEventId(calNamespace) {
    try { return sessionStorage.getItem('eg_last_event_id_' + calNamespace); } catch (e) { return null; }
  }

  // Debounce genérico: agrupa disparos seguidos (p. ej. arrastrar un
  // slider) en uno solo, "wait" ms después del último cambio. Evita
  // mandar un evento CustomizeProduct por cada pixel de arrastre.
  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait || 600);
    };
  }

  // ─────────────────────────────────────────────
  // Prefill del contrato con los datos que ya dio en Cal.com
  // ─────────────────────────────────────────────
  // Cal.com, con "Reenviar parámetros" activado en el redirect del evento,
  // manda de vuelta lo que el cliente ya escribió en el formulario de
  // reserva como query params: ?name=...&email=...&title=...&location=...
  // Como el cliente YA dio su nombre, el nombre de su negocio, su correo,
  // la dirección de la sesión y (en sesión, vía el workflow de WhatsApp;
  // en plan mensual, como pregunta propia) su WhatsApp — no tiene sentido
  // pedírselo otra vez en /contrato/. Guardamos lo que llegue en el mismo
  // localStorage que ya usa /contrato/ para restaurar un borrador
  // (eg_contrato_v1), así ese formulario lo recoge solo, sin tocar su
  // código. Nunca pisa un campo que el cliente ya haya escrito a mano ahí.
  //
  // OJO: los nombres exactos de estos parámetros dependen de cómo Cal.com
  // serializa cada tipo de pregunta — quedan confirmados recién con una
  // reserva real después de desplegar esto. Por eso se prueban varios
  // nombres candidatos por campo.
  function guardarPrefillContratoDesdeURL() {
    try {
      var p = new URLSearchParams(window.location.search);
      function primero() {
        for (var i = 0; i < arguments.length; i++) {
          var v = p.get(arguments[i]);
          if (v) return v;
        }
        return '';
      }
      // El campo "whatsapp" del contrato es solo el número LOCAL (el
      // selector de país de al lado ya pone el +591 por defecto) — si
      // Cal.com manda el número con el código de país incluido, se lo
      // quitamos para no terminar con "+591 591 69422335".
      function soloNumeroLocal(tel) {
        if (!tel) return '';
        var limpio = tel.replace(/[^\d+]/g, '');
        limpio = limpio.replace(/^\+?591/, '');
        return limpio;
      }

      var datos = {
        nombre: primero('name'),
        negocio: primero('title'),
        email: primero('email'),
        direccion: primero('location'),
        whatsapp: soloNumeroLocal(primero('aiAgentCallPhoneNumber', 'Whatsapp', 'whatsapp', 'attendeePhoneNumber')),
      };
      // Si Cal.com no mandó nada útil (visita directa, sin reserva recién
      // hecha), no tocamos el localStorage para nada.
      var hayAlgo = Object.keys(datos).some(function (k) { return datos[k]; });
      if (!hayAlgo) return;

      var actual = {};
      try { actual = JSON.parse(localStorage.getItem('eg_contrato_v1') || '{}'); } catch (e) {}
      Object.keys(datos).forEach(function (k) {
        if (datos[k] && !actual[k]) actual[k] = datos[k];
      });
      localStorage.setItem('eg_contrato_v1', JSON.stringify(actual));
    } catch (e) { /* silencioso: esto es una comodidad, no algo crítico */ }
  }

  // ─────────────────────────────────────────────
  // Detección de origen "vino del blog"
  // ─────────────────────────────────────────────
  // Evento "inicio_en_blog": se dispara en landing/precios cuando el
  // visitante llega haciendo click desde una página de /blog/* (mismo
  // dominio). Usa document.referrer, que el navegador llena solo cuando
  // la navegación fue un click real dentro del sitio (no llega vacío por
  // ?origen= de ads, ni por escribir la URL directo).
  function cameFromBlog() {
    try {
      var ref = document.referrer;
      if (!ref) return false;
      var refUrl = new URL(ref);
      return refUrl.hostname === window.location.hostname && refUrl.pathname.indexOf('/blog') === 0;
    } catch (e) { return false; }
  }

  function trackBlogReferrerIfApplicable() {
    if (cameFromBlog()) {
      trackCustomEvent('inicio_en_blog', {
        content_name: 'Llegó desde el blog',
        referrer_path: (function () { try { return new URL(document.referrer).pathname; } catch (e) { return null; } })(),
        origen: getOrigen(),
      });
    }
  }

  // ─────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────
  EG.trackEvent = trackEvent;
  EG.trackCustomEvent = trackCustomEvent;
  EG.trackClick = trackClick;
  EG.getOrigen = getOrigen;
  EG.getTipo = getTipo;
  EG.getFbp = getFbp;
  EG.getFbc = getFbc;
  EG.generateEventId = generateEventId;
  EG.prepareCalBooking = prepareCalBooking;
  EG.getLastEventId = getLastEventId;
  EG.debounce = debounce;
  EG.cameFromBlog = cameFromBlog;
  EG.trackBlogReferrerIfApplicable = trackBlogReferrerIfApplicable;
  EG.guardarPrefillContratoDesdeURL = guardarPrefillContratoDesdeURL;

})(window.EG);
