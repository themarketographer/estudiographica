/* Menú de Magma Wings: catálogo, pedido y envío por WhatsApp.
   Datos:   /api/magma/menu (o menu.json si la API no responde)
   Pedido:  /api/magma/order (si falla, el mensaje se arma aquí con las mismas reglas)
   Eventos: window.Magma.on('add_to_cart', fn) y document 'magma:add_to_cart'. Ver README.md
   Movimiento: js/motion.js (entradas, nav de vidrio, botones, paralaje). */
(function () {
  'use strict';

  var P = window.MagmaPricing;
  var CART_KEY = 'magma.cart.v2';
  var CUST_KEY = 'magma.customer.v1';
  var LAST_KEY = 'magma.last.v2';
  var PREF_KEY = 'magma.prefs.v1';
  var LAST_TTL = 1000 * 60 * 60 * 12;

  var menu = null;
  var lines = [];
  var lastOrder = null;
  var cartView = 'cart';
  var itemState = null;
  var removed = null;
  var openCount = 0;
  var sending = false;
  var shownTotal = 0;
  var tickRaf = 0;

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
  function icon(id) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ic');
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
  function cookie(n) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  /* Si llegó desde un anuncio de Meta, el parámetro fbclid se convierte en la cookie fbc con el formato oficial. */
  function fbcFromUrl() {
    try { var id = new URLSearchParams(location.search).get('fbclid'); return id ? 'fb.1.' + Date.now() + '.' + id : ''; } catch (e) { return ''; }
  }
  function fetchTimeout(url, opts, ms) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    opts = opts || {};
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); throw e; });
  }
  function motionRefresh() { if (window.MagmaMotion) window.MagmaMotion.refresh(); }

  /* ---------- eventos y analítica ---------- */

  var listeners = {};
  var GA = { item_view: 'view_item', add_to_cart: 'add_to_cart', remove_from_cart: 'remove_from_cart', cart_open: 'view_cart', checkout_start: 'begin_checkout', order_sent: 'generate_lead' };
  var FBC = { category_select: 'MagmaCategoria', whatsapp_click: 'MagmaWhatsApp', order_fallback: 'MagmaPedidoSinServidor', undo_remove: 'MagmaDeshacer' };
  var FB = { item_view: 'ViewContent', add_to_cart: 'AddToCart', checkout_start: 'InitiateCheckout', order_sent: 'Lead' };

  function items(ls) {
    return ls.map(function (l) { return { item_id: l.id + '-' + l.portion, item_name: l.name, item_variant: l.portionLabel, price: l.unitPrice, quantity: l.qty }; });
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
      if (typeof window.fbq === 'function') {
        var fbData = {
          currency: 'BOB', value: value, content_type: 'product',
          content_ids: (detail.items || []).map(function (i) { return i.item_id; }),
          num_items: detail.count || undefined
        };
        /* El eventID (número de pedido) permite a Meta unir el evento del navegador con el del servidor. */
        if (FB[name]) window.fbq('track', FB[name], fbData, detail.orderId ? { eventID: detail.orderId } : undefined);
        else if (FBC[name]) window.fbq('trackCustom', FBC[name], fbData);
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
    setTimeout(fin, 600);
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

  /* ---------- aviso ---------- */

  var toastTimer = 0;
  function toast(msg, actionLabel, onAction) {
    var t = $('#toast');
    clearTimeout(toastTimer);
    /* Un diálogo modal deja inerte todo lo que está fuera de él, así que el aviso se muda dentro del que esté abierto. */
    var host = $('#itemDlg').open ? $('#itemDlg') : ($('#cartDlg').open ? $('#cartDlg') : document.body);
    if (t.parentNode !== host) host.appendChild(t);
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
    store(CART_KEY, { v: 2, lines: lines.map(P.toRaw) });
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
    commit(lines.map(function (x) { var r = P.toRaw(x); if (x.key === key) r.qty = Math.min(q, P.MAX_QTY); return r; }));
    emit('update_cart', { id: l.id, qty: q, cartTotal: totals().total });
  }
  function removeLine(key) {
    var idx = -1;
    lines.forEach(function (l, i) { if (l.key === key) idx = i; });
    if (idx < 0) return;
    var line = lines[idx];
    removed = { raw: P.toRaw(line), index: idx };
    var list = rawLines();
    list.splice(idx, 1);
    commit(list);
    emit('remove_from_cart', { value: line.total, items: items([line]), count: line.qty });
    toast('Quitaste ' + line.qty + 'x ' + line.name + ' ' + line.portionLabel, 'Deshacer', undoRemove);
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
    ], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' });
  }

  function renderBar() {
    var t = totals();
    var bar = $('#cartBar');
    var on = t.count > 0;
    $('#cartCount').textContent = t.count;
    tickNumber($('#cartTotal'), shownTotal, t.total);
    shownTotal = t.total;
    $('#cartStatus').textContent = on ? t.count + (t.count === 1 ? ' producto' : ' productos') + ' en tu pedido, ' + money(t.total) : 'Tu pedido está vacío';
    bar.classList.toggle('on', on);
    if (on) bar.removeAttribute('inert'); else bar.setAttribute('inert', '');
    document.body.classList.toggle('has-cart', on);
    var nc = $('#navCount');
    nc.textContent = t.count;
    nc.hidden = !on;
    $('#navCart').setAttribute('aria-label', on ? 'Ver pedido, ' + t.count + (t.count === 1 ? ' producto' : ' productos') : 'Ver pedido');
    renderBadges();
  }
  /* Number ticker: el total cuenta hasta su nuevo valor (cifras tabulares, no se mueve el layout). */
  function tickNumber(el, from, to) {
    cancelAnimationFrame(tickRaf);
    if (reduceMotion.matches || from === to || !el.isConnected) { el.textContent = money(to); return; }
    var t0 = performance.now(), dur = 380;
    (function step(now) {
      var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(Math.round(from + (to - from) * e));
      if (k < 1) tickRaf = requestAnimationFrame(step);
    })(t0);
  }
  /* Continuidad: un punto de brasa viaja del botón Agregar al carrito de la barra superior. */
  function flyToCart(fromEl) {
    var fly = $('#fly'), cart = $('#navCart');
    if (reduceMotion.matches || !fromEl || !fly || !fly.showPopover || !fly.animate) return;
    var a = fromEl.getBoundingClientRect(), b = cart.getBoundingClientRect();
    var x0 = a.left + a.width / 2 - 11, y0 = a.top + a.height / 2 - 11;
    var x1 = b.left + b.width / 2 - 11, y1 = b.top + b.height / 2 - 11;
    try { fly.showPopover(); } catch (e) { return; }
    var arc = Math.min(120, Math.abs(y1 - y0) * 0.25);
    var anim = fly.animate([
      { transform: 'translate(' + x0 + 'px,' + y0 + 'px) scale(1.3)', opacity: 1 },
      { transform: 'translate(' + ((x0 + x1) / 2) + 'px,' + (Math.min(y0, y1) - arc) + 'px) scale(1)', opacity: 1, offset: 0.55 },
      { transform: 'translate(' + x1 + 'px,' + y1 + 'px) scale(.45)', opacity: 0.9 }
    ], { duration: 520, easing: 'cubic-bezier(.5,0,.2,1)' });
    anim.onfinish = anim.oncancel = function () {
      try { fly.hidePopover(); } catch (e) {}
      if (cart.animate) cart.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.23,1,.32,1)' });
    };
  }
  function renderBadges() {
    $$('.row').forEach(function (row) {
      var n = 0;
      lines.forEach(function (l) { if (l.id === row.getAttribute('data-pid') && l.portion === row.getAttribute('data-portion')) n += l.qty; });
      var inc = $('.inc', row);
      if (!inc) return;
      inc.textContent = n + ' en tu pedido';
      inc.hidden = !n;
      row.classList.toggle('has', n > 0);
    });
  }

  function summaryOf(l) {
    var parts = l.choices.map(function (c) {
      return c.label + ': ' + c.options.map(function (o) { return o.name; }).join(', ');
    });
    if (l.note) parts.push('Nota: ' + l.note);
    return parts.join(' · ');
  }

  /* ---------- hoja de producto ---------- */

  function portionOptions(product) {
    return product.portions.map(function (p) {
      return { id: p.id, name: p.qty + ' ' + p.unit, price: p.price, abs: true, off: p.available === false };
    });
  }
  function unitOf(st) {
    var u = 0;
    st.product.portions.forEach(function (p) { if (p.id === (st.sel.portion || [])[0]) u = p.price; });
    (st.product.groups || []).forEach(function (gid) {
      var opts = P.groupOptions(menu, menu.optionGroups[gid]);
      (st.sel[gid] || []).forEach(function (oid) {
        opts.forEach(function (o) { if (o.id === oid) u += o.price || 0; });
      });
    });
    return u;
  }
  function openItem(pid, portionId, edit, opener) {
    var product = P.findProduct(menu, pid);
    if (!product || product.available === false) return;
    var st = { product: product, sel: {}, qty: 1, note: '', editKey: null };
    st.sel.portion = portionId ? [portionId] : [];
    (product.groups || []).forEach(function (gid) {
      var opts = P.groupOptions(menu, menu.optionGroups[gid]);
      st.sel[gid] = opts.filter(function (o) { return o.default; }).map(function (o) { return o.id; });
    });
    var prefs = load(PREF_KEY) || {};
    ['salsa', 'papas'].forEach(function (g) {
      if (!prefs[g] || (product.groups || []).indexOf(g) < 0) return;
      var ok = P.groupOptions(menu, menu.optionGroups[g]).some(function (o) { return o.id === prefs[g]; });
      if (ok) st.sel[g] = [prefs[g]];
    });
    if (edit) {
      Object.keys(edit.sel).forEach(function (g) { st.sel[g] = edit.sel[g].slice(); });
      st.sel.portion = [edit.portion];
      st.qty = edit.qty; st.note = edit.note || ''; st.editKey = edit.key;
    }
    itemState = st;
    renderItem();
    openSheet($('#itemDlg'), opener);
    if (!edit) emit('item_view', { value: unitOf(st), items: [{ item_id: product.id, item_name: product.title, price: unitOf(st), quantity: 1 }] });
  }
  function renderItem() {
    var st = itemState;
    $('#itemTitle').textContent = st.product.title;
    var body = $('#itemBody');
    body.textContent = '';
    body.appendChild(h('p', { class: 'lead-s', text: st.product.sub + '.' }));
    body.appendChild(groupEl('portion'));
    (st.product.groups || []).forEach(function (gid) { body.appendChild(groupEl(gid)); });
    var note = h('textarea', { id: 'itemNote', maxlength: '120', rows: '2', placeholder: 'Bien cocidas, sin picante extra, lo que necesites' });
    note.value = st.note;
    note.addEventListener('input', function () { st.note = note.value; });
    body.appendChild(h('div', { class: 'f item-note' }, h('label', { for: 'itemNote' }, 'Nota ', h('small', { text: '(opcional)' })), note));
    renderItemFoot();
    syncOptions();
  }
  function groupEl(gid) {
    var isPortion = gid === 'portion';
    var g = isPortion ? { label: 'Porción', hint: 'Elige 1', type: 'single' } : menu.optionGroups[gid];
    var multi = g.type === 'multi';
    var opts = isPortion ? portionOptions(itemState.product) : P.groupOptions(menu, g);
    var box = h('div', { class: 'opts' });
    opts.forEach(function (o) {
      var input = h('input', { type: multi ? 'checkbox' : 'radio', name: 'g-' + gid, value: o.id, checked: (itemState.sel[gid] || []).indexOf(o.id) > -1, disabled: o.off });
      var price = o.abs ? money(o.price) : (o.price ? '+' + o.price + ' ' + menu.brand.currency : (o.default ? 'Incluido' : ''));
      var check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      check.setAttribute('viewBox', '0 0 24 24');
      check.setAttribute('aria-hidden', 'true');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5');
      path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
      check.appendChild(path);
      var label = h('label', { class: 'opt' + (multi ? ' multi' : '') + (o.off ? ' off' : '') },
        input,
        h('span', { class: 'mark-c' }, check),
        h('span', { class: 'nm' }, o.name, o.desc ? h('small', { text: o.desc }) : null),
        price ? h('span', { class: 'pr', text: o.off ? 'Agotado' : price }) : null);
      input.addEventListener('change', function () {
        var cur = itemState.sel[gid] || [];
        if (multi) cur = input.checked ? cur.concat([o.id]) : cur.filter(function (x) { return x !== o.id; });
        else cur = [o.id];
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
      var g = gid === 'portion' ? { type: 'single' } : menu.optionGroups[gid];
      var cur = itemState.sel[gid] || [];
      var full = g.type === 'multi' && cur.length >= (g.max || 99);
      $$('.opt', fs).forEach(function (lab) {
        var input = $('input', lab);
        var on = cur.indexOf(input.value) > -1;
        input.checked = on;
        lab.classList.toggle('on', on);
        if (gid !== 'portion') {
          var off = full && !on;
          lab.classList.toggle('off', off);
          input.disabled = off;
        }
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
    foot.appendChild(h('div', { class: 'stepper' }, minus, out, plus));
    foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: submitItem, text: (st.editKey ? 'Guardar' : 'Agregar') + ' · ' + money(unitOf(st) * st.qty) }));
    motionRefresh();
  }
  function submitItem() {
    var st = itemState;
    var sel = {};
    Object.keys(st.sel).forEach(function (g) { if (g !== 'portion') sel[g] = st.sel[g]; });
    var raw = { id: st.product.id, portion: (st.sel.portion || [])[0], sel: sel, qty: st.qty, note: st.note };
    var r = P.resolveLine(menu, raw);
    if (!r.ok) {
      if (r.missing) showGroupError(r.missing, r.missing === 'portion' ? 'Elige una porción para continuar.' : 'Elige una opción para continuar.');
      return;
    }
    if (st.editKey) {
      var list = lines.filter(function (l) { return l.key !== st.editKey; }).map(P.toRaw);
      commit(list.concat([raw]));
      emit('edit_cart_item', { id: st.product.id });
    } else { addToCart(raw); flyToCart($('#itemFoot .btn')); }
    var pf = load(PREF_KEY) || {};
    ['salsa', 'papas'].forEach(function (g) { if (sel[g] && sel[g][0]) pf[g] = sel[g][0]; });
    store(PREF_KEY, pf);
    if (navigator.vibrate && !reduceMotion.matches) { try { navigator.vibrate(12); } catch (e) {} }
    closeSheet($('#itemDlg'));
  }

  /* ---------- hoja del pedido ---------- */

  function openCart() {
    cartView = 'cart';
    renderCart();
    openSheet($('#cartDlg'), $('#cartBar'));
    emit('cart_open', { value: totals().total, items: items(lines), count: totals().count });
  }
  function renderSteps() {
    var order = ['cart', 'details', 'done'], labels = ['Pedido', 'Tus datos', 'Listo'];
    var at = order.indexOf(cartView);
    var ol = $('#cartSteps');
    ol.textContent = '';
    labels.forEach(function (l, i) {
      var cls = i < at ? 'done' : (i === at ? 'current' : '');
      ol.appendChild(h('li', { class: 'step ' + cls, 'aria-current': i === at ? 'step' : null },
        h('div', { class: 'step-num' }, i < at ? icon('i-check') : String(i + 1)),
        h('div', { class: 'step-label', text: l })));
    });
  }
  function renderCart() {
    var body = $('#cartBody'), foot = $('#cartFoot'), title = $('#cartTitle'), back = $('#cartBack');
    body.textContent = ''; foot.textContent = '';
    back.hidden = cartView !== 'details';
    $('#cartSteps').hidden = !(lines.length || cartView === 'done');
    renderSteps();
    if (cartView === 'cart') {
      title.textContent = 'Tu pedido';
      if (!lines.length) return renderEmpty(body);
      var ul = h('ul', { class: 'lines' });
      lines.forEach(function (l) {
        var minus = h('button', { type: 'button', 'aria-label': l.qty === 1 ? 'Quitar ' + l.name : 'Menos ' + l.name, onclick: function () { setQty(l.key, l.qty - 1); } }, icon(l.qty === 1 ? 'i-trash' : 'i-minus'));
        var plus = h('button', { type: 'button', 'aria-label': 'Más ' + l.name, onclick: function () { setQty(l.key, l.qty + 1); } }, icon('i-plus'));
        ul.appendChild(h('li', { class: 'line' },
          h('h3', {}, l.name, h('span', { text: l.portionLabel })),
          h('span', { class: 'amt', text: money(l.total) }),
          summaryOf(l) ? h('p', { class: 'opts-sum', text: summaryOf(l) }) : null,
          h('div', { class: 'ctl' },
            h('div', { class: 'stepper' }, minus, h('output', { text: String(l.qty) }), plus),
            h('button', { class: 'link', type: 'button', text: 'Editar', onclick: function (e) { var r = P.toRaw(l); openItem(l.id, l.portion, { sel: r.sel, portion: l.portion, qty: l.qty, note: l.note, key: l.key }, e.currentTarget); } }))));
      });
      body.appendChild(ul);
      body.appendChild(h('div', { class: 'sum' }, h('span', { text: 'Total productos' }), h('b', { text: money(totals().total) })));
      if (menu.service.delivery) body.appendChild(h('p', { class: 'small', text: menu.service.deliveryNote }));
      var min = menu.service.minOrder;
      var short = min && totals().total < min;
      if (short) body.appendChild(h('p', { class: 'small', text: 'El pedido mínimo es de ' + money(min) + '. Te faltan ' + money(min - totals().total) + '.' }));
      foot.appendChild(h('button', { class: 'btn btn--block', type: 'button', disabled: !!short, text: 'Continuar', onclick: function () { cartView = 'details'; renderCart(); emit('checkout_start', { value: totals().total, items: items(lines), count: totals().count }); } }));
    } else if (cartView === 'details') {
      title.textContent = 'Tus datos';
      renderDetails(body, foot);
    } else if (cartView === 'done') {
      title.textContent = 'Pedido listo';
      renderDone(body, foot);
    }
    $('.sheet-body', $('#cartDlg')).scrollTop = 0;
    motionRefresh();
  }
  function renderEmpty(body) {
    var kids = [h('p', { text: 'Tu pedido está vacío. Las alitas no se piden solas.' })];
    kids.push(h('button', { class: 'btn', type: 'button', text: 'Ver el menú', onclick: function () { closeSheet($('#cartDlg')); } }));
    if (lastOrder) kids.push(h('p', { class: 'small' }, h('button', { class: 'link', type: 'button', text: 'Repetir mi último pedido (' + lastOrder.orderId + ')', onclick: restoreLast })));
    body.appendChild(h('div', { class: 'empty' }, kids));
    motionRefresh();
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
    var field = function (id, label, attrs, hint) {
      var input = h('input', Object.assign({ type: 'text', id: id, name: id, 'aria-describedby': 'e-' + id, maxlength: '120' }, attrs));
      return h('div', { class: 'f', id: 'row-' + id }, h('label', { for: id }, label, hint ? h('small', { text: ' ' + hint }) : null), input, h('p', { class: 'field-err', id: 'e-' + id, role: 'alert', hidden: true }));
    };
    var fFirst = field('firstName', 'Nombre', { autocomplete: 'given-name', value: saved.firstName || '', enterkeyhint: 'next' });
    var fLast = field('lastName', 'Apellido', { autocomplete: 'family-name', value: saved.lastName || '', enterkeyhint: 'next' });
    var fPhone = field('phone', 'Celular', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', value: saved.phone ? saved.phone.replace(/^591/, '') : '', placeholder: '7XXXXXXX', maxlength: '20', enterkeyhint: 'next' }, '(WhatsApp)');
    var fEmail = field('email', 'Correo', { type: 'email', inputmode: 'email', autocomplete: 'email', value: saved.email || '', placeholder: 'tu@correo.com', enterkeyhint: 'next' }, menu.service.requireEmail ? '' : '(opcional)');
    var addr = h('textarea', { id: 'address', name: 'address', autocomplete: 'street-address', maxlength: '160', rows: '2', 'aria-describedby': 'e-address', placeholder: 'Calle, número y una referencia' });
    addr.value = saved.address || '';
    var notes = h('textarea', { id: 'notes', name: 'notes', maxlength: '240', rows: '2', placeholder: 'Más servilletas, tocar el timbre, lo que necesites' });
    var fAddr = h('div', { class: 'f', id: 'row-address' }, h('label', { for: 'address' }, 'Dirección', h('br'), h('small', { text: menu.service.deliveryNote })), addr, h('p', { class: 'field-err', id: 'e-address', role: 'alert', hidden: true }));
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
    var consent = h('input', { type: 'checkbox', id: 'consent', name: 'consent' });
    var consentRow = h('label', { class: 'consent', for: 'consent' }, consent,
      h('span', {}, 'Quiero recibir ofertas y novedades de ' + menu.brand.name + '. ', h('small', { text: 'Usamos tus datos para tu pedido y, si aceptas, para ofertas y anuncios. Puedes pedir que los borremos cuando quieras.' })));
    var form = h('form', { class: 'form', id: 'orderForm', novalidate: true, onsubmit: function (e) { e.preventDefault(); sendOrder(function () {
      return { firstName: fFirst.querySelector('input').value, lastName: fLast.querySelector('input').value, phone: fPhone.querySelector('input').value, email: fEmail.querySelector('input').value,
        consent: consent.checked, mode: mode, address: addr.value, notes: notes.value };
    }); } },
      h('div', { class: 'pair' }, fFirst, fLast), fPhone, fEmail,
      seg, fAddr,
      h('div', { class: 'f' }, h('label', { for: 'notes' }, 'Notas del pedido ', h('small', { text: '(opcional)' })), notes),
      consentRow,
      h('div', { class: 'sum' }, h('span', { text: 'Total productos' }), h('b', { text: money(totals().total) })));
    form.addEventListener('input', function (e) {
      var row = e.target.closest && e.target.closest('.f');
      if (!row || !row.classList.contains('err')) return;
      row.classList.remove('err');
      var er = $('.field-err', row);
      if (er) er.hidden = true;
    });
    body.appendChild(form);
    foot.appendChild(h('button', { class: 'btn btn--wa btn--block', type: 'submit', id: 'sendBtn', form: 'orderForm' }, icon('i-wa'), h('span', { text: 'Enviar por WhatsApp' })));
  }

  function fieldError(field, msg) {
    $$('.f.err').forEach(function (x) { x.classList.remove('err'); });
    $$('.field-err', $('#cartBody')).forEach(function (x) { x.hidden = true; });
    var row = field && $('#row-' + field);
    if (!row) { toast(msg); return; }
    row.classList.add('err');
    var e = $('#e-' + field); e.textContent = msg; e.hidden = false;
    var inp = $('input, textarea', row);
    if (inp) inp.focus();
  }

  function setSending(on) {
    sending = on;
    var b = $('#sendBtn');
    if (!b) return;
    b.classList.toggle('is-loading', on);
    if (on) b.setAttribute('aria-busy', 'true'); else b.removeAttribute('aria-busy');
    $('span', b).textContent = on ? 'Enviando…' : 'Enviar por WhatsApp';
  }

  function sendOrder(read) {
    if (sending) return;
    var c = P.cleanCustomer(menu, read());
    if (!c.ok) return fieldError(c.field, c.error);
    store(CUST_KEY, { firstName: c.customer.firstName, lastName: c.customer.lastName, phone: c.customer.phone, email: c.customer.email, mode: c.customer.mode, address: c.customer.address });
    var payload = { lines: rawLines(), customer: c.customer, meta: { fbp: cookie('_fbp'), fbc: cookie('_fbc') || fbcFromUrl() } };
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
    /* Coincidencia avanzada: solo con permiso del cliente, el píxel recibe sus datos (Meta los convierte en hash). */
    if (customer.consent && typeof window.fbq === 'function' && menu.tracking && menu.tracking.metaPixel) {
      try { window.fbq('init', menu.tracking.metaPixel, { em: customer.email || undefined, ph: customer.phone, fn: customer.firstName.toLowerCase(), ln: customer.lastName.toLowerCase(), country: 'bo' }); } catch (e) {}
    }
    emit('order_sent', ev);
    setTimeout(function () { if (cartView === 'done') window.location.href = d.whatsappUrl; }, reduceMotion.matches ? 0 : 900);
  }

  function renderDone(body, foot) {
    var o = lastOrder;
    var tick = h('div', { class: 'tick' });
    tick.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    body.appendChild(h('div', { class: 'done' },
      tick,
      h('h3', { text: 'Pedido ' + o.orderId }),
      h('p', { text: 'Abrimos WhatsApp con tu pedido listo. Envía el mensaje y lo confirmamos contigo.' }),
      h('div', { class: 'stack' },
        h('a', { class: 'btn btn--wa btn--block', href: o.whatsappUrl, rel: 'noopener', onclick: function () { emit('whatsapp_click', { source: 'done', orderId: o.orderId }); } }, icon('i-wa'), 'Abrir WhatsApp'),
        h('button', { class: 'btn btn--ghost btn--block', type: 'button', onclick: function () { copyText(o.message); } }, icon('i-copy'), 'Copiar mensaje'),
        h('button', { class: 'link', type: 'button', text: 'Editar pedido', onclick: restoreLast })),
      h('pre', { class: 'preview', text: o.message })));
    foot.appendChild(h('button', { class: 'btn btn--ghost btn--block', type: 'button', text: 'Cerrar', onclick: function () { closeSheet($('#cartDlg')); } }));
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
    menu.products.forEach(function (p, i) {
      var rows = h('ul', { class: 'rows rv', style: '--d:200ms' }, p.portions.map(function (po) {
        var gone = p.available === false || po.available === false;
        return h('li', {}, h('button', { class: 'row shine', type: 'button', 'data-pid': p.id, 'data-portion': po.id, disabled: gone, 'aria-label': p.title + ' ' + po.qty + ' ' + po.unit + ', ' + money(po.price) + (gone ? ', agotado' : '. Elegir salsa y agregar') },
          h('span', { class: 'q', text: String(po.qty) }),
          h('span', { class: 'u' }, po.unit, h('em', { class: 'inc', hidden: true })),
          h('span', { class: 'p' }, String(po.price), h('small', { text: menu.brand.currency })),
          gone ? h('span', { class: 'gone', text: 'Agotado' }) : h('span', { class: 'add', 'aria-hidden': 'true' }, icon('i-plus'))));
      }));
      main.appendChild(h('section', { class: 'prod ' + p.tone + (i % 2 ? ' flip' : ''), id: p.id, 'data-tone': p.tone === 'org' ? 'light' : 'dark', 'aria-labelledby': p.id + '-h' },
        h('div', { class: 'prod-grid' },
          h('div', { class: 'photo shine' }, h('img', { src: p.photo, srcset: p.photoSm ? p.photoSm + ' 720w, ' + p.photo + ' 1400w' : null, sizes: '(min-width: 900px) 50vw, 100vw', width: '1400', height: '1050', alt: p.alt, decoding: 'async', loading: i ? 'lazy' : null, 'data-img-par': '0.07', style: 'object-position:' + (p.photoPos || '50% 50%') })),
          h('div', { class: 'txt' },
            h('h2', { class: 'rv', id: p.id + '-h', text: p.title }),
            h('p', { class: 'sub rv', style: '--d:100ms', text: p.sub }),
            rows,
            h('p', { class: 'note rv', style: '--d:350ms', text: 'Eliges papas y salsas al armar tu pedido.' })))));
    });
    main.removeAttribute('aria-busy');
    renderBadges();
    main.addEventListener('click', function (e) {
      var row = e.target.closest && e.target.closest('.row');
      if (row && !row.disabled) openItem(row.getAttribute('data-pid'), row.getAttribute('data-portion'), null, row);
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('.nav-links a');
      if (!a) return;
      var id = (a.getAttribute('href') || '').slice(1);
      if (window.MagmaMotion) window.MagmaMotion.lockSpy(700);
      emit('category_select', { category: id });
    });
  }

  /* Estado abierto o cerrado, solo si el menú trae horario estructurado en "hours". */
  function openStatus() {
    var hrs = menu.hours;
    if (!hrs) return null;
    var out = { text: hrs.text || '', open: null };
    if (hrs.days && hrs.tz) {
      try {
        var parts = new Intl.DateTimeFormat('en-US', { timeZone: hrs.tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
        var get = function (t) { return parts.filter(function (p) { return p.type === t; })[0].value; };
        var day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
        var now = (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10);
        var slots = hrs.days[String(day)] || [];
        var toMin = function (s) { var a = s.split(':'); return +a[0] * 60 + +a[1]; };
        out.open = slots.some(function (s) { return now >= toMin(s[0]) && now < toMin(s[1]); });
      } catch (e) {}
    }
    return out;
  }

  function renderFooter() {
    var b = menu.brand;
    var wa = $('#wa');
    wa.href = 'https://wa.me/' + b.whatsapp + '?text=' + encodeURIComponent('Hola ' + b.name + ', tengo una consulta.');
    wa.textContent = b.whatsappDisplay || ('+' + b.whatsapp);
    wa.addEventListener('click', function () { emit('whatsapp_click', { source: 'footer' }); });
    var a = $('#addr');
    a.textContent = b.address;
    a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.name + ' ' + b.address);
    var st = openStatus();
    if (st && st.text) { $('#hours').textContent = st.text; $('#hoursRow').hidden = false; }
    if (st && st.open !== null) {
      var s = $('#status');
      s.textContent = st.open ? 'Abierto ahora' : 'Cerrado ahora. Puedes dejar tu pedido y lo vemos al abrir.';
      s.classList.toggle('open', st.open);
      s.hidden = false;
    }
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
    $('#navCart').addEventListener('click', openCart);
    $('#cartBack').addEventListener('click', function () { cartView = 'cart'; renderCart(); });
    motionRefresh();
    loadTracking(m.tracking);
    emit('menu_view', { products: m.products.length });
    if (location.hash) {
      var t = document.getElementById(location.hash.slice(1));
      if (t && t.classList.contains('prod')) setTimeout(function () { t.scrollIntoView(); }, 60);
    }
  }

  window.Magma = {
    version: 2,
    on: function (name, fn) { (listeners[name] = listeners[name] || []).push(fn); return window.Magma; },
    off: function (name, fn) { listeners[name] = (listeners[name] || []).filter(function (f) { return f !== fn; }); return window.Magma; },
    emit: emit,
    open: function () { if (menu) openCart(); },
    cart: {
      lines: function () { return JSON.parse(JSON.stringify(lines)); },
      total: function () { return totals().total; },
      count: function () { return totals().count; },
      add: function (id, portion, sel, qty, note) { if (menu) addToCart({ id: id, portion: portion, sel: sel || {}, qty: qty || 1, note: note || '' }); },
      clear: function () { if (menu) clearCart(); }
    },
    get menu() { return menu; }
  };

  getMenu().then(start, fail);
})();
