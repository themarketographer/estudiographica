// GET /.netlify/functions/reserva?uid=... -> { marca, whatsapp } de esa reserva de Cal.com.
// Los guarda cal-webhook.js. El uid solo lo conoce quien hizo la reserva (viaja en su redirección).
function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const uid = ((event.queryStringParameters || {}).uid || '').trim();
  if (!/^[\w-]{8,40}$/.test(uid)) return reply(400, {});
  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const r = await getStore({ name: 'cal-reservas' }).get(uid, { type: 'json' });
    return reply(200, r ? { marca: r.marca || '', whatsapp: r.whatsapp || '' } : {});
  } catch (e) {
    return reply(200, {});
  }
};
