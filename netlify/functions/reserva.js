// GET /.netlify/functions/reserva?uid=... -> { marca, whatsapp, ubicacion } de esa reserva de Cal.com.
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
    // La ubicación solo sirve si es una dirección escrita, no el tipo de ubicación de Cal ("attendeeInPerson").
    const tipos = /^(attendeeInPerson|inPerson|organizerAddress|attendeeAddress|attendeePhone|attendeeDefined|somewhereElse|phone|userPhone|link|integrations:.*)$/i;
    const ubicacion = r && typeof r.ubicacion === 'string' && !tipos.test(r.ubicacion.trim()) ? r.ubicacion.trim() : '';
    return reply(200, r ? { marca: r.marca || '', whatsapp: r.whatsapp || '', ubicacion } : {});
  } catch (e) {
    return reply(200, {});
  }
};
