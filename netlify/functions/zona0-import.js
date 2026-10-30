// Importa el historial del sistema anterior (solo con la clave del personal). Los datos viajan en el cuerpo del pedido,
// nunca viven en el repositorio. Se puede repetir sin duplicar: lo que ya existe se salta.
//   POST /api/zona0/import { orders:[...], ledger:[...] }   máximo 60 pedidos y 300 gastos por llamada
const Store = require('./lib-zona0/store.js');
const { authorized, reply } = require('./lib-zona0/auth.js');

const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
const txt = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n);
const num = (v) => Math.round(Number(v) * 100) / 100;
const METHODS = ['efectivo', 'qr', 'tarjeta', 'transferencia'];

function cleanOrder(o) {
  if (!o || !/^\d{4}-\d{2}-\d{2}\/h\d{1,6}[a-z]?$/.test(o.key || '') || !Array.isArray(o.lines) || !o.lines.length) return null;
  const total = num(o.total);
  if (!(total >= 0) || total > 100000) return null;
  const lines = o.lines.slice(0, 60).map((l) => ({ name: txt(l.name, 80), qty: Math.max(1, Math.min(99, parseInt(l.qty, 10) || 1)), unitPrice: num(l.unitPrice) || 0, total: num(l.total) || 0, choices: [], note: '', done: [] }));
  const parts = (o.payment && Array.isArray(o.payment.parts) ? o.payment.parts : []).slice(0, 4)
    .map((p) => ({ method: METHODS.indexOf(p.method) > -1 ? p.method : 'efectivo', amount: num(p.amount) || 0 }));
  const c = o.customer || {};
  const day = o.key.slice(0, 10), at = isDay(day) ? day + 'T16:00:00.000Z' : new Date().toISOString();
  const rec = {
    key: o.key, orderId: txt(o.orderId, 24), number: parseInt(o.number, 10) || 0, createdAt: at, updatedAt: at, status: 'entregado', source: 'historial',
    mode: o.mode === 'mesa' ? 'mesa' : 'recojo',
    customer: { name: txt(c.name, 50), phone: '', mode: o.mode === 'mesa' ? 'mesa' : 'recojo', mesa: txt(c.mesa, 8), address: '', zone: '', zoneName: '', notes: '' },
    lines, subtotal: num(o.subtotal) || 0, deliveryFee: 0, total, count: lines.reduce((s, l) => s + l.qty, 0), currency: 'Bs',
    mozo: txt(o.mozo, 30), payment: { method: parts.length ? parts.slice().sort((a, b) => b.amount - a.amount)[0].method : 'efectivo', status: 'pagado', updatedAt: at, parts },
    legacy: { ticket: parseInt(o.number, 10) || 0 }
  };
  if (o.discount > 0) rec.discount = num(o.discount);
  if (o.extra > 0) rec.extra = num(o.extra);
  return rec;
}
function cleanEntry(e) {
  if (!e || !/^led\/\d{4}-\d{2}-\d{2}\/h\d{3,5}$/.test(e.id || '') || !(Number(e.amount) > 0)) return null;
  const day = e.id.slice(4, 14);
  return { id: e.id, day, type: e.type === 'ingreso' ? 'ingreso' : 'egreso', amount: num(e.amount), concept: txt(e.concept, 80), category: txt(e.category, 30) || 'Otros',
    responsible: txt(e.responsible, 40) || 'Sin dato', method: 'efectivo', createdAt: day + 'T16:00:00.000Z', imported: true };
}

exports.handler = async function (event) {
  if (!process.env.ZONA0_ADMIN_TOKEN) return reply(503, { ok: false, error: 'Falta configurar ZONA0_ADMIN_TOKEN en Netlify.' });
  if (!authorized(event)) return reply(401, { ok: false, error: 'Clave incorrecta.' });
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Método no permitido.' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Archivo ilegible.' }); }
  try {
    const orders = (Array.isArray(b.orders) ? b.orders.slice(0, 60) : []).map(cleanOrder).filter(Boolean);
    const ledger = (Array.isArray(b.ledger) ? b.ledger.slice(0, 300) : []).map(cleanEntry).filter(Boolean);
    const a = await Store.importRecords(event, orders), l = await Store.importRecords(event, ledger);
    return reply(200, { ok: true, orders: a, ledger: l, rejected: (Array.isArray(b.orders) ? b.orders.length : 0) - orders.length + (Array.isArray(b.ledger) ? b.ledger.length : 0) - ledger.length });
  } catch (e) {
    console.error('zona0-import:', e && e.message);
    return reply(500, { ok: false, error: 'No se pudo importar.' });
  }
};
