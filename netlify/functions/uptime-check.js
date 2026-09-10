// Monitoreo de caidas de estudiographica.com.
// Netlify ejecuta esta funcion sola cada 15 min (ver netlify.toml). Si el
// sitio no responde bien, manda un aviso a ntfy.sh: un servicio gratis de
// notificaciones push que NO pide cuenta ni contrasena, solo un "topic"
// (como un canal). No cuesta nada y no guarda datos de nadie.
//
// Para recibir los avisos en el celular:
//   1. Instala la app "ntfy" (iOS o Android), o abre https://ntfy.sh/eg-uptime-dac703bf en el navegador.
//   2. Suscribete al topic: eg-uptime-dac703bf
//   Listo. Cuando el sitio se caiga, llega la notificacion ahi.
const SITE_URL = 'https://estudiographica.com/';
const NTFY_TOPIC = 'eg-uptime-dac703bf';

exports.handler = async function () {
  try {
    const res = await fetch(SITE_URL, { method: 'GET', redirect: 'follow' });
    if (!res.ok) {
      await notify('estudiographica.com respondió con código ' + res.status + '. Revisa Netlify.');
    }
  } catch (err) {
    await notify('estudiographica.com no respondió (' + (err && err.message ? err.message : 'sin conexión') + '). Revisa Netlify.');
  }
  return { statusCode: 200, body: 'ok' };
};

async function notify(message) {
  try {
    await fetch('https://ntfy.sh/' + NTFY_TOPIC, {
      method: 'POST',
      headers: { 'Title': '⚠️ Estudio Graphica podría estar caído' },
      body: message,
    });
  } catch (e) {
    // si ntfy tampoco responde, no hay mucho mas que hacer desde aca
  }
}
