// Almacén de pedidos de Zona 0 en Netlify Blobs.
// Los pedidos reales (dominio de producción) van a "zona0-orders". Cualquier otro deploy (previews, ramas)
// escribe en "zona0-orders-test", porque un store de sitio se comparte entre todos los deploys.
const STATUSES = ['nuevo', 'preparando', 'listo', 'entregado', 'cancelado'];

function isProd(event) {
  if (process.env.CONTEXT === 'production') return true;
  const h = (event && event.headers) || {};
  const host = String(h['x-forwarded-host'] || h.host || '').toLowerCase().split(',')[0].trim().replace(/:\d+$/, '');
  const hosts = (process.env.ZONA0_PROD_HOSTS || 'estudiographica.com,www.estudiographica.com,estudiographica.netlify.app').split(',').map((x) => x.trim().toLowerCase());
  return hosts.indexOf(host) > -1;
}
function storeName(event) { return isProd(event) ? 'zona0-orders' : 'zona0-orders-test'; }

function open(event) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  if (event) connectLambda(event);
  return getStore({ name: storeName(event) });
}

function keyFor(dateKey, n) { return dateKey + '/' + String(n).padStart(3, '0'); }

// Reserva el número del día con "onlyIfNew": dos pedidos simultáneos nunca se quedan con el mismo número.
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
    console.error('zona0 store save:', e && e.message);
    return { ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

// Registro de cambios: cada pedido nuevo o modificado deja una marca diminuta "ev/<hora>/<ms>-<azar>".
// El panel pregunta solo por las marcas recientes y lee únicamente los pedidos que cambiaron.
function hourKey(ms) { return new Date(ms).toISOString().slice(0, 13); }
async function touch(event, key) {
  try {
    const now = Date.now();
    await open(event).setJSON('ev/' + hourKey(now) + '/' + now + '-' + Math.random().toString(36).slice(2, 6), { k: key });
  } catch (e) { console.error('zona0 touch:', e && e.message); }
}

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

async function listDays(event, dayKeys, cap) {
  const store = open(event);
  const lists = await Promise.all(dayKeys.map((d) => store.list({ prefix: d + '/' }).then((r) => r.blobs).catch(() => [])));
  const keys = [].concat.apply([], lists.map((bl) => bl.map((b) => b.key))).slice(-(cap || 600));
  const rows = await Promise.all(keys.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return rows.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getOrder(event, key) {
  return open(event).get(key, { type: 'json' }).catch(() => null);
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

async function setPayment(event, key, status, method) {
  const store = open(event);
  const rec = await store.get(key, { type: 'json' });
  if (!rec) return null;
  rec.payment = Object.assign({}, rec.payment, { status }, method ? { method } : {}, { updatedAt: new Date().toISOString() });
  rec.updatedAt = rec.payment.updatedAt;
  await store.setJSON(key, rec);
  await touch(event, key);
  return rec;
}

// Cocina marca una estación (comida o bebida) de una línea como lista o la desmarca.
// Cuando todas las estaciones de todas las líneas están listas, el pedido pasa solo a "listo".
function lineKinds(l) { return Array.isArray(l.kinds) && l.kinds.length ? l.kinds : ['comida']; }
function lineDone(l) { const d = Array.isArray(l.done) ? l.done : []; return lineKinds(l).filter((k) => k === 'comida' || k === 'bebida').every((k) => d.indexOf(k) > -1); }
async function setLineDone(event, key, idx, station, done) {
  const store = open(event);
  const rec = await store.get(key, { type: 'json' });
  if (!rec || !Array.isArray(rec.lines) || !rec.lines[idx]) return null;
  const l = rec.lines[idx];
  if (lineKinds(l).indexOf(station) === -1) return null;
  const d = new Set(Array.isArray(l.done) ? l.done : []);
  if (done) d.add(station); else d.delete(station);
  l.done = Array.from(d);
  if (rec.status === 'preparando' || rec.status === 'listo') {
    rec.status = rec.lines.every(lineDone) ? 'listo' : 'preparando';
  }
  rec.updatedAt = new Date().toISOString();
  await store.setJSON(key, rec);
  await touch(event, key);
  return rec;
}

// Cobra un pedido y lo da por entregado (se usa al cerrar una mesa).
async function settle(event, key, method) {
  const store = open(event);
  const rec = await store.get(key, { type: 'json' });
  if (!rec || rec.status === 'cancelado') return rec || null;
  const now = new Date().toISOString();
  rec.payment = Object.assign({}, rec.payment, { status: 'pagado', method, updatedAt: now });
  rec.status = 'entregado';
  rec.updatedAt = now;
  await store.setJSON(key, rec);
  await touch(event, key);
  return rec;
}

// Cobra varios pedidos con una cuenta dividida: cada parte lleva su monto y su medio. Los montos deben sumar el total.
// Las partes se reparten en orden sobre los pedidos, y cada pedido guarda las suyas.
async function settleParts(event, keys, parts) {
  const store = open(event);
  const recs = [];
  for (const k of keys) { const r = await store.get(k, { type: 'json' }); if (r && r.status !== 'cancelado') recs.push([k, r]); }
  const total = Math.round(recs.reduce((s, x) => s + x[1].total, 0) * 100);
  const sum = Math.round(parts.reduce((s, p) => s + p.amount, 0) * 100);
  if (!recs.length || total !== sum) return { error: 'Los montos no suman el total de la cuenta.' };
  const left = parts.map((p) => ({ method: p.method, c: Math.round(p.amount * 100) }));
  const now = new Date().toISOString(), out = [];
  let i = 0;
  for (const [k, rec] of recs) {
    let need = Math.round(rec.total * 100);
    const mine = {};
    while (need > 0 && i < left.length) {
      const take = Math.min(need, left[i].c);
      mine[left[i].method] = (mine[left[i].method] || 0) + take;
      left[i].c -= take; need -= take;
      if (left[i].c === 0) i++;
    }
    const arr = Object.keys(mine).map((m) => ({ method: m, amount: mine[m] / 100 }));
    const main = arr.slice().sort((a, b) => b.amount - a.amount)[0];
    rec.payment = Object.assign({}, rec.payment, { status: 'pagado', method: main ? main.method : 'efectivo', parts: arr, split: parts.length, updatedAt: now });
    rec.status = 'entregado'; rec.updatedAt = now;
    await store.setJSON(k, rec); await touch(event, k);
    out.push(rec);
  }
  return { orders: out };
}

// Libro diario: una clave por movimiento, "led/<fecha>/<ms>-<azar>". Los movimientos anulados se conservan marcados.
async function ledgerAdd(event, day, entry) {
  const id = 'led/' + day + '/' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  const rec = Object.assign({ id, day }, entry);
  await open(event).setJSON(id, rec);
  return rec;
}
async function ledgerRange(event, dayKeys) {
  const store = open(event);
  const lists = await Promise.all(dayKeys.map((d) => store.list({ prefix: 'led/' + d + '/' }).then((r) => r.blobs).catch(() => [])));
  const keys = [].concat.apply([], lists.map((bl) => bl.map((b) => b.key))).slice(-1500);
  const rows = await Promise.all(keys.map((k) => store.get(k, { type: 'json' }).catch(() => null)));
  return rows.filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
async function ledgerVoid(event, id, by, reason) {
  if (!/^led\/\d{4}-\d{2}-\d{2}\/[\w-]+$/.test(id)) return null;
  const store = open(event);
  const rec = await store.get(id, { type: 'json' });
  if (!rec) return null;
  rec.voided = true; rec.voidedAt = new Date().toISOString(); rec.voidReason = String(reason || '').slice(0, 80); rec.voidedBy = String(by || '').slice(0, 40);
  await store.setJSON(id, rec);
  return rec;
}

// Importación de historial (sistema anterior). Es idempotente: una clave que ya existe no se pisa.
async function importRecords(event, recs) {
  const store = open(event);
  let added = 0, skipped = 0;
  for (const rec of recs) {
    const r = await store.setJSON(rec.key || rec.id, rec, { onlyIfNew: true });
    if (r && r.modified === false) skipped++; else added++;
  }
  return { added, skipped };
}

// Productos nuevos o temporales y productos agotados: un solo documento "cfg/menu".
async function getMenuExtra(event) {
  try { const c = await open(event).get('cfg/menu', { type: 'json' }); return c && typeof c === 'object' ? { custom: c.custom || [], off: c.off || [] } : { custom: [], off: [] }; }
  catch (e) { return { custom: [], off: [] }; }
}
async function setMenuExtra(event, extra) {
  await open(event).setJSON('cfg/menu', { custom: extra.custom, off: extra.off, at: new Date().toISOString() });
  return extra;
}

// Interruptor "recibiendo pedidos". Por defecto abierto.
async function isOpen(event) {
  try {
    const c = await open(event).get('cfg/open', { type: 'json' });
    return !c || c.open !== false;
  } catch (e) { return true; }
}
async function setOpen(event, open_) {
  await open(event).setJSON('cfg/open', { open: !!open_, at: new Date().toISOString() });
  return !!open_;
}

module.exports = { isProd, storeName, STATUSES, keyFor, saveNumbered, touch, changedSince, listDays, getOrder, setStatus, setPayment, isOpen, setOpen, setLineDone, settle, lineKinds, lineDone, ledgerAdd, ledgerRange, ledgerVoid, importRecords, settleParts, getMenuExtra, setMenuExtra };
