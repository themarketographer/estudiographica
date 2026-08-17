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

  // ─────────────────────────────────────────────
  // API pública
  // ─────────────────────────────────────────────
  EG.trackEvent = trackEvent;
  EG.trackCustomEvent = trackCustomEvent;
  EG.trackClick = trackClick;
  EG.getOrigen = getOrigen;
  EG.getTipo = getTipo;
  EG.generateEventId = generateEventId;
  EG.prepareCalBooking = prepareCalBooking;

})(window.EG);
