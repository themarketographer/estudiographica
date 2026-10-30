/* Zona 0 · cocina. Lista las comandas aceptadas, separadas en Comidas y Bebidas, y deja marcar cada plato cuando se prepara.
   Consulta cada 10 s (cada 30 s si nada cambia). Marcar un plato se ve al instante y se confirma en segundo plano. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k) || ''; if (v === null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return ''; }
  var KEY = 'z0.kt', token = '', orders = {}, lastNow = 0, idle = 0, n = 0, timer = 0, tick = 0, first = true, soundOn = false, audio = null, toastT = 0, queue = {}, selMode = false, sel = {};
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 9.5 17 19 7.5"/></svg>';

  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 3000); }
  function api(method, body, qs) {
    return fetch('/api/zona0/kitchen' + (qs || ''), { method: method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (d) { d.http = r.status; return d; }); })
      .then(function (d) { if (d.http === 401 || d.http === 503) throw Object.assign(new Error(d.error || 'Clave incorrecta.'), { auth: true }); if (!d.ok) throw new Error(d.error || 'Error del servidor.'); return d; });
  }
  function setLive(ok, text) { var l = $('#live'); l.hidden = false; l.classList.toggle('off', !ok); l.textContent = text || (ok ? 'En vivo' : 'Sin conexión, reintentando'); }
  function mins(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); }
  function hm(iso) { return new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' }); }
  function beep() { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); [700, 940].forEach(function (f, i) { var o = audio.createOscillator(), g = audio.createGain(), t0 = audio.currentTime + i * 0.18; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25); o.connect(g); g.connect(audio.destination); o.start(t0); o.stop(t0 + 0.28); }); } catch (e) {} }

  function load() {
    var url = lastNow ? '?since=' + Math.max(0, lastNow - 20000) : '?days=1';
    return api('GET', null, url).then(function (d) {
      var fresh = 0, changed = false;
      d.orders.forEach(function (o) { var old = orders[o.key]; if (!old) { changed = true; if (!first) { fresh++; o._new = true; } } else if (JSON.stringify(old) !== JSON.stringify(o)) changed = true; orders[o.key] = o; });
      (d.gone || []).forEach(function (k) { if (orders[k]) { delete orders[k]; changed = true; } });
      lastNow = d.now; setLive(true);
      if (changed) { idle = 0; render(); } else idle++;
      if (fresh && soundOn) beep();
      first = false;
    });
  }

  function whoLabel(o) { var c = o.customer || {}; return o.mode === 'mesa' ? 'MESA ' + (c.mesa || '?') : o.mode === 'delivery' ? 'DELIVERY' : 'LLEVAR'; }
  function lineText(l) { return (l.choices || []).map(function (c) { return c.options.map(function (x) { return x.name; }).join(', '); }).join(' · '); }

  function card(o, st, doneList) {
    var lines = []; o.lines.forEach(function (l, i) { if (l.kinds.indexOf(st) > -1) lines.push({ l: l, i: i }); });
    var c = el('article', 'kcard' + (o._new ? ' new' : '')); c.dataset.key = o.key;
    var h = el('div', 'kh'); h.appendChild(el('div', 'kwho', whoLabel(o)));
    var cu = o.customer || {}, meta = el('div', 'kmeta'); meta.appendChild(el('div', '', o.orderId + (o.mode !== 'mesa' && cu.name ? ' · ' + cu.name : '')));
    var a = mins(o.createdAt), age = el('span', 'kage num' + (a >= 20 ? ' late' : a >= 10 ? ' warn' : ''), a < 1 ? 'ahora' : a + ' min'); age.title = 'Entró a las ' + hm(o.createdAt); meta.appendChild(age); h.appendChild(meta); c.appendChild(h);
    var ul = el('ul', 'klines');
    lines.forEach(function (x) {
      var on = x.l.done.indexOf(st) > -1, li = el('li'), b = el('button', 'kline' + (on ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var box = el('span', 'kbox'); box.innerHTML = CHECK; b.appendChild(box);
      var t = el('span', 'kt'), nm = el('b'); nm.appendChild(el('i', 'num', x.l.qty + '×')); nm.appendChild(document.createTextNode(x.l.name)); t.appendChild(nm);
      var det = lineText(x.l); if (det) t.appendChild(el('small', '', det)); if (x.l.inc) t.appendChild(el('small', '', 'Incluye: ' + x.l.inc)); if (x.l.note) t.appendChild(el('small', 'note', 'Nota: ' + x.l.note));
      var sk = o.key + '|' + x.i + '|' + st;
      if (selMode && sel[sk]) { b.classList.add('sel'); b.setAttribute('aria-pressed', 'true'); }
      b.appendChild(t);
      b.addEventListener('click', function () {
        if (selMode && !on) { if (sel[sk]) delete sel[sk]; else sel[sk] = { o: o, i: x.i, st: st }; render(); return; }
        toggle(o, x.i, st, !on);
      });
      li.appendChild(b); ul.appendChild(li);
    });
    c.appendChild(ul);
    var pend = lines.filter(function (x) { return x.l.done.indexOf(st) === -1; });
    if (!selMode && pend.length > 1) { var all = el('button', 'kall', 'Todo listo (' + pend.length + ')'); all.type = 'button'; all.addEventListener('click', function () { toggleMany(pend.map(function (x) { return { o: o, i: x.i, st: st, done: true }; })); }); c.appendChild(all); }
    if (cu.notes) c.appendChild(el('p', 'knote', 'Notas: ' + cu.notes));
    return { node: c, done: lines.every(function (x) { return x.l.done.indexOf(st) > -1; }) };
  }

  function render() {
    var before = {}; $$('.kcard').forEach(function (c) { before[c.closest('.kcol').dataset.st + c.dataset.key] = c.getBoundingClientRect(); });
    var list = Object.keys(orders).map(function (k) { return orders[k]; }).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    ['comida', 'bebida'].forEach(function (st) {
      var col = $('.kcol[data-st="' + st + '"]'), act = $('[data-active]', col), dn = $('[data-done]', col); act.textContent = ''; dn.textContent = '';
      var na = 0, nd = 0, doneCards = [];
      list.forEach(function (o) { if (!o.lines.some(function (l) { return l.kinds.indexOf(st) > -1; })) return; var r = card(o, st); if (r.done) { doneCards.push(r.node); nd++; } else { act.appendChild(r.node); na++; } });
      doneCards.slice(-6).reverse().forEach(function (nd2) { dn.appendChild(nd2); });
      $('[data-n]', col).textContent = String(na); $('[data-dn]', col).textContent = String(nd);
    });
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) $$('.kcard').forEach(function (c) {
      var was = before[c.closest('.kcol').dataset.st + c.dataset.key];
      if (was) { var now = c.getBoundingClientRect(), dy = was.top - now.top; if (Math.abs(dy) > 2) c.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 550, easing: 'cubic-bezier(.16,1,.3,1)' }); }
      else c.animate([{ opacity: 0, transform: 'translateY(18px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'cubic-bezier(.16,1,.3,1)' });
    });
    Object.keys(orders).forEach(function (k) { delete orders[k]._new; });
    selBar();
  }

  /* Marcar un plato: se ve al instante; las marcas de un mismo pedido viajan una tras otra para no pisarse. */
  function toggle(o, idx, st, done) { toggleMany([{ o: o, i: idx, st: st, done: done }]); }
  function toggleMany(items) {
    var prevs = items.map(function (it) { var l = it.o.lines[it.i], p = l.done.slice(); l.done = it.done ? l.done.concat(it.st) : l.done.filter(function (x) { return x !== it.st; }); return p; });
    render();
    items.forEach(function (it, n) {
      var o = it.o, idx = it.i, st = it.st, done = it.done, l = o.lines[idx], prev = prevs[n];
      queue[o.key] = (queue[o.key] || Promise.resolve()).then(function () { return api('POST', { key: o.key, line: idx, station: st, done: done }); })
        .then(function (d) { if (d.order) orders[o.key] = d.order; else delete orders[o.key]; render(); })
        .catch(function (e) { if (e.auth) { leave(e.message); return; } l.done = prev; render(); toast('No se pudo guardar. Revisa la conexión.'); });
    });
  }
  function selBar() {
    var n = Object.keys(sel).length, bar = $('#selbar'); bar.hidden = !selMode;
    $('#selGo').textContent = n ? 'Marcar ' + n + (n === 1 ? ' listo' : ' listos') : 'Toca los productos'; $('#selGo').disabled = !n;
    $('#selBtn').setAttribute('aria-pressed', selMode ? 'true' : 'false'); $('#selBtn').textContent = selMode ? 'Salir de selección' : 'Seleccionar varios';
  }
  function selOff() { selMode = false; sel = {}; render(); }
  $('#selBtn').addEventListener('click', function () { if (selMode) selOff(); else { selMode = true; sel = {}; render(); } });
  $('#selCancel').addEventListener('click', selOff);
  $('#selGo').addEventListener('click', function () {
    var items = Object.keys(sel).map(function (k) { var v = sel[k]; return { o: orders[v.o.key] || v.o, i: v.i, st: v.st, done: true }; });
    selMode = false; sel = {}; toggleMany(items);
  });

  function enter() {
    $('#login').hidden = true; $('#app').hidden = false; $('#tools').hidden = false; n = 0; clearInterval(timer); clearInterval(tick);
    timer = setInterval(function () { if (document.hidden) return; n++; if (idle >= 6 && n % 3) return; load().catch(function (e) { if (e.auth) leave(e.message); else setLive(false); }); }, 10000);
    tick = setInterval(function () { if (!document.hidden) render(); }, 60000);
  }
  function leave(msg) {
    token = ''; ls(KEY, ''); clearInterval(timer); clearInterval(tick); orders = {}; lastNow = 0; first = true;
    $('#login').hidden = false; $('#app').hidden = true; $('#tools').hidden = true; $('#live').hidden = true; var e = $('#err'); e.textContent = msg || ''; e.hidden = !msg;
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && token && !$('#app').hidden) load().catch(function () {}); });
  $('#sound').addEventListener('click', function () { soundOn = !soundOn; this.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); if (soundOn) { beep(); toast('Sonará con cada comanda nueva'); } });
  $('#logout').addEventListener('click', function () { leave(''); });
  $('#login').addEventListener('submit', function (e) { e.preventDefault(); token = $('#tk').value.trim(); load().then(function () { ls(KEY, token); enter(); }).catch(function (er) { leave(er.message || 'No pudimos conectar.'); }); });
  var saved = ls(KEY); if (saved) { token = saved; load().then(enter).catch(function (e) { leave(e.auth ? '' : e.message); }); }
})();
