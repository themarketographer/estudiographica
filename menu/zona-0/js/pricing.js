/* Reglas de precio y validación del pedido de Zona 0.
   Las usan el navegador (window.Zona0Pricing) y las funciones de Netlify (require):
   el total que ve el cliente y el que valida el servidor salen del mismo código. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Zona0Pricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_QTY = 20;
  var MAX_LINES = 30;
  var MODES = ['mesa', 'recojo', 'delivery'];
  var PAY_METHODS = ['efectivo', 'qr', 'tarjeta'];
  var MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  function text(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function money(n, currency) {
    var v = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return v + ' ' + (currency || 'Bs');
  }

  function findProduct(menu, id) {
    for (var i = 0; i < menu.products.length; i++) if (menu.products[i].id === id) return menu.products[i];
    return null;
  }

  /* Productos nuevos o temporales que el personal agrega desde el panel, y productos marcados como agotados.
     extra: { custom:[{id,title,sub,category,price,until}], off:[id] }  Devuelve el mismo menú, ya mezclado. */
  function applyExtras(menu, extra, today) {
    if (!extra) return menu;
    var have = {}; menu.products.forEach(function (p) { have[p.id] = 1; });
    (extra.custom || []).forEach(function (c) {
      if (!c || have[c.id] || (c.until && today && c.until < today)) return;
      var p = { id: c.id, title: c.title, sub: c.sub || '', category: c.category, price: c.price, groups: [], custom: true, until: c.until || '' };
      if (c.kinds && c.kinds.length) p.kinds = c.kinds.slice(); if (c.staffOnly) p.staffOnly = true;
      menu.products.push(p); have[c.id] = 1;
    });
    var off = extra.off || [], over = extra.over || {}, hide = extra.hide || [];
    menu.products.forEach(function (p) {
      var o = over[p.id];
      if (o && !p.custom) {
        if (o.price > 0 && o.price !== p.price) { p.basePrice = p.price; p.price = o.price; }
        if (o.title) { p.baseTitle = p.title; p.title = o.title; }
        if (typeof o.sub === 'string') p.sub = o.sub;
        if (o.category) { p.baseCategory = p.category; p.category = o.category; }
        if (o.kinds && o.kinds.length) p.kinds = o.kinds.slice();
        if (o.staffOnly) p.staffOnly = true;
        if (o.until) { p.until = o.until; if (today && o.until < today) p.hidden = true; }
        p.edited = true;
      }
      if (off.indexOf(p.id) > -1) p.available = false;
      if (hide.indexOf(p.id) > -1) p.hidden = true;
    });
    return menu;
  }

  /* Producto libre (solo personal): { free:{ title, price, kind:'comida'|'bebida'|'tienda' }, qty, note }.
     Sirve para productos de las mini tiendas o cosas que no están en el menú. 'tienda' no pasa por cocina ni barra. */
  var FREE_KINDS = ['comida', 'bebida', 'tienda'];
  function resolveFree(raw, opts) {
    if (!(opts && opts.staff)) return { ok: false, error: 'Un producto del pedido ya no está en el menú.' };
    var f = raw.free, title = text(f && f.title, 60), price = Math.round(Number(f && f.price) * 100) / 100;
    var kind = FREE_KINDS.indexOf(f && f.kind) > -1 ? f.kind : 'tienda';
    var qty = Number(raw.qty);
    if (title.length < 2) return { ok: false, error: 'Escribe el nombre del producto.' };
    if (!(price > 0) || price > 5000) return { ok: false, error: 'Revisa el precio de ' + title + '.' };
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { ok: false, error: 'Cantidad inválida en ' + title + '.' };
    var note = text(raw.note, 120);
    return { ok: true, line: {
      key: 'free|' + title + '|' + price + '|' + kind + '|' + note,
      id: 'free', name: title, choices: [], note: note, qty: qty, unitPrice: price, total: Math.round(price * qty * 100) / 100, free: true, kind: kind
    } };
  }

  /* raw: { id, sel: { grupo: [opcion] }, qty, note }  ->  { ok, line } | { ok:false, error } */
  function resolveLine(menu, raw, opts) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Línea inválida.' };
    if (raw.free) return resolveFree(raw, opts);
    var product = findProduct(menu, raw.id);
    if (!product) return { ok: false, error: 'Un producto del pedido ya no está en el menú.' };
    if (product.hidden || (product.staffOnly && !(opts && opts.staff))) return { ok: false, error: 'Un producto del pedido ya no está en el menú.' };
    if (product.available === false) return { ok: false, error: product.title + ' está agotado.' };
    var qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { ok: false, error: 'Cantidad inválida en ' + product.title + '.' };

    var sel = raw.sel && typeof raw.sel === 'object' ? raw.sel : {};
    var allowed = product.groups || [];
    for (var k in sel) {
      if (Object.prototype.hasOwnProperty.call(sel, k) && allowed.indexOf(k) === -1) return { ok: false, error: 'Opción desconocida en ' + product.title + '.' };
    }
    var unit = product.price, choices = [], keyParts = [];
    for (var g = 0; g < allowed.length; g++) {
      var gid = allowed[g], group = menu.optionGroups[gid];
      var picked = Array.isArray(sel[gid]) ? sel[gid] : [];
      var seen = {}, chosen = [];
      for (var p = 0; p < picked.length; p++) {
        var oid = picked[p];
        if (seen[oid]) return { ok: false, error: 'Opción repetida en ' + product.title + '.' };
        seen[oid] = true;
        var found = null;
        for (var o = 0; o < group.options.length; o++) if (group.options[o].id === oid) { found = group.options[o]; break; }
        if (!found) return { ok: false, error: 'Opción desconocida en ' + product.title + '.' };
        chosen.push(found);
      }
      var max = group.type === 'multi' ? (group.max || group.options.length) : 1;
      if (chosen.length > max) return { ok: false, error: 'Demasiadas opciones en ' + group.label + '.' };
      if (group.required && chosen.length < 1) return { ok: false, error: 'Falta elegir: ' + group.label + '.', missing: gid };
      for (var c = 0; c < chosen.length; c++) unit += chosen[c].price || 0;
      if (chosen.length) {
        choices.push({ group: gid, label: group.label, options: chosen.map(function (x) { return { id: x.id, name: x.name, price: x.price || 0 }; }) });
        keyParts.push(gid + ':' + chosen.map(function (x) { return x.id; }).sort().join(','));
      }
    }
    var note = text(raw.note, 120);
    return { ok: true, line: {
      key: product.id + '|' + keyParts.join(';') + '|' + note,
      id: product.id, name: product.title, choices: choices, note: note, qty: qty, unitPrice: unit, total: unit * qty
    } };
  }

  /* Línea resuelta a su forma cruda (para guardar y reenviar). */
  function toRaw(line) {
    var sel = {};
    line.choices.forEach(function (c) { sel[c.group] = c.options.map(function (o) { return o.id; }); });
    return { id: line.id, sel: sel, qty: line.qty, note: line.note || '' };
  }

  function resolveOrder(menu, rawLines, opts) {
    if (!Array.isArray(rawLines) || !rawLines.length) return { ok: false, error: 'El pedido está vacío.' };
    if (rawLines.length > MAX_LINES) return { ok: false, error: 'El pedido tiene demasiadas líneas.' };
    var byKey = {}, lines = [];
    for (var i = 0; i < rawLines.length; i++) {
      var r = resolveLine(menu, rawLines[i], opts);
      if (!r.ok) return r;
      var ex = byKey[r.line.key];
      if (ex) {
        ex.qty += r.line.qty;
        if (ex.qty > MAX_QTY) return { ok: false, error: 'Cantidad inválida en ' + ex.name + '.' };
        ex.total = Math.round(ex.unitPrice * ex.qty * 100) / 100;
      } else { byKey[r.line.key] = r.line; lines.push(r.line); }
    }
    var total = lines.reduce(function (s, l) { return s + l.total; }, 0);
    var count = lines.reduce(function (s, l) { return s + l.qty; }, 0);
    var min = menu.service && menu.service.minOrder;
    if (min && total < min) return { ok: false, error: 'El pedido mínimo es de ' + money(min, menu.brand.currency) + '.' };
    return { ok: true, lines: lines, total: total, count: count };
  }

  /* Fecha en Bolivia (UTC-4, sin horario de verano). */
  function boliviaDate(d) {
    var t = new Date((d || new Date()).getTime() - 4 * 3600 * 1000);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return { key: t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()), label: p(t.getUTCDate()) + MESES[t.getUTCMonth()], hm: p(t.getUTCHours()) + ':' + p(t.getUTCMinutes()) };
  }
  /* Número visible: #07-30OCT (el 7.º pedido del 30 de octubre). El servidor lleva la cuenta del día. */
  function orderNumber(n, date) { return '#' + String(n).padStart(2, '0') + '-' + boliviaDate(date).label; }

  /* Celular a solo dígitos con código de país. En Bolivia los móviles tienen 8 dígitos y empiezan con 6 o 7. */
  function normalizePhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 8 && /^[67]/.test(d)) d = '591' + d;
    return d;
  }
  function validPhone(d) {
    if (d.indexOf('591') === 0) return d.length === 11 && /^[67]/.test(d.slice(3));
    return d.length >= 10 && d.length <= 15;
  }
  function fmtPhone(d) { return !d ? '' : d.indexOf('591') === 0 ? '+591 ' + d.slice(3) : '+' + d; }

  function findZone(menu, id) {
    var zs = (menu.service && menu.service.zones) || [];
    for (var i = 0; i < zs.length; i++) if (zs[i].id === id) return zs[i];
    return null;
  }
  function deliveryFee(menu, customer, subtotal) {
    if (!customer || customer.mode !== 'delivery') return 0;
    var z = findZone(menu, customer.zone);
    if (!z) return 0;
    var free = menu.service && menu.service.freeDeliveryFrom;
    return free && subtotal >= free ? 0 : z.fee;
  }

  /* staff: el personal registra desde la computadora; pide menos datos del cliente. */
  function cleanCustomer(menu, raw, staff) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var svc = menu.service || {};
    var mode = MODES.indexOf(raw.mode) > -1 ? raw.mode : 'recojo';
    if ((svc.modes || MODES).indexOf(mode) === -1) return { ok: false, error: 'Ese tipo de pedido no está disponible.', field: 'mode' };
    var name = text(raw.name, 50);
    var phone = normalizePhone(raw.phone);
    var mesa = text(raw.mesa, 10);
    var address = text(raw.address, 160);
    var notes = text(raw.notes, 240);
    var zone = findZone(menu, String(raw.zone || ''));
    if (!staff && !name) return { ok: false, error: 'Falta tu nombre.', field: 'name' };
    if (!staff && !validPhone(phone)) return { ok: false, error: 'Escribe tu celular, por ejemplo 76980828. Lo usamos para que sigas tu pedido.', field: 'phone' };
    if (staff && phone && !validPhone(phone)) return { ok: false, error: 'Revisa el celular del cliente.', field: 'phone' };
    if (mode === 'mesa' && !staff && !mesa) return { ok: false, error: 'Falta el número de mesa.', field: 'mesa' };
    if (mode === 'delivery' && !address) return { ok: false, error: 'Falta la dirección o una referencia para la entrega.', field: 'address' };
    if (mode === 'delivery' && svc.zones && svc.zones.length && !zone) return { ok: false, error: 'Elige la zona de entrega.', field: 'zone' };
    if (!name) name = mode === 'mesa' && mesa ? 'Mesa ' + mesa : mode === 'delivery' ? 'Delivery' : 'Mostrador';
    return { ok: true, customer: {
      name: name, phone: phone, mode: mode,
      mesa: mode === 'mesa' ? mesa : '',
      address: mode === 'delivery' ? address : '',
      zone: mode === 'delivery' && zone ? zone.id : '', zoneName: mode === 'delivery' && zone ? zone.name : '',
      notes: notes
    } };
  }

  /* payload: { lines:[raw], customer:{...} }  ->  { ok, order } */
  function validateOrder(menu, payload, opts) {
    var staff = !!(opts && opts.staff);
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Pedido inválido.' };
    var r = resolveOrder(menu, payload.lines, opts);
    if (!r.ok) return r;
    var c = cleanCustomer(menu, payload.customer, staff);
    if (!c.ok) return c;
    var fee = deliveryFee(menu, c.customer, r.total);
    return { ok: true, order: { customer: c.customer, lines: r.lines, subtotal: r.total, deliveryFee: fee, total: r.total + fee, count: r.count } };
  }

  return {
    MAX_QTY: MAX_QTY, MODES: MODES, PAY_METHODS: PAY_METHODS,
    money: money, applyExtras: applyExtras, findProduct: findProduct, resolveLine: resolveLine, resolveOrder: resolveOrder, toRaw: toRaw,
    boliviaDate: boliviaDate, orderNumber: orderNumber, normalizePhone: normalizePhone, validPhone: validPhone, fmtPhone: fmtPhone,
    findZone: findZone, deliveryFee: deliveryFee, cleanCustomer: cleanCustomer, validateOrder: validateOrder
  };
});
