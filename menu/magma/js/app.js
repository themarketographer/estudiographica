/* Menú de Magma Wings: catálogo, pedido y envío por WhatsApp.
   Datos:   /api/magma/menu (o menu.json si la API no responde)
   Pedido:  /api/magma/order (si falla, el mensaje se arma aquí con las mismas reglas)
   Eventos: window.Magma.on('add_to_cart', fn) y document 'magma:add_to_cart'. Ver README.md */
(function () {
  'use strict';

  var P = window.MagmaPricing;
  var CART_KEY = 'magma.cart.v1';
  var CUST_KEY = 'magma.customer.v1';
  var LAST_KEY = 'magma.last.v1';
  var LAST_TTL = 1000 * 60 * 60 * 12;

  var menu = null;
  var lines = [];
  var lastOrder = null;
  var cartView = 'cart';
  var itemState = null;
  var removed = null;
  var spyLock = 0;
  var openCount = 0;
  var sending = false;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var sheetMode = window.matchMedia('(max-width: 759px)');

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- utilidades ---------- */

  function h(tag, attrs) {
    var node = document.createElement(tag);
    var k, v;
    for (k in (attrs || {})) {
      v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    add(node, Array.prototype.slice.call(arguments, 2));
    return node;
  }
  function add(node, kids) {
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) add(node, c);
      else node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
  }
  function icon(id, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#' + id);
    s.appendChild(u);
    return s;
  }
  function store(key, val) {
    try { if (val == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function money(n) { return P.money(n, menu ? menu.brand.currency : 'Bs'); }
  function fetchTimeout(url, opts, ms) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    opts = opts || {};
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }

  /* ---------- eventos y analítica ---------- */

  var listeners = {};
  var GA = { item_view: 'view_item', add_to_cart: 'add_to_cart', remove_from_cart: 'remove_from_cart', cart_open: 'view_cart', checkout_start: 'begin_checkout', order_sent: 'generate_lead' };
  var FB = { item_view: 'ViewContent', add_to_cart: 'AddToCart', checkout_start: 'InitiateCheckout', order_sent: 'Lead' };

  function items(ls) {
    return ls.map(function (l) { return { item_id: l.id, item_name: l.name, price: l.unitPrice, quantity: l.qty }; });
  }
  function emit(name, data) {
    var detail = Object.assign({ name: name, ts: Date.now() }, data || {});
    (listeners[name] || []).concat(listeners['*'] || []).forEach(function (fn) { try { fn(detail); } catch (e) {} });
    try { document.dispatchEvent(new CustomEvent('magma:' + name, { detail: detail })); } catch (e) {}
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: 'magma_' + name }, detail));
      var value = detail.value || 0;
      if (typeof window.gtag === 'function' && GA[name]) {
        window.gtag('event', GA[name], { currency: 'BOB', value: value, items: detail.items || [] });
      }
      if (typeof window.fbq === 'function' && FB[name]) {
        window.fbq('track', FB[name], {
          currency: 'BOB', value: value, content_type: 'product',
          content_ids: (detail.items || []).map(function (i) { return i.item_id; }),
          num_items: detail.count || undefined
        });
      }
    } catch (e) {}
  }
  function loadTracking(t) {
    t = t || {};
    if (t.ga4 && !window.gtag) {
      var s = document.createElement('script');
      s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(t.ga4);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', t.ga4);
    }
    if (t.metaPixel && !window.fbq) {
      !(function (f, b, e, v, n, tt, s2) {
        if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
        tt = b.createElement(e); tt.async = true; tt.src = v; s2 = b.getElementsByTagName(e)[0]; s2.parentNode.insertBefore(tt, s2);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', t.metaPixel);
      window.fbq('track', 'PageView');
    }
  }

  /* ---------- hojas (diálogos) ---------- */

  function openSheet(dlg, opener) {
    if (dlg.open) return;
    dlg._opener = opener || document.activeElement;
    dlg.showModal();
    document.documentElement.classList.add('locked');
    openCount++;
    void dlg.offsetHeight;
    dlg.classList.add('open');
  }
  function closeSheet(dlg) {
    if (!dlg.open || dlg._closing) return;
    dlg._closing = true;
    dlg.style.transform = '';
    dlg.classList.remove('open');
    var finished = false;
    function fin() {
      if (finished) return;
      finished = true;
      dlg.removeEventListener('transitionend', onEnd);
      dlg.close();
      dlg._closing = false;
      openCount = Math.max(0, openCount - 1);
      if (!openCount) document.documentElement.classList.remove('locked');
      var o = dlg._opener;
      if (o && document.contains(o) && o.focus) { try { o.focus({ preventScroll: true }); } catch (e) {} }
      if (dlg.id === 'cartDlg') emit('cart_close');
    }
    function onEnd(e) { if (e.target === dlg) fin(); }
    dlg.addEventListener('transitionend', onEnd);
    setTimeout(fin, 560);
  }
  function wireSheet(dlg) {
    dlg.addEventListener('cancel', function (e) { e.preventDefault(); closeSheet(dlg); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) closeSheet(dlg);
      else if (e.target.closest && e.target.closest('[data-close]')) closeSheet(dlg);
    });
    var grab = $('[data-grab]', dlg);
    var id = null, startY = 0, lastY = 0, lastT = 0, vel = 0, dy = 0, height = 0;
    grab.addEventListener('pointerdown', function (e) {
      if (!sheetMode.matches || e.button > 0 || (e.target.closest && e.target.closest('button'))) return;
      id = e.pointerId; grab.setPointerCapture(id);
      startY = lastY = e.clientY; lastT = performance.now(); vel = 0; dy = 0; height = dlg.offsetHeight;
      dlg.style.transition = 'none';
    });
    grab.addEventListener('pointermove', function (e) {
      if (e.pointerId !== id) return;
      var now = performance.now();
      var raw = e.clientY - startY;
      /* hacia abajo sigue al dedo 1:1; hacia arriba resiste con fricción */
      dy = raw >= 0 ? raw : -(Math.abs(raw) * 0.55 * 200) / (200 + 0.55 * Math.abs(raw));
      var dt = Math.max(1, now - lastT);
      vel = 0.8 * ((e.clientY - lastY) / dt) + 0.2 * vel;
      lastY = e.clientY; lastT = now;
      dlg.style.transform = 'translateY(' + dy + 'px)';
    });
    function end(e) {
      if (e.pointerId !== id) return;
      id = null;
      dlg.style.transition = '';
      /* proyección de inercia (vel en px/ms): dónde terminaría el gesto si siguiera con su velocidad */
      var projected = dy + vel * 0.998 / (1 - 0.998);
      if (dy > 0 && (projected > height * 0.45 || vel > 0.5)) closeSheet(dlg);
      else dlg.style.transform = '';
    }
    grab.addEventListener('pointerup', end);
    grab.addEventListener('pointercancel', end);
  }

  /* ---------- toast ---------- */

  var toastTimer = 0;
  function toast(msg, actionLabel, onAction) {
    var t = $('#toast');
    clearTimeout(toastTimer);
    /* Un diálogo modal deja inerte todo lo que está fuera de él, así que el aviso se muda dentro del que esté abierto. */
    var host = $('#itemDlg').open ? $('#itemDlg') : ($('#cartDlg').open ? $('#cartDlg') : document.body);
    if (t.parentNode !== host) host.appendChild(t);
    t.classList.toggle('in-sheet', host !== document.body);
    t.textContent = '';
    t.appendChild(h('span', { text: msg }));
    if (actionLabel) t.appendChild(h('button', { type: 'button', text: actionLabel, onclick: function () { hideToast(); onAction(); } }));
    t.hidden = false;
    void t.offsetHeight;
    t.classList.add('on');
    toastTimer = setTimeout(hideToast, actionLabel ? 6000 : 3200);
  }
  function hideToast() {
    var t = $('#toast');
    clearTimeout(toastTimer);
    t.classList.remove('on');
    toastTimer = setTimeout(function () { t.hidden = true; }, 300);
  }

  /* ---------- carrito ---------- */

  function commit(rawList) {
    var by = {}, out = [];
    rawList.forEach(function (r) {
      var x = P.resolveLine(menu, r);
      if (!x.ok) return;
      var l = x.line;
      if (by[l.key]) {
        by[l.key].qty = Math.min(P.MAX_QTY, by[l.key].qty + l.qty);
        by[l.key].total = by[l.key].unitPrice * by[l.key].qty;
      } else { by[l.key] = l; out.push(l); }
    });
    lines = out;
    store(CART_KEY, { v: 1, lines: lines.map(P.toRaw) });
    renderBar();
    if ($('#cartDlg').open && cartView !== 'done') renderCart();
  }
  function rawLines() { return lines.map(P.toRaw); }
  function totals() {
    return { total: lines.reduce(function (s, l) { return s + l.total; }, 0), count: lines.reduce(function (s, l) { return s + l.qty; }, 0) };
  }
  function addToCart(raw) {
    var before = totals().count;
    commit(rawLines().concat([raw]));
    var res = P.resolveLine(menu, raw);
    emit('add_to_cart', { value: res.ok ? res.line.unitPrice * raw.qty : 0, items: res.ok ? items([res.line]) : [], count: raw.qty, cartCount: totals().count, cartTotal: totals().total });
    bump(before === 0);
  }
  function setQty(key, q) {
    var l = lines.filter(function (x) { return x.key === key; })[0];
    if (!l) return;
    if (q < 1) return removeLine(key);
    commit(rawLines().map(function (r, i) { return lines[i].key === key ? { id: r.id, sel: r.sel, qty: Math.min(q, P.MAX_QTY) } : r; }));
    emit('update_cart', { id: l.id, qty: q, cartTotal: totals().total });
  }
  function removeLine(key) {
    var idx = -1;
    lines.forEach(function (l, i) { if (l.key === key) idx = i; });
    if (idx < 0) return;
    var line = lines[idx];
    removed = { raw: P.toRaw(line), index: idx, name: line.name };
    var list = rawLines();
    list.splice(idx, 1);
    commit(list);
    emit('remove_from_cart', { value: line.total, items: items([line]), count: line.qty });
    toast('Quitaste ' + line.qty + 'x ' + line.name, 'Deshacer', undoRemove);
  }
  function undoRemove() {
    if (!removed) return;
    var list = rawLines();
    list.splice(Math.min(removed.index, list.length), 0, removed.raw);
    removed = null;
    commit(list);
    emit('undo_remove');
  }
  function clearCart() { commit([]); }

  function restoreFromStorage() {
    var saved = load(CART_KEY);
    if (saved && Array.isArray(saved.lines) && saved.lines.length) {
      var n = saved.lines.length;
      commit(saved.lines);
      if (lines.length < n) toast('Actualizamos tu pedido: algo del menú cambió.');
    }
    var l = load(LAST_KEY);
    if (l && l.at && Date.now() - l.at < LAST_TTL && Array.isArray(l.lines)) lastOrder = l;
  }

  function bump(first) {
    var bar = $('#cartBar');
    if (first || reduceMotion.matches || !bar.animate) return;
    bar.animate([
      { transform: 'translate(-50%,0) scale(1)' },
      { transform: 'translate(-50%,0) scale(1.035)', offset: 0.4 },
      { transform: 'translate(-50%,0) scale(1)' }
    ], { duration: 240, easing: 'cubic-bezier(.23,1,.32,1)' });
  }

  function renderBar() {
    var t = totals();
    var bar = $('#cartBar');
    var on = t.count > 0;
    $('#cartCount').textContent = t.count;
    $('#cartTotal').textContent = money(t.total);
    $('#cartStatus').textContent = on ? t.count + (t.count === 1 ? ' producto' : ' productos') + ' en tu pedido, ' + money(t.total) : 'Tu pedido está vacío';
    bar.classList.toggle('on', on);
    if (on) bar.removeAttribute('inert'); else bar.setAttribute('inert', '');
    document.body.classList.toggle('has-cart', on);
  }

  function summaryOf(l) {
    return l.choices.map(function (c) {
      return c.label + ': ' + c.options.map(function (o) { return o.name; }).join(', ');
    }).join(' · ');
  }

  /* ---------- hoja de producto ---------- */

  function unitOf(st) {
    var u = st.product.price;
    (st.product.groups || []).forEach(function (gid) {
      var opts = P.groupOptions(menu, menu.optionGroups[gid]);
      (st.sel[gid] || []).forEach(function (oid) {
        opts.forEach(function (o) { if (o.id === oid) u += o.price || 0; });
      });
    });
    return u;
  }
  function openItem(pid, edit, opener) {
    var hit = P.findProduct(menu, pid);
    if (!hit || hit.product.available === false) return;
    var st = { product: hit.product, category: hit.category, sel: {}, qty: 1, editKey: null };
    (hit.product.groups || []).forEach(function (gid) {
      var opts = P.groupOptions(menu, menu.optionGroups[gid]);
      st.sel[gid] = opts.filter(function (o) { return o.default; }).map(function (o) { return o.id; });
    });
    if (edit) {
      Object.keys(edit.sel).forEach(function (g) { st.sel[g] = edit.sel[g].slice(); });
      st.qty = edit.qty; st.editKey = edit.key;
    }
    itemState = st;
    renderItem();
    openSheet($('#itemDlg'), opener);
    if (!edit) emit('item_view', { value: st.product.price, items: [{ item_id: st.product.id, item_name: st.product.name, price: st.product.price, quantity: 1 }] });
  }
  function renderItem() {
    var st = itemState;
    $('#itemTitle').textContent = st.product.name;
    var body = $('#itemBody');
    body.textContent = '';
    body.appendChild(h('p', { class: 'lead', text: st.category.sub + '. ' + st.product.qty + ' ' + st.product.unit + ' por ' + money(st.product.price) + '.' }));
    (st.product.groups || []).forEach(function (gid) { body.appendChild(groupEl(gid)); });
    renderItemFoot();
    syncOptions();
  }
  function groupEl(gid) {
    var g = menu.optionGroups[gid];
    var multi = g.type === 'multi';
    var opts = P.groupOptions(menu, g);
    var box = h('div', { class: 'opts' });
    opts.forEach(function (o) {
      var input = h('input', { type: multi ? 'checkbox' : 'radio', name: 'g-' + gid, value: o.id, checked: (itemState.sel[gid] || []).indexOf(o.id) > -1 });
      var price = o.price ? '+' + o.price + ' ' + menu.brand.currency : (o.default ? 'Incluido' : '');
      var label = h('label', { class: 'opt' + (multi ? ' multi' : '') },
        input,
        h('span', { class: 'mark' }, icon('i-check')),
        h('span', { class: 'nm' }, o.name, o.desc ? h('small', { text: o.desc }) : null),
        price ? h('span', { class: 'pr', text: price }) : null);
      input.addEventListener('change', function () {
        var cur = itemState.sel[gid] || [];
        if (multi) {
          cur = input.checked ? cur.concat([o.id]) : cur.filter(function (x) { return x !== o.id; });
        } else cur = [o.id];
        itemState.sel[gid] = cur;
        clearGroupError(gid);
        syncOptions();
        renderItemFoot();
      });
      box.appendChild(label);
    });
    return h('fieldset', { class: 'group', 'data-g': gid }, h('legend', {}, g.label, h('small', { text: g.hint || '' })), box, h('p', { class: 'field-err', role: 'alert', hidden: true }));
  }
  function syncOptions() {
    $$('#itemBody .group').forEach(function (fs) {
      var gid = fs.getAttribute('data-g');
      var g = menu.optionGroups[gid];
      var cur = itemState.sel[gid] || [];
      var full = g.type === 'multi' && cur.length >= (g.max || 99);
      $$('.opt', fs).forEach(function (lab) {
        var input = $('input', lab);
        var on = cur.indexOf(input.value) > -1;
        input.checked = on;
        lab.classList.toggle('on', on);
        var off = full && !on;
        lab.classList.toggle('off', off);
        input.disabled = off;
      });
    });
  }
  function showGroupError(gid, msg) {
    var fs = $('#itemBody .group[data-g="' + gid + '"]');
    if (!fs) return;
    fs.classList.add('err');
    var p = $('.field-err', fs);
    p.textContent = msg; p.hidden = false;
    fs.scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    var first = $('input', fs);
    if (first) first.focus({ preventScroll: true });
  }
  function clearGroupError(gid) {
    var fs = $('#itemBody .group[data-g="' + gid + '"]');
    if (!fs) return;
    fs.classList.remove('err');
    $('.field-err', fs).hidden = true;
  }
  function renderItemFoot() {
    var st = itemState;
    var foot = $('#itemFoot');
    foot.textContent = '';
    var out = h('output', { 'aria-live': 'polite', text: String(st.qty) });
    var minus = h('button', { type: 'button', 'aria-label': 'Menos', onclick: function () { if (st.qty > 1) { st.qty--; renderItemFoot(); } } }, icon('i-minus'));
    var plus = h('button', { type: 'button', 'aria-label': 'Más', onclick: function () { if (st.qty < P.MAX_QTY) { st.qty++; renderItemFoot(); } } }, icon('i-plus'));
    if (st.qty <= 1) minus.setAttribute('aria-disabled', 'true');
    foot.appendChild(h('div', { class: 'stepper' }, minus, out, plus));
    foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: submitItem, text: (st.editKey ? 'Guardar' : 'Agregar') + ' · ' + money(unitOf(st) * st.qty) }));
  }
  function submitItem() {
    var st = itemState;
    var raw = { id: st.product.id, sel: st.sel, qty: st.qty };
    var r = P.resolveLine(menu, raw);
    if (!r.ok) {
      if (r.missing) showGroupError(r.missing, 'Elige una opción para continuar.');
      return;
    }
    if (st.editKey) {
      var list = rawLines().filter(function (x, i) { return lines[i].key !== st.editKey; });
      commit(list.concat([raw]));
      emit('edit_cart_item', { id: st.product.id });
    } else addToCart(raw);
    closeSheet($('#itemDlg'));
  }

  /* ---------- hoja del pedido ---------- */

  function openCart() {
    cartView = 'cart';
    renderCart();
    openSheet($('#cartDlg'), $('#cartBar'));
    emit('cart_open', { value: totals().total, items: items(lines), count: totals().count });
  }
  function renderCart() {
    var body = $('#cartBody'), foot = $('#cartFoot'), title = $('#cartTitle'), back = $('#cartBack');
    body.textContent = ''; foot.textContent = '';
    back.hidden = cartView !== 'details';
    if (cartView === 'cart') {
      title.textContent = 'Tu pedido';
      if (!lines.length) return renderEmpty(body, foot);
      var ul = h('ul', { class: 'lines' });
      lines.forEach(function (l) {
        var minus = h('button', { type: 'button', 'aria-label': l.qty === 1 ? 'Quitar ' + l.name : 'Menos ' + l.name, onclick: function () { setQty(l.key, l.qty - 1); } }, icon(l.qty === 1 ? 'i-trash' : 'i-minus'));
        var plus = h('button', { type: 'button', 'aria-label': 'Más ' + l.name, onclick: function () { setQty(l.key, l.qty + 1); } }, icon('i-plus'));
        if (l.qty >= P.MAX_QTY) plus.setAttribute('aria-disabled', 'true');
        ul.appendChild(h('li', { class: 'line' },
          h('h3', { text: l.name }),
          h('span', { class: 'amt', text: money(l.total) }),
          summaryOf(l) ? h('p', { class: 'opts-sum', text: summaryOf(l) }) : null,
          h('div', { class: 'ctl' },
            h('div', { class: 'stepper' }, minus, h('output', { text: String(l.qty) }), plus),
            h('button', { class: 'link', type: 'button', text: 'Editar', onclick: function (e) { openItem(l.id, { sel: P.toRaw(l).sel, qty: l.qty, key: l.key }, e.currentTarget); } }))));
      });
      body.appendChild(ul);
      body.appendChild(h('div', { class: 'sum' }, h('span', { text: 'Total productos' }), h('b', { text: money(totals().total) })));
      if (menu.service.delivery) body.appendChild(h('p', { class: 'small', text: menu.service.deliveryNote }));
      foot.appendChild(h('button', { class: 'btn block', type: 'button', text: 'Continuar', onclick: function () { cartView = 'details'; renderCart(); emit('checkout_start', { value: totals().total, items: items(lines), count: totals().count }); } }));
    } else if (cartView === 'details') {
      title.textContent = 'Tus datos';
      renderDetails(body, foot);
    } else if (cartView === 'done') {
      title.textContent = 'Pedido listo';
      renderDone(body, foot);
    }
    $('.sheet-body', $('#cartDlg')).scrollTop = 0;
  }
  function renderEmpty(body, foot) {
    var kids = [h('p', { text: 'Tu pedido está vacío. Las alitas no se piden solas.' })];
    kids.push(h('button', { class: 'btn', type: 'button', text: 'Ver el menú', onclick: function () { closeSheet($('#cartDlg')); } }));
    if (lastOrder) kids.push(h('p', { class: 'small' }, h('button', { class: 'link', type: 'button', text: 'Repetir mi último pedido (' + lastOrder.orderId + ')', onclick: restoreLast })));
    body.appendChild(h('div', { class: 'empty' }, kids));
  }
  function restoreLast() {
    if (!lastOrder) return;
    commit(lastOrder.lines);
    cartView = 'cart';
    renderCart();
    emit('order_edit', { orderId: lastOrder.orderId });
  }

  function renderDetails(body, foot) {
    var saved = load(CUST_KEY) || {};
    var both = menu.service.pickup !== false && menu.service.delivery;
    var mode = saved.mode === 'delivery' && menu.service.delivery ? 'delivery' : (menu.service.pickup === false ? 'delivery' : 'pickup');
    var name = h('input', { type: 'text', id: 'fName', name: 'name', autocomplete: 'name', maxlength: '60', value: saved.name || '', 'aria-describedby': 'eName', enterkeyhint: 'next' });
    var addr = h('textarea', { id: 'fAddr', name: 'address', autocomplete: 'street-address', maxlength: '160', rows: '2', 'aria-describedby': 'eAddr', placeholder: 'Calle, número y una referencia' });
    addr.value = saved.address || '';
    var notes = h('textarea', { id: 'fNotes', name: 'notes', maxlength: '240', rows: '2', placeholder: 'Sin cebolla, más servilletas, lo que necesites' });
    var fAddr = h('div', { class: 'f', id: 'rowAddr' }, h('label', { for: 'fAddr' }, 'Dirección', h('br'), h('small', { text: menu.service.deliveryNote })), addr, h('p', { class: 'field-err', id: 'eAddr', role: 'alert', hidden: true }));
    var seg = null;
    if (both) {
      var mk = function (val, label) {
        var input = h('input', { type: 'radio', name: 'mode', value: val, checked: mode === val });
        var lab = h('label', { class: 'opt' + (mode === val ? ' on' : '') }, input, h('span', { class: 'nm', text: label }));
        input.addEventListener('change', function () {
          mode = val;
          $$('.seg .opt').forEach(function (x) { x.classList.toggle('on', $('input', x).checked); });
          fAddr.hidden = mode !== 'delivery';
        });
        return lab;
      };
      seg = h('div', { class: 'f' }, h('span', { class: 'lab', text: '¿Cómo lo recibes?' }), h('div', { class: 'seg' }, mk('pickup', 'Recojo en el local'), mk('delivery', 'Entrega')));
    }
    fAddr.hidden = mode !== 'delivery';
    var form = h('form', { class: 'form', id: 'orderForm', novalidate: true, onsubmit: function (e) { e.preventDefault(); sendOrder(function () { return { name: name.value, mode: mode, address: addr.value, notes: notes.value }; }); } },
      h('div', { class: 'f', id: 'rowName' }, h('label', { for: 'fName', text: 'Tu nombre' }), name, h('p', { class: 'field-err', id: 'eName', role: 'alert', hidden: true })),
      seg, fAddr,
      h('div', { class: 'f' }, h('label', { for: 'fNotes' }, 'Notas ', h('small', { text: '(opcional)' })), notes),
      h('div', { class: 'sum' }, h('span', { text: 'Total productos' }), h('b', { text: money(totals().total) })));
    form.addEventListener('input', function (e) {
      var row = e.target.closest && e.target.closest('.f');
      if (!row || !row.classList.contains('err')) return;
      row.classList.remove('err');
      var er = $('.field-err', row);
      if (er) er.hidden = true;
    });
    body.appendChild(form);
    var btn = h('button', { class: 'btn wa block', type: 'submit', id: 'sendBtn', form: 'orderForm' }, icon('i-wa'), 'Enviar por WhatsApp');
    foot.appendChild(btn);
  }

  function fieldError(field, msg) {
    var map = { name: ['rowName', 'eName', 'fName'], address: ['rowAddr', 'eAddr', 'fAddr'] };
    $$('.f.err').forEach(function (x) { x.classList.remove('err'); });
    $$('.field-err', $('#cartBody')).forEach(function (x) { x.hidden = true; });
    var m = map[field];
    if (!m) { toast(msg); return; }
    $('#' + m[0]).classList.add('err');
    var e = $('#' + m[1]); e.textContent = msg; e.hidden = false;
    $('#' + m[2]).focus();
  }

  function setSending(on) {
    sending = on;
    var b = $('#sendBtn');
    if (!b) return;
    b.disabled = on;
    b.textContent = '';
    if (on) b.appendChild(h('span', { class: 'spinner', 'aria-hidden': 'true' }));
    else b.appendChild(icon('i-wa'));
    b.appendChild(document.createTextNode(on ? 'Enviando…' : 'Enviar por WhatsApp'));
  }

  function sendOrder(read) {
    if (sending) return;
    var customer = read();
    var c = P.cleanCustomer(menu, customer);
    if (!c.ok) return fieldError(c.field, c.error);
    store(CUST_KEY, { name: c.customer.name, mode: c.customer.mode, address: c.customer.address });
    var payload = { lines: rawLines(), customer: c.customer };
    emit('order_submit', { value: totals().total, items: items(lines), count: totals().count, mode: c.customer.mode });
    setSending(true);
    fetchTimeout('/api/magma/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }, 6000)
      .then(function (res) {
        if (res.status === 422) {
          return res.json().then(function (d) { setSending(false); fieldError(d.field, d.error || 'Revisa tu pedido.'); emit('order_error', { reason: d.error }); });
        }
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json().then(function (d) {
          if (!d || !d.ok) throw new Error('bad payload');
          finishOrder(d, c.customer, false);
        });
      })
      .catch(function (err) {
        if (!sending) return;
        /* La API no respondió: armamos el pedido aquí con las mismas reglas y seguimos. */
        var v = P.validateOrder(menu, payload);
        if (!v.ok) { setSending(false); toast(v.error); emit('order_error', { reason: v.error }); return; }
        emit('order_fallback', { reason: err && err.message });
        finishOrder({ orderId: v.order.orderId, total: v.order.total, count: v.order.count, message: v.order.message, whatsappUrl: v.order.whatsappUrl }, c.customer, true);
      });
  }

  function finishOrder(d, customer, fallback) {
    var snapshot = { at: Date.now(), orderId: d.orderId, lines: rawLines(), customer: customer, message: d.message, whatsappUrl: d.whatsappUrl, total: d.total };
    var ev = { value: d.total, items: items(lines), count: totals().count, orderId: d.orderId, mode: customer.mode, fallback: !!fallback };
    lastOrder = snapshot;
    store(LAST_KEY, snapshot);
    clearCart();
    setSending(false);
    cartView = 'done';
    renderCart();
    emit('order_sent', ev);
    setTimeout(function () { if (cartView === 'done') window.location.href = d.whatsappUrl; }, reduceMotion.matches ? 0 : 450);
  }

  function renderDone(body, foot) {
    var o = lastOrder;
    body.appendChild(h('div', { class: 'done' },
      h('div', { class: 'tick' }, icon('i-check')),
      h('h3', { text: 'Pedido ' + o.orderId }),
      h('p', { text: 'Abrimos WhatsApp con tu pedido listo. Envía el mensaje y lo confirmamos contigo.' }),
      h('div', { class: 'stack' },
        h('a', { class: 'btn wa block', href: o.whatsappUrl, rel: 'noopener', onclick: function () { emit('whatsapp_click', { source: 'done', orderId: o.orderId }); } }, icon('i-wa'), 'Abrir WhatsApp'),
        h('button', { class: 'btn ghost block', type: 'button', onclick: function () { copyText(o.message); } }, icon('i-copy'), 'Copiar mensaje'),
        h('button', { class: 'link', type: 'button', text: 'Editar pedido', onclick: restoreLast })),
      h('pre', { class: 'preview', text: o.message })));
    foot.appendChild(h('button', { class: 'btn ghost block', type: 'button', text: 'Cerrar', onclick: function () { closeSheet($('#cartDlg')); } }));
  }
  function copyText(t) {
    var done = function () { toast('Mensaje copiado'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { toast('No pudimos copiar. Selecciónalo a mano.'); });
    else toast('Tu navegador no deja copiar. Selecciónalo a mano.');
  }

  /* ---------- catálogo ---------- */

  function renderMenu() {
    var main = $('#menu');
    main.textContent = '';
    var nav = $('#nav');
    nav.textContent = '';
    menu.categories.forEach(function (c, i) {
      var body;
      if (c.kind === 'products') {
        body = h('ul', { class: 'rows' }, c.products.map(function (p) {
          var gone = p.available === false;
          return h('li', {}, h('button', { class: 'row', type: 'button', 'data-pid': p.id, disabled: gone, 'aria-label': p.name + ', ' + money(p.price) + (gone ? ', agotado' : '. Elegir opciones y agregar') },
            h('span', { class: 'q', text: String(p.qty) }),
            h('span', { class: 'u', text: p.unit }),
            h('span', { class: 'p' }, String(p.price), h('small', { text: menu.brand.currency })),
            gone ? h('span', { class: 'gone', text: 'Agotado' }) : h('span', { class: 'add', 'aria-hidden': 'true' }, icon('i-plus'))));
        }));
      } else if (c.kind === 'info') {
        body = h('div', {}, h('ul', { class: 'list' }, c.items.map(function (it) { return h('li', {}, h('b', { text: it.name }), ' ' + it.desc); })), c.note ? h('p', { class: 'note', text: c.note }) : null);
      } else {
        body = h('div', {}, h('ul', { class: 'sauces' }, menu.sauces.map(function (s) { return h('li', { text: s.name }); })), c.note ? h('p', { class: 'note', text: c.note }) : null);
      }
      main.appendChild(h('section', { class: 'sec ' + c.tone + (i % 2 ? ' flip' : ''), id: c.id, 'aria-labelledby': c.id + '-h' },
        h('div', { class: 'in' },
          h('div', { class: 'photo' }, h('img', { src: c.photo, alt: c.alt, decoding: 'async', loading: i ? 'lazy' : null })),
          h('div', { class: 'txt' }, h('h2', { id: c.id + '-h', text: c.title }), h('div', { class: 'sub', text: c.sub }), body))));
      nav.appendChild(h('a', { href: '#' + c.id, 'data-id': c.id, 'aria-current': i === 0 ? 'true' : null, text: c.title }));
    });
    main.removeAttribute('aria-busy');
    main.addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('.row');
      if (row && !row.disabled) openItem(row.getAttribute('data-pid'), null, row);
    });
    nav.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a) return;
      e.preventDefault();
      var id = a.getAttribute('data-id');
      var sec = document.getElementById(id);
      spyLock = Date.now() + 900;
      setActive(id);
      sec.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      try { history.replaceState(null, '', '#' + id); } catch (er) {}
      emit('category_select', { category: id });
    });
    setupSpy();
    setupReveal();
  }

  function setActive(id) {
    var wrap = $('#nav');
    $$('a', wrap).forEach(function (a) {
      var on = a.getAttribute('data-id') === id;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on) {
        var left = a.offsetLeft - (wrap.clientWidth - a.offsetWidth) / 2;
        if (wrap.scrollWidth > wrap.clientWidth) wrap.scrollTo({ left: left, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      }
    });
  }
  function setupSpy() {
    if (!('IntersectionObserver' in window)) return;
    var navH = $('#navWrap').offsetHeight;
    var io = new IntersectionObserver(function (entries) {
      if (Date.now() < spyLock) return;
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: '-' + (navH + 24) + 'px 0px -55% 0px', threshold: 0 });
    $$('.sec').forEach(function (s) { io.observe(s); });
  }
  function setupReveal() {
    if (!('IntersectionObserver' in window) || reduceMotion.matches) return;
    document.documentElement.classList.add('js-reveal');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { var img = $('img', en.target); if (img) img.classList.add('shown'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.01 });
    $$('.photo').forEach(function (box) { io.observe(box); });
  }

  function renderFooter() {
    var b = menu.brand;
    $('#tagline').textContent = b.tagline;
    var wa = $('#wa');
    wa.href = 'https://wa.me/' + b.whatsapp + '?text=' + encodeURIComponent('Hola ' + b.name + ', tengo una consulta.');
    wa.classList.add('wa');
    wa.addEventListener('click', function () { emit('whatsapp_click', { source: 'footer' }); });
    $('#waNum').textContent = b.whatsappDisplay || ('+' + b.whatsapp);
    var a = $('#addr');
    a.textContent = b.address;
    a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.name + ' ' + b.address);
    if (b.hours) { var hr = $('#hours'); hr.textContent = b.hours; hr.hidden = false; }
    if (menu.draftNote) { var d = $('#draft'); d.textContent = menu.draftNote; d.hidden = false; }
  }

  /* ---------- arranque ---------- */

  function getMenu() {
    return fetchTimeout('/api/magma/menu', { headers: { Accept: 'application/json' } }, 3500)
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(function () { return fetchTimeout('menu.json', {}, 6000).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); }); });
  }

  function fail() {
    var main = $('#menu');
    main.textContent = '';
    main.removeAttribute('aria-busy');
    main.appendChild(h('div', { class: 'boot' },
      h('p', { text: 'No pudimos cargar el menú. Revisa tu conexión e inténtalo otra vez.' }),
      h('p', {}, h('button', { class: 'btn', type: 'button', text: 'Reintentar', onclick: function () { location.reload(); } }))));
  }

  function start(m) {
    menu = m;
    document.title = 'Menú ' + m.brand.name;
    renderFooter();
    renderMenu();
    restoreFromStorage();
    renderBar();
    wireSheet($('#itemDlg'));
    wireSheet($('#cartDlg'));
    $('#cartBar').addEventListener('click', openCart);
    $('#cartBack').addEventListener('click', function () { cartView = 'cart'; renderCart(); });
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { document.documentElement.style.setProperty('--nav-h', $('#navWrap').offsetHeight + 'px'); }).observe($('#navWrap'));
    }
    loadTracking(m.tracking);
    emit('menu_view', { categories: m.categories.length });
    if (location.hash) {
      var t = document.getElementById(location.hash.slice(1));
      if (t && t.classList.contains('sec')) setTimeout(function () { t.scrollIntoView(); setActive(t.id); }, 60);
    }
  }

  window.Magma = {
    version: 1,
    on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); return window.Magma; },
    off: function (name, fn) { listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; }); return window.Magma; },
    emit: emit,
    open: function () { if (menu) openCart(); },
    cart: {
      lines: function () { return JSON.parse(JSON.stringify(lines)); },
      total: function () { return totals().total; },
      count: function () { return totals().count; },
      add: function (id, sel, qty) { if (menu) addToCart({ id: id, sel: sel || {}, qty: qty || 1 }); },
      clear: function () { if (menu) clearCart(); }
    },
    get menu() { return menu; }
  };

  getMenu().then(start, fail);
})();
