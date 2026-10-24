// Aviso de pedido nuevo al celular de quien atiende, por Telegram.
// Variables en Netlify (las dos): MAGMA_TELEGRAM_BOT_TOKEN y MAGMA_TELEGRAM_CHAT_ID.
// Sin ellas no pasa nada. En previews y pruebas no se envía, salvo que exista MAGMA_NOTIFY_TEST=1.
const money = (n) => n + ' Bs';

function texto(r) {
  const c = r.customer || {};
  const out = [];
  out.push('Pedido nuevo ' + r.orderId + ' · ' + money(r.total));
  out.push((c.name || 'Sin nombre') + ' · +' + (c.phone || ''));
  out.push(r.mode === 'delivery' ? 'Entrega: ' + (c.zoneName ? c.zoneName + '. ' : '') + (c.address || '') : 'Recojo en el local');
  out.push('');
  (r.lines || []).forEach((l) => {
    out.push(l.qty + ' x ' + l.name + ' ' + l.portion);
    (l.choices || []).forEach((ch) => out.push('   ' + ch.label + ': ' + ch.options.map((o) => o.name).join(', ')));
    if (l.note) out.push('   Nota: ' + l.note);
  });
  if (c.notes) { out.push(''); out.push('Notas: ' + c.notes); }
  return out.join('\n');
}

async function post(texto, prod) {
  const token = process.env.MAGMA_TELEGRAM_BOT_TOKEN;
  const chat = process.env.MAGMA_TELEGRAM_CHAT_ID;
  if (!token || !chat) return { skipped: 'sin configurar' };
  if (!prod && !process.env.MAGMA_NOTIFY_TEST) return { skipped: 'no es producción' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto, disable_web_page_preview: true }),
      signal: ctrl.signal
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error('magma notify:', e && e.message);
    return { ok: false, error: String((e && e.message) || e).slice(0, 80) };
  }
}

// Un pedido por QR avisa recién cuando llega el comprobante: antes no hay nada que preparar.
async function newOrder(record, prod) {
  if (record.payment && record.payment.method === 'qr') return { skipped: 'espera comprobante' };
  return post(texto(record), prod);
}
async function proof(record, prod) {
  return post('Comprobante recibido ' + record.orderId + ' · ' + money(record.total) + '\n' + ((record.customer || {}).name || '') + ' · +' + ((record.customer || {}).phone || '') + '\nRevísalo en el panel y confirma el pago.\n\n' + texto(record), prod);
}

module.exports = { newOrder, proof, texto };
