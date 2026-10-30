// Productos nuevos o temporales de Zona 0 y marca de "agotado".
//   GET  /api/zona0/menu                          público: { extra:{ custom:[...], off:[ids] }, today }
//   POST (clave del personal) { add:{ title, sub?, category, price, until? } }   agrega un producto
//        { update:id, patch:{ title?, sub?, price?, until? } }                  edita un producto agregado
//        { remove:id }                                                         quita un producto agregado
//        { off:id, value:true|false }                                          marca cualquier producto como agotado o disponible
const Store = require('./lib-zona0/store.js');
const Pricing = require('../../menu/zona-0/js/pricing.js');
const base = require('../../menu/zona-0/menu.json');
const { authorized, reply } = require('./lib-zona0/auth.js');

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d + 'T12:00:00Z'));
const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'prod';

exports.handler = async function (event) {
  const today = Pricing.boliviaDate(new Date()).key;
  try {
    if (event.httpMethod === 'GET') {
      const extra = await Store.getMenuExtra(event);
      return reply(200, { ok: true, extra, today });
    }
    if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Método no permitido.' });
    if (!process.env.ZONA0_ADMIN_TOKEN) return reply(503, { ok: false, error: 'Falta configurar ZONA0_ADMIN_TOKEN en Netlify.' });
    if (!authorized(event)) return reply(401, { ok: false, error: 'Clave incorrecta.' });
    let b;
    try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'Dato ilegible.' }); }
    const extra = await Store.getMenuExtra(event);
    const cats = (base.categories || []).map((c) => c.id);

    if (b.add) {
      const title = clean(b.add.title, 60);
      if (title.length < 2) return reply(422, { ok: false, error: 'Escribe el nombre del producto.' });
      if (cats.indexOf(b.add.category) === -1) return reply(422, { ok: false, error: 'Elige una categoría.' });
      const price = Math.round(Number(b.add.price) * 100) / 100;
      if (!(price > 0) || price > 2000) return reply(422, { ok: false, error: 'Revisa el precio.' });
      const until = isDay(b.add.until) ? b.add.until : '';
      if (until && until < today) return reply(422, { ok: false, error: 'La fecha final ya pasó.' });
      if (extra.custom.length >= 80) return reply(422, { ok: false, error: 'Ya hay demasiados productos agregados. Quita algunos.' });
      const id = 'x-' + slug(title) + '-' + Math.random().toString(36).slice(2, 6);
      extra.custom.push({ id, title, sub: clean(b.add.sub, 90), category: b.add.category, price, until, createdAt: new Date().toISOString() });
    } else if (typeof b.update === 'string') {
      const c = extra.custom.find((x) => x.id === b.update);
      if (!c) return reply(404, { ok: false, error: 'No existe ese producto.' });
      const p = b.patch || {};
      if (p.title != null) { const t = clean(p.title, 60); if (t.length < 2) return reply(422, { ok: false, error: 'Escribe el nombre.' }); c.title = t; }
      if (p.sub != null) c.sub = clean(p.sub, 90);
      if (p.price != null) { const pr = Math.round(Number(p.price) * 100) / 100; if (!(pr > 0) || pr > 2000) return reply(422, { ok: false, error: 'Revisa el precio.' }); c.price = pr; }
      if (p.until != null) c.until = isDay(p.until) ? p.until : '';
    } else if (typeof b.remove === 'string') {
      extra.custom = extra.custom.filter((x) => x.id !== b.remove);
      extra.off = extra.off.filter((x) => x !== b.remove);
    } else if (typeof b.off === 'string') {
      const known = base.products.some((p) => p.id === b.off) || extra.custom.some((x) => x.id === b.off);
      if (!known) return reply(404, { ok: false, error: 'No existe ese producto.' });
      extra.off = extra.off.filter((x) => x !== b.off);
      if (b.value !== false) extra.off.push(b.off);
    } else return reply(422, { ok: false, error: 'Falta indicar qué hacer.' });

    await Store.setMenuExtra(event, extra);
    return reply(200, { ok: true, extra, today });
  } catch (e) {
    console.error('zona0-menu:', e && e.message);
    return reply(500, { ok: false, error: 'No pudimos guardar el menú.' });
  }
};
