// Seguimiento del pedido para el cliente: GET /api/magma/track?n=07-24OCT&p=1234
// "p" son los últimos 4 dígitos del celular con el que pidió. Devuelve el estado y el del pago, nada de datos personales.
const Lookup = require('./lib-magma/lookup.js');

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return reply(405, { ok: false, error: 'Método no permitido.' });
  const q = event.queryStringParameters || {};
  const r = await Lookup.findOrder(event, q.n, q.p);
  if (!r.rec) return reply(r.status, { ok: false, error: r.error });
  const rec = r.rec;
  return reply(200, {
    ok: true,
    orderId: rec.orderId,
    status: rec.status,
    mode: rec.mode,
    zone: rec.customer.zone || '',
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt || rec.createdAt,
    total: rec.total,
    count: rec.count,
    firstName: rec.customer.firstName || '',
    payment: rec.payment ? { method: rec.payment.method, status: rec.payment.status } : { method: 'cash', status: 'pendiente' }
  });
};
