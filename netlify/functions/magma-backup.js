// Respaldo semanal: cada lunes envía por correo un CSV con los pedidos de los últimos 8 días.
// Variables en Netlify: MAGMA_BACKUP_EMAIL (a quién), RESEND_API_KEY (ya existe) y opcional MAGMA_BACKUP_FROM.
// Solo corre en producción. Programación en netlify.toml.
const Pricing = require('../../menu/magma/js/pricing.js');
const Store = require('./lib-magma/store.js');

const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';

function csv(rows) {
  const head = ['Pedido', 'Fecha', 'Estado', 'Entrega', 'Zona', 'Nombre', 'Apellido', 'Celular', 'Correo', 'Acepta ofertas', 'Direccion', 'Productos', 'Envio', 'Total', 'Detalle', 'Notas'];
  const out = [head.map(q).join(',')];
  rows.forEach((r) => {
    const c = r.customer || {};
    const det = (r.lines || []).map((l) => l.qty + 'x ' + l.name + ' ' + l.portion + ' [' + (l.choices || []).map((ch) => ch.options.map((o) => o.name).join('/')).join('; ') + ']' + (l.note ? ' nota: ' + l.note : '')).join(' | ');
    out.push([r.orderId, r.createdAt, r.status, r.mode === 'delivery' ? 'Entrega' : 'Recojo', c.zoneName || '', c.firstName, c.lastName, c.phone, c.email, c.consent ? 'Si' : 'No', c.address, r.subtotal != null ? r.subtotal : r.total, r.deliveryFee == null ? '' : r.deliveryFee, r.total, det, c.notes].map(q).join(','));
  });
  return '﻿' + out.join('\n');
}

exports.handler = async function (event) {
  const to = process.env.MAGMA_BACKUP_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  Store.forceProd(); // las funciones programadas solo corren en la versión publicada
  if (!to || !apiKey) { console.log('[magma-backup] falta MAGMA_BACKUP_EMAIL o RESEND_API_KEY'); return { statusCode: 200, body: 'sin configurar' }; }
  const since = Pricing.boliviaDate(new Date(Date.now() - 8 * 86400000)).key;
  const rows = await Store.listSince(event, since);
  const hoy = Pricing.boliviaDate(new Date()).key;
  const vendido = rows.filter((r) => r.status !== 'cancelado').reduce((s, r) => s + (r.total || 0), 0);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAGMA_BACKUP_FROM || process.env.CONTRATO_FROM || 'Magma Wings <onboarding@resend.dev>',
      to: [to],
      subject: 'Respaldo de pedidos Magma Wings, ' + hoy,
      text: rows.length + ' pedidos desde ' + since + ', ' + vendido + ' Bs sin contar cancelados. El detalle va en el CSV adjunto.',
      attachments: [{ filename: 'pedidos-magma-' + hoy + '.csv', content: Buffer.from(csv(rows), 'utf8').toString('base64') }]
    })
  });
  console.log('[magma-backup]', rows.length, 'pedidos, resend', res.status);
  return { statusCode: 200, body: String(rows.length) };
};

exports.csv = csv;
