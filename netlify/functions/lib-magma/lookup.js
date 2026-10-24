// Busca un pedido por número visible (07-24OCT) y últimos 4 dígitos del celular.
// Lo usan el seguimiento y la subida de comprobante. Frena los intentos masivos por IP (en memoria de la función).
const Pricing = require('../../../menu/magma/js/pricing.js');
const Store = require('./store.js');

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const fails = new Map();
const MAX_FAILS = 8, WINDOW = 10 * 60 * 1000;

function ipOf(event) {
  const h = event.headers || {};
  return String(h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || 'x').trim();
}
function blocked(ip) {
  const f = fails.get(ip);
  if (!f) return false;
  if (Date.now() - f.at > WINDOW) { fails.delete(ip); return false; }
  return f.n >= MAX_FAILS;
}
function fail(ip) {
  const f = fails.get(ip);
  if (!f || Date.now() - f.at > WINDOW) fails.set(ip, { n: 1, at: Date.now() });
  else f.n += 1;
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

// Devuelve { rec } o { error, status }.
async function findOrder(event, n, p) {
  const ip = ipOf(event);
  if (blocked(ip)) return { status: 429, error: 'Demasiados intentos. Espera unos minutos y vuelve a probar.' };
  const keys = keysFor(n, new Date());
  const last4 = String(p || '').replace(/\D/g, '').slice(-4);
  if (!keys || last4.length !== 4) return { status: 400, error: 'Revisa el número de pedido y los últimos 4 dígitos de tu celular.' };
  let rec = null;
  for (const k of keys) {
    rec = await Store.getOrder(event, k);
    if (rec) break;
  }
  const phone = rec && rec.customer && rec.customer.phone ? String(rec.customer.phone) : '';
  if (!rec || phone.slice(-4) !== last4) {
    fail(ip);
    await new Promise((r) => setTimeout(r, 600));
    return { status: 404, error: 'No encontramos ese pedido. Revisa el número y los 4 últimos dígitos de tu celular.' };
  }
  return { rec };
}

module.exports = { findOrder, keysFor };
