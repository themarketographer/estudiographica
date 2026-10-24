/* Reglas de precio y mensaje del pedido. Las usan el navegador (window.MagmaPricing)
   y la función de Netlify (require), así el total que ve el cliente y el que valida
   el servidor salen del mismo código. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MagmaPricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_QTY = 20;
  var MAX_LINES = 30;
  var ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function groupOptions(menu, group) {
    if (group.source === 'sauces') {
      return menu.sauces.map(function (s) { return { id: s.id, name: s.name, price: group.price || 0 }; });
    }
    return group.options || [];
  }

  function findProduct(menu, id) {
    for (var i = 0; i < menu.products.length; i++) if (menu.products[i].id === id) return menu.products[i];
    return null;
  }

  function money(n, currency) {
    var v = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return v + ' ' + (currency || 'Bs');
  }

  function text(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /* raw: { id, portion, sel: { groupId: [optionId] }, qty, note }  ->  { ok, line } | { ok:false, error } */
  function resolveLine(menu, raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, error: 'Línea inválida.' };
    var product = findProduct(menu, raw.id);
    if (!product) return { ok: false, error: 'Un producto del pedido ya no está en el menú.' };
    if (product.available === false) return { ok: false, error: product.title + ' está agotado.' };

    var portion = null;
    for (var q = 0; q < product.portions.length; q++) if (product.portions[q].id === raw.portion) portion = product.portions[q];
    if (!portion) return { ok: false, error: 'Elige la porción de ' + product.title + '.', missing: 'portion' };
    if (portion.available === false) return { ok: false, error: portion.qty + ' ' + portion.unit + ' de ' + product.title + ' está agotado.' };

    var qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return { ok: false, error: 'Cantidad inválida en ' + product.title + '.' };

    var sel = raw.sel && typeof raw.sel === 'object' ? raw.sel : {};
    var allowed = product.groups || [];
    for (var k in sel) {
      if (Object.prototype.hasOwnProperty.call(sel, k) && allowed.indexOf(k) === -1) {
        return { ok: false, error: 'Opción desconocida en ' + product.title + '.' };
      }
    }

    var unit = portion.price;
    var choices = [];
    var keyParts = [];
    for (var g = 0; g < allowed.length; g++) {
      var gid = allowed[g];
      var group = menu.optionGroups[gid];
      var opts = groupOptions(menu, group);
      var picked = Array.isArray(sel[gid]) ? sel[gid] : [];
      var seen = {};
      var chosen = [];
      for (var p = 0; p < picked.length; p++) {
        var oid = picked[p];
        if (seen[oid]) return { ok: false, error: 'Opción repetida en ' + product.title + '.' };
        seen[oid] = true;
        var found = null;
        for (var o = 0; o < opts.length; o++) if (opts[o].id === oid) { found = opts[o]; break; }
        if (!found) return { ok: false, error: 'Opción desconocida en ' + product.title + '.' };
        chosen.push(found);
      }
      var max = group.type === 'multi' ? (group.max || opts.length) : 1;
      if (chosen.length > max) return { ok: false, error: 'Demasiadas opciones en ' + group.label + '.' };
      if (group.required && chosen.length < 1) return { ok: false, error: 'Falta elegir: ' + group.label + '.', missing: gid };
      for (var c = 0; c < chosen.length; c++) unit += chosen[c].price || 0;
      if (chosen.length) {
        choices.push({ group: gid, label: group.label, options: chosen.map(function (x) { return { id: x.id, name: x.name, price: x.price || 0 }; }) });
        keyParts.push(gid + ':' + chosen.map(function (x) { return x.id; }).sort().join(','));
      }
    }
    var note = text(raw.note, 120);

    return {
      ok: true,
      line: {
        key: product.id + '|' + portion.id + '|' + keyParts.join(';') + '|' + note,
        id: product.id,
        portion: portion.id,
        name: product.title,
        portionLabel: portion.qty + ' ' + portion.unit,
        categoryId: product.id,
        choices: choices,
        note: note,
        qty: qty,
        unitPrice: unit,
        total: unit * qty
      }
    };
  }

  /* Convierte una línea resuelta de vuelta a su forma cruda (para guardar y enviar). */
  function toRaw(line) {
    var sel = {};
    line.choices.forEach(function (c) { sel[c.group] = c.options.map(function (o) { return o.id; }); });
    return { id: line.id, portion: line.portion, sel: sel, qty: line.qty, note: line.note || '' };
  }

  /* Junta líneas idénticas y calcula el total. rawLines puede venir del navegador o del servidor. */
  function resolveOrder(menu, rawLines) {
    if (!Array.isArray(rawLines) || !rawLines.length) return { ok: false, error: 'El pedido está vacío.' };
    if (rawLines.length > MAX_LINES) return { ok: false, error: 'El pedido tiene demasiadas líneas.' };
    var byKey = {};
    var lines = [];
    for (var i = 0; i < rawLines.length; i++) {
      var r = resolveLine(menu, rawLines[i]);
      if (!r.ok) return r;
      var ex = byKey[r.line.key];
      if (ex) {
        ex.qty += r.line.qty;
        if (ex.qty > MAX_QTY) return { ok: false, error: 'Cantidad inválida en ' + ex.name + '.' };
        ex.total = ex.unitPrice * ex.qty;
      } else {
        byKey[r.line.key] = r.line;
        lines.push(r.line);
      }
    }
    var total = lines.reduce(function (s, l) { return s + l.total; }, 0);
    var count = lines.reduce(function (s, l) { return s + l.qty; }, 0);
    var min = menu.service && menu.service.minOrder;
    if (min && total < min) return { ok: false, error: 'El pedido mínimo es de ' + money(min, menu.brand.currency) + '.' };
    return { ok: true, lines: lines, total: total, count: count };
  }

  function makeOrderId(prefix) {
    var s = '';
    for (var i = 0; i < 5; i++) s += ID_ALPHABET.charAt(Math.floor(Math.random() * ID_ALPHABET.length));
    return (prefix || 'MW') + '-' + s;
  }

  function cleanCustomer(menu, raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var mode = raw.mode === 'delivery' ? 'delivery' : 'pickup';
    var name = text(raw.name, 60);
    var address = text(raw.address, 160);
    var notes = text(raw.notes, 240);
    if (!name) return { ok: false, error: 'Falta tu nombre.', field: 'name' };
    if (mode === 'delivery' && !(menu.service && menu.service.delivery)) return { ok: false, error: 'Por ahora solo hay recojo en el local.', field: 'mode' };
    if (mode === 'pickup' && menu.service && menu.service.pickup === false) return { ok: false, error: 'Por ahora solo hay entrega a domicilio.', field: 'mode' };
    if (mode === 'delivery' && !address) return { ok: false, error: 'Falta la dirección o una referencia para la entrega.', field: 'address' };
    return { ok: true, customer: { name: name, mode: mode, address: mode === 'delivery' ? address : '', notes: notes } };
  }

  function buildMessage(menu, order) {
    var cur = menu.brand.currency;
    var out = [];
    out.push('*Pedido ' + order.orderId + '* · ' + menu.brand.name);
    out.push('Nombre: ' + order.customer.name);
    out.push(order.customer.mode === 'delivery' ? 'Entrega a domicilio' : 'Recojo en el local');
    if (order.customer.address) out.push('Dirección: ' + order.customer.address);
    out.push('');
    order.lines.forEach(function (l) {
      out.push(l.qty + 'x ' + l.name + ' · ' + l.portionLabel + ' (' + money(l.unitPrice, cur) + ' c/u)');
      l.choices.forEach(function (c) {
        var names = c.options.map(function (o) { return o.name + (o.price ? ' +' + o.price : ''); }).join(', ');
        out.push('   ' + c.label + ': ' + names);
      });
      if (l.note) out.push('   Nota: ' + l.note);
    });
    out.push('');
    out.push('*Total productos: ' + money(order.total, cur) + '*');
    if (order.customer.mode === 'delivery') out.push('Envío: por confirmar');
    if (order.customer.notes) { out.push(''); out.push('Notas: ' + order.customer.notes); }
    return out.join('\n');
  }

  function whatsappUrl(menu, message) {
    return 'https://wa.me/' + menu.brand.whatsapp + '?text=' + encodeURIComponent(message);
  }

  /* payload: { lines:[raw], customer:{...} }  ->  { ok, order } */
  function validateOrder(menu, payload) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Pedido inválido.' };
    var r = resolveOrder(menu, payload.lines);
    if (!r.ok) return r;
    var c = cleanCustomer(menu, payload.customer);
    if (!c.ok) return c;
    var order = { orderId: makeOrderId(menu.brand.orderPrefix), customer: c.customer, lines: r.lines, total: r.total, count: r.count };
    order.message = buildMessage(menu, order);
    order.whatsappUrl = whatsappUrl(menu, order.message);
    return { ok: true, order: order };
  }

  return {
    MAX_QTY: MAX_QTY,
    groupOptions: groupOptions,
    findProduct: findProduct,
    money: money,
    resolveLine: resolveLine,
    resolveOrder: resolveOrder,
    toRaw: toRaw,
    makeOrderId: makeOrderId,
    cleanCustomer: cleanCustomer,
    buildMessage: buildMessage,
    whatsappUrl: whatsappUrl,
    validateOrder: validateOrder
  };
});
