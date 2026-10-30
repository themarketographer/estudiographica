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
  var soundOn = false, audio = null, first = true, idle = 0, lastAct = Date.now(), paused = false, timer = 0, tick = 0, toastT = 0, loadedAt = 0, pending = 0;
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
      var li = el('li'); li.appendChild(el('b', 'num', l.qty + '×')); li.appendChild(el('span', '', l.name));
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
    kpis();
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
  function printTicket(o) {
    var t = $('#ticket'); t.textContent = ''; var cu = o.customer || {}, n = split(o.orderId);
    t.appendChild(el('h1', '', 'Zona 0')); t.appendChild(el('p', 'c', 'Cafetería para ciclistas'));
    t.appendChild(document.createElement('hr'));
    t.appendChild(el('p', 'big num', '#' + n[0])); t.appendChild(el('p', 'c', n[1] + ' · ' + hm(o.createdAt)));
    t.appendChild(document.createElement('hr'));
    t.appendChild(el('p', '', (o.mode === 'mesa' ? 'MESA ' + (cu.mesa || '') : MODE[o.mode].toUpperCase()) + ' · ' + (cu.name || '')));
    if (cu.phone) t.appendChild(el('p', '', P.fmtPhone(cu.phone)));
    if (o.mode === 'delivery') t.appendChild(el('p', '', (cu.zoneName ? cu.zoneName + '. ' : '') + (cu.address || '')));
    t.appendChild(document.createElement('hr'));
    (o.lines || []).forEach(function (l) {
      var r = el('div', 'r'); r.appendChild(el('span', '', l.qty + ' × ' + l.name)); r.appendChild(el('span', 'num', String(l.total))); t.appendChild(r);
      (l.choices || []).forEach(function (ch) { t.appendChild(el('small', '', ch.label + ': ' + ch.options.map(function (x) { return x.name; }).join(', '))); });
      if (l.note) t.appendChild(el('small', '', 'Nota: ' + l.note));
    });
    if (o.deliveryFee) { var f = el('div', 'r'); f.appendChild(el('span', '', 'Envío')); f.appendChild(el('span', 'num', String(o.deliveryFee))); t.appendChild(f); }
    t.appendChild(document.createElement('hr'));
    var tt = el('div', 'r'); tt.style.fontSize = '15pt'; tt.appendChild(el('b', '', 'TOTAL')); tt.appendChild(el('b', 'num', money(o.total))); t.appendChild(tt);
    t.appendChild(el('p', 'c', o.payment && o.payment.status === 'pagado' ? 'COBRADO · ' + o.payment.method : 'POR COBRAR'));
    if (cu.notes) { t.appendChild(document.createElement('hr')); t.appendChild(el('p', '', 'Notas: ' + cu.notes)); }
    t.appendChild(document.createElement('hr')); t.appendChild(el('p', 'c', 'Gracias por rodar con nosotros'));
    window.print();
  }

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

  /* ---------- Registrar pedido desde la computadora ---------- */
  var pc = { cat: '', lines: [], mode: 'mesa', method: 'efectivo', uid: 1, opt: null };
  function openPos() {
    pc.lines = []; pc.mode = 'mesa'; pc.method = 'efectivo'; $('#posForm').reset(); $('#posOpts').hidden = true;
    if (!pc.cat) pc.cat = menu.categories[0].id;
    segSet('#posSeg', 'mode', 'mesa'); segSet('#payMethod', 'm', 'efectivo'); posMode(); posCats(); posGrid(); posLines();
    $('#pos').showModal();
    segSet('#posSeg', 'mode', 'mesa'); segSet('#payMethod', 'm', 'efectivo');
  }
  function segSet(sel, attr, val) {
    $$(sel + ' button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset[attr] === val ? 'true' : 'false'); });
    var th = $(sel + ' .thumb'), on = $(sel + ' button[aria-pressed="true"]'); if (th && on) { th.style.left = on.offsetLeft + 'px'; th.style.width = on.offsetWidth + 'px'; }
  }
  function posCats() {
    var box = $('#posCats'); box.textContent = '';
    menu.categories.forEach(function (c) { var b = el('button', 'chip'); b.type = 'button'; b.setAttribute('data-press', ''); b.setAttribute('aria-pressed', c.id === pc.cat ? 'true' : 'false'); b.appendChild(Z0Icon(c.icon)); b.appendChild(document.createTextNode(c.name)); b.addEventListener('click', function () { pc.cat = c.id; posCats(); posGrid(); }); box.appendChild(b); });
  }
  function posGrid() {
    var g = $('#posGrid'); g.textContent = '';
    menu.products.filter(function (p) { return p.category === pc.cat; }).forEach(function (p) {
      var b = el('button', 'ptile'); b.type = 'button'; b.setAttribute('data-press', ''); b.appendChild(el('b', '', p.title));
      var s = el('span', 'num', money(p.price)); if (p.groups && p.groups.length) s.appendChild(el('i', '', 'opciones')); b.appendChild(s);
      b.addEventListener('click', function () { if (p.groups && p.groups.length) posOptions(p); else posAdd({ id: p.id, sel: {}, qty: 1, note: '' }); });
      g.appendChild(b);
    });
  }
  function posAdd(raw) {
    var r = P.resolveLine(menu, raw); if (!r.ok) { toast(r.error); return; }
    var ex = pc.lines.filter(function (l) { return l.line.key === r.line.key; })[0];
    if (ex) { ex.raw.qty = Math.min(P.MAX_QTY, ex.raw.qty + raw.qty); ex.line = P.resolveLine(menu, ex.raw).line; } else pc.lines.push({ u: pc.uid++, raw: raw, line: r.line });
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
  function posLines() {
    var ul = $('#posLines'); ul.textContent = ''; $('#posEmpty').hidden = pc.lines.length > 0;
    pc.lines.forEach(function (it) {
      var l = it.line, li = el('li', 'pl'); li.appendChild(el('b', '', l.name));
      var st = el('div', 'step'), m = el('button'); m.type = 'button'; m.appendChild(Z0Icon('minus')); var a = el('button'); a.type = 'button'; a.appendChild(Z0Icon('plus'));
      m.addEventListener('click', function () { if (it.raw.qty <= 1) pc.lines = pc.lines.filter(function (x) { return x !== it; }); else { it.raw.qty--; it.line = P.resolveLine(menu, it.raw).line; } posLines(); });
      a.addEventListener('click', function () { if (it.raw.qty < P.MAX_QTY) { it.raw.qty++; it.line = P.resolveLine(menu, it.raw).line; posLines(); } });
      st.appendChild(m); st.appendChild(el('b', 'num', String(it.raw.qty))); st.appendChild(a); li.appendChild(st);
      li.appendChild(el('span', 'pr num', money(l.total)));
      var det = l.choices.map(function (c) { return c.options.map(function (o) { return o.name; }).join(', '); }).join(' · ') + (l.note ? ' · ' + l.note : ''); if (det) li.appendChild(el('small', '', det));
      ul.appendChild(li);
    });
    posTotals();
  }
  function posMode() {
    $('#pMesaG').hidden = pc.mode !== 'mesa'; $('#pDelG').hidden = pc.mode !== 'delivery'; $('#pAddrG').hidden = pc.mode !== 'delivery'; posTotals();
  }
  function posTotals() {
    var sub = pc.lines.reduce(function (s, x) { return s + x.line.total; }, 0), fee = 0;
    if (pc.mode === 'delivery') fee = P.deliveryFee(menu, { mode: 'delivery', zone: $('#pZone').value }, sub);
    $('#posFeeRow').hidden = pc.mode !== 'delivery'; $('#posFee').textContent = fee ? money(fee) : 'Gratis'; $('#posTot').textContent = money(sub + fee);
  }
  $('#posSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; pc.mode = b.dataset.mode; segSet('#posSeg', 'mode', pc.mode); posMode(); });
  $('#payMethod').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; pc.method = b.dataset.m; segSet('#payMethod', 'm', pc.method); });
  $('#pZone').addEventListener('change', posTotals);
  $('#newBtn').addEventListener('click', openPos);
  $('#posForm').addEventListener('submit', function (e) {
    e.preventDefault(); var err = $('#posErr'); err.hidden = true;
    var body = {
      lines: pc.lines.map(function (x) { return x.raw; }),
      customer: { mode: pc.mode, name: $('#pName').value, phone: $('#pPhone').value, mesa: $('#pMesa').value, address: $('#pAddr').value, zone: $('#pZone').value, notes: $('#pNotes').value },
      payment: { method: pc.method, paid: $('#pPaid').checked }
    };
    var chk = P.validateOrder(menu, body, { staff: true }); if (!chk.ok) { err.textContent = chk.error; err.hidden = false; return; }
    var btn = $('#posSend'); btn.classList.add('is-loading'); btn.disabled = true;
    fetch('/api/zona0/order', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { d.http = r.status; return d; }); })
      .then(function (d) {
        if (d.http === 401) { $('#pos').close(); leave('Clave incorrecta.'); return; }
        if (!d.ok) { err.textContent = d.error || 'No se pudo registrar.'; err.hidden = false; return; }
        orders[d.order.key] = d.order; d.order._fresh = true; $('#pos').close(); render(); toast('Pedido ' + d.order.orderId + ' registrado y en cocina', 'Imprimir ticket', function () { printTicket(d.order); });
      })
      .catch(function () { err.textContent = 'Sin conexión. Intenta otra vez.'; err.hidden = false; })
      .then(function () { btn.classList.remove('is-loading'); btn.disabled = false; });
  });

  /* ---------- Entrar, consultar y salir ---------- */
  function enter() {
    $('#login').hidden = true; $('#app').hidden = false; $('#tools').hidden = false;
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
    $('#login').hidden = false; $('#app').hidden = true; $('#tools').hidden = true; $('#live').hidden = true;
    var e = $('#err'); e.textContent = msg || ''; e.hidden = !msg;
  }
  function wake() { lastAct = Date.now(); if (paused) { paused = false; idle = 0; load().catch(function () {}); } }
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, wake, { passive: true }); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && token && !$('#app').hidden && Date.now() - loadedAt > 20000) load().catch(function () {}); });
  document.addEventListener('keydown', function (e) { if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey && !/input|textarea|select/i.test(document.activeElement.tagName) && !$('#app').hidden && !$('#pos').open) { e.preventDefault(); openPos(); } });
  $('#logout').addEventListener('click', function () { leave(''); });
  $('#login').addEventListener('submit', function (e) {
    e.preventDefault(); token = $('#tk').value.trim(); var b = $('#login .btn'); b.classList.add('is-loading');
    load(2).then(function () { ls(KEY, token); enter(); }).catch(function (er) { leave(er.message || 'No pudimos conectar.'); }).then(function () { b.classList.remove('is-loading'); });
  });

  S.press();
  fetch('../menu.json').then(function (r) { return r.json(); }).then(function (m) {
    menu = m;
    var z = $('#pZone'); z.textContent = ''; var o0 = el('option', '', 'Elige zona'); o0.value = ''; z.appendChild(o0);
    m.service.zones.forEach(function (zn) { var o = el('option', '', zn.name + ' · ' + zn.fee + ' Bs'); o.value = zn.id; z.appendChild(o); });
    var saved = ls(KEY);
    if (saved) { token = saved; load(2).then(enter).catch(function (e) { leave(e.auth ? '' : e.message); }); }
  });
})();
