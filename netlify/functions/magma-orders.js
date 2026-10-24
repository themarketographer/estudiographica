// Panel de pedidos de Magma Wings (solo para el dueño).
//   GET  /api/magma/orders?days=2             pedidos de los últimos N días (por defecto hoy y ayer)
//   GET  /api/magma/orders?since=<ms>         solo los pedidos que cambiaron desde ese momento (consulta liviana)
//   POST /api/magma/orders { key, status }    cambia el estado de un pedido
//   POST /api/magma/orders { key, payment }   verifica o rechaza el pago (verificado | rechazado | pendiente)
//   GET  /api/magma/orders?proof=<key>        imagen del comprobante de pago
// Pide la cabecera  Authorization: Bearer <MAGMA_ADMIN_TOKEN>  (variable de entorno en Netlify).
const crypto = require('crypto');
const Store = require('./lib-magma/store.js');
const Pricing = require('../../menu/magma/js/pricing.js');
const Meta = require('./lib-magma/meta.js');

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

function authorized(event) {
  const expected = process.env.MAGMA_ADMIN_TOKEN || '';
  const h = event.headers || {};
  const got = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

exports.handler = async function (event) {
  if (!process.env.MAGMA_ADMIN_TOKEN) return reply(503, { ok: false, error: 'Falta configurar MAGMA_ADMIN_TOKEN en Netlify.' });
  if (!authorized(event)) return reply(401, { ok: false, error: 'Clave incorrecta.' });

  try {
    if (event.httpMethod === 'GET') {
      const pk = (event.queryStringParameters || {}).proof;
      if (pk) {
        const pr = await Store.getProof(event, pk);
        if (!pr) return reply(404, { ok: false, error: 'Este pedido no tiene comprobante.' });
        return reply(200, { ok: true, image: pr.image, at: pr.at });
      }
      const q = event.queryStringParameters || {};
      // Consulta liviana: solo lo que cambió desde la última vez.
      if (q.since) {
        const r = await Store.changedSince(event, Number(q.since) || 0);
        return reply(200, { ok: true, store: Store.storeName(event), now: r.now, orders: r.orders });
      }
      // Carga completa: hoy y ayer por defecto. "days" amplía (máximo 31).
      const days = Math.min(31, Math.max(1, parseInt(q.days, 10) || 2));
      const keys = [];
      for (let i = 0; i < days; i++) keys.push(Pricing.boliviaDate(new Date(Date.now() - i * 86400000)).key);
      const orders = await Store.listDays(event, keys);
      return reply(200, { ok: true, store: Store.storeName(event), now: Date.now(), days, orders });
    }
    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Pedido ilegible.' }); }
      if (typeof body.key === 'string' && typeof body.payment === 'string') {
        if (['pendiente', 'comprobante', 'verificado', 'rechazado'].indexOf(body.payment) === -1) return reply(422, { ok: false, error: 'Estado de pago inválido.' });
        const pr = await Store.setPayment(event, body.key, body.payment);
        return pr ? reply(200, { ok: true, order: pr }) : reply(404, { ok: false, error: 'No existe ese pedido.' });
      }
      if (typeof body.key !== 'string' || Store.STATUSES.indexOf(body.status) === -1) return reply(422, { ok: false, error: 'Estado inválido.' });
      const rec = await Store.setStatus(event, body.key, body.status);
      if (!rec) return reply(404, { ok: false, error: 'No existe ese pedido.' });
      // Al entregar, el pedido pasa a ser una venta confirmada: se avisa a Meta una sola vez.
      let capi = 'skipped';
      if (body.status === 'entregado' && !rec.purchaseSent) {
        const r = await Meta.sendEvent('Purchase', rec, 'https://' + ((event.headers || {}).host || 'estudiographica.com') + '/menu/magma/', Store.isProd(event));
        capi = r.status;
        if (r.status === 'sent') { rec.purchaseSent = true; await Store.saveRecord(event, rec); }
      }
      return reply(200, { ok: true, order: rec, capi });
    }
    return reply(405, { ok: false, error: 'Método no permitido.' });
  } catch (e) {
    console.error('magma-orders:', e && e.message);
    return reply(500, { ok: false, error: 'No pudimos leer los pedidos.' });
  }
};
