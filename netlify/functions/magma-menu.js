// API pública del menú de Magma Wings: GET /api/magma/menu
// Sirve menu/magma/menu.json (única fuente de verdad). Editas ese archivo y el
// menú cambia aquí y en la página sin tocar código.
const menu = require('../../menu/magma/menu.json');

exports.handler = async function (event) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET') return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Método no permitido.' }) };
  return { statusCode: 200, headers, body: JSON.stringify(menu) };
};
