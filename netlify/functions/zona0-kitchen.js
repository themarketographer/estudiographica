// Cocina de Zona 0: GET /api/zona0/kitchen y POST /api/zona0/kitchen
// Acepta la clave de cocina (ZONA0_KITCHEN_TOKEN) o la del personal. La cocina no ve teléfonos, direcciones ni precios.
//   GET  ?days=1      comandas activas de hoy y ayer
//   GET  ?since=<ms>  solo las que cambiaron desde ese momento
//   POST { key, line, station:'comida'|'bebida', done:true|false }   marca lo que ya se preparó
const Store = require('./lib-zona0/store.js');
const Pricing = require('../../menu/zona-0/js/pricing.js');
const { role, reply } = require('./lib-zona0/auth.js');

function view(o) {
  const c = o.customer || {};
  return {
    key: o.key, orderId: o.orderId, createdAt: o.createdAt, status: o.status, mode: o.mode,
    customer: { name: c.name || '', mesa: c.mesa || '', notes: c.notes || '' },
    lines: (o.lines || []).map((l) => ({ name: l.name, qty: l.qty, choices: l.choices || [], note: l.note || '', inc: l.inc || '', kinds: Store.lineKinds(l), done: Array.isArray(l.done) ? l.done : [] }))
  };
}
const active = (o) => o && (o.status === 'preparando' || o.status === 'listo');

exports.handler = async function (event) {
  if (!process.env.ZONA0_ADMIN_TOKEN && !process.env.ZONA0_KITCHEN_TOKEN) return reply(503, { ok: false, error: 'Falta configurar la clave de cocina en Netlify.' });
  if (!role(event)) return reply(401, { ok: false, error: 'Clave incorrecta.' });
  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      if (q.since) {
        const r = await Store.changedSince(event, Number(q.since) || 0);
        const gone = r.orders.filter((o) => !active(o)).map((o) => o.key);
        return reply(200, { ok: true, now: r.now, orders: r.orders.filter(active).map(view), gone });
      }
      const keys = [0, 1].map((i) => Pricing.boliviaDate(new Date(Date.now() - i * 86400000)).key);
      const rows = await Store.listDays(event, keys);
      return reply(200, { ok: true, now: Date.now(), orders: rows.filter(active).map(view), gone: [] });
    }
    if (event.httpMethod === 'POST') {
      let b;
      try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Pedido ilegible.' }); }
      if (typeof b.key !== 'string' || !Number.isInteger(b.line) || ['comida', 'bebida'].indexOf(b.station) === -1) return reply(422, { ok: false, error: 'Datos incompletos.' });
      const rec = await Store.setLineDone(event, b.key, b.line, b.station, b.done !== false);
      return rec ? reply(200, { ok: true, order: active(rec) ? view(rec) : null, status: rec.status }) : reply(404, { ok: false, error: 'No existe ese pedido.' });
    }
    return reply(405, { ok: false, error: 'Método no permitido.' });
  } catch (e) {
    console.error('zona0-kitchen:', e && e.message);
    return reply(500, { ok: false, error: 'No pudimos leer las comandas.' });
  }
};
