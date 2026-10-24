// Pedidos de Magma Wings: POST /api/magma/order
// Recalcula el pedido con los precios del menú (nunca confía en el total que
// manda el navegador), genera el número de pedido y devuelve el mensaje listo
// para WhatsApp. Si existe la variable ORDER_WEBHOOK_URL en Netlify, también
// reenvía el pedido ahí (Make, Zapier, un bot de Telegram, etc.).
const menu = require('../../menu/magma/menu.json');
const Pricing = require('../../menu/magma/js/pricing.js');
const Store = require('./lib-magma/store.js');
const Meta = require('./lib-magma/meta.js');
const Notify = require('./lib-magma/notify.js');

const FB_RE = /^fb\.\d\.\d+\.[\w-]{1,100}$/;

const MAX_BODY = 20000;

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Método no permitido.' });
  if ((event.body || '').length > MAX_BODY) return reply(413, { ok: false, error: 'El pedido es demasiado grande.' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return reply(400, { ok: false, error: 'No pudimos leer el pedido.' });
  }

  const check = Pricing.validateOrder(menu, payload);
  if (!check.ok) return reply(422, { ok: false, error: check.error, field: check.field || null });

  const h = event.headers || {};
  const now = new Date();
  const createdAt = now.toISOString();
  const day = Pricing.boliviaDate(now);
  const meta = {
    ip: String(h['x-nf-client-connection-ip'] || String(h['x-forwarded-for'] || '').split(',')[0] || '').trim().slice(0, 64),
    ua: String(h['user-agent'] || '').slice(0, 300),
    fbp: FB_RE.test(String((payload.meta || {}).fbp || '')) ? payload.meta.fbp : '',
    fbc: FB_RE.test(String((payload.meta || {}).fbc || '')) ? payload.meta.fbc : ''
  };

  // El número del día (#01, #02...) se reserva al guardar. Si no se puede guardar, queda un número por hora (#T1432-24OCT).
  const make = (o, n, key) => ({
    key, orderId: o.orderId, number: n, createdAt, status: 'nuevo', mode: o.customer.mode, customer: o.customer,
    subtotal: o.subtotal, deliveryFee: o.deliveryFee, payment: { method: o.customer.payMethod || 'cash', status: 'pendiente' }, total: o.total, count: o.count, currency: menu.brand.currency,
    lines: o.lines.map((l) => ({ name: l.name, portion: l.portionLabel, qty: l.qty, unitPrice: l.unitPrice, total: l.total, choices: l.choices, note: l.note })),
    message: o.message, context: process.env.CONTEXT || 'dev', meta
  });
  const save = await Store.saveNumbered(event, day.key, (n, key) =>
    make(Pricing.validateOrder(menu, payload, { orderId: Pricing.orderNumber(n, now) }).order, n, key));
  const record = save.ok ? save.rec : make(check.order, 0, 'sin-guardar/' + createdAt);
  const order = { orderId: record.orderId, customer: record.customer, total: record.total, count: record.count, lines: record.lines, message: record.message, whatsappUrl: Pricing.whatsappUrl(menu, record.message) };
  const sourceUrl = 'https://' + (h.host || 'estudiographica.com') + '/menu/magma/';
  const capi = await Meta.sendEvent('Lead', record, sourceUrl);
  const notified = save.ok ? await Notify.newOrder(record) : { skipped: 'sin guardar' };
  const hook = process.env.ORDER_WEBHOOK_URL;
  if (hook) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
      await fetch(hook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.orderId,
          customer: order.customer,
          total: order.total,
          currency: menu.brand.currency,
          lines: record.lines,
          message: order.message,
          createdAt
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
    } catch (e) {
      // Si el aviso interno falla, el cliente igual puede pedir por WhatsApp.
      console.error('magma-order webhook:', e && e.message);
    }
  }

  return reply(200, {
    ok: true,
    orderId: order.orderId,
    total: order.total,
    count: order.count,
    message: order.message,
    whatsappUrl: order.whatsappUrl,
    saved: save.ok,
    number: record.number || null,
    // En previews y pruebas se devuelve el motivo para poder diagnosticar; en producción no.
    saveError: save.ok || process.env.CONTEXT === 'production' ? undefined : save.error,
    capi: process.env.CONTEXT === 'production' ? undefined : capi.status,
    notify: process.env.CONTEXT === 'production' ? undefined : notified
  });
};
