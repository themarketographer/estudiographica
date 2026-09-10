/**
 * funnel-ux.js — Estudio Graphica
 * FUENTE ÚNICA para la barra de progreso del flujo de reserva y el aviso de
 * "retomar donde quedaste". Antes esto estaba a medias: /contrato tenía su
 * propio stepper hardcodeado en HTML (siempre marcaba "Diagnóstico" y
 * "Reserva" como hechos, aunque el cliente nunca haya agendado el
 * diagnóstico gratuito) y /precios y /gracias-sesion no tenían ninguno. Este
 * archivo centraliza esa lógica para que:
 *
 *   1. El paso marcado como "hecho" sea siempre verdad (no un check
 *      decorativo) — se calcula según el camino real del visitante.
 *   2. La misma barra aparezca en TODAS las páginas del flujo
 *      (/precios, /contrato, /gracias-sesion, /gracias-plan), así el
 *      cliente siempre sabe en qué paso está y cuántos faltan.
 *
 * Camino del visitante (localStorage 'eg_flow_path'):
 *   'diagnostico' → pasó por la llamada gratuita en /empezar antes de armar
 *                   su paquete → 4 pasos: Diagnóstico, Reserva, Contrato, Pago.
 *   'directo'     → (valor por defecto si nunca se guardó nada, ej. alguien
 *                   que llega directo a /precios desde un anuncio) → 3
 *                   pasos: Reserva, Contrato, Pago.
 *
 * /empezar guarda este valor cuando el visitante elige un camino ahí; si
 * nunca pasó por /empezar, no hay nada que guardar y el default 'directo'
 * es el correcto (la mayoría de la gente arma su paquete sin pedir la
 * llamada gratuita antes).
 */
window.EGFlowSteps = (function () {
  'use strict';

  var LS_PATH = 'eg_flow_path';

  function getPath() {
    try { return localStorage.getItem(LS_PATH) || 'directo'; } catch (e) { return 'directo'; }
  }
  function setPath(p) {
    try { localStorage.setItem(LS_PATH, p); } catch (e) {}
  }

  var STEP_LABELS = {
    diagnostico: 'Diagnóstico',
    reserva: 'Paquete y reserva',
    contrato: 'Contrato',
    pago: 'Pago',
  };

  function stepsForPath(path) {
    return path === 'diagnostico'
      ? ['diagnostico', 'reserva', 'contrato', 'pago']
      : ['reserva', 'contrato', 'pago'];
  }

  // Pinta la barra de progreso dentro de `container` (elemento o id),
  // marcando `currentKey` ('reserva' | 'contrato' | 'pago' | 'diagnostico')
  // como el paso actual. Devuelve { index, total } (1-based) por si la
  // página necesita mostrar un texto tipo "Paso 2 de 3".
  function render(container, currentKey, opts) {
    opts = opts || {};
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return null;

    var path = opts.path || getPath();
    var keys = stepsForPath(path);
    var currentIdx = keys.indexOf(currentKey);
    if (currentIdx === -1) currentIdx = 0;

    container.innerHTML = keys.map(function (key, i) {
      var cls = 'step';
      var numContent = i + 1;
      if (i < currentIdx) { cls += ' done'; numContent = '✓'; }
      else if (i === currentIdx) { cls += ' current'; }
      return '<div class="' + cls + '"><div class="step-num">' + numContent + '</div>' +
        '<div class="step-label">' + STEP_LABELS[key] + '</div></div>';
    }).join('');

    container.setAttribute('role', 'list');
    container.setAttribute('aria-label', 'Paso ' + (currentIdx + 1) + ' de ' + keys.length + ': ' + STEP_LABELS[keys[currentIdx]]);

    return { index: currentIdx + 1, total: keys.length };
  }

  // Aviso reutilizable de "tienes un proceso a medias" — misma lógica que
  // ya usaba /empezar, ahora disponible en cualquier página del flujo.
  function renderRetomar(container) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return;
    try {
      var firmado = JSON.parse(localStorage.getItem('eg_contrato_firmado') || 'null');
      var borrador = JSON.parse(localStorage.getItem('eg_contrato_v1') || 'null');
      var paquete = JSON.parse(localStorage.getItem('eg_paquete_v1') || 'null');
      var txt, href, cta;

      if (firmado) {
        txt = '<b>Ya firmaste tu contrato.</b> Solo falta el adelanto para apartar tu fecha.';
        href = firmado.tipo === 'plan' ? '/gracias-plan/' : '/gracias-sesion/';
        cta = 'Ir al pago →';
      } else if (borrador && borrador.nombre) {
        txt = '<b>Tienes tu contrato a medio llenar.</b> Retómalo donde lo dejaste.';
        href = '/contrato/';
        cta = 'Seguir firmando →';
      } else if (paquete && paquete.precio) {
        txt = '<b>Ya armaste un paquete</b> de Bs. ' + paquete.precio + '. ¿Seguimos con el contrato?';
        href = '/contrato/';
        cta = 'Firmar contrato →';
      } else {
        return;
      }

      container.innerHTML = '<span class="eg-retomar-icon">📄</span>' +
        '<span class="eg-retomar-txt">' + txt + '</span>' +
        '<a class="eg-retomar-link" href="' + href + '">' + cta + '</a>';
      container.classList.add('show');
    } catch (e) {}
  }

  return {
    getPath: getPath,
    setPath: setPath,
    stepsForPath: stepsForPath,
    render: render,
    renderRetomar: renderRetomar,
  };
})();
