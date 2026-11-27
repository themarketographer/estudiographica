// Firma desde el celular. El contrato en el computador crea una sesion (POST crear), muestra un QR con el
// token, el celular envia los trazos (POST enviar) y el computador los recoge (GET leer=1) una sola vez.
// Los trazos se guardan unos minutos y se borran al leerlos. Nada de esto toca el PDF ni el correo.
const crypto = require('crypto');
const VIDA_MS = 15 * 60 * 1000;
function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
function trazosValidos(t) {
  if (!Array.isArray(t) || t.length < 1 || t.length > 80) return null;
  let puntos = 0;
  const limpio = [];
  for (const tr of t) {
    if (!Array.isArray(tr) || tr.length < 1) return null;
    const s = [];
    for (const p of tr) {
      if (!p || typeof p.x !== 'number' || typeof p.y !== 'number') return null;
      s.push({ x: Math.max(0, Math.min(1, +p.x.toFixed(4))), y: Math.max(0, Math.min(1, +p.y.toFixed(4))) });
      if (++puntos > 6000) return null;
    }
    limpio.push(s);
  }
  return limpio;
}
exports.handler = async (event) => {
  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore({ name: 'firma-remota' });
    if (event.httpMethod === 'POST') {
      let b = {};
      try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, {}); }
      if (b.accion === 'crear') {
        const ratio = Math.max(1.2, Math.min(5, Number(b.ratio) || 2.6));
        const t = crypto.randomBytes(16).toString('hex');
        await store.setJSON(t, { estado: 'esperando', ratio, creado: Date.now() });
        return reply(200, { t });
      }
      if (b.accion === 'enviar') {
        const t = String(b.t || '');
        if (!/^[a-f0-9]{32}$/.test(t)) return reply(400, {});
        const s = await store.get(t, { type: 'json' });
        if (!s || Date.now() - s.creado > VIDA_MS) return reply(410, { error: 'vencido' });
        if (s.estado !== 'esperando') return reply(409, { error: 'usado' });
        const trazos = trazosValidos(b.trazos);
        if (!trazos) return reply(400, { error: 'firma' });
        await store.setJSON(t, { estado: 'lista', ratio: s.ratio, creado: s.creado, trazos });
        return reply(200, { ok: true });
      }
      return reply(400, {});
    }
    const q = event.queryStringParameters || {};
    const t = String(q.t || '');
    if (!/^[a-f0-9]{32}$/.test(t)) return reply(400, {});
    const s = await store.get(t, { type: 'json' });
    if (!s || Date.now() - s.creado > VIDA_MS) return reply(200, { estado: 'vencido' });
    if (q.leer === '1' && s.estado === 'lista') {
      await store.delete(t);
      return reply(200, { estado: 'lista', trazos: s.trazos });
    }
    return reply(200, { estado: s.estado, ratio: s.ratio });
  } catch (e) {
    return reply(500, { error: 'servidor' });
  }
};
