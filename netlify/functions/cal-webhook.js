const crypto = require('crypto');
const { sendCapiEvent, findOrCreateAudience, addUserToAudience } = require('./capi');

// ─────────────────────────────────────────────
// Clasificación de slugs: Lead (conversación) vs Cliente (compra)
// ─────────────────────────────────────────────
// "reunion" = alguien agendó una llamada de diagnóstico. Todavía no pagó
// nada, es un LEAD calificado, no un cliente.
//
// "sesion" / "jornada" / "plan-mensual" = alguien reservó directamente un
// servicio pagado desde /precios. Esto es intención de COMPRA, un nivel de
// calificación distinto. Van a una audiencia separada para que Meta no
// mezcle "gente que quiere hablar" con "gente que quiere pagar" al armar
// un Lookalike — son dos públicos con comportamiento de compra distinto.
const SLUGS_LEAD = ['reunion'];
const SLUGS_CLIENTE = ['sesion', 'jornada', 'plan-mensual'];
const SLUGS_PERMITIDOS = [...SLUGS_LEAD, ...SLUGS_CLIENTE];

const AUDIENCIA_LEAD = {
  nombre: 'Leads - Reunión (Estudio Graphica)',
  descripcion: 'Personas que agendaron una llamada de diagnóstico por Cal.com (evento reunion). Todavía no son clientes.',
};

const AUDIENCIA_CLIENTE = {
  nombre: 'Clientes - Sesión o Plan (Estudio Graphica)',
  descripcion: 'Personas que reservaron directamente una Sesión, Jornada o Plan Mensual por Cal.com. Intención de compra confirmada.',
};

// Nombre del evento que se manda a Meta según el tipo de slug.
// "Lead" es un evento estándar de Meta con mejor soporte de optimización
// automática de campañas orientadas a generación de leads.
// "Schedule" (también estándar) se usa para bookings de servicio pagado.
function eventNameForSlug(slug) {
  if (SLUGS_LEAD.includes(slug)) return 'Lead';
  return 'Schedule';
}

function audienceForSlug(slug) {
  if (SLUGS_LEAD.includes(slug)) return AUDIENCIA_LEAD;
  return AUDIENCIA_CLIENTE;
}

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

// El event_id se genera client-side (ver tracking.js → prepareCalBooking)
// y se manda como "metadata[eventId]" en data-cal-config del embed —
// Cal.com lo guarda en booking.metadata y lo reenvía tal cual en el
// webhook como payload.metadata.eventId (confirmado contra la doc oficial:
// cal.com/help/embedding/prefill-booking-form-embed). Con esto, Pixel
// (client-side) y CAPI (server-side, aquí) mandan el MISMO event_id y
// Meta deduplica automáticamente.
function extraerEventId(payload, fallbackUid) {
  const metadata = payload?.payload?.metadata || {};
  return metadata.eventId || metadata.eventID || fallbackUid;
}

// Lee "metadata[origen]" (mismo mecanismo) para saber si el booking vino
// de tráfico de ads o de la página orgánica.
function extraerOrigen(payload) {
  const metadata = payload?.payload?.metadata || {};
  return metadata.origen || 'organico';
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const rawBody = event.body || '';
  const signature = event.headers['x-cal-signature-256'] || event.headers['X-Cal-Signature-256'];
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

  const eventName = eventNameForSlug(slug);
  const eventId = extraerEventId(payload, bookingUid);
  const origen = extraerOrigen(payload);
  const audiencia = audienceForSlug(slug);

  console.log(`Booking recibido: slug="${slug}" evento="${eventName}" origen="${origen}" eventId="${eventId}"`);

  try {
    await sendCapiEvent({
      eventName,
      eventId,
      email,
      phone,
      sourceUrl,
    });
  } catch (err) {
    console.error('Error enviando evento CAPI a Meta:', err.message);
  }

  try {
    const audienceId = await findOrCreateAudience(audiencia.nombre, audiencia.descripcion);
    await addUserToAudience(audienceId, { email, phone });
  } catch (err) {
    console.error('Error actualizando la audiencia personalizada:', err.message);
  }

  return { statusCode: 200, body: 'OK' };
};
