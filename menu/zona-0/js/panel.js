/* Zona 0 · panel del local. Recibe los pedidos del celular en vivo y deja registrar pedidos desde la computadora.
   Consulta barato: la primera vez trae hoy y ayer, después solo pregunta qué cambió. */
(function () {
  'use strict';
  var P = window.Zona0Pricing, S = window.Z0Spring;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; if (v === null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return ''; }
  var money = function (n) { return P.money(n, 'Bs'); };

  var KEY = 'z0.tk', token = '', menu = null, orders = {}, open = true, lastNow = 0, loadedDays = 0;
  var listeners = [], tab = 'mesas', soundOn = false, audio = null, first = true, idle = 0, lastAct = Date.now(), paused = false, timer = 0, tick = 0, toastT = 0, loadedAt = 0, pending = 0;
  var NEXT = { nuevo: 'preparando', preparando: 'listo', listo: 'entregado' };
  var LABEL = { nuevo: 'Nuevo', preparando: 'En cocina', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado' };
  var MODE = { mesa: 'Mesa', recojo: 'Para llevar', delivery: 'Delivery' };
  var BTN = { nuevo: 'Aceptar y preparar', preparando: 'Marcar listo', listo: 'Entregado' };

  function toast(msg, label, fn) {
    var t = $('#toast'); t.textContent = ''; t.appendChild(document.createTextNode(msg));
    if (label) { var b = el('button', '', label); b.type = 'button'; b.addEventListener('click', function () { t.classList.remove('on'); fn(); }); t.appendChild(b); }
    t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, label ? 7000 : 3200);
  }

  /* ---------- API ---------- */
  function api(method, body, qs) {
    return fetch('/api/zona0/orders' + (qs || ''), { method: method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (d) { d.http = r.status; return d; }); })
      .then(function (d) {
        if (d.http === 401) throw Object.assign(new Error('Clave incorrecta.'), { auth: true });
        if (d.http === 503) throw Object.assign(new Error(d.error), { auth: true });
        if (!d.ok) throw new Error(d.error || 'Error del servidor.');
        return d;
      });
  }
  function setLive(ok, text) { var l = $('#live'); l.hidden = false; l.classList.toggle('off', !ok); l.textContent = text || (ok ? 'En vivo' : 'Sin conexión, reintentando'); }

  function merge(list) {
    var fresh = 0, changed = false;
    list.forEach(function (o) {
      var old = orders[o.key];
      if (!old) { changed = true; if (!first && o.source === 'app' && o.status === 'nuevo') { fresh++; o._fresh = true; } }
      else if (JSON.stringify(old) !== JSON.stringify(o)) changed = true;
      orders[o.key] = o;
    });
    return { fresh: fresh, changed: changed };
  }
  function load(days) {
    var url = days || !lastNow ? '?days=' + (days || 2) : '?since=' + Math.max(0, lastNow - 20000);
    return api('GET', null, url).then(function (d) {
      var m = merge(d.orders); lastNow = d.now; if (d.days) loadedDays = d.days; loadedAt = Date.now();
      open = d.open !== false; paintOpen(); setLive(true);
      if (m.changed) { idle = 0; render(); } else idle++;
      if (m.fresh) { newAlert(m.fresh); }
      first = false;
    });
  }

  function newAlert(n) {
    if (soundOn) beep();
    var base = 'Panel · Zona 0'; document.title = '(' + n + ') Pedido nuevo · Zona 0';
    var off = function () { document.title = base; window.removeEventListener('focus', off); }; window.addEventListener('focus', off);
    toast(n === 1 ? 'Entró un pedido nuevo' : 'Entraron ' + n + ' pedidos nuevos');
  }
  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [660, 880, 1100].forEach(function (f, i) {
        var o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.16;
        o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
        o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + 0.22);
      });
    } catch (e) {}
  }

  /* ---------- Vista ---------- */
  function today() { return P.boliviaDate(new Date()).key; }
  function list() { return Object.keys(orders).map(function (k) { return orders[k]; }); }
  function mins(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); }
  function hm(iso) { return new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' }); }
  function split(id) { var m = /^#(\d+)-(\w+)$/.exec(id || ''); return m ? [m[1], m[2]] : [id || '', '']; }

  function kpis() {
    var td = list().filter(function (o) { return o.key.slice(0, 10) === today(); });
    var valid = td.filter(function (o) { return o.status !== 'cancelado'; });
    var sales = valid.reduce(function (s, o) { return s + o.total; }, 0);
    var live = valid.filter(function (o) { return o.status !== 'entregado'; }).length;
    var due = valid.filter(function (o) { return o.payment && o.payment.status !== 'pagado'; }).reduce(function (s, o) { return s + o.total; }, 0);
    var data = [['Pedidos hoy', String(valid.length), false], ['Ventas de hoy', money(sales), false], ['En curso', String(live), live > 0], ['Por cobrar', money(due), false]];
    var box = $('#kpis'); box.textContent = '';
    data.forEach(function (d) { var k = el('div', 'kpi' + (d[2] ? ' hot' : '')); k.appendChild(el('span', '', d[0])); k.appendChild(el('b', 'num', d[1])); box.appendChild(k); });
  }

  function chip(text, cls, icon) { var t = el('span', 'tag' + (cls ? ' ' + cls : '')); if (icon) t.appendChild(Z0Icon(icon)); t.appendChild(document.createTextNode(text)); return t; }

  function card(o) {
    var c = el('article', 'card' + (o._fresh ? ' fresh' : '')); c.dataset.key = o.key;
    var age = mins(o.createdAt); if ((o.status === 'nuevo' && age >= 5) || (o.status === 'preparando' && age >= 15)) c.classList.add('late');
    var n = split(o.orderId), h = el('div', 'ch'), no = el('div', 'no num', '#' + n[0]); no.appendChild(el('small', '', n[1])); h.appendChild(no);
    var a = el('span', 'age num', age < 1 ? 'ahora' : age + ' min'); a.title = 'Entró a las ' + hm(o.createdAt); a.prepend(Z0Icon('clock')); a.firstChild.style.cssText = 'width:15px;height:15px'; h.appendChild(a); c.appendChild(h);
    var cu = o.customer || {}, who = el('div', 'who'); who.appendChild(el('b', '', cu.name || 'Sin nombre'));
    if (cu.phone) { var tel = el('a', 'num', P.fmtPhone(cu.phone)); tel.href = 'tel:+' + cu.phone; who.appendChild(tel); } c.appendChild(who);
    var tags = el('div', 'tags');
    tags.appendChild(chip(o.mode === 'mesa' ? 'Mesa ' + (cu.mesa || 's/n') : MODE[o.mode], '', o.mode === 'mesa' ? 'table' : o.mode === 'delivery' ? 'bike' : 'bag'));
    tags.appendChild(chip(o.source === 'app' ? 'Desde el celular' : 'Registrado en el local', o.source === 'app' ? 'app' : ''));
    tags.appendChild(o.payment && o.payment.status === 'pagado' ? chip('Cobrado · ' + o.payment.method, 'paid', 'check') : chip('Por cobrar', 'due'));
    c.appendChild(tags);
    if (o.mode === 'delivery') c.appendChild(el('p', 'addr', (cu.zoneName ? cu.zoneName + '. ' : '') + (cu.address || '')));
    var ul = el('ul', 'items');
    (o.lines || []).forEach(function (l) {
      var li = el('li', lineDoneAll(l) ? 'done' : ''); li.appendChild(el('b', 'num', l.qty + '×')); li.appendChild(el('span', '', l.name + (lineDoneAll(l) ? '  ✓' : '')));
      var det = (l.choices || []).map(function (ch) { return ch.options.map(function (x) { return x.name; }).join(', '); }).join(' · ') + (l.note ? ((l.choices || []).length ? ' · ' : '') + 'Nota: ' + l.note : '');
      if (det) li.appendChild(el('small', '', det)); ul.appendChild(li);
    }); c.appendChild(ul);
    if (cu.notes) c.appendChild(el('p', 'note', 'Notas: ' + cu.notes));
    var cf = el('div', 'cf'); cf.appendChild(el('span', 't num', money(o.total)));
    var tools = el('div', 'acts');
    var pr = el('button', 'mini'); pr.type = 'button'; pr.appendChild(Z0Icon('print')); pr.appendChild(document.createTextNode('Ticket')); pr.addEventListener('click', function () { printTicket(o); }); tools.appendChild(pr);
    if (!(o.payment && o.payment.status === 'pagado') && o.status !== 'cancelado') {
      var cb = el('button', 'mini'); cb.type = 'button'; cb.appendChild(Z0Icon('wallet')); cb.appendChild(document.createTextNode('Cobrar'));
      cb.addEventListener('click', function () {
        var ms = el('div', 'methods'); ['efectivo', 'qr', 'tarjeta'].forEach(function (m) { var b = el('button', 'mini', m === 'qr' ? 'QR' : m[0].toUpperCase() + m.slice(1)); b.type = 'button'; b.addEventListener('click', function () { setPay(o, m); }); ms.appendChild(b); });
        cb.replaceWith(ms);
      }); tools.appendChild(cb);
    }
    cf.appendChild(tools); c.appendChild(cf);
    var acts = el('div', 'acts');
    if (NEXT[o.status]) {
      var go = el('button', 'btn' + (o.status === 'listo' ? ' btn--ink' : '')); go.type = 'button'; go.setAttribute('data-press', ''); go.textContent = BTN[o.status];
      go.addEventListener('click', function () { setStatus(o, NEXT[o.status]); }); acts.appendChild(go);
    }
    if (o.status !== 'cancelado' && o.status !== 'entregado') {
      var cx = el('button', 'mini danger', 'Cancelar'); cx.type = 'button'; var armed = 0;
      cx.addEventListener('click', function () { if (!armed) { armed = 1; cx.textContent = '¿Seguro? Toca otra vez'; cx.classList.add('armed'); setTimeout(function () { armed = 0; cx.textContent = 'Cancelar'; cx.classList.remove('armed'); }, 3500); } else setStatus(o, 'cancelado'); });
      acts.appendChild(cx);
    }
    c.appendChild(acts);
    return c;
  }

  /* Dibuja todo y anima: las tarjetas que cambian de columna se deslizan desde donde estaban (FLIP). */
  function render() {
    var before = {}; $$('.card').forEach(function (c) { before[c.dataset.key] = c.getBoundingClientRect(); });
    kpis(); renderTables(); if ($('#pos').open) { posAcct(); posLines(); } listeners.forEach(function (f) { try { f(); } catch (e) {} });
    var nn = list().filter(function (o) { return o.status === 'nuevo'; }).length, bg = $('#bdgPed'); bg.hidden = !nn; bg.textContent = String(nn);
    var td = list().filter(function (o) { return o.status !== 'cancelado'; });
    ['nuevo', 'preparando', 'listo'].forEach(function (st) {
      var col = $('.col[data-col="' + st + '"]'), stack = $('[data-stack]', col); stack.textContent = '';
      var items = td.filter(function (o) { return o.status === st; }).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
      items.forEach(function (o) { stack.appendChild(card(o)); });
      $('[data-n]', col).textContent = String(items.length);
    });
    var done = td.filter(function (o) { return o.status === 'entregado' && o.key.slice(0, 10) === today(); }).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); });
    var dl = $('#doneList'); dl.textContent = ''; $('#doneN').textContent = String(done.length);
    done.forEach(function (o) {
      var r = el('div', 'drow'); var l = el('div'); l.appendChild(el('b', 'num', o.orderId + ' ')); l.appendChild(el('span', '', (o.customer.name || '') + ' · ' + money(o.total))); r.appendChild(l);
      var b = el('button', 'mini', 'Ticket'); b.type = 'button'; b.addEventListener('click', function () { printTicket(o); }); r.appendChild(b); dl.appendChild(r);
    });
    $('#closedBanner').hidden = open;
    $$('.card').forEach(function (c) {
      var was = before[c.dataset.key];
      if (S.reduce) return;
      if (was) {
        var now = c.getBoundingClientRect(), dx = was.left - now.left, dy = was.top - now.top;
        if (Math.abs(dx) + Math.abs(dy) > 2) c.animate([{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.16,1,.3,1)' });
      } else c.animate([{ opacity: 0, transform: 'translateY(22px) scale(.96)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 700, easing: 'cubic-bezier(.16,1,.3,1)' });
    });
    Object.keys(orders).forEach(function (k) { delete orders[k]._fresh; });
  }

  /* ---------- Acciones (se ven al instante y se confirman en segundo plano) ---------- */
  function setStatus(o, status) {
    var prev = o.status; o.status = status; o.updatedAt = new Date().toISOString(); render(); pending++;
    api('POST', { key: o.key, status: status }).then(function (d) { orders[o.key] = d.order; render(); if (status === 'cancelado') toast('Pedido ' + o.orderId + ' cancelado', 'Deshacer', function () { setStatus(orders[o.key], prev); }); })
      .catch(function (e) { o.status = prev; render(); if (e.auth) leave(e.message); else toast('No se pudo guardar: ' + e.message); })
      .then(function () { pending--; });
  }
  function setPay(o, method) {
    o.payment = Object.assign({}, o.payment, { status: 'pagado', method: method }); render();
    api('POST', { key: o.key, payment: 'pagado', method: method }).then(function (d) { orders[o.key] = d.order; render(); toast('Cobrado ' + money(o.total) + ' · ' + method); })
      .catch(function (e) { o.payment.status = 'pendiente'; render(); toast('No se pudo registrar el cobro: ' + e.message); });
  }
  function paintOpen() { var b = $('#openSw'); b.setAttribute('aria-pressed', open ? 'true' : 'false'); $('#closedBanner').hidden = open; }
  $('#openSw').addEventListener('click', function () {
    var want = !open; open = want; paintOpen();
    api('POST', { open: want }).then(function () { toast(want ? 'Ya se reciben pedidos desde el celular' : 'Pedidos desde el celular en pausa'); })
      .catch(function (e) { open = !want; paintOpen(); toast('No se pudo cambiar: ' + e.message); });
  });
  $('#sound').addEventListener('click', function () {
    soundOn = !soundOn; this.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); this.querySelector('use').setAttribute('href', soundOn ? '#i-sound' : '#i-mute');
    if (soundOn) { beep(); toast('Sonido activado. Sonará con cada pedido nuevo del celular.'); }
  });

  /* ---------- Ticket de 80 mm ---------- */
  function payText(o) {
    var p = o.payment || {};
    if (p.status !== 'pagado') return 'POR COBRAR';
    var ps = p.parts && p.parts.length ? p.parts : [{ method: p.method || 'efectivo', amount: o.total }];
    var nm = { efectivo: 'Efectivo', qr: 'QR', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
    return ps.length > 1 ? 'COBRADO: ' + ps.map(function (q) { return nm[q.method] + ' ' + q.amount; }).join(' + ') : 'COBRADO: ' + (nm[ps[0].method] || ps[0].method);
  }
  function buildTicket(o, t, withLogo) {
    t.textContent = ''; var cu = o.customer || {}, n = split(o.orderId);
    if (withLogo) { var lg = el('img', 'logo'); lg.src = '../img/bean.svg'; lg.alt = ''; t.appendChild(lg); }
    t.appendChild(el('h1', '', 'Zona 0')); t.appendChild(el('p', 'c', 'Café Boutique'));
    t.appendChild(document.createElement('hr'));
    if (o.orderId) { t.appendChild(el('p', 'big num', '#' + n[0])); t.appendChild(el('p', 'c', n[1] + ' · ' + hm(o.createdAt))); } else { t.appendChild(el('p', 'big num', 'MESA ' + (cu.mesa || ''))); t.appendChild(el('p', 'c', 'Cuenta · ' + hm(o.createdAt))); }
    t.appendChild(document.createElement('hr'));
    var isMesa = o.mode === 'mesa' || !!cu.mesa, nm = cu.name && !/^mesa\s*\d*$/i.test(String(cu.name).trim()) && !isMesa ? ' · ' + cu.name : '';
    t.appendChild(el('p', '', (isMesa ? 'MESA ' + (cu.mesa || '') : (MODE[o.mode] || '').toUpperCase()) + nm));
    if (o.mozo) t.appendChild(el('p', '', 'Atendió: ' + o.mozo));
    if (cu.phone) t.appendChild(el('p', '', P.fmtPhone(cu.phone)));
    if (o.mode === 'delivery') t.appendChild(el('p', '', (cu.zoneName ? cu.zoneName + '. ' : '') + (cu.address || '')));
    t.appendChild(document.createElement('hr'));
    (o.lines || []).forEach(function (l) {
      var r = el('div', 'r'); r.appendChild(el('span', 'rn', l.qty + ' × ' + l.name)); r.appendChild(el('span', 'num rp', String(l.total))); t.appendChild(r);
      (l.choices || []).forEach(function (ch) { t.appendChild(el('small', '', ch.label + ': ' + ch.options.map(function (x) { return x.name; }).join(', '))); });
      if (l.note) t.appendChild(el('small', '', 'Nota: ' + l.note));
    });
    if (o.deliveryFee) { var f = el('div', 'r'); f.appendChild(el('span', 'rn', 'Envío')); f.appendChild(el('span', 'num rp', String(o.deliveryFee))); t.appendChild(f); }
    if (o.discount) { var d = el('div', 'r'); d.appendChild(el('span', 'rn', 'Descuento')); d.appendChild(el('span', 'num rp', '-' + o.discount)); t.appendChild(d); }
    t.appendChild(document.createElement('hr'));
    var tt = el('div', 'r tot'); tt.appendChild(el('b', 'rn', 'TOTAL')); tt.appendChild(el('b', 'num rp', money(o.total))); t.appendChild(tt);
    t.appendChild(el('p', 'c', payText(o)));
    if (cu.notes) { t.appendChild(document.createElement('hr')); t.appendChild(el('p', '', 'Notas: ' + cu.notes)); }
    t.appendChild(document.createElement('hr')); t.appendChild(el('p', 'c', 'Gracias por rodar con nosotros'));
  }
  /* Ticket para papel de 80 x 210 mm con 4 mm de margen. Se ve antes de imprimir y se puede achicar o agrandar. */
  var PAPER_H = 210, MARGIN = 4, PX_MM = 96 / 25.4;
  var prt = { o: null, auto: true, scale: 1, logo: false, compat: false };
  try { var sv = JSON.parse(ls('z0.prt') || '{}'); if (sv.scale >= 0.5 && sv.scale <= 1.5) prt.scale = sv.scale; if (sv.auto === false) prt.auto = false; if (sv.v === 3 && sv.logo === true) prt.logo = true; if (sv.v === 3 && sv.compat === true) prt.compat = true; } catch (e) {}
  var lastTicket = null;
  function prtFit() {
    var t = $('#prtTicket'); t.style.setProperty('--ts', '1'); var h = t.getBoundingClientRect().height / PX_MM, room = PAPER_H - MARGIN * 2 - 8;
    return Math.max(0.5, Math.min(1, Math.floor(room / h * 20) / 20));
  }
  function prtPaint() {
    var t = $('#prtTicket'); buildTicket(prt.o, t, prt.logo);
    if (prt.auto) prt.scale = prtFit();
    t.style.setProperty('--ts', String(prt.scale));
    var h = t.getBoundingClientRect().height / PX_MM, fits = h <= PAPER_H - MARGIN * 2; prt.h = h;
    $('#prtPct').textContent = Math.round(prt.scale * 100) + '%';
    $('#prtAuto').checked = prt.auto; $('#prtLogo').checked = prt.logo; $('#prtCompat').checked = prt.compat;
    $('#prtInfo').textContent = 'Papel 80 × 210 mm, margen ' + MARGIN + ' mm. El ticket mide ' + Math.round(h) + ' mm de alto' + (fits ? ' y entra completo.' : ' y NO entra: achícalo o activa el ajuste automático.');
    $('#prtInfo').classList.toggle('bad', !fits);
    ls('z0.prt', JSON.stringify({ auto: prt.auto, scale: prt.scale, logo: prt.logo, compat: prt.compat, v: 3 }));
  }
  function printTicket(o) {
    lastTicket = o; prt.o = o; $('#prtT').textContent = o.orderId ? 'Ticket ' + o.orderId : 'Cuenta de la mesa ' + ((o.customer || {}).mesa || '');
    if (!$('#prt').open) $('#prt').showModal(); prtPaint();
  }
  $('#prtMinus').addEventListener('click', function () { prt.auto = false; prt.scale = Math.max(0.5, Math.round((prt.scale - 0.05) * 100) / 100); prtPaint(); });
  $('#prtPlus').addEventListener('click', function () { prt.auto = false; prt.scale = Math.min(1.5, Math.round((prt.scale + 0.05) * 100) / 100); prtPaint(); });
  $('#prtAuto').addEventListener('change', function () { prt.auto = this.checked; prtPaint(); });
  $('#prtLogo').addEventListener('change', function () { prt.logo = this.checked; prtPaint(); });
  $('#prtCompat').addEventListener('change', function () { prt.compat = this.checked; prtPaint(); });
  $('#prtGo').addEventListener('click', function () {
    var t = $('#ticket'); buildTicket(prt.o, t, prt.logo && !prt.compat); t.style.setProperty('--ts', String(prt.scale));
    /* El alto de la hoja se ajusta al ticket (máximo 210 mm): las impresoras de rollo no avanzan papel de más. */
    t.style.cssText += ';display:block;position:absolute;visibility:hidden;left:-9999px;top:0';
    var real = t.getBoundingClientRect().height / PX_MM; t.style.display = t.style.position = t.style.visibility = t.style.left = t.style.top = '';
    var H = Math.min(PAPER_H, Math.max(60, Math.ceil(real + MARGIN * 2 + 6)));
    var st = document.getElementById('pageSize'); if (!st) { st = document.createElement('style'); st.id = 'pageSize'; document.head.appendChild(st); }
    st.textContent = prt.compat ? '@media print{@page{margin:0}#ticket{margin:0 auto!important;padding:' + MARGIN + 'mm 0}}' : '@media print{@page{size:72mm ' + H + 'mm;margin:0}#ticket{margin:0 auto!important;padding:' + MARGIN + 'mm 0}}';
    window.print();
  });
  $('#prtUsb').addEventListener('click', function () {
    var b = this, msg = $('#prtUsbMsg'); msg.classList.remove('bad'); msg.textContent = 'Enviando a la impresora...'; b.disabled = true;
    var o = prt.o, cu = o.customer || {}, isMesa = o.mode === 'mesa' || !!cu.mesa;
    var ctx = { hm: hm, fmtPhone: P.fmtPhone, money: function (n) { return money(n); }, payText: payText, split: split,
      modeName: function () { var nm = cu.name && !/^mesa\s*\d*$/i.test(String(cu.name).trim()) && !isMesa ? ' - ' + cu.name : ''; return (isMesa ? 'MESA ' + (cu.mesa || '') : (MODE[o.mode] || '').toUpperCase()) + nm; } };
    window.Z0Escpos.print(o, ctx).then(function () { msg.textContent = 'Enviado a la impresora.'; })
      .catch(function (e) { msg.textContent = e.message || 'No se pudo imprimir.'; msg.classList.add('bad'); })
      .then(function () { b.disabled = false; });
  });
  $('#reprint').addEventListener('click', function () {
    var o = lastTicket || histRows().filter(function (x) { return x.status !== 'cancelado'; })[0];
    if (!o) { toast('Todavía no hay tickets para reimprimir.'); return; } printTicket(o);
  });

  /* ---------- Historial y CSV ---------- */
  function histRows() { return list().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); }); }
  function openHist() {
    var tb = $('#tbl tbody'); tb.textContent = '';
    histRows().forEach(function (o) {
      var tr = el('tr'); [o.orderId, new Date(o.createdAt).toLocaleString('es-BO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' }), (o.customer.name || '') + (o.customer.phone ? ' · ' + P.fmtPhone(o.customer.phone) : ''), MODE[o.mode] + (o.mode === 'mesa' && o.customer.mesa ? ' ' + o.customer.mesa : '')].forEach(function (v) { tr.appendChild(el('td', '', v)); });
      var s = el('td'); s.appendChild(el('span', 'st ' + o.status, LABEL[o.status])); tr.appendChild(s);
      tr.appendChild(el('td', '', o.payment && o.payment.status === 'pagado' ? 'Cobrado · ' + o.payment.method : 'Pendiente'));
      tr.appendChild(el('td', 'r num', money(o.total))); tb.appendChild(tr);
    });
    if (!$('#hist').open) $('#hist').showModal();
  }
  function csv() {
    var rows = [['pedido', 'fecha', 'hora', 'estado', 'origen', 'tipo', 'mesa', 'cliente', 'celular', 'productos', 'subtotal', 'envio', 'total', 'pago', 'medio']];
    histRows().forEach(function (o) {
      var c = o.customer || {}, d = new Date(o.createdAt);
      rows.push([o.orderId, d.toLocaleDateString('es-BO', { timeZone: 'America/La_Paz' }), hm(o.createdAt), LABEL[o.status], o.source === 'app' ? 'celular' : 'local', MODE[o.mode], c.mesa || '', c.name || '', c.phone ? '+' + c.phone : '', (o.lines || []).map(function (l) { return l.qty + ' ' + l.name; }).join(' | '), o.subtotal, o.deliveryFee || 0, o.total, o.payment ? o.payment.status : '', o.payment ? o.payment.method : '']);
    });
    var text = '﻿' + rows.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = 'pedidos-zona0-' + today() + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  $('#histBtn').addEventListener('click', openHist);
  $('#csv').addEventListener('click', csv);
  $('#moreDays').addEventListener('click', function () { var b = this; b.disabled = true; load(14).then(function () { openHist(); toast('Pedidos de los últimos 14 días cargados'); }).catch(function (e) { toast(e.message); }).then(function () { b.disabled = false; }); });
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close(); }); });
  $$('dialog').forEach(function (d) { d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); });

  /* ---------- Secciones ---------- */
  function go(t) {
    if (!$('#v-' + t)) t = 'mesas'; tab = t; ls('z0.tab', t);
    $$('#tabs [data-tab]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.tab === t ? 'true' : 'false'); });
    $$('.view').forEach(function (v) { v.hidden = v.dataset.view !== t; });
    if (window.Z0Books && Z0Books.show) Z0Books.show(t);
    if (t === 'mesas') renderTables();
    window.scrollTo(0, 0);
  }
  $('#tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) go(b.dataset.tab); });

  /* ---------- Mesas ---------- */
  function kindsOf(l) { return l.kinds && l.kinds.length ? l.kinds : ['comida']; }
  function lineDoneAll(l) { var d = l.done || []; return kindsOf(l).filter(function (k) { return k === 'comida' || k === 'bebida'; }).every(function (k) { return d.indexOf(k) > -1; }); }
  function openOrders(mesa) {
    return list().filter(function (o) { return o.mode === 'mesa' && o.customer && o.customer.mesa === mesa && o.status !== 'cancelado' && !(o.payment && o.payment.status === 'pagado'); })
      .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
  }
  function tableNames() {
    var t = ((menu && menu.service && menu.service.tables) || []).slice();
    list().forEach(function (o) { var m = o.customer && o.customer.mesa; if (o.mode === 'mesa' && m && t.indexOf(m) < 0 && openOrders(m).length) t.push(m); });
    return t;
  }
  function renderTables() {
    var box = $('#tables'); if (!box || !menu) return; box.textContent = '';
    tableNames().forEach(function (name) {
      var os = openOrders(name), b = el('button', 'tile'); b.type = 'button'; b.setAttribute('data-press', ''); b.dataset.t = name;
      var total = os.reduce(function (s, o) { return s + o.total; }, 0), allLines = [], pendingApp = false;
      os.forEach(function (o) { (o.lines || []).forEach(function (l) { allLines.push(l); }); if (o.status === 'nuevo') pendingApp = true; });
      var doneN = allLines.filter(lineDoneAll).length, ready = os.length > 0 && !pendingApp && os.every(function (o) { return o.status === 'listo' || o.status === 'entregado'; });
      b.classList.add(!os.length ? 'free' : ready ? 'ready' : 'busy');
      var top = el('div', 'tn'); top.appendChild(el('small', '', 'Mesa')); top.appendChild(el('b', 'num', name)); b.appendChild(top);
      if (!os.length) b.appendChild(el('span', 'ts', 'Libre'));
      else {
        b.appendChild(el('span', 'tt num', money(total)));
        var st = pendingApp ? 'Por aceptar' : ready ? 'Lista para servir' : 'En cocina · ' + doneN + '/' + allLines.length;
        b.appendChild(el('span', 'ts', st));
        b.appendChild(el('span', 'ta num', mins(os[0].createdAt) + ' min · ' + os.length + (os.length === 1 ? ' ronda' : ' rondas')));
      }
      b.addEventListener('click', function () { openPos('mesa', name); });
      box.appendChild(b);
    });
  }

  /* ---------- Mesa, para llevar y delivery desde la computadora ---------- */
  var pc = { cat: '', lines: [], mode: 'mesa', mesa: '', method: 'efectivo', uid: 1, opt: null, parts: null };
  function openPos(mode, mesa) {
    pc.lines = []; pc.mode = mode || 'recojo'; pc.mesa = mesa || ''; pc.method = 'efectivo'; pc.parts = null; $('#posForm').reset(); $('#posOpts').hidden = true; $('#posErr').hidden = true;
    if (!pc.cat) pc.cat = menu.categories[0].id;
    var isMesa = pc.mode === 'mesa';
    $('#posT').textContent = isMesa ? 'Mesa ' + pc.mesa : pc.mode === 'delivery' ? 'Delivery' : 'Para llevar';
    $('#posSeg').hidden = isMesa; $('#paidChk').hidden = isMesa; $('#posPay').hidden = !isMesa;
    $('#posSend').textContent = isMesa ? 'Enviar a cocina' : 'Registrar pedido';
    posCats(); posGrid(); posMode(); posLines(); posAcct();
    $('#pos').showModal();
    segSet('#posSeg', 'mode', pc.mode); segSet('#payMethod', 'm', 'efectivo');
  }
  function segSet(sel, attr, val) {
    $$(sel + ' button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset[attr] === val ? 'true' : 'false'); });
    var th = $(sel + ' .thumb'), on = $(sel + ' button[aria-pressed="true"]'); if (th && on) { th.style.left = on.offsetLeft + 'px'; th.style.width = on.offsetWidth + 'px'; }
  }
  function posCats() {
    var box = $('#posCats'); box.textContent = '';
    menu.categories.forEach(function (c) { var b = el('button', 'chip'); b.type = 'button'; b.setAttribute('data-press', ''); b.setAttribute('aria-pressed', c.id === pc.cat ? 'true' : 'false'); b.appendChild(Z0Icon(c.icon)); b.appendChild(document.createTextNode(c.name)); b.addEventListener('click', function () { pc.cat = c.id; posCats(); posGrid(); }); box.appendChild(b); });
    var fb = el('button', 'chip'); fb.type = 'button'; fb.setAttribute('data-press', ''); fb.setAttribute('aria-pressed', pc.cat === '__free' ? 'true' : 'false'); fb.appendChild(Z0Icon('plus')); fb.appendChild(document.createTextNode('Producto libre')); fb.addEventListener('click', function () { pc.cat = '__free'; posCats(); posGrid(); }); box.appendChild(fb);
  }
  function cartQty(p) { return pc.lines.reduce(function (t, x) { return t + (x.raw.id === p.id ? x.raw.qty : 0); }, 0); }
  function simpleLine(p) { return pc.lines.filter(function (x) { return x.raw.id === p.id && !(p.groups && p.groups.length); })[0]; }
  function posGrid() {
    var g = $('#posGrid'), top = g.scrollTop; g.textContent = '';
    if (pc.cat === '__free') { posFree(g); return; }
    menu.products.filter(function (p) { return p.category === pc.cat && !p.hidden; }).forEach(function (p) {
      var out = p.available === false, opts = p.groups && p.groups.length, q = cartQty(p);
      var t = el('div', 'ptile' + (out ? ' out' : '') + (q ? ' has' : '')), b = el('button', 'pmain'); b.type = 'button'; b.setAttribute('data-press', ''); b.disabled = out; b.appendChild(el('b', '', p.title));
      var sp = el('span', 'num', out ? 'Agotado' : money(p.price)); if (opts && !out) sp.appendChild(el('i', '', 'opciones')); b.appendChild(sp);
      b.addEventListener('click', function () { if (opts) posOptions(p); else posAdd({ id: p.id, sel: {}, qty: 1, note: '' }); });
      t.appendChild(b);
      if (!out) {
        var st = el('div', 'pstep'), m = el('button'), a = el('button'), n = el('b', 'num' + (pc.bump === p.id ? ' bump' : ''), String(q));
        m.type = 'button'; a.type = 'button'; m.setAttribute('aria-label', 'Quitar uno de ' + p.title); a.setAttribute('aria-label', 'Agregar uno de ' + p.title);
        m.appendChild(Z0Icon('minus')); a.appendChild(Z0Icon('plus')); m.disabled = !q || !!opts;
        m.addEventListener('click', function () { var it = simpleLine(p); if (!it) return; if (it.raw.qty <= 1) pc.lines = pc.lines.filter(function (x) { return x !== it; }); else { it.raw.qty--; it.line = P.resolveLine(menu, it.raw, { staff: true }).line; } posLines(); });
        a.addEventListener('click', function () { if (opts) posOptions(p); else posAdd({ id: p.id, sel: {}, qty: 1, note: '' }); });
        st.appendChild(m); st.appendChild(n); st.appendChild(a); t.appendChild(st);
      }
      g.appendChild(t);
    });
    if (pc.cat === 'extras') {
      var fr = el('button', 'ptile pfree'); fr.type = 'button'; fr.setAttribute('data-press', ''); fr.appendChild(el('b', '', 'Producto libre')); fr.appendChild(el('span', '', 'Otro producto o de otra tienda'));
      fr.addEventListener('click', function () { pc.cat = '__free'; posCats(); posGrid(); }); g.appendChild(fr);
    }
    pc.bump = '';
    g.scrollTop = top;
  }
  /* Producto libre: algo que no está en el menú (mini tiendas, favores, cosas sueltas). Solo lo arma el personal. */
  var freeLast = { kind: 'tienda' };
  function posFree(g) {
    var f = el('form', 'pfreeform'); f.noValidate = true;
    f.appendChild(el('h3', '', 'Producto libre'));
    f.appendChild(el('p', 'muted', 'Para vender algo que no está en el menú, por ejemplo de otra tienda. Queda en la cuenta y en las ventas.'));
    var l1 = el('label', 'field'); l1.appendChild(el('span', '', 'Nombre')); var nm = el('input'); nm.maxLength = 60; nm.required = true; l1.appendChild(nm); f.appendChild(l1);
    var row = el('div', 'two'), l2 = el('label', 'field'); l2.appendChild(el('span', '', 'Precio (Bs)')); var pr = el('input'); pr.type = 'number'; pr.inputMode = 'decimal'; pr.min = '0'; pr.step = '0.5'; l2.appendChild(pr); row.appendChild(l2);
    var l3 = el('label', 'field'); l3.appendChild(el('span', '', 'Va a')); var ds = el('select'); [['tienda', 'Directo, sin preparar'], ['comida', 'Cocina'], ['bebida', 'Barra']].forEach(function (x) { var o = el('option', '', x[1]); o.value = x[0]; ds.appendChild(o); }); ds.value = freeLast.kind; l3.appendChild(ds); row.appendChild(l3); f.appendChild(row);
    var l4 = el('label', 'field'); l4.appendChild(el('span', '', 'Cantidad')); var qn = el('input'); qn.type = 'number'; qn.inputMode = 'numeric'; qn.min = '1'; qn.max = String(P.MAX_QTY); qn.value = '1'; l4.appendChild(qn); f.appendChild(l4);
    var er = el('p', 'formerr'); er.hidden = true; f.appendChild(er);
    var go = el('button', 'btn btn--block', 'Agregar a la cuenta'); go.type = 'submit'; go.setAttribute('data-press', ''); f.appendChild(go);
    f.addEventListener('submit', function (e) {
      e.preventDefault(); er.hidden = true;
      var raw = { free: { title: nm.value, price: Number(pr.value), kind: ds.value }, qty: Math.floor(Number(qn.value) || 0), note: '' };
      var r = P.resolveLine(menu, raw, { staff: true }); if (!r.ok) { er.textContent = r.error; er.hidden = false; return; }
      freeLast.kind = ds.value; posAdd(raw); toast(raw.free.title + ' agregado.'); nm.value = ''; pr.value = ''; qn.value = '1'; nm.focus();
    });
    g.appendChild(f);
  }
  function posAdd(raw) {
    var r = P.resolveLine(menu, raw, { staff: true }); if (!r.ok) { toast(r.error); return; }
    var ex = pc.lines.filter(function (l) { return l.line.key === r.line.key; })[0];
    pc.bump = raw.id || ''; pc.enterU = 0;
    if (ex) { pc.bumpU = ex.u; ex.raw.qty = Math.min(P.MAX_QTY, ex.raw.qty + raw.qty); ex.line = P.resolveLine(menu, ex.raw, { staff: true }).line; } else { pc.enterU = pc.uid; pc.lines.push({ u: pc.uid++, raw: raw, line: r.line }); }
    posLines();
  }
  function posOptions(p) {
    var box = $('#posOpts'); box.textContent = ''; box.hidden = false;
    var sel = {}, qty = 1; (p.groups || []).forEach(function (gid) { var g = menu.optionGroups[gid]; sel[gid] = []; if (g.type === 'single') g.options.forEach(function (o) { if (o.default) sel[gid] = [o.id]; }); });
    box.appendChild(el('h3', '', p.title));
    var priceEl = el('span', 'num');
    function unit() { var u = p.price, ok = true; p.groups.forEach(function (gid) { var g = menu.optionGroups[gid]; if (g.required && !sel[gid].length) ok = false; sel[gid].forEach(function (oid) { g.options.forEach(function (o) { if (o.id === oid) u += o.price || 0; }); }); }); return { u: u, ok: ok }; }
    var addBtn = el('button', 'btn'); addBtn.type = 'button'; addBtn.setAttribute('data-press', ''); addBtn.appendChild(el('span', '', 'Agregar')); addBtn.appendChild(priceEl);
    var qn = el('b', 'num', '1');
    function paint() { $$('.opt', box).forEach(function (b) { b.setAttribute('aria-checked', sel[b.dataset.g].indexOf(b.dataset.o) > -1 ? 'true' : 'false'); }); var u = unit(); priceEl.textContent = money(u.u * qty); addBtn.disabled = !u.ok; qn.textContent = String(qty); }
    p.groups.forEach(function (gid) {
      var g = menu.optionGroups[gid], grp = el('div', 'group'), h = el('h4', '', g.label); h.appendChild(el('small', '', g.hint || '')); grp.appendChild(h);
      var os = el('div', 'opts');
      g.options.forEach(function (o) {
        var b = el('button', 'opt'); b.type = 'button'; b.setAttribute('data-press', ''); b.dataset.g = gid; b.dataset.o = o.id; b.setAttribute('role', g.type === 'single' ? 'radio' : 'checkbox'); b.appendChild(document.createTextNode(o.name)); if (o.price) b.appendChild(el('span', 'p', '+' + o.price));
        b.addEventListener('click', function () { var s = sel[gid], i = s.indexOf(o.id); if (g.type === 'single') sel[gid] = [o.id]; else if (i > -1) s.splice(i, 1); else if (s.length < (g.max || g.options.length)) s.push(o.id); paint(); });
        os.appendChild(b);
      }); grp.appendChild(os); box.appendChild(grp);
    });
    var note = el('label', 'field'); note.appendChild(el('span', '', 'Nota para cocina (opcional)')); var ni = el('input'); ni.maxLength = 120; note.appendChild(ni); box.appendChild(note);
    var foot = el('div', 'foot'), back = el('button', 'mini', 'Volver'); back.type = 'button'; back.addEventListener('click', function () { box.hidden = true; });
    var q = el('div', 'qty'), m = el('button'); m.type = 'button'; m.appendChild(Z0Icon('minus')); var a = el('button'); a.type = 'button'; a.appendChild(Z0Icon('plus'));
    m.addEventListener('click', function () { if (qty > 1) { qty--; paint(); } }); a.addEventListener('click', function () { if (qty < P.MAX_QTY) { qty++; paint(); } });
    q.appendChild(m); q.appendChild(qn); q.appendChild(a);
    addBtn.addEventListener('click', function () { var s = {}; Object.keys(sel).forEach(function (g) { if (sel[g].length) s[g] = sel[g].slice(); }); posAdd({ id: p.id, sel: s, qty: qty, note: ni.value }); box.hidden = true; });
    foot.appendChild(back); foot.appendChild(q); foot.appendChild(addBtn); box.appendChild(foot); paint();
  }
  function lineDetail(l) { return (l.choices || []).map(function (c) { return c.options.map(function (o) { return o.name; }).join(', '); }).join(' · ') + (l.note ? ((l.choices || []).length ? ' · ' : '') + l.note : ''); }
  function posLines() {
    var ul = $('#posLines'); ul.textContent = ''; $('#posEmpty').hidden = pc.lines.length > 0 || (pc.mode === 'mesa' && openOrders(pc.mesa).length > 0);
    pc.lines.forEach(function (it) {
      var l = it.line, li = el('li', 'pl' + (pc.enterU === it.u ? ' enter' : '')); li.appendChild(el('b', '', l.name));
      var st = el('div', 'step'), m = el('button'); m.type = 'button'; m.appendChild(Z0Icon('minus')); var a = el('button'); a.type = 'button'; a.appendChild(Z0Icon('plus'));
      m.addEventListener('click', function () { if (it.raw.qty <= 1) pc.lines = pc.lines.filter(function (x) { return x !== it; }); else { it.raw.qty--; it.line = P.resolveLine(menu, it.raw, { staff: true }).line; } posLines(); });
      a.addEventListener('click', function () { if (it.raw.qty < P.MAX_QTY) { it.raw.qty++; it.line = P.resolveLine(menu, it.raw, { staff: true }).line; posLines(); } });
      st.appendChild(m); st.appendChild(el('b', 'num' + (pc.bumpU === it.u ? ' bump' : ''), String(it.raw.qty))); st.appendChild(a); li.appendChild(st);
      li.appendChild(el('span', 'pr num', money(l.total)));
      var det = lineDetail(l); if (det) li.appendChild(el('small', '', det));
      ul.appendChild(li);
    });
    if (pc.cat !== '__free') posGrid();
    pc.enterU = 0; pc.bumpU = 0;
    posTotals();
  }
  /* Cuenta abierta de la mesa: lo que ya se pidió en rondas anteriores y qué ya salió de cocina. */
  function posAcct() {
    var box = $('#posAcct'); box.textContent = '';
    var old = pc.mode === 'mesa' ? openOrders(pc.mesa) : [];
    box.hidden = !old.length; $('#posNewH').hidden = !old.length; $('#posPrint').hidden = !old.length;
    old.forEach(function (o, i) {
      var r = el('div', 'round'), h = el('div', 'rh'); h.appendChild(el('b', '', 'Ronda ' + (i + 1))); h.appendChild(el('span', 'num', hm(o.createdAt)));
      h.appendChild(el('span', 'st ' + o.status, o.status === 'nuevo' ? 'Por aceptar' : o.status === 'listo' ? 'Listo' : 'En cocina'));
      var cx = el('button', 'mini danger', 'Anular'); cx.type = 'button'; var armed = 0;
      cx.addEventListener('click', function () { if (!armed) { armed = 1; cx.textContent = '¿Seguro?'; cx.classList.add('armed'); setTimeout(function () { armed = 0; cx.textContent = 'Anular'; cx.classList.remove('armed'); }, 3000); } else { setStatus(o, 'cancelado'); posAcct(); posTotals(); } });
      h.appendChild(cx); r.appendChild(h);
      (o.lines || []).forEach(function (l) {
        var li = el('div', 'rl' + (lineDoneAll(l) ? ' done' : '')); li.appendChild(el('span', 'ck', lineDoneAll(l) ? '✓' : '·')); li.appendChild(el('span', '', l.qty + ' × ' + l.name + (lineDetail(l) ? ' (' + lineDetail(l) + ')' : ''))); li.appendChild(el('b', 'num', String(l.total))); r.appendChild(li);
      });
      box.appendChild(r);
    });
  }
  function posMode() {
    var d = pc.mode === 'delivery'; $('#pDelG').hidden = !d; $('#pAddrG').hidden = !d; posTotals();
  }
  function posTotals() {
    var sub = pc.lines.reduce(function (s, x) { return s + x.line.total; }, 0), fee = 0, isMesa = pc.mode === 'mesa';
    if (pc.mode === 'delivery') fee = P.deliveryFee(menu, { mode: 'delivery', zone: $('#pZone').value }, sub);
    var old = isMesa ? openOrders(pc.mesa).reduce(function (s, o) { return s + o.total; }, 0) : 0;
    $('#posFeeRow').hidden = pc.mode !== 'delivery'; $('#posFee').textContent = fee ? money(fee) : 'Gratis';
    $('#posOldRow').hidden = !old; $('#posOld').textContent = money(old);
    $('#posTotL').textContent = isMesa ? 'Total de la mesa' : 'Total'; $('#posTot').textContent = money(sub + fee + old);
    $('#posSend').disabled = !pc.lines.length; $('#posPay').disabled = (sub + old) === 0; $('#posSplit').hidden = !isMesa || (sub + old) === 0; pc.total = Math.round((sub + old) * 100) / 100; $('#posPay').textContent = 'Cobrar ' + money(sub + old);
  }
  $('#posSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; pc.mode = b.dataset.mode; $('#posT').textContent = pc.mode === 'delivery' ? 'Delivery' : 'Para llevar'; segSet('#posSeg', 'mode', pc.mode); posMode(); });
  $('#payMethod').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; pc.method = b.dataset.m; segSet('#payMethod', 'm', pc.method); });
  $('#pZone').addEventListener('change', posTotals);
  $('#takeBtn').addEventListener('click', function () { openPos('recojo'); });
  $('#delBtn').addEventListener('click', function () { openPos('delivery'); });
  $('#posPrint').addEventListener('click', function () { printAccount(pc.mesa, openOrders(pc.mesa)); });
  $('#posForm').addEventListener('submit', function (e) { e.preventDefault(); doSend(false); });
  $('#posPay').addEventListener('click', function () { doSend(true); });

  function postOrder(body) {
    return fetch('/api/zona0/order', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { d.http = r.status; return d; }); });
  }
  function doSend(pay) {
    var err = $('#posErr'); err.hidden = true;
    var isMesa = pc.mode === 'mesa', oldOrders = isMesa ? openOrders(pc.mesa) : [], mesa = pc.mesa;
    if (!pc.lines.length && !(pay && oldOrders.length)) { err.textContent = 'Agrega al menos un producto.'; err.hidden = false; return; }
    var body = {
      lines: pc.lines.map(function (x) { return x.raw; }),
      customer: { mode: pc.mode, name: $('#pName').value, phone: $('#pPhone').value, mesa: isMesa ? pc.mesa : '', address: $('#pAddr').value, zone: $('#pZone').value, notes: $('#pNotes').value },
      payment: { method: pc.method, paid: isMesa ? (!!pay && !pc.parts) : $('#pPaid').checked }
    };
    if (pc.lines.length) { var chk = P.validateOrder(menu, body, { staff: true }); if (!chk.ok) { err.textContent = chk.error; err.hidden = false; return; } }
    var btns = [$('#posSend'), $('#posPay')]; btns.forEach(function (b) { b.disabled = true; }); (pay ? $('#posPay') : $('#posSend')).classList.add('is-loading');
    var fresh = null;
    var step1 = pc.lines.length ? postOrder(body).then(function (d) {
      if (d.http === 401) { $('#pos').close(); leave('Clave incorrecta.'); throw new Error('auth'); }
      if (!d.ok) throw new Error(d.error || 'No se pudo registrar.');
      fresh = d.order; orders[fresh.key] = fresh; fresh._fresh = true;
    }) : Promise.resolve();
    step1.then(function () {
      if (pay && pc.parts) return api('POST', { settle: oldOrders.concat(fresh ? [fresh] : []).map(function (o) { return o.key; }), parts: pc.parts }).then(function (d) { d.orders.forEach(function (o) { orders[o.key] = o; }); });
      if (pay && oldOrders.length) return api('POST', { settle: oldOrders.map(function (o) { return o.key; }), method: pc.method }).then(function (d) { d.orders.forEach(function (o) { orders[o.key] = o; }); });
    }).then(function () {
      $('#pos').close(); render();
      if (pay) {
        var all = oldOrders.concat(fresh ? [fresh] : []), tot = all.reduce(function (s, o) { return s + o.total; }, 0);
        toast((isMesa ? 'Mesa ' + mesa + ' cobrada' : 'Cobrado') + ' · ' + money(tot) + ' · ' + (pc.parts ? 'dividida en ' + pc.parts.length : pc.method), 'Imprimir cuenta', function () { printAccount(mesa, all.map(function (o) { return orders[o.key] || o; })); });
      } else if (fresh) toast((isMesa ? 'Mesa ' + mesa + ': enviado a cocina. La cuenta sigue abierta.' : 'Pedido ' + fresh.orderId + ' registrado y en cocina'), 'Imprimir ticket', function () { printTicket(fresh); });
    }).catch(function (e) {
      if (e.message === 'auth') return;
      err.textContent = /Failed to fetch|NetworkError/.test(e.message) ? 'Sin conexión. Intenta otra vez.' : e.message; err.hidden = false;
    }).then(function () { $('#posSend').classList.remove('is-loading'); $('#posPay').classList.remove('is-loading'); posTotals(); });
  }
  /* Dividir cuenta */
  var SP_M = [['efectivo', 'Efectivo'], ['qr', 'QR'], ['tarjeta', 'Tarjeta']];
  var spMode = 'monto', spUnits = [];
  function spCollect() {
    var us = [];
    (pc.mode === 'mesa' ? openOrders(pc.mesa) : []).forEach(function (o) { (o.lines || []).forEach(function (l) { us.push({ n: l.name, c: l.qty, t: l.total }); }); });
    pc.lines.forEach(function (x) { us.push({ n: x.line.name, c: x.line.qty, t: x.line.total }); });
    spUnits = [];
    us.forEach(function (l) {
      var each = Math.floor(l.t / l.c * 100), rest = Math.round(l.t * 100) - each * l.c;
      for (var i = 0; i < l.c; i++) spUnits.push({ name: l.n, cents: each + (i === l.c - 1 ? rest : 0), who: 0 });
    });
  }
  function spItemsBuild() {
    var n = Number(spN.value), box = $('#spItems'); box.textContent = '';
    spUnits.forEach(function (u, i) {
      var r = el('div', 'sp-item'), sel = el('select');
      for (var k = 0; k < n; k++) { var o = el('option', '', 'Persona ' + (k + 1)); o.value = k; sel.appendChild(o); }
      if (u.who >= n) u.who = 0; sel.value = u.who; sel.setAttribute('aria-label', 'Quién paga ' + u.name);
      sel.addEventListener('change', function () { u.who = Number(sel.value); spFromItems(); });
      r.appendChild(el('span', '', u.name)); r.appendChild(el('b', 'num', money(u.cents / 100))); r.appendChild(sel); box.appendChild(r);
    });
  }
  function spFromItems() {
    var tot = {}; spUnits.forEach(function (u) { tot[u.who] = (tot[u.who] || 0) + u.cents; });
    spRows().forEach(function (r, i) { r.querySelector('input').value = tot[i] ? String(tot[i] / 100) : '0'; });
    spCheck();
  }
  function spSetMode(m) {
    spMode = m; segSet('#spMode', 'sm', m); $('#spItems').hidden = m !== 'prod'; $('#spEq').hidden = m === 'prod';
    spBuild(Number(spN.value), m === 'monto');
    if (m === 'prod') { spItemsBuild(); spFromItems(); }
  }
  function spRows() { return $$('#spRows .sp-row'); }
  function spRead() { return spRows().map(function (r) { return { method: r.querySelector('select').value, amount: Math.round((Number(r.querySelector('input').value) || 0) * 100) / 100 }; }).filter(function (p) { return spMode !== 'prod' || p.amount > 0; }); }
  function spCheck() {
    var got = Math.round(spRead().reduce(function (s, p) { return s + p.amount; }, 0) * 100), want = Math.round(pc.total * 100), d = want - got, ok = d === 0 && spRead().length > 0 && spRead().every(function (p) { return p.amount > 0; });
    $('#spDiff').textContent = d === 0 ? (ok ? 'La suma cuadra.' : 'Cada parte necesita un monto.') : d > 0 ? 'Faltan ' + money(d / 100) + ' por repartir.' : 'Se pasan ' + money(-d / 100) + ' del total.';
    $('#spDiff').className = 'sp-diff' + (ok ? ' ok' : ''); $('#spGo').disabled = !ok;
  }
  function spBuild(n, equal) {
    var box = $('#spRows'); box.textContent = '';
    var base = Math.floor(pc.total / n * 100) / 100, rest = Math.round((pc.total - base * n) * 100) / 100;
    for (var i = 0; i < n; i++) {
      var r = el('div', 'sp-row'), lab = el('span', '', 'Persona ' + (i + 1)), inp = el('input'), sel = el('select');
      inp.type = 'number'; inp.inputMode = 'decimal'; inp.min = '0'; inp.step = '0.5'; inp.setAttribute('aria-label', 'Monto de la persona ' + (i + 1));
      inp.value = equal ? String(Math.round((base + (i === n - 1 ? rest : 0)) * 100) / 100) : '';
      SP_M.forEach(function (m) { var o = el('option', '', m[1]); o.value = m[0]; sel.appendChild(o); });
      sel.setAttribute('aria-label', 'Medio de la persona ' + (i + 1));
      inp.addEventListener('input', spCheck); sel.addEventListener('change', spCheck);
      r.appendChild(lab); r.appendChild(inp); r.appendChild(sel); box.appendChild(r);
    }
    spCheck();
  }
  var spN = $('#spN'); for (var q = 2; q <= 8; q++) { var oq = el('option', '', String(q)); oq.value = q; spN.appendChild(oq); }
  $('#posSplit').addEventListener('click', function () {
    $('#spTot').textContent = 'Total de la mesa ' + pc.mesa + ': ' + money(pc.total) + '. Reparte entre personas, cada una con su medio de pago.';
    spN.value = '2'; spCollect(); spSetMode('monto'); $('#split').showModal();
  });
  spN.addEventListener('change', function () { spSetMode(spMode); });
  $('#spMode').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) spSetMode(b.dataset.sm); });
  $('#spEq').addEventListener('click', function () { spBuild(Number(spN.value), true); });
  $('#spForm').addEventListener('submit', function (e) { e.preventDefault(); if ($('#spGo').disabled) return; pc.parts = spRead(); $('#split').close(); doSend(true); });
  function printAccount(mesa, os) {
    var lines = []; os.forEach(function (o) { (o.lines || []).forEach(function (l) { lines.push(l); }); });
    var paid = os.length && os.every(function (o) { return o.payment && o.payment.status === 'pagado'; });
    printTicket({ orderId: '', createdAt: os.length ? os[0].createdAt : new Date().toISOString(), mode: 'mesa', customer: { mesa: mesa, name: 'Mesa ' + mesa }, lines: lines, deliveryFee: 0, total: os.reduce(function (s, o) { return s + o.total; }, 0), payment: { status: paid ? 'pagado' : 'pendiente', method: paid ? os[os.length - 1].payment.method : '' } });
  }

  /* ---------- Entrar, consultar y salir ---------- */
  function enter() {
    $('#login').hidden = true; $('#app').hidden = false; $('#tools').hidden = false; $('#tabs').hidden = false; go(ls('z0.tab') || 'mesas');
    var n = 0; clearInterval(timer); clearInterval(tick);
    /* Cada 20 s mientras hay movimiento. Si pasan 6 consultas sin cambios, cada 60 s. Con la pestaña oculta no consulta.
       Sin actividad por 15 minutos y con el sonido apagado, se pausa hasta que alguien toque la pantalla. */
    timer = setInterval(function () {
      if (document.hidden) return;
      if (!soundOn && Date.now() - lastAct > 900000) { if (!paused) { paused = true; setLive(false, 'En pausa por inactividad. Toca la pantalla para seguir'); } return; }
      n++; if (idle >= 6 && n % 3) return;
      load().catch(function (e) { if (e.auth) leave(e.message); else setLive(false); });
    }, 20000);
    tick = setInterval(function () { if (!document.hidden && !$('#app').hidden && !pending) render(); }, 60000);
  }
  function leave(msg) {
    token = ''; ls(KEY, ''); clearInterval(timer); clearInterval(tick); orders = {}; lastNow = 0; first = true; idle = 0;
    $('#login').hidden = false; $('#app').hidden = true; $('#tools').hidden = true; $('#tabs').hidden = true; $('#live').hidden = true;
    var e = $('#err'); e.textContent = msg || ''; e.hidden = !msg;
  }
  function wake() { lastAct = Date.now(); if (paused) { paused = false; idle = 0; load().catch(function () {}); } }
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, wake, { passive: true }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && token && !$('#app').hidden && Date.now() - loadedAt > 20000) load().catch(function () {}); });
  $('#logout').addEventListener('click', function () { leave(''); });
  $('#login').addEventListener('submit', function (e) {
    e.preventDefault(); token = $('#tk').value.trim(); var b = $('#login .btn'); b.classList.add('is-loading');
    load(2).then(function () { ls(KEY, token); enter(); }).catch(function (er) { leave(er.message || 'No pudimos conectar.'); }).then(function () { b.classList.remove('is-loading'); });
  });

  window.Z0Panel = {
    P: P, S: S, $: $, $$: $$, el: el, ls: ls, money: money, toast: toast, hm: hm, today: today, list: list, token: function () { return token; }, menu: function () { return menu; },
    printTicket: printTicket, lineDoneAll: lineDoneAll, tab: function () { return tab; }, onChange: function (f) { listeners.push(f); },
    ensureDays: function (n) { return loadedDays >= n ? Promise.resolve() : load(n); }, leave: leave,
    extra: function () { return extra; },
    setExtra: function (x) { extra = x; menu.products = JSON.parse(baseJson).products; P.applyExtras(menu, extra, today()); if (pc.cat && $('#pos').open) posGrid(); }
  };
  var extra = { custom: [], off: [], over: {}, hide: [] }, baseJson = '{"products":[]}';
  S.press();
  fetch('../menu.json').then(function (r) { return r.text(); }).then(function (t) {
    baseJson = t; var m = JSON.parse(t);
    return fetch('/api/zona0/menu', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (x) { if (x && x.extra) { extra = x.extra; P.applyExtras(m, extra, x.today); } return m; });
  }).then(function (m) {
    menu = m;
    var z = $('#pZone'); z.textContent = ''; var o0 = el('option', '', 'Elige zona'); o0.value = ''; z.appendChild(o0);
    m.service.zones.forEach(function (zn) { var o = el('option', '', zn.name + ' · ' + zn.fee + ' Bs'); o.value = zn.id; z.appendChild(o); });
    var saved = ls(KEY);
    if (saved) { token = saved; load(2).then(enter).catch(function (e) { leave(e.auth ? '' : e.message); }); }
  });
})();
