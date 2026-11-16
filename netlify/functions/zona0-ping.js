// Timbre de Zona 0: GET /api/zona0/ping/<sha256 de la clave>  ->  { ok, v, open }
// "v" es la hora en que se generó la respuesta. Netlify la guarda 10 minutos y la borra
// sola al haber cambios (ver bump en lib-zona0/store.js), así las pantallas lo revisan sin gastar llamadas a funciones.
// No lleva datos de pedidos. Solo responde si la dirección contiene el hash de una clave válida.
const Store = require('./lib-zona0/store.js');

function reply(statusCode, body, headers) {
  return { statusCode, headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, headers || {}), body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'GET') return reply(405, { ok: false });
  const k = String(event.path || '').split('?')[0].split('/').pop().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(k) || Store.pingKeys().indexOf(k) === -1) return reply(401, { ok: false });
  try {
    const p = await Store.ping(event);
    return reply(200, { ok: true, v: p.v, open: p.open, dbg: p.dbg }, {
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': 'public, s-maxage=600, durable',
      'Netlify-Cache-Tag': Store.pingTag(k)
    });
  } catch (e) {
    console.error('zona0-ping:', e && e.message);
    return reply(500, { ok: false });
  }
};
