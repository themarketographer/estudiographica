// Pedidos de Magma Wings: POST /api/magma/order
// Recalcula el pedido con los precios del menú (nunca confía en el total que
// manda el navegador), genera el número de pedido y devuelve el mensaje listo
// para WhatsApp. Si existe la variable ORDER_WEBHOOK_URL en Netlify, también
// reenvía el pedido ahí (Make, Zapier, un bot de Telegram, etc.).
const menu = require('../../menu/magma/menu.json');
const Pricing = require('../../menu/magma/js/pricing.js');
const Store = require('./lib-magma/store.js');

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

  const result = Pricing.validateOrder(menu, payload);
  if (!result.ok) return reply(422, { ok: false, error: result.error, field: result.field || null });

  const order = result.order;
  const createdAt = new Date().toISOString();
  const record = {
    key: Store.keyFor(createdAt, order.orderId),
    orderId: order.orderId,
    createdAt,
    status: 'nuevo',
    mode: order.customer.mode,
    customer: order.customer,
    total: order.total,
    count: order.count,
    currency: menu.brand.currency,
    lines: order.lines.map((l) => ({ name: l.name, portion: l.portionLabel, qty: l.qty, unitPrice: l.unitPrice, total: l.total, choices: l.choices, note: l.note })),
    message: order.message,
    context: process.env.CONTEXT || 'dev'
  };
  // Si no se puede guardar, el cliente igual puede pedir por WhatsApp.
  const save = await Store.saveOrder(event, record);
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
          lines: order.lines,
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
    // En previews y pruebas se devuelve el motivo para poder diagnosticar; en producción no.
    saveError: save.ok || process.env.CONTEXT === 'production' ? undefined : save.error
  });
};
