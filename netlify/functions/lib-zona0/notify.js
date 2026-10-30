// Aviso de pedido nuevo al celular de cocina por Telegram.
// Variables en Netlify (las dos): ZONA0_TELEGRAM_BOT_TOKEN y ZONA0_TELEGRAM_CHAT_ID. Sin ellas no pasa nada.
// En previews y pruebas no se envía, salvo que exista ZONA0_NOTIFY_TEST=1.
function texto(r) {
  const c = r.customer || {};
  const out = [];
  out.push('Pedido nuevo ' + r.orderId + ' · ' + r.total + ' Bs');
  const donde = r.mode === 'mesa' ? 'Mesa ' + (c.mesa || '') : r.mode === 'delivery' ? 'Delivery: ' + (c.zoneName ? c.zoneName + '. ' : '') + (c.address || '') : 'Para llevar';
  out.push((c.name || 'Sin nombre') + ' · ' + donde);
  out.push('');
  (r.lines || []).forEach((l) => {
    out.push(l.qty + ' x ' + l.name);
    (l.choices || []).forEach((ch) => out.push('   ' + ch.label + ': ' + ch.options.map((o) => o.name).join(', ')));
    if (l.note) out.push('   Nota: ' + l.note);
  });
  if (c.notes) { out.push(''); out.push('Notas: ' + c.notes); }
  return out.join('\n');
}

async function newOrder(record, prod) {
  const token = process.env.ZONA0_TELEGRAM_BOT_TOKEN;
  const chat = process.env.ZONA0_TELEGRAM_CHAT_ID;
  if (!token || !chat) return { skipped: 'sin configurar' };
  if (!prod && !process.env.ZONA0_NOTIFY_TEST) return { skipped: 'no es producción' };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: texto(record), disable_web_page_preview: true }), signal: ctrl.signal
    });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error('zona0 notify:', e && e.message);
    return { ok: false };
  }
}

module.exports = { newOrder, texto };
