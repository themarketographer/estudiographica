// API de Conversiones de Meta para Magma Wings (envío desde el servidor).
// Usa el píxel y el token PROPIOS del negocio, no los de Estudio Graphica:
//   MAGMA_META_PIXEL_ID, MAGMA_META_ACCESS_TOKEN  y, para probar, MAGMA_META_TEST_CODE.
// Sin esas variables no envía nada y el pedido sigue normal.
// Los datos personales (correo, celular, nombre, apellido) viajan en hash SHA-256 y SOLO si el
// cliente aceptó el uso de sus datos. Sin aceptación se envía el evento sin datos personales.
const crypto = require('crypto');

const sha = (v) => crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

function userData(rec) {
  const c = rec.customer || {};
  const m = rec.meta || {};
  const u = { country: [sha('bo')] };
  if (c.consent) {
    if (c.email) u.em = [sha(c.email)];
    if (c.phone) u.ph = [sha(c.phone)];
    if (c.firstName) u.fn = [sha(c.firstName)];
    if (c.lastName) u.ln = [sha(c.lastName)];
    u.external_id = [sha(c.phone || c.email || rec.orderId)];
  }
  if (m.ip) u.client_ip_address = m.ip;
  if (m.ua) u.client_user_agent = m.ua;
  if (m.fbp) u.fbp = m.fbp;
  if (m.fbc) u.fbc = m.fbc;
  return u;
}

async function sendEvent(eventName, rec, sourceUrl) {
  const pixel = process.env.MAGMA_META_PIXEL_ID;
  const token = process.env.MAGMA_META_ACCESS_TOKEN;
  if (!pixel || !token) return { status: 'skipped' };
  const body = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: rec.orderId,
      event_source_url: sourceUrl,
      action_source: 'website',
      user_data: userData(rec),
      custom_data: {
        currency: 'BOB',
        value: rec.total,
        order_id: rec.orderId,
        content_type: 'product',
        num_items: rec.count,
        contents: (rec.lines || []).map((l) => ({ id: l.name + ' ' + l.portion, quantity: l.qty, item_price: l.unitPrice }))
      }
    }]
  };
  if (process.env.MAGMA_META_TEST_CODE) body.test_event_code = process.env.MAGMA_META_TEST_CODE;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch('https://graph.facebook.com/v21.0/' + encodeURIComponent(pixel) + '/events?access_token=' + encodeURIComponent(token), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal
    });
    clearTimeout(t);
    if (!res.ok) {
      const txt = (await res.text()).slice(0, 200);
      console.error('magma meta', eventName, res.status, txt);
      return { status: 'error', detail: res.status + ' ' + txt };
    }
    return { status: 'sent' };
  } catch (e) {
    console.error('magma meta', eventName, e && e.message);
    return { status: 'error', detail: String((e && e.message) || e).slice(0, 120) };
  }
}

module.exports = { sendEvent, userData, sha };
