// Clave del personal: variable ZONA0_ADMIN_TOKEN en Netlify. El repositorio es público, así que la clave nunca va en el código.
const crypto = require('crypto');

function authorized(event) {
  const expected = process.env.ZONA0_ADMIN_TOKEN || '';
  if (!expected) return false;
  const h = event.headers || {};
  const got = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

module.exports = { authorized, reply };
