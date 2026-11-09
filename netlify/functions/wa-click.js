// Recibe el click en WhatsApp de /ads y lo manda a Meta por la API de Conversiones.
// El navegador manda el mismo event_id al Pixel, así Meta deduplica.
const { sendCapiEvent } = require('./capi');

const ALLOWED_HOST = /^https:\/\/(www\.)?estudiographica\.com(\/|$)/;

function cookie(header, name) {
  const m = (header || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  // shortcut: solo filtra por Origin/Referer (se puede falsear); subir a token firmado si llega spam.
  const origin = event.headers.origin || event.headers.referer || '';
  if (!ALLOWED_HOST.test(origin)) return { statusCode: 403, body: '' };

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: '' }; }
  if (typeof b.event_id !== 'string' || !/^[\w-]{6,100}$/.test(b.event_id)) return { statusCode: 400, body: '' };
  const sourceUrl = ALLOWED_HOST.test(b.source_url || '') ? b.source_url : 'https://estudiographica.com/ads';

  const h = event.headers;
  const ck = h.cookie;
  const fbclid = new URL(sourceUrl).searchParams.get('fbclid');
  const userData = {
    client_ip_address: h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim() || undefined,
    client_user_agent: h['user-agent'],
    fbp: cookie(ck, '_fbp') || undefined,
    fbc: cookie(ck, '_fbc') || (fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined),
  };
  const value = Number(b.value) > 0 ? Number(b.value) : null;

  try {
    await sendCapiEvent({
      eventName: 'Contact',
      eventId: b.event_id,
      sourceUrl,
      actionSource: 'website',
      extraUserData: userData,
      customData: {
        content_name: 'WhatsApp ads',
        content_category: String(b.button || '').slice(0, 40),
        origen: 'ads',
        ...(value ? { value, currency: 'BOB' } : {}),
      },
    });
    return { statusCode: 204, body: '' };
  } catch (err) {
    console.error('wa-click CAPI falló:', err.message);
    return { statusCode: 202, body: '' }; // el tracking nunca debe romper la página
  }
};
