// Libro diario de Zona 0 (solo con la clave del personal): ingresos y egresos de caja que no son ventas de pedidos.
// Las ventas salen de los pedidos cobrados; aquí se anota lo demás, por ejemplo "leche para el local".
//   GET  /api/zona0/ledger?from=YYYY-MM-DD&to=YYYY-MM-DD   movimientos del rango (máximo 62 días)
//   POST { type:'egreso'|'ingreso', amount, concept, category, responsible, method, day? }  anota un movimiento
//   POST { void:'<id>', reason? }                          anula un movimiento (queda registrado como anulado)
const Store = require('./lib-zona0/store.js');
const Pricing = require('../../menu/zona-0/js/pricing.js');
const { authorized, reply } = require('./lib-zona0/auth.js');

const CATS = { egreso: ['Insumos', 'Servicios', 'Sueldos', 'Transporte', 'Mantenimiento', 'Retiro del dueño', 'Otros'], ingreso: ['Aporte a caja', 'Cambio', 'Otros ingresos'] };
const METHODS = ['efectivo', 'qr', 'tarjeta', 'transferencia'];
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d + 'T12:00:00Z'));

function days(from, to) {
  const out = [], a = Date.parse(from + 'T12:00:00Z'), b = Date.parse(to + 'T12:00:00Z');
  for (let t = a; t <= b && out.length < 62; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

exports.handler = async function (event) {
  if (!process.env.ZONA0_ADMIN_TOKEN) return reply(503, { ok: false, error: 'Falta configurar ZONA0_ADMIN_TOKEN en Netlify.' });
  if (!authorized(event)) return reply(401, { ok: false, error: 'Clave incorrecta.' });
  try {
    if (event.httpMethod === 'GET') {
      const q = event.queryStringParameters || {};
      const today = Pricing.boliviaDate(new Date()).key;
      const from = isDay(q.from) ? q.from : today, to = isDay(q.to) ? q.to : from;
      const rows = await Store.ledgerRange(event, days(from, to));
      return reply(200, { ok: true, from, to, categories: CATS, entries: rows });
    }
    if (event.httpMethod === 'POST') {
      let b;
      try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Dato ilegible.' }); }
      if (typeof b.void === 'string') {
        const rec = await Store.ledgerVoid(event, b.void, b.by, b.reason);
        return rec ? reply(200, { ok: true, entry: rec }) : reply(404, { ok: false, error: 'No existe ese movimiento.' });
      }
      const type = b.type === 'ingreso' ? 'ingreso' : b.type === 'egreso' ? 'egreso' : '';
      if (!type) return reply(422, { ok: false, error: 'Elige si es ingreso o gasto.' });
      const amount = Math.round(Number(b.amount) * 100) / 100;
      if (!(amount > 0) || amount > 200000) return reply(422, { ok: false, error: 'Revisa el monto.' });
      const concept = clean(b.concept, 80);
      if (!concept) return reply(422, { ok: false, error: 'Escribe en qué se usó o de dónde viene.' });
      const responsible = clean(b.responsible, 40);
      if (!responsible) return reply(422, { ok: false, error: 'Falta el responsable.' });
      const category = CATS[type].indexOf(b.category) > -1 ? b.category : 'Otros';
      const method = METHODS.indexOf(b.method) > -1 ? b.method : 'efectivo';
      const today = Pricing.boliviaDate(new Date()).key;
      const day = isDay(b.day) && b.day <= today ? b.day : today;
      const rec = await Store.ledgerAdd(event, day, { type, amount, concept, category, responsible, method, createdAt: new Date().toISOString() });
      return reply(200, { ok: true, entry: rec });
    }
    return reply(405, { ok: false, error: 'Método no permitido.' });
  } catch (e) {
    console.error('zona0-ledger:', e && e.message);
    return reply(500, { ok: false, error: 'No pudimos leer el libro diario.' });
  }
};
