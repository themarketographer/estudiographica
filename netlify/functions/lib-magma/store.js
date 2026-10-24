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
  return getStore({ name: storeName(), consistency: 'strong' });
}

// La clave empieza con la fecha ISO para que el orden alfabético sea el cronológico.
function keyFor(createdAt, orderId) {
  return createdAt.replace(/[:.]/g, '-') + '_' + orderId;
}

async function saveOrder(event, record) {
  try {
    await open(event).setJSON(record.key, record);
    return true;
  } catch (e) {
    console.error('magma store save:', e && e.message);
    return false;
  }
}

async function listOrders(event, limit) {
  const store = open(event);
  const { blobs } = await store.list();
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit || 100);
  const rows = await Promise.all(keys.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return rows.filter(Boolean);
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

module.exports = { STATUSES, storeName, keyFor, saveOrder, listOrders, setStatus };
