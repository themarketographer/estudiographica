/* Zona 0 · app del cliente. Menú, carrito, pedido y seguimiento en vivo.
   El precio lo recalcula el servidor con el mismo pricing.js: el celular solo muestra, nunca decide. */
(function () {
  'use strict';
  var P = window.Zona0Pricing, S = window.Z0Spring;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  var money = function (n) { return P.money(n, 'Bs'); };

  var menu = null, cart = [], uid = 1, mode = 'mesa', cur = null, track = null, toastT = 0;
  var FINAL = { entregado: 1, cancelado: 1 };
  var TIMELINE = ['nuevo', 'preparando', 'listo', 'entregado'];

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 3200);
  }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

  /* ---------- Carga ---------- */
  fetch('menu.json').then(function (r) { return r.json(); }).then(function (m) {
    return fetch('/api/zona0/menu', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (x) { menu = m; if (x && x.extra) P.applyExtras(menu, x.extra, x.today); boot(); });
  }).catch(function () {
    $('#menu').textContent = ''; $('#menu').appendChild(el('p', 'empty', 'No pudimos cargar el menú. Revisa tu conexión e intenta de nuevo.'));
  });

  function boot() {
    document.title = menu.brand.name + ' · Pedidos';
    $('#prepText').textContent = 'Listo en unos ' + menu.service.prepMin + ' min';
    $('#footAddr').textContent = menu.brand.address;
    $('#footHours').textContent = menu.hours.text;
    hoursPill();
    renderMenu();
    buildZones();
    restoreMe();
    setupSheets();
    setupForm();
    S.press();
    wordSplit();
    scrollFx();
    resumeTrack();
  }

  function hoursPill() {
    var t = new Date(Date.now() - 4 * 3600 * 1000), now = t.getUTCHours() * 60 + t.getUTCMinutes();
    var toM = function (s) { var a = s.split(':'); return Number(a[0]) * 60 + Number(a[1]); };
    var open = now >= toM(menu.hours.open) && now < toM(menu.hours.close);
    $('#openPill').classList.toggle('is-open', open);
    $('#openText').textContent = open ? 'Abierto ahora · hasta ' + menu.hours.close : 'Cerrado ahora · abre a las ' + menu.hours.open;
  }

  /* ---------- Menú ---------- */
  function catIcon(id) { var c = menu.categories.filter(function (x) { return x.id === id; })[0]; return c ? c.icon : 'cup'; }
  function renderMenu() {
    var root = $('#menu'), chips = $('#catsIn'); root.textContent = ''; chips.textContent = '';
    menu.categories.forEach(function (c, ci) {
      var chip = el('button', 'chip'); chip.type = 'button'; chip.setAttribute('data-press', ''); chip.dataset.cat = c.id;
      chip.appendChild(Z0Icon(c.icon)); chip.appendChild(document.createTextNode(c.name));
      chip.addEventListener('click', function () { var s = document.getElementById('cat-' + c.id); if (s) s.scrollIntoView({ behavior: S.reduce ? 'auto' : 'smooth', block: 'start' }); });
      chips.appendChild(chip);
      var sec = el('section', 'cat'); sec.id = 'cat-' + c.id; sec.dataset.cat = c.id;
      var h = el('h2', '', c.name);
      var items = menu.products.filter(function (p) { return p.category === c.id; });
      h.appendChild(el('small', '', items.length + (items.length === 1 ? ' opción' : ' opciones')));
      sec.appendChild(h);
      var ul = el('ul', 'rows');
      items.forEach(function (p, i) { ul.appendChild(productRow(p, i)); });
      sec.appendChild(ul); root.appendChild(sec);
    });
    spy(); reveal();
  }

  function productRow(p, i) {
    var li = el('li', 'row rv' + (p.available === false ? ' is-out' : '')); li.dataset.p = p.id; li.style.setProperty('--d', Math.min(i, 4) * 60 + 'ms');
    var tile = el('button', 'tile'); tile.type = 'button'; tile.setAttribute('data-press', ''); tile.setAttribute('aria-label', 'Ver ' + p.title); tile.appendChild(Z0Icon(catIcon(p.category)));
    var txt = el('button', 'txt'); txt.type = 'button';
    txt.appendChild(el('b', '', p.title)); txt.appendChild(el('span', '', p.sub));
    var pr = el('em', 'num', money(p.price)); if (p.groups && p.groups.length) pr.appendChild(el('i', '', ' · personaliza')); txt.appendChild(pr);
    [tile, txt].forEach(function (b) { b.addEventListener('click', function () { openProduct(p); }); });
    var ctl = el('div', 'ctl'); ctl.dataset.ctl = p.id;
    li.appendChild(tile); li.appendChild(txt); li.appendChild(ctl);
    renderControl(p, ctl);
    return li;
  }

  function plainItem(p) { return cart.filter(function (c) { return c.raw.id === p.id && !c.raw.note && !Object.keys(c.raw.sel).length; })[0]; }
  function qtyOf(p) { return cart.reduce(function (s, c) { return s + (c.raw.id === p.id ? c.raw.qty : 0); }, 0); }

  function renderControl(p, ctl) {
    ctl = ctl || document.querySelector('[data-ctl="' + p.id + '"]'); if (!ctl) return;
    ctl.textContent = '';
    var hasGroups = p.groups && p.groups.length, n = qtyOf(p);
    if (!hasGroups && n > 0) {
      var it = plainItem(p), st = el('div', 'step');
      var m = el('button'); m.type = 'button'; m.setAttribute('data-press', ''); m.setAttribute('aria-label', 'Quitar uno de ' + p.title); m.appendChild(Z0Icon('minus'));
      var b = el('b', 'num', String(n));
      var a = el('button'); a.type = 'button'; a.setAttribute('data-press', ''); a.setAttribute('aria-label', 'Agregar otro ' + p.title); a.appendChild(Z0Icon('plus'));
      m.addEventListener('click', function () { if (it) setQty(it, it.raw.qty - 1); });
      a.addEventListener('click', function () { if (it) setQty(it, it.raw.qty + 1); });
      st.appendChild(m); st.appendChild(b); st.appendChild(a); ctl.appendChild(st);
    } else {
      var add = el('button', 'add'); add.type = 'button'; add.setAttribute('data-press', ''); add.setAttribute('aria-label', hasGroups ? 'Personalizar ' + p.title : 'Agregar ' + p.title);
      add.appendChild(Z0Icon('plus'));
      var bd = el('span', 'badge num' + (n ? ' on' : ''), String(n || '')); add.appendChild(bd);
      add.addEventListener('click', function () { if (hasGroups) openProduct(p); else { addToCart({ id: p.id, sel: {}, qty: 1, note: '' }); buzz(10); } });
      ctl.appendChild(add);
    }
  }

  /* IntersectionObserver: entrada al hacer scroll y categoría activa */
  function reveal() {
    var rvs = $$('.rv'); if (S.reduce || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-seen'); io.unobserve(e.target); } }); }, { threshold: 0.08 });
    rvs.forEach(function (r) { r.classList.add('is-armed'); io.observe(r); });
  }
  function spy() {
    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        $$('.chip').forEach(function (c) { var on = c.dataset.cat === e.target.dataset.cat; if (on) { c.setAttribute('aria-current', 'true'); var box = $('#catsIn'); box.scrollTo({ left: c.offsetLeft - box.clientWidth / 2 + c.offsetWidth / 2, behavior: S.reduce ? 'auto' : 'smooth' }); } else c.removeAttribute('aria-current'); });
      });
    }, { rootMargin: '-25% 0px -65% 0px' });
    $$('.cat').forEach(function (c) { io.observe(c); });
  }

  function wordSplit() {
    var h = $('#h1'); if (!h || S.reduce) return;
    var words = h.textContent.trim().split(/\s+/); h.setAttribute('aria-label', h.textContent); h.textContent = '';
    words.forEach(function (w, i) { var s = el('span', 'w', w); s.style.setProperty('--i', i); s.setAttribute('aria-hidden', 'true'); h.appendChild(s); h.appendChild(document.createTextNode(' ')); });
  }

  function scrollFx() {
    var wheel = $('#heroWheel'), cats = $('#cats'), tick = false;
    function f() { tick = false; var y = window.scrollY; if (wheel && !S.reduce) wheel.style.setProperty('--rot', (y * 0.12) + 'deg'); var st = cats.getBoundingClientRect().top <= 70; cats.classList.toggle('stuck', st); document.body.classList.toggle('is-stuck', st); }
    window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(f); } }, { passive: true });
    f();
  }

  /* ---------- Carrito ---------- */
  function addToCart(raw) {
    var r = P.resolveLine(menu, raw); if (!r.ok) { toast(r.error); return false; }
    var ex = cart.filter(function (c) { return c.line.key === r.line.key; })[0];
    if (ex) { var q = ex.raw.qty + raw.qty; if (q > P.MAX_QTY) { toast('Máximo ' + P.MAX_QTY + ' por producto.'); return false; } ex.raw.qty = q; ex.line = P.resolveLine(menu, ex.raw).line; }
    else cart.push({ u: uid++, raw: raw, line: r.line });
    afterCart(raw.id); return true;
  }
  function setQty(it, q) {
    if (q < 1) { cart = cart.filter(function (c) { return c !== it; }); }
    else if (q > P.MAX_QTY) { toast('Máximo ' + P.MAX_QTY + ' por producto.'); return; }
    else { it.raw.qty = q; it.line = P.resolveLine(menu, it.raw).line; }
    afterCart(it.raw.id);
  }
  function subtotal() { return cart.reduce(function (s, c) { return s + c.line.total; }, 0); }
  function count() { return cart.reduce(function (s, c) { return s + c.raw.qty; }, 0); }

  var barY = 140, barAnim = null, shown = false, shownTotal = 0, totAnim = null;
  function afterCart(pid) {
    var p = P.findProduct(menu, pid); if (p) renderControl(p);
    var n = count(), bar = $('#cartbar');
    if (n && !shown) { shown = true; bar.hidden = false; barMove(0, 0.78); }
    else if (!n && shown) { shown = false; barMove(140, 1, function () { bar.hidden = true; }); }
    if (n) {
      var c = $('#cartCount'); c.textContent = String(n); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
      if (totAnim) totAnim.stop();
      totAnim = S.spring(shownTotal, subtotal(), { response: 0.5 }, function (v) { $('#cartTotal').textContent = money(Math.round(v)); }, function () { shownTotal = subtotal(); });
      shownTotal = subtotal();
    }
    if (!$('#csheet').hidden) renderLines();
  }
  function barMove(to, damping, done) {
    if (barAnim) barAnim.stop();
    barAnim = S.spring(barY, to, { response: 0.5, damping: damping }, function (v) { barY = v; $('#cartbar').style.transform = 'translate3d(0,' + v.toFixed(1) + 'px,0)'; }, done);
  }

  function choicesText(l) { return l.choices.map(function (c) { return c.options.map(function (o) { return o.name; }).join(', '); }).join(' · '); }
  function renderLines() {
    var ul = $('#lines'); ul.textContent = ''; $('#cEmpty').hidden = cart.length > 0; $('#toForm').disabled = !cart.length;
    cart.forEach(function (c) {
      var l = c.line, li = el('li', 'line');
      li.appendChild(el('b', '', l.name));
      li.appendChild(el('span', 'pr num', money(l.total)));
      var det = choicesText(l) + (l.note ? (choicesText(l) ? ' · ' : '') + 'Nota: ' + l.note : '');
      if (det) li.appendChild(el('span', 'ch', det));
      var ctl = el('div', 'ctl'), st = el('div', 'step');
      var m = el('button'); m.type = 'button'; m.setAttribute('data-press', ''); m.setAttribute('aria-label', 'Quitar uno'); m.appendChild(Z0Icon('minus'));
      var a = el('button'); a.type = 'button'; a.setAttribute('data-press', ''); a.setAttribute('aria-label', 'Agregar uno'); a.appendChild(Z0Icon('plus'));
      m.addEventListener('click', function () { setQty(c, c.raw.qty - 1); }); a.addEventListener('click', function () { setQty(c, c.raw.qty + 1); });
      st.appendChild(m); st.appendChild(el('b', 'num', String(c.raw.qty))); st.appendChild(a);
      var rm = el('button', 'rm', 'Quitar'); rm.type = 'button'; rm.addEventListener('click', function () { setQty(c, 0); });
      ctl.appendChild(st); ctl.appendChild(rm); li.appendChild(ctl); ul.appendChild(li);
    });
    $('#cSub').textContent = money(subtotal()); totals();
    if (!cart.length) { setTimeout(function () { if (!cart.length) csheet.close(); }, 450); }
  }

  /* ---------- Hojas ---------- */
  var psheet, csheet, paneX = 0, paneAnim = null;
  function setupSheets() {
    psheet = S.sheet($('#psheet'), $('#scrim'), $('#pGrab'));
    csheet = S.sheet($('#csheet'), $('#scrim'), $('#cGrab'), { onClosed: function () { setPane(0, true); }, onOpen: function () { placeThumb(); } });
    $('#cartOpen').addEventListener('click', function () { renderLines(); csheet.open(); });
    $('#toForm').addEventListener('click', function () { if (cart.length) { setPane(1); totals(); } });
    $('#backCart').addEventListener('click', function () { setPane(0); });
    $('#tClose').addEventListener('click', closeTrack);
    $('#tMore').addEventListener('click', closeTrack);
    $('#mine').addEventListener('click', openTrack);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!$('#track').hidden) closeTrack(); else { psheet.close(); csheet.close(); } } });
  }
  function setPane(i, instant) {
    var w = $('#csheet').offsetWidth, to = -i * w; if (paneAnim) paneAnim.stop();
    if (instant) { paneX = to; $('#panes').style.transform = 'translate3d(' + to + 'px,0,0)'; return; }
    paneAnim = S.spring(paneX, to, { response: 0.5 }, function (v) { paneX = v; $('#panes').style.transform = 'translate3d(' + v.toFixed(1) + 'px,0,0)'; });
    var tgt = i ? $('#fName') : null; if (tgt && !tgt.value) setTimeout(function () { tgt.focus({ preventScroll: true }); }, 380);
  }

  /* Producto */
  function openProduct(p) {
    if (p.available === false) return;
    cur = { p: p, sel: {}, qty: 1 };
    (p.groups || []).forEach(function (gid) {
      var g = menu.optionGroups[gid]; cur.sel[gid] = [];
      if (g.type === 'single') g.options.forEach(function (o) { if (o.default) cur.sel[gid] = [o.id]; });
    });
    $('#pTitle').textContent = p.title; $('#pSub').textContent = p.sub; $('#pNote').value = ''; $('#pN').textContent = '1';
    var box = $('#pGroups'); box.textContent = '';
    (p.groups || []).forEach(function (gid) {
      var g = menu.optionGroups[gid], grp = el('div', 'group'), h = el('h3', '', g.label); h.appendChild(el('small', '', g.hint || '')); grp.appendChild(h);
      var list = el('div', 'opts'); list.setAttribute('role', g.type === 'single' ? 'radiogroup' : 'group'); list.setAttribute('aria-label', g.label);
      g.options.forEach(function (o) {
        var b = el('button', 'opt' + (g.type === 'multi' ? ' multi' : '')); b.type = 'button'; b.setAttribute('data-press', ''); b.dataset.g = gid; b.dataset.o = o.id;
        b.setAttribute('role', g.type === 'single' ? 'radio' : 'checkbox');
        b.appendChild(el('span', 'rad')); b.appendChild(el('span', '', o.name)); if (o.price) b.appendChild(el('span', 'p num', '+' + o.price + ' Bs'));
        b.addEventListener('click', function () { pick(gid, o.id); }); list.appendChild(b);
      });
      grp.appendChild(list); box.appendChild(grp);
    });
    paintOpts(); psheet.open();
  }
  function pick(gid, oid) {
    var g = menu.optionGroups[gid], s = cur.sel[gid], i = s.indexOf(oid);
    if (g.type === 'single') cur.sel[gid] = [oid];
    else if (i > -1) s.splice(i, 1);
    else if (s.length < (g.max || g.options.length)) s.push(oid); else { toast('Máximo ' + g.max + ' en ' + g.label.toLowerCase() + '.'); return; }
    buzz(8); paintOpts();
  }
  function curUnit() {
    var u = cur.p.price, ok = true;
    (cur.p.groups || []).forEach(function (gid) {
      var g = menu.optionGroups[gid]; if (g.required && !cur.sel[gid].length) ok = false;
      cur.sel[gid].forEach(function (oid) { g.options.forEach(function (o) { if (o.id === oid) u += o.price || 0; }); });
    });
    return { unit: u, ok: ok };
  }
  function paintOpts() {
    $$('#pGroups .opt').forEach(function (b) { b.setAttribute('aria-checked', cur.sel[b.dataset.g].indexOf(b.dataset.o) > -1 ? 'true' : 'false'); });
    var u = curUnit(); $('#pPrice').textContent = money(u.unit * cur.qty); $('#pAdd').disabled = !u.ok; $('#pN').textContent = String(cur.qty);
  }
  $('#pMinus').addEventListener('click', function () { if (cur.qty > 1) { cur.qty--; paintOpts(); } });
  $('#pPlus').addEventListener('click', function () { if (cur.qty < P.MAX_QTY) { cur.qty++; paintOpts(); } });
  $('#pAdd').addEventListener('click', function () {
    var sel = {}; Object.keys(cur.sel).forEach(function (g) { if (cur.sel[g].length) sel[g] = cur.sel[g].slice(); });
    if (addToCart({ id: cur.p.id, sel: sel, qty: cur.qty, note: $('#pNote').value })) { buzz(14); psheet.close(); }
  });

  /* ---------- Datos y envío del pedido ---------- */
  function buildZones() {
    var sel = $('#fZone'); sel.textContent = ''; var o0 = el('option', '', 'Elige tu zona'); o0.value = ''; sel.appendChild(o0);
    menu.service.zones.forEach(function (z) { var o = el('option', '', z.name + ' · ' + z.fee + ' Bs'); o.value = z.id; sel.appendChild(o); });
    sel.addEventListener('change', totals);
  }
  function restoreMe() {
    try { var me = JSON.parse(ls('z0.me') || '{}'); if (me.name) $('#fName').value = me.name; if (me.phone) $('#fPhone').value = me.phone; if (me.mode) mode = me.mode; } catch (e) {}
  }
  function setupForm() {
    $$('#modeSeg button').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); buzz(8); }); });
    $('#paneForm').addEventListener('submit', submit);
    $$('#paneForm input,#paneForm select').forEach(function (i) { i.addEventListener('input', function () { clearErr(i.closest('.field')); }); });
    window.addEventListener('resize', function () { setPane($('#paneForm').getBoundingClientRect().left < 40 ? 1 : 0, true); });
    setMode(mode, true);
  }
  function setMode(m, silent) {
    mode = m;
    $$('#modeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.mode === m ? 'true' : 'false'); });
    placeThumb();
    $('#gMesa').hidden = m !== 'mesa'; $('#gZone').hidden = m !== 'delivery'; $('#gAddr').hidden = m !== 'delivery';
    totals();
  }
  function placeThumb() { var th = $('#modeSeg .thumb'), on = $('#modeSeg button[aria-pressed="true"]'); if (th && on && on.offsetWidth) { th.style.left = on.offsetLeft + 'px'; th.style.width = on.offsetWidth + 'px'; } }
  function totals() {
    var sub = subtotal(), fee = 0, free = menu.service.freeDeliveryFrom;
    var z = mode === 'delivery' ? P.findZone(menu, $('#fZone').value) : null;
    if (z) fee = free && sub >= free ? 0 : z.fee;
    $('#rowSub').hidden = mode !== 'delivery'; $('#rowFee').hidden = mode !== 'delivery'; $('#fFee').textContent = mode === 'delivery' ? (!z ? 'Elige zona' : fee === 0 ? 'Gratis' : money(fee)) : '';
    $('#fSub').textContent = money(sub); $('#fTot').textContent = money(sub + fee);
  }
  function fieldOf(name) { return document.querySelector('.field[data-f="' + name + '"]'); }
  function showErr(name, msg) {
    var f = fieldOf(name); if (!f) { var fe = $('#formErr'); fe.textContent = msg; fe.hidden = false; return; }
    f.classList.remove('has-err'); void f.offsetWidth; f.classList.add('has-err');
    var m = f.querySelector('.msg'); m.textContent = msg; m.hidden = false; var inp = f.querySelector('input,select'); if (inp) inp.focus({ preventScroll: false });
  }
  function clearErr(f) { if (!f) return; f.classList.remove('has-err'); var m = f.querySelector('.msg'); if (m) m.hidden = true; $('#formErr').hidden = true; }

  function customer() {
    return { mode: mode, name: $('#fName').value, phone: $('#fPhone').value, mesa: $('#fMesa').value, address: $('#fAddr').value, zone: $('#fZone').value, notes: $('#fNotes').value };
  }
  function submit(ev) {
    ev.preventDefault(); if (!cart.length) return;
    $$('#paneForm .field').forEach(clearErr);
    var c = customer(), chk = P.validateOrder(menu, { lines: cart.map(function (x) { return x.raw; }), customer: c });
    if (!chk.ok) { showErr(chk.field || '', chk.error); return; }
    var btn = $('#send'); btn.classList.add('is-loading'); btn.disabled = true;
    fetch('/api/zona0/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lines: cart.map(function (x) { return x.raw; }), customer: c }) })
      .then(function (r) { return r.json().then(function (d) { d.status = r.status; return d; }); })
      .then(function (d) {
        if (!d.ok) { showErr(d.field || '', d.error || 'No pudimos enviar tu pedido.'); return; }
        var o = d.order; ls('z0.me', JSON.stringify({ name: c.name, phone: c.phone, mode: mode }));
        track = { n: o.orderId.replace('#', ''), p: String(o.customer.phone).slice(-4), mode: o.mode, total: o.total, at: Date.now(), prepMin: d.prepMin, status: 'nuevo', seen: 'nuevo' };
        ls('z0.last', JSON.stringify(track));
        var touched = cart.map(function (x) { return x.raw.id; }); cart = []; touched.forEach(function (id) { afterCart(id); });
        buzz([20, 40, 20]); csheet.close();
        setTimeout(function () { openTrack(); }, 380);
      })
      .catch(function () { showErr('', 'Sin conexión. Revisa tu internet e intenta otra vez.'); })
      .then(function () { btn.classList.remove('is-loading'); btn.disabled = false; });
  }

  /* ---------- Seguimiento en vivo ---------- */
  var pollT = 0, unchanged = 0, polling = false;
  function resumeTrack() {
    try { var t = JSON.parse(ls('z0.last') || 'null'); if (t && Date.now() - t.at < 6 * 3600 * 1000 && !FINAL[t.status]) { track = t; $('#mine').hidden = false; fetchStatus(true); } } catch (e) {}
    document.addEventListener('visibilitychange', function () { if (!document.hidden && track && !FINAL[track.status] && !$('#track').hidden) { clearTimeout(pollT); fetchStatus(); } });
  }
  function openTrack() {
    if (!track) return;
    var tr = $('#track'); tr.hidden = false; document.body.style.overflow = 'hidden';
    tr.style.opacity = '0'; tr.style.transform = 'translateY(24px) scale(.98)';
    S.spring(0, 1, { response: 0.55 }, function (v) { tr.style.opacity = String(Math.min(1, v)); tr.style.transform = 'translateY(' + ((1 - v) * 24).toFixed(1) + 'px) scale(' + (0.98 + 0.02 * v).toFixed(4) + ')'; });
    var parts = track.n.split('-'); var h = $('#tNum'); h.textContent = '#' + parts[0]; h.appendChild(el('small', '', parts[1]));
    paintTrack(true); unchanged = 0; clearTimeout(pollT); fetchStatus();
  }
  function closeTrack() {
    var tr = $('#track'); document.body.style.overflow = ''; clearTimeout(pollT);
    S.spring(1, 0, { response: 0.4 }, function (v) { tr.style.opacity = String(Math.max(0, v)); tr.style.transform = 'translateY(' + ((1 - v) * 24).toFixed(1) + 'px)'; }, function () { tr.hidden = true; });
    var m = $('#mine'); m.hidden = !(track && !FINAL[track.status]);
    if (track && !FINAL[track.status]) { clearTimeout(pollT); pollT = setTimeout(fetchStatus, 20000); }
  }
  function fetchStatus(quiet) {
    if (!track || polling) return; if (document.hidden) { pollT = setTimeout(fetchStatus, 15000); return; }
    polling = true;
    fetch('/api/zona0/track?n=' + encodeURIComponent(track.n) + '&p=' + encodeURIComponent(track.p), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) { if (!quiet) $('#tFine').textContent = d.error || ''; return; }
        var changed = d.status !== track.status; track.status = d.status; ls('z0.last', JSON.stringify(track));
        if (changed) { unchanged = 0; buzz([30, 60, 30]); } else unchanged++;
        $('#mineText').textContent = d.status === 'listo' ? 'Tu pedido está listo' : 'Mi pedido';
        $('#mine').hidden = !!FINAL[d.status] && $('#track').hidden;
        if (!$('#track').hidden) paintTrack(false);
      })
      .catch(function () {})
      .then(function () {
        polling = false;
        if (!track || FINAL[track.status] || Date.now() - track.at > 3 * 3600 * 1000) return;
        /* 10 s al principio; si nada cambia, se espacia hasta 40 s para cuidar los créditos */
        pollT = setTimeout(fetchStatus, Math.min(40000, 10000 + unchanged * 3000));
      });
  }
  var MSG = {
    nuevo: ['Recibimos tu pedido.', 'Cocina ya lo tiene en pantalla.'],
    preparando: ['Estamos preparando tu pedido.', ''],
    listo: { mesa: 'Tu pedido está listo, ya te lo llevamos a la mesa.', recojo: 'Tu pedido está listo. Pásalo a recoger.', delivery: 'Tu pedido está listo y sale a tu dirección.' },
    entregado: ['Entregado. Buen provecho y buena ruta.', ''],
    cancelado: ['Este pedido fue cancelado. Si fue un error, avísanos en el local.', '']
  };
  function paintTrack(first) {
    var st = track.status || 'nuevo', idx = TIMELINE.indexOf(st), msg = MSG[st];
    $('#tMsg').textContent = st === 'listo' ? msg[track.mode] : msg[0];
    var steps = $('#steps'); steps.classList.toggle('cancel', st === 'cancelado');
    $('#lblListo').textContent = track.mode === 'delivery' ? 'Sale a tu puerta' : 'Listo';
    $('#subListo').textContent = track.mode === 'mesa' ? 'Te lo llevamos a la mesa' : track.mode === 'recojo' ? 'Pásalo a recoger' : 'En camino a tu dirección';
    $$('#steps li').forEach(function (li, i) {
      li.classList.toggle('done', idx > -1 && (i < idx || (st === 'entregado' && i === idx)));
      li.classList.toggle('now', idx > -1 && i === idx && st !== 'entregado');
    });
    steps.style.setProperty('--p', idx < 0 ? 0 : (idx / 3).toFixed(3));
    $('#tFine').textContent = st === 'nuevo' || st === 'preparando' ? 'Tiempo estimado: unos ' + (track.prepMin || menu.service.prepMin) + ' min. Esta pantalla se actualiza sola.' : '';
    if (!first && track.seen !== st) { track.seen = st; }
  }
})();
