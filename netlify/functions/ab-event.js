// Recibe un evento de prueba A/B y lo guarda en Netlify Blobs.
// Una clave por visitante y evento: "prueba/variante/evento/visitante". Guardar dos veces lo mismo no cuenta doble.
// Los deploys que no son el sitio publicado escriben en "ab-events-test" para no ensuciar los resultados.
const PROD = (process.env.AB_PROD_HOSTS || 'estudiographica.com,www.estudiographica.com').split(',').map((x) => x.trim().toLowerCase());

function storeFor(event) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  connectLambda(event);
  const h = event.headers || {};
  const host = String(h['x-forwarded-host'] || h.host || '').toLowerCase().split(',')[0].trim().replace(/:\d+$/, '');
  return getStore({ name: PROD.indexOf(host) > -1 ? 'ab-events' : 'ab-events-test' });
}

exports.storeFor = storeFor;
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  let d;
  try { d = JSON.parse(event.body || '{}'); } catch (e) { return { statusCode: 400, body: '' }; }
  const ok = /^[a-z0-9-]{1,40}$/.test(d.t || '') && /^[a-z]$/.test(d.v || '') &&
    /^(view|convert:[a-z0-9-]{1,30})$/.test(d.e || '') && /^[a-z0-9]{8,30}$/.test(d.vid || '');
  if (!ok) return { statusCode: 400, body: '' };
  try {
    const store = storeFor(event);
    await store.setJSON([d.t, d.v, d.e.replace(':', '_'), d.vid].join('/'), { ts: Date.now() }, { onlyIfNew: true });
    // Marca de inicio de la prueba: solo se escribe la primera vez.
    if (d.e === 'view') await store.setJSON('_start/' + d.t, { ts: Date.now() }, { onlyIfNew: true });
  } catch (e) { return { statusCode: 500, body: '' }; }
  return { statusCode: 204, body: '' };
};
