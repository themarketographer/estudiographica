// Clave del personal: variable ZONA0_ADMIN_TOKEN en Netlify. El repositorio es público, así que la clave nunca va en el código.
const crypto = require('crypto');

function authorized(event) {
  const expected = String(process.env.ZONA0_ADMIN_TOKEN || '').trim();
  if (!expected) return false;
  const h = event.headers || {};
  const got = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Clave de cocina (ZONA0_KITCHEN_TOKEN): solo sirve para ver comandas y marcar lo que ya se preparó.
// Devuelve 'admin', 'kitchen' o false. La clave del personal también abre la cocina.
function role(event) {
  if (authorized(event)) return 'admin';
  const expected = String(process.env.ZONA0_KITCHEN_TOKEN || '').trim();
  if (!expected) return false;
  const h = event.headers || {};
  const got = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '').trim();
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? 'kitchen' : false;
}

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

module.exports = { authorized, role, reply };
