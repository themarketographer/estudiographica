// Pedidos de Zona 0: POST /api/zona0/order
// Lo usan dos cosas: el celular del cliente (público) y el panel de la computadora (con la clave del personal).
// Recalcula todo con los precios del menú: nunca confía en el total que manda el navegador.
const menu = require('../../menu/zona-0/menu.json');
const Pricing = require('../../menu/zona-0/js/pricing.js');
const Store = require('./lib-zona0/store.js');
const Notify = require('./lib-zona0/notify.js');
const { authorized, reply } = require('./lib-zona0/auth.js');

const MAX_BODY = 20000;
// Freno simple contra pedidos en masa desde el celular (vive en la memoria de la función).
const hits = new Map();
const MAX_HITS = 6, WINDOW = 10 * 60 * 1000;
function ipOf(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
}
function tooMany(ip) {
  const now = Date.now();
  const f = hits.get(ip);
  if (!f || now - f.at > WINDOW) { hits.set(ip, { n: 1, at: now }); return false; }
  f.n += 1;
  return f.n > MAX_HITS;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Método no permitido.' });
  if ((event.body || '').length > MAX_BODY) return reply(413, { ok: false, error: 'El pedido es demasiado grande.' });

  const staff = authorized(event);
  if (!staff && tooMany(ipOf(event))) return reply(429, { ok: false, error: 'Demasiados pedidos seguidos. Espera unos minutos.' });

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'No pudimos leer el pedido.' }); }

  const check = Pricing.validateOrder(menu, payload, { staff });
  if (!check.ok) return reply(422, { ok: false, error: check.error, field: check.field || null });

  if (!staff && !(await Store.isOpen(event))) {
    return reply(409, { ok: false, closed: true, error: 'Ahora mismo no estamos recibiendo pedidos. Vuelve a intentar en un rato.' });
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const day = Pricing.boliviaDate(now);
  const o = check.order;
  const pay = payload.payment && typeof payload.payment === 'object' ? payload.payment : {};
  const method = staff && Pricing.PAY_METHODS.indexOf(pay.method) > -1 ? pay.method : 'efectivo';
  const paid = staff && pay.paid === true;

  // Cada línea sabe si es comida, bebida o las dos, para separar la comanda en cocina.
  const catKind = {};
  (menu.categories || []).forEach((c) => { catKind[c.id] = c.kind || 'comida'; });
  const kindsOf = (id) => {
    const p = Pricing.findProduct(menu, id);
    return p && Array.isArray(p.kinds) && p.kinds.length ? p.kinds.slice(0, 2) : [catKind[p && p.category] || 'comida'];
  };
  const incOf = (id) => { const p = Pricing.findProduct(menu, id); return p && p.includes ? String(p.includes) : ''; };

  const make = (n, key) => ({
    key, orderId: Pricing.orderNumber(n, now), number: n, createdAt, updatedAt: createdAt,
    status: staff ? 'preparando' : 'nuevo', source: staff ? 'local' : 'app', mode: o.customer.mode, customer: o.customer,
    lines: o.lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unitPrice: l.unitPrice, total: l.total, choices: l.choices, note: l.note, kinds: kindsOf(l.id), inc: incOf(l.id), done: [] })),
    subtotal: o.subtotal, deliveryFee: o.deliveryFee, total: o.total, count: o.count, currency: menu.brand.currency,
    payment: { method, status: paid ? 'pagado' : 'pendiente' },
    context: Store.isProd(event) ? 'production' : 'preview'
  });

  const save = await Store.saveNumbered(event, day.key, make);
  if (!save.ok) return reply(500, { ok: false, error: 'No pudimos guardar el pedido. Intenta de nuevo.', detail: Store.isProd(event) ? undefined : save.error });
  await Store.touch(event, save.rec.key);
  if (!staff) await Notify.newOrder(save.rec, Store.isProd(event));

  return reply(200, { ok: true, order: save.rec, prepMin: menu.service.prepMin });
};
