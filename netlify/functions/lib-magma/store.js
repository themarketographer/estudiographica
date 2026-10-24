// Almacén de pedidos de Magma Wings en Netlify Blobs.
// Los pedidos reales (contexto "production") van a "magma-orders". Cualquier otro deploy
// (previews, ramas, pruebas) escribe en "magma-orders-test", porque un store de sitio se
// comparte entre todos los deploys y una prueba no debe mezclarse con pedidos reales.
const STATUSES = ['nuevo', 'preparando', 'listo', 'entregado', 'cancelado'];

function storeName() {
  return process.env.CONTEXT === 'production' ? 'magma-orders' : 'magma-orders-test';
}

function open(event) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  if (event) connectLambda(event);
  return getStore({ name: storeName() });
}

// Cada pedido tiene una clave por fecha y número del día: "2026-10-24/007". El número visible es #07-24OCT.
// "onlyIfNew" hace que dos pedidos simultáneos nunca se queden con el mismo número.
function keyFor(dateKey, n) { return dateKey + '/' + String(n).padStart(3, '0'); }

async function saveNumbered(event, dateKey, build) {
  try {
    const store = open(event);
    const { blobs } = await store.list({ prefix: dateKey + '/' });
    let n = blobs.length + 1;
    for (let i = 0; i < 12; i++, n++) {
      const rec = build(n, keyFor(dateKey, n));
      const r = await store.setJSON(rec.key, rec, { onlyIfNew: true });
      if (!r || r.modified !== false) return { ok: true, rec };
    }
    return { ok: false, error: 'No se pudo asignar número de pedido.' };
  } catch (e) {
    console.error('magma store save:', e && e.message);
    return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

async function listOrders(event, limit) {
  const store = open(event);
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit || 100);
  const rows = await Promise.all(keys.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return rows.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function setStatus(event, key, status) {
  const store = open(event);
  const rec = await store.get(key, { type: 'json' });
  if (!rec) return null;
  rec.status = status;
  rec.updatedAt = new Date().toISOString();
  await store.setJSON(key, rec);
  return rec;
}

async function saveRecord(event, rec) {
  await open(event).setJSON(rec.key, rec);
}

async function getOrder(event, key) {
  return open(event).get(key, { type: 'json' }).catch(() => null);
}

// Pedidos creados desde una fecha (clave "YYYY-MM-DD"), para el respaldo semanal.
async function listSince(event, sinceKey) {
  const store = open(event);
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).filter((k) => k.slice(0, 10) >= sinceKey).sort();
  const rows = await Promise.all(keys.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return rows.filter(Boolean);
}

// Comprobantes de pago: un almacén aparte para no cargar imágenes al leer la lista de pedidos.
function openProofs(event) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  if (event) connectLambda(event);
  return getStore({ name: storeName() === 'magma-orders' ? 'magma-proofs' : 'magma-proofs-test' });
}
async function saveProof(event, key, proof) {
  await openProofs(event).setJSON(key, proof);
}
async function getProof(event, key) {
  return openProofs(event).get(key, { type: 'json' }).catch(() => null);
}
async function setPayment(event, key, status, extra) {
  const store = open(event);
  const rec = await store.get(key, { type: 'json' });
  if (!rec) return null;
  rec.payment = Object.assign({ method: 'cash' }, rec.payment, extra || {}, { status, updatedAt: new Date().toISOString() });
  await store.setJSON(key, rec);
  return rec;
}

module.exports = { saveProof, getProof, setPayment, getOrder, listSince, saveRecord, STATUSES, storeName, keyFor, saveNumbered, listOrders, setStatus };
