// Seguimiento para el cliente: GET /api/zona0/track?n=07-30OCT&p=1234
// "p" son los últimos 4 dígitos del celular con el que pidió. Devuelve estados, nada de datos personales.
const Pricing = require('../../menu/zona-0/js/pricing.js');
const Store = require('./lib-zona0/store.js');
const { reply } = require('./lib-zona0/auth.js');

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const fails = new Map();
const MAX_FAILS = 8, WINDOW = 10 * 60 * 1000;
function ipOf(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
}

// "07-30OCT" -> claves posibles "2026-10-30/007" (este año y el anterior, porque el número no lleva año).
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
  const ip = ipOf(event);
  const f = fails.get(ip);
  if (f && Date.now() - f.at <= WINDOW && f.n >= MAX_FAILS) return reply(429, { ok: false, error: 'Demasiados intentos. Espera unos minutos.' });
  const keys = keysFor(q.n, new Date());
  const last4 = String(q.p || '').replace(/\D/g, '').slice(-4);
  if (!keys || last4.length !== 4) return reply(400, { ok: false, error: 'Revisa el número de pedido y los últimos 4 dígitos de tu celular.' });
  let rec = null;
  for (const k of keys) { rec = await Store.getOrder(event, k); if (rec) break; }
  const phone = rec && rec.customer && rec.customer.phone ? String(rec.customer.phone) : '';
  if (!rec || phone.slice(-4) !== last4) {
    if (!f || Date.now() - f.at > WINDOW) fails.set(ip, { n: 1, at: Date.now() }); else f.n += 1;
    return reply(404, { ok: false, error: 'No encontramos ese pedido. Revisa el número y los 4 últimos dígitos de tu celular.' });
  }
  return reply(200, {
    ok: true, orderId: rec.orderId, status: rec.status, mode: rec.mode,
    createdAt: rec.createdAt, updatedAt: rec.updatedAt || rec.createdAt,
    total: rec.total, count: rec.count, firstName: String(rec.customer.name || '').split(' ')[0],
    payment: rec.payment ? rec.payment.status : 'pendiente'
  });
};
