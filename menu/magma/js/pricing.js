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

  /* Fecha en Bolivia (UTC-4, sin horario de verano). Devuelve { key: '2026-10-24', label: '24OCT', hm: '1432' }. */
  var MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
  function boliviaDate(d) {
    var t = new Date((d || new Date()).getTime() - 4 * 3600 * 1000);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return {
      key: t.getUTCFullYear() + '-' + p(t.getUTCMonth() + 1) + '-' + p(t.getUTCDate()),
      label: p(t.getUTCDate()) + MESES[t.getUTCMonth()],
      hm: p(t.getUTCHours()) + p(t.getUTCMinutes())
    };
  }
  /* Número de pedido: #07-24OCT (el 7.º del día 24 de octubre). El servidor lleva la cuenta del día. */
  function orderNumber(n, date) { return '#' + String(n).padStart(2, '0') + '-' + boliviaDate(date).label; }
  /* Sin servidor no hay cuenta: se marca con la hora, por ejemplo #T1432-24OCT. */
  function makeOrderId() { var d = boliviaDate(); return '#T' + d.hm + '-' + d.label; }

  /* Celular a solo dígitos con código de país. En Bolivia los móviles tienen 8 dígitos y empiezan con 6 o 7. */
  function normalizePhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    if (d.length === 8 && /^[67]/.test(d)) d = '591' + d;
    return d;
  }
  function fmtPhone(d) { return d.indexOf('591') === 0 ? '+591 ' + d.slice(3) : '+' + d; }
  function validPhone(d) {
    if (d.indexOf('591') === 0) return d.length === 11 && /^[67]/.test(d.slice(3));
    return d.length >= 10 && d.length <= 15;
  }

  /* Envío según la zona. fee: número, 0 si supera el monto de envío gratis, o null si se confirma por chat. */
  function findZone(menu, id) {
    var zs = (menu.service && menu.service.zones) || [];
    for (var i = 0; i < zs.length; i++) if (zs[i].id === id) return zs[i];
    return null;
  }
  function deliveryFee(menu, customer, subtotal) {
    if (!customer || customer.mode !== 'delivery') return { fee: 0, free: false, label: '' };
    var z = findZone(menu, customer.zone);
    var free = menu.service && menu.service.freeDeliveryFrom;
    if (free && subtotal >= free && z && z.fee !== null) return { fee: 0, free: true, label: z.name };
    if (!z) return { fee: null, free: false, label: '' };
    return { fee: z.fee, free: false, label: z.name };
  }

  function cleanCustomer(menu, raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var svc = menu.service || {};
    var mode = raw.mode === 'delivery' ? 'delivery' : 'pickup';
    var firstName = text(raw.firstName, 40);
    var lastName = text(raw.lastName, 40);
    var email = text(raw.email, 120).toLowerCase();
    var phone = normalizePhone(raw.phone);
    var address = text(raw.address, 160);
    var notes = text(raw.notes, 240);
    var zone = findZone(menu, String(raw.zone || ''));
    if (!firstName) return { ok: false, error: 'Falta tu nombre.', field: 'firstName' };
    if (!lastName) return { ok: false, error: 'Falta tu apellido.', field: 'lastName' };
    if (!validPhone(phone)) return { ok: false, error: 'Escribe tu celular, por ejemplo 76980828.', field: 'phone' };
    if (email ? !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) : !!svc.requireEmail) return { ok: false, error: email ? 'Revisa tu correo, parece incompleto.' : 'Falta tu correo.', field: 'email' };
    if (mode === 'delivery' && !svc.delivery) return { ok: false, error: 'Por ahora solo hay recojo en el local.', field: 'mode' };
    if (mode === 'pickup' && svc.pickup === false) return { ok: false, error: 'Por ahora solo hay entrega a domicilio.', field: 'mode' };
    if (mode === 'delivery' && !address) return { ok: false, error: 'Falta la dirección o una referencia para la entrega.', field: 'address' };
    if (mode === 'delivery' && svc.zones && svc.zones.length && !zone) return { ok: false, error: 'Elige tu zona de entrega.', field: 'zone' };
    return { ok: true, customer: {
      firstName: firstName, lastName: lastName, name: firstName + ' ' + lastName,
      email: email, phone: phone, consent: raw.consent === true,
      mode: mode, address: mode === 'delivery' ? address : '', zone: mode === 'delivery' && zone ? zone.id : '', zoneName: mode === 'delivery' && zone ? zone.name : '', notes: notes
    } };
  }

  /* Sin emojis: los de 4 bytes llegan rotos a WhatsApp Web en algunos navegadores al pasar por la redirección de wa.me.
     El orden, las negritas y las sangrías hacen el trabajo de ordenar. */
  function buildMessage(menu, order) {
    var cur = menu.brand.currency;
    var c = order.customer;
    var out = [];
    out.push('*PEDIDO ' + order.orderId + '*');
    out.push(menu.brand.name + ', Cochabamba');
    out.push('');
    out.push('*Cliente:* ' + c.name);
    out.push('*Celular:* ' + fmtPhone(c.phone));
    if (c.email) out.push('*Correo:* ' + c.email);
    out.push('*Entrega:* ' + (c.mode === 'delivery' ? 'a domicilio' : 'recojo en el local'));
    if (c.address) out.push('*Dirección:* ' + c.address);
    out.push('');
    out.push('*MI PEDIDO*');
    order.lines.forEach(function (l) {
      out.push('• ' + l.qty + ' × ' + l.name + ' ' + l.portionLabel + ' · ' + money(l.total, cur) + (l.qty > 1 ? ' (' + money(l.unitPrice, cur) + ' c/u)' : ''));
      l.choices.forEach(function (ch) {
        var names = ch.options.map(function (o) { return o.name + (o.price ? ' (+' + o.price + ')' : ''); }).join(', ');
        out.push('      ' + ch.label + ': ' + names);
      });
      if (l.note) out.push('      Nota: ' + l.note);
    });
    out.push('');
    if (c.mode === 'delivery') {
      var fee = order.deliveryFee;
      out.push('Productos: ' + money(order.subtotal, cur));
      out.push('Envío' + (c.zoneName ? ' (' + c.zoneName + ')' : '') + ': ' + (fee === null ? 'por confirmar' : fee === 0 ? 'gratis' : money(fee, cur)));
    }
    out.push('*TOTAL: ' + money(order.total, cur) + '*' + (order.deliveryFee === null ? ' más envío' : ''));
    if (order.deliveryFee === null) out.push('El costo de envío me lo confirman por aquí.');
    if (c.notes) { out.push(''); out.push('*Notas:* ' + c.notes); }
    if (menu.brand.trackUrl && !/^#T/.test(order.orderId)) {
      out.push('');
      out.push('*Sigue tu pedido:*');
      out.push(menu.brand.trackUrl + '?n=' + order.orderId.replace(/^#/, ''));
    }
    out.push('');
    out.push('Gracias, quedo atento a la confirmación.');
    return out.join('\n');
  }

  function whatsappUrl(menu, message) {
    return 'https://wa.me/' + menu.brand.whatsapp + '?text=' + encodeURIComponent(message);
  }

  /* payload: { lines:[raw], customer:{...} }  ->  { ok, order } */
  function validateOrder(menu, payload, opts) {
    if (!payload || typeof payload !== 'object') return { ok: false, error: 'Pedido inválido.' };
    var r = resolveOrder(menu, payload.lines);
    if (!r.ok) return r;
    var c = cleanCustomer(menu, payload.customer);
    if (!c.ok) return c;
    var env = deliveryFee(menu, c.customer, r.total);
    var order = { orderId: (opts && opts.orderId) || makeOrderId(), customer: c.customer, lines: r.lines, subtotal: r.total, deliveryFee: env.fee, total: r.total + (env.fee || 0), count: r.count };
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
    orderNumber: orderNumber,
    boliviaDate: boliviaDate,
    cleanCustomer: cleanCustomer,
    deliveryFee: deliveryFee,
    findZone: findZone,
    normalizePhone: normalizePhone,
    fmtPhone: fmtPhone,
    buildMessage: buildMessage,
    whatsappUrl: whatsappUrl,
    validateOrder: validateOrder
  };
});
