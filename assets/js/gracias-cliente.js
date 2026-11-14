/**
 * gracias-cliente.js — páginas /gracias-sesion, /gracias-plan, /gracias-jornada, /gracias-reunion.
 * Con los datos que el cliente dio UNA vez en Cal.com (guardados por tracking.js):
 *  1. saluda por su nombre y fecha,
 *  2. arma el mensaje de WhatsApp con todo el detalle (paquete, pago, datos),
 *  3. pone un botón flotante con la siguiente acción,
 *  4. pliega las listas largas en celular para no hacer tanto scroll.
 */
(function () {
  'use strict';
  var path = location.pathname;
  var tipo = /plan/.test(path) ? 'plan' : /jornada/.test(path) ? 'jornada' : /reunion/.test(path) ? 'reunion' : 'sesion';
  var NOMBRE = { plan: 'plan mensual', jornada: 'jornada', sesion: 'sesión de fotos', reunion: 'reunión' };

  function ls(k) { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cuando() {
    var r = ls('eg_reunion_v1'), d = r.inicio && new Date(r.inicio);
    if (!d || isNaN(d)) return '';
    return d.toLocaleString('es-BO', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: 'America/La_Paz' });
  }
  function el(id) { return document.getElementById(id); }

  // ── 1. Saludo con nombre y fecha ──
  function saludar() {
    var c = ls('eg_contrato_v1'), nom = (c.nombre || '').trim().split(/\s+/)[0];
    var sub = document.querySelector('p.sub');
    if (!nom || !sub || ls('eg_contrato_firmado').nombre) return; // si ya firmó, la página ya tiene su propio texto
    var f = cuando();
    sub.innerHTML = tipo === 'reunion'
      ? 'Gracias, <b>' + esc(nom) + '</b>. Te llegó un correo de Cal.com con los detalles.' + (f ? ' Te esperamos el <b>' + esc(f) + '</b>' : '')
      : 'Gracias, <b>' + esc(nom) + '</b>, por agendar tu ' + NOMBRE[tipo] + (f ? ' (<b>' + esc(f) + '</b>)' : '') + '. Aquí abajo puedes firmar tu contrato; el adelanto se hace justo después.';
  }

  // ── 2. Mensajes de WhatsApp con todo el detalle ──
  function misDatos() {
    var c = ls('eg_contrato_v1'), L = [];
    if (c.email) L.push('- Correo: ' + c.email);
    if (c.whatsapp) L.push('- WhatsApp: ' + (c.whatsappPais || '+591') + ' ' + c.whatsapp);
    if (c.direccion) L.push('- Ubicación: ' + c.direccion);
    return L.length ? '\n\n*Mis datos*\n' + L.join('\n') : '';
  }
  function quien() {
    var c = ls('eg_contrato_v1');
    return c.nombre ? 'Soy ' + c.nombre + (c.negocio ? ' de ' + c.negocio : '') + '. ' : '';
  }
  function texto(node) { return node ? node.innerText.replace(/\s*\n\s*/g, ' · ').trim() : ''; }
  function mensajeComprobante() {
    var notas = window.EG && window.EG.notasReserva ? window.EG.notasReserva() : '';
    var f = cuando();
    return '¡Hola, Pablo! ' + quien() + 'Ya hice el depósito de mi ' + NOMBRE[tipo] + ', te envío el comprobante 📸' +
      '\n\n*Pago*\n- Total: ' + texto(el('payPrecioTotal')) + '\n- Pagué ahora: ' + texto(el('payMonto')) + ' (' + texto(el('payLabel')).replace(/^PAGAS AHORA · /, '') + ')' +
      (notas ? '\n\n*Mi paquete*\n' + notas : '') + (f ? '\n\n*Fecha*\n' + f : '') + misDatos();
  }
  function mensajeReunion() {
    var f = cuando();
    return '¡Hola, Pablo! ' + quien() + 'Agendé una reunión de diagnóstico' + (f ? ' para el ' + f : '') + ' y quiero confirmar mi asistencia ☕' + misDatos();
  }
  function armarWA() {
    var wa = document.querySelector('.track-wa-comprobante'), conf = document.querySelector('.track-wa-confirm');
    if (wa) wa.href = 'https://api.whatsapp.com/send?phone=+59169422335&text=' + encodeURIComponent(mensajeComprobante());
    if (conf) conf.href = 'https://api.whatsapp.com/send?phone=+59169422335&text=' + encodeURIComponent(mensajeReunion());
  }

  // ── 3. Botón flotante con la siguiente acción ──
  function flotante() {
    var contrato = el('egContratoBtn');
    if (!contrato) return;
    var bar = document.createElement('div');
    bar.className = 'eg-float-cta';
    bar.hidden = true;
    var b = document.createElement('button');
    b.type = 'button';
    bar.appendChild(b);
    document.body.appendChild(bar);
    document.body.classList.add('has-float-cta');
    var visibles = {};
    function destino() {
      var pay = el('egPayCard'), wa = document.querySelector('.track-wa-comprobante');
      return pay && wa && getComputedStyle(pay).display !== 'none' ? wa : contrato;
    }
    function pintar() {
      var d = destino();
      b.textContent = d === contrato ? contrato.textContent.trim() : 'Ya pagué: enviar comprobante';
      bar.hidden = !!visibles[d.id || d.className];
      b.onclick = function () { armarWA(); d.click(); };
    }
    var io = 'IntersectionObserver' in window && new IntersectionObserver(function (es) {
      es.forEach(function (e) { visibles[e.target.id || e.target.className] = e.isIntersecting; });
      pintar();
    });
    [contrato, document.querySelector('.track-wa-comprobante')].forEach(function (n) { if (n && io) io.observe(n); });
    var pay = el('egPayCard');
    if (pay && window.MutationObserver) new MutationObserver(pintar).observe(pay, { attributes: true, attributeFilter: ['style'] });
    pintar();
  }

  // ── 4. Listas plegables en celular ──
  function plegar(lista, etiqueta) {
    if (!lista || !window.matchMedia('(max-width:720px)').matches) return;
    var t = document.createElement('button');
    t.type = 'button';
    t.className = 'eg-toggle';
    t.textContent = etiqueta;
    t.setAttribute('aria-expanded', 'false');
    lista.classList.add('eg-colapsada');
    t.onclick = function () {
      var abierta = lista.classList.toggle('eg-colapsada') === false;
      t.setAttribute('aria-expanded', String(abierta));
      t.classList.toggle('abierto', abierta);
    };
    lista.parentNode.insertBefore(t, lista);
  }

  function iniciar() {
    saludar();
    armarWA();
    flotante();
    plegar(el('benefitsList'), 'Ver qué incluye');
    plegar(document.querySelector('.gx-list'), 'Cómo aprovechar la reunión');
    var wa = document.querySelector('.track-wa-comprobante');
    if (wa) wa.addEventListener('click', armarWA);
  }
  window.addEventListener('eg-cliente', function () { saludar(); armarWA(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
