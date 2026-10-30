// Panel de pedidos de Zona 0 (solo personal, con  Authorization: Bearer <ZONA0_ADMIN_TOKEN>).
//   GET  /api/zona0/orders?days=2        pedidos de los últimos N días (por defecto hoy y ayer) y estado del interruptor
//   GET  /api/zona0/orders?since=<ms>    solo los pedidos que cambiaron desde ese momento (consulta liviana)
//   POST /api/zona0/orders { key, status }                    cambia el estado
//   POST /api/zona0/orders { key, payment:'pagado'|'pendiente', method? }  registra el cobro
//   POST /api/zona0/orders { settle:[key,...], method }       cobra varios pedidos (cierra una mesa) y los marca entregados
//   POST /api/zona0/orders { settle:[key,...], parts:[{method,amount}] }  cobra con la cuenta dividida (los montos suman el total)
//   POST /api/zona0/orders { open: true|false }               abre o cierra la recepción de pedidos
const Store = require('./lib-zona0/store.js');
const Pricing = require('../../menu/zona-0/js/pricing.js');
const { authorized, reply } = require('./lib-zona0/auth.js');

exports.handler = async function (event) {
  if (!process.env.ZONA0_ADMIN_TOKEN) return reply(503, { ok: false, error: 'Falta configurar ZONA0_ADMIN_TOKEN en Netlify.' });
  if (!authorized(event)) return reply(401, { ok: false, error: 'Clave incorrecta.' });
  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      if (q.since) {
        const [r, open] = await Promise.all([Store.changedSince(event, Number(q.since) || 0), Store.isOpen(event)]);
        return reply(200, { ok: true, now: r.now, open, orders: r.orders });
      }
      const days = Math.min(120, Math.max(1, parseInt(q.days, 10) || 2));
      const keys = [];
      for (let i = 0; i < days; i++) keys.push(Pricing.boliviaDate(new Date(Date.now() - i * 86400000)).key);
      const [orders, open] = await Promise.all([Store.listDays(event, keys, days > 31 ? 1500 : 600), Store.isOpen(event)]);
      return reply(200, { ok: true, store: Store.storeName(event), now: Date.now(), days, open, orders });
    }
    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Pedido ilegible.' }); }
      if (typeof body.open === 'boolean') {
        await Store.setOpen(event, body.open);
        return reply(200, { ok: true, open: body.open });
      }
      if (Array.isArray(body.settle) && Array.isArray(body.parts)) {
        const keys = body.settle.filter((k) => typeof k === 'string').slice(0, 30);
        const parts = body.parts.slice(0, 12).map((p) => ({ method: Pricing.PAY_METHODS.indexOf(p && p.method) > -1 ? p.method : 'efectivo', amount: Math.round(Number(p && p.amount) * 100) / 100 }));
        if (!parts.length || parts.some((p) => !(p.amount > 0))) return reply(422, { ok: false, error: 'Revisa los montos de cada parte.' });
        const r = await Store.settleParts(event, keys, parts);
        return r.error ? reply(422, { ok: false, error: r.error }) : reply(200, { ok: true, orders: r.orders });
      }
      if (Array.isArray(body.settle)) {
        const method = Pricing.PAY_METHODS.indexOf(body.method) > -1 ? body.method : 'efectivo';
        const keys = body.settle.filter((k) => typeof k === 'string').slice(0, 30);
        const rows = [];
        for (const k of keys) { const r = await Store.settle(event, k, method); if (r) rows.push(r); }
        return reply(200, { ok: true, orders: rows });
      }
      if (typeof body.key !== 'string') return reply(422, { ok: false, error: 'Falta el pedido.' });
      if (typeof body.payment === 'string') {
        if (['pagado', 'pendiente'].indexOf(body.payment) === -1) return reply(422, { ok: false, error: 'Estado de pago inválido.' });
        const method = Pricing.PAY_METHODS.indexOf(body.method) > -1 ? body.method : undefined;
        const rec = await Store.setPayment(event, body.key, body.payment, method);
        return rec ? reply(200, { ok: true, order: rec }) : reply(404, { ok: false, error: 'No existe ese pedido.' });
      }
      if (Store.STATUSES.indexOf(body.status) === -1) return reply(422, { ok: false, error: 'Estado inválido.' });
      const rec = await Store.setStatus(event, body.key, body.status);
      return rec ? reply(200, { ok: true, order: rec }) : reply(404, { ok: false, error: 'No existe ese pedido.' });
    }
    return reply(405, { ok: false, error: 'Método no permitido.' });
  } catch (e) {
    console.error('zona0-orders:', e && e.message);
    return reply(500, { ok: false, error: 'No pudimos leer los pedidos.' });
  }
};
