// Almacén de pedidos de Magma Wings en Netlify Blobs.
// Los pedidos reales (contexto "production") van a "magma-orders". Cualquier otro deploy
// (previews, ramas, pruebas) escribe en "magma-orders-test", porque un store de sitio se
// comparte entre todos los deploys y una prueba no debe mezclarse con pedidos reales.
const STATUSES = ['nuevo', 'preparando', 'listo', 'entregado', 'cancelado'];

// Netlify no entrega la variable CONTEXT dentro de las funciones, así que producción se reconoce por el dominio
// con el que llegó la visita. Se puede cambiar con MAGMA_PROD_HOSTS (dominios separados por coma).
// Las funciones programadas no traen dominio: llaman a forceProd() (solo corren en la versión publicada).
let forced = false;
function forceProd() { forced = true; }
function isProd(event) {
  if (forced || process.env.CONTEXT === 'production') return true;
  const h = (event && event.headers) || {};
  const host = String(h['x-forwarded-host'] || h.host || '').toLowerCase().split(',')[0].trim().replace(/:\d+$/, '');
  const hosts = (process.env.MAGMA_PROD_HOSTS || 'estudiographica.com,www.estudiographica.com,estudiographica.netlify.app').split(',').map((x) => x.trim().toLowerCase());
  return hosts.indexOf(host) > -1;
}
function storeName(event) {
  return isProd(event) ? 'magma-orders' : 'magma-orders-test';
}

function open(event) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  if (event) connectLambda(event);
  return getStore({ name: storeName(event) });
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

// Registro de cambios. Cada pedido nuevo o modificado deja una marca diminuta "ev/<hora>/<ms>-<azar>".
// El panel pregunta solo por las marcas recientes y lee únicamente los pedidos que cambiaron, en vez de
// releer todos en cada consulta. Cada marca es una clave nueva, así que nunca hay choques entre escrituras.
function hourKey(ms) { return new Date(ms).toISOString().slice(0, 13); }
async function touch(event, key) {
  try {
    const now = Date.now();
    await open(event).setJSON('ev/' + hourKey(now) + '/' + now + '-' + Math.random().toString(36).slice(2, 6), { k: key });
  } catch (e) { console.error('magma touch:', e && e.message); }
}

// Pedidos cambiados desde "since" (ms). Devuelve { now, orders }.
async function changedSince(event, since) {
  const store = open(event);
  const now = Date.now();
  const floor = Math.max(since, now - 36 * 3600 * 1000);
  const hours = [];
  for (let t = Math.floor(floor / 3600000) * 3600000; t <= now; t += 3600000) hours.push(hourKey(t));
  const lists = await Promise.all(hours.map((h) => store.list({ prefix: 'ev/' + h + '/' }).then((r) => r.blobs).catch(() => [])));
  const keys = [];
  lists.forEach((bl) => bl.forEach((b) => { const ms = Number(b.key.split('/')[2].split('-')[0]); if (ms >= floor) keys.push(b.key); }));
  const targets = new Set();
  const evs = await Promise.all(keys.slice(-300).map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  evs.forEach((e) => { if (e && e.k) targets.add(e.k); });
  const rows = await Promise.all(Array.from(targets).slice(0, 200).map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return { now, orders: rows.filter(Boolean) };
}

// Pedidos de los últimos "days" días (hora de Bolivia). Una lectura por pedido, solo al abrir el panel.
async function listDays(event, dayKeys) {
  const store = open(event);
  const lists = await Promise.all(dayKeys.map((d) => store.list({ prefix: d + '/' }).then((r) => r.blobs).catch(() => [])));
  const keys = [].concat.apply([], lists.map((bl) => bl.map((b) => b.key))).slice(-600);
  const rows = await Promise.all(keys.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return rows.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
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
  await touch(event, key);
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
  return getStore({ name: isProd(event) ? 'magma-proofs' : 'magma-proofs-test' });
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
  await touch(event, key);
  return rec;
}

module.exports = { isProd, forceProd, touch, changedSince, listDays, saveProof, getProof, setPayment, getOrder, listSince, saveRecord, STATUSES, storeName, keyFor, saveNumbered, listOrders, setStatus };
