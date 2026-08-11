const crypto = require('crypto');
const { sendCapiEvent, findOrCreateAudience, addUserToAudience } = require('./capi');

const SLUGS_PERMITIDOS = ['sesion', 'jornada', 'plan-mensual', 'reunion'];

const NOMBRE_AUDIENCIA = 'Agendaron llamada - Estudio Graphica';
const DESCRIPCION_AUDIENCIA = 'Personas que agendaron una llamada por Cal.com (sesion, jornada, plan-mensual, reunion)';

function verificarFirma(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const expected = hmac.digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

function extraerSlug(payload) {
  return (
    payload?.payload?.eventType?.slug ||
    payload?.payload?.type ||
    payload?.eventType?.slug ||
    ''
    ).toLowerCase();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  const rawBody = event.body || '';
  const signature = event.headers['cal-signature-256'] || event.headers['Cal-Signature-256'];
  const secret = process.env.CALCOM_WEBHOOK_SECRET;
  
  if (!verificarFirma(rawBody, signature, secret)) {
    console.error('Firma HMAC invalida, se rechaza el webhook.');
    return { statusCode: 401, body: 'Firma invalida' };
  }
  
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    console.error('No se pudo parsear el body del webhook:', err);
    return { statusCode: 400, body: 'Body invalido' };
  }
  
  if (payload.triggerEvent !== 'BOOKING_CREATED') {
    return { statusCode: 200, body: 'Evento ignorado (no es booking created)' };
  }
  
  const slug = extraerSlug(payload);
  if (!SLUGS_PERMITIDOS.includes(slug)) {
    console.log(`Slug "${slug}" no esta en la lista de rastreo, se ignora.`);
    return { statusCode: 200, body: 'Slug fuera de la lista de rastreo' };
  }
  
  const booking = payload.payload || {};
  const attendee = (booking.attendees && booking.attendees[0]) || {};
  const email = attendee.email || booking.email;
  const phone = attendee.phoneNumber || booking.phone;
  const bookingUid = booking.uid || booking.uuid || String(Date.now());
  const sourceUrl = `https://cal.com/themarketographer/${slug}`;
  
  try {
    await sendCapiEvent({
      eventName: 'Schedule',
      eventId: bookingUid,
      email,
      phone,
      sourceUrl,
    });
  } catch (err) {
    console.error('Error enviando evento CAPI a Meta:', err.message);
  }
  
  try {
    const audienceId = await findOrCreateAudience(NOMBRE_AUDIENCIA, DESCRIPCION_AUDIENCIA);
    await addUserToAudience(audienceId, { email, phone });
  } catch (err) {
    console.error('Error actualizando la audiencia personalizada:', err.message);
  }
  
  return { statusCode: 200, body: 'OK' };
};
