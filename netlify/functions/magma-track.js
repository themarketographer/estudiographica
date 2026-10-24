// Seguimiento del pedido para el cliente: GET /api/magma/track?n=07-24OCT&p=1234
// "p" son los últimos 4 dígitos del celular con el que pidió. Devuelve solo el estado, nada de datos personales.
const Pricing = require('../../menu/magma/js/pricing.js');
const Store = require('./lib-magma/store.js');

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

// "07-24OCT" -> claves posibles "2026-10-24/007" (este año y el anterior, porque el número no lleva año).
function keysFor(n, now) {
  const m = /^(\d{1,3})-(\d{2})([A-Z]{3})$/.exec(String(n || '').replace(/^#/, '').toUpperCase().trim());
  if (!m) return null;
  const mes = MESES.indexOf(m[3]);
  if (mes < 0) return null;
  const y = Number(Pricing.boliviaDate(now).key.slice(0, 4));
  return [y, y - 1].map((yy) => yy + '-' + String(mes + 1).padStart(2, '0') + '-' + m[2] + '/' + String(Number(m[1])).padStart(3, '0'));
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return reply(405, { ok: false, error: 'Método no permitido.' });
  const q = event.queryStringParameters || {};
  const keys = keysFor(q.n, new Date());
  const last4 = String(q.p || '').replace(/\D/g, '').slice(-4);
  if (!keys || last4.length !== 4) return reply(400, { ok: false, error: 'Revisa el número de pedido y los últimos 4 dígitos de tu celular.' });
  let rec = null;
  for (const k of keys) {
    rec = await Store.getOrder(event, k);
    if (rec) break;
  }
  const phone = rec && rec.customer && rec.customer.phone ? String(rec.customer.phone) : '';
  if (!rec || phone.slice(-4) !== last4) {
    await new Promise((r) => setTimeout(r, 600));
    return reply(404, { ok: false, error: 'No encontramos ese pedido. Revisa el número y los 4 últimos dígitos de tu celular.' });
  }
  return reply(200, {
    ok: true,
    orderId: rec.orderId,
    status: rec.status,
    mode: rec.mode,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt || rec.createdAt,
    total: rec.total,
    count: rec.count,
    firstName: rec.customer.firstName || ''
  });
};
