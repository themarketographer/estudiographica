// netlify/functions/capi-web.js
//
// Relevo de eventos del navegador hacia la API de conversiones de Meta (CAPI).
//
// Por qué existe: hasta ahora en estudiographica.com solo llegaban por servidor
// las reservas de Cal.com (cal-webhook.js). Todos los demás eventos (ViewContent,
// CustomizeProduct, InitiateCheckout, vio_portafolio, interesado_reunion, etc.)
// dependían 100% del Pixel del navegador, y ese se pierde cuando el visitante
// usa un bloqueador de anuncios o un iPhone con la protección de rastreo activa.
// Con este relevo, assets/js/tracking.js manda cada evento dos veces: por el
// Pixel y por aquí, con el MISMO event_id, y Meta los cuenta una sola vez.
//
// Usa las mismas variables de entorno que ya tiene el sitio en Netlify para
// cal-webhook.js: META_PIXEL_ID y META_ACCESS_TOKEN.

const GRAPH_VERSION = 'v21.0';

// Solo se aceptan eventos que vengan de páginas de este sitio. Así nadie puede
// usar esta función desde afuera para ensuciar el pixel con eventos falsos.
const HOSTS_PERMITIDOS = ['estudiographica.com', 'www.estudiographica.com'];

function hostDe(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Faltan META_PIXEL_ID o META_ACCESS_TOKEN en Netlify' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { event_name, event_id, event_source_url, fbp, fbc, custom_data } = body;

  // Nombre de evento: letras, números y guion bajo, como los que usa el sitio.
  if (!event_name || !/^[A-Za-z0-9_]{2,50}$/.test(event_name) || !event_id || String(event_id).length > 120) {
    return { statusCode: 400, body: JSON.stringify({ error: 'event_name o event_id inválido' }) };
  }
  if (!HOSTS_PERMITIDOS.includes(hostDe(event_source_url))) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Origen no permitido' }) };
  }

  const headers = event.headers || {};
  const clientIp =
    headers['x-nf-client-connection-ip'] ||
    (headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    undefined;

  const userData = {
    client_ip_address: clientIp,
    client_user_agent: headers['user-agent'],
  };
  if (fbp) userData.fbp = String(fbp);
  if (fbc) userData.fbc = String(fbc);

  // custom_data: solo valores simples (texto, número, booleano), para no
  // reenviar nada raro a Meta.
  let customData;
  if (custom_data && typeof custom_data === 'object') {
    customData = {};
    Object.keys(custom_data).slice(0, 25).forEach((k) => {
      const v = custom_data[k];
      if (['string', 'number', 'boolean'].includes(typeof v)) {
        customData[k] = typeof v === 'string' ? v.slice(0, 200) : v;
      }
    });
  }

  const payload = {
    data: [
      {
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: String(event_id),
        event_source_url,
        action_source: 'website',
        user_data: userData,
        ...(customData && Object.keys(customData).length ? { custom_data: customData } : {}),
      },
    ],
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    );
    const data = await res.json();
    if (!res.ok) console.error('Error CAPI Meta:', JSON.stringify(data));
    return { statusCode: res.ok ? 200 : 400, body: JSON.stringify(data) };
  } catch (err) {
    console.error('Error llamando a CAPI:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
