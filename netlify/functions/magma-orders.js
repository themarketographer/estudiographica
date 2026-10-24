// Panel de pedidos de Magma Wings (solo para el dueño).
//   GET  /api/magma/orders                    lista los últimos pedidos
//   POST /api/magma/orders { key, status }    cambia el estado de un pedido
// Pide la cabecera  Authorization: Bearer <MAGMA_ADMIN_TOKEN>  (variable de entorno en Netlify).
const crypto = require('crypto');
const Store = require('./lib-magma/store.js');
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
      const orders = await Store.listOrders(event, 150);
      return reply(200, { ok: true, store: Store.storeName(), orders });
    }
    if (event.httpMethod === 'POST') {
      let body;
      try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Pedido ilegible.' }); }
      if (typeof body.key !== 'string' || Store.STATUSES.indexOf(body.status) === -1) return reply(422, { ok: false, error: 'Estado inválido.' });
      const rec = await Store.setStatus(event, body.key, body.status);
      if (!rec) return reply(404, { ok: false, error: 'No existe ese pedido.' });
      // Al entregar, el pedido pasa a ser una venta confirmada: se avisa a Meta una sola vez.
      let capi = 'skipped';
      if (body.status === 'entregado' && !rec.purchaseSent) {
        const r = await Meta.sendEvent('Purchase', rec, 'https://' + ((event.headers || {}).host || 'estudiographica.com') + '/menu/magma/');
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
