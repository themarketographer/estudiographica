// Comprobante de pago por QR: POST /api/magma/proof { n, p, image }
// "n" es el número del pedido (07-24OCT), "p" los últimos 4 dígitos del celular, "image" una foto en data URL (jpeg, png o webp).
// La página reduce la foto antes de enviarla; aquí se vuelve a revisar el tipo y el tamaño.
const Lookup = require('./lib-magma/lookup.js');
const Store = require('./lib-magma/store.js');
const Notify = require('./lib-magma/notify.js');

const MAX_BODY = 1500000;
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'Método no permitido.' });
  if ((event.body || '').length > MAX_BODY) return reply(413, { ok: false, error: 'La foto es muy pesada. Prueba con una captura de pantalla.' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { ok: false, error: 'No pudimos leer la foto.' }); }
  if (typeof b.image !== 'string' || !IMG_RE.test(b.image)) return reply(422, { ok: false, error: 'Sube una foto o captura (JPG, PNG o WebP).' });
  const r = await Lookup.findOrder(event, b.n, b.p);
  if (!r.rec) return reply(r.status, { ok: false, error: r.error });
  const rec = r.rec;
  if (!rec.payment || rec.payment.method !== 'qr') return reply(422, { ok: false, error: 'Este pedido se paga en efectivo.' });
  if (rec.payment.status === 'verificado') return reply(200, { ok: true, status: 'verificado' });
  if (rec.status === 'cancelado') return reply(422, { ok: false, error: 'Este pedido está cancelado.' });
  try {
    await Store.saveProof(event, rec.key, { image: b.image, at: new Date().toISOString() });
    await Store.setPayment(event, rec.key, 'comprobante', { proofAt: new Date().toISOString() });
  } catch (e) {
    console.error('magma-proof:', e && e.message);
    return reply(500, { ok: false, error: 'No pudimos guardar el comprobante. Envíalo por WhatsApp.' });
  }
  if (rec.payment.status !== 'comprobante') await Notify.proof(rec, Store.isProd(event));
  return reply(200, { ok: true, status: 'comprobante' });
};
