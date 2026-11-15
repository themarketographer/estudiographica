// Resultados de las pruebas A/B. Pide  Authorization: Bearer <AB_ADMIN_TOKEN>.
// Devuelve, por prueba y variante, visitantes únicos y conversiones únicas por objetivo, y la fecha del primer evento.
const crypto = require('crypto');
const { storeFor } = require('./ab-event.js');

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  const expected = process.env.AB_ADMIN_TOKEN || '';
  if (!expected) return reply(503, { ok: false, error: 'Falta crear la variable AB_ADMIN_TOKEN en Netlify.' });
  const h = event.headers || {};
  const got = Buffer.from(String(h.authorization || '').replace(/^Bearer\s+/i, '')), exp = Buffer.from(expected);
  if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) return reply(401, { ok: false, error: 'Clave incorrecta.' });

  const store = storeFor(event);
  const tests = {};
  const { blobs } = await store.list();
  for (const b of blobs) {
    const [t, v, e] = b.key.split('/');
    if (t === '_start') { (tests[v] = tests[v] || { variants: {} }).firstSeen = (await store.get(b.key, { type: 'json' })).ts; continue; }
    const test = (tests[t] = tests[t] || { variants: {} });
    const row = (test.variants[v] = test.variants[v] || { views: 0, goals: {} });
    if (e === 'view') row.views++;
    else { const g = e.replace('convert_', ''); row.goals[g] = (row.goals[g] || 0) + 1; }
  }
  return reply(200, { ok: true, now: Date.now(), tests });
};
