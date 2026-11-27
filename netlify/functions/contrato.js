/**
 * contrato.js — Estudio Graphica
 * Recibe el contrato firmado desde /contrato/ y lo manda por correo con el
 * PDF adjunto: una copia al cliente y otra a Pablo (que queda como archivo).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * QUÉ HAY QUE CONFIGURAR EN NETLIFY (Site settings → Environment variables)
 * ─────────────────────────────────────────────────────────────────────────
 *   RESEND_API_KEY   (obligatoria)  Tu API key de resend.com. Plan gratuito:
 *                                   3.000 correos al mes, suficiente de sobra.
 *   CONTRATO_FROM    (opcional)     Remitente. Debe ser de un dominio
 *                                   verificado en Resend.
 *                                   Por defecto: 'Estudio Graphica <contratos@estudiographica.com>'
 *   CONTRATO_TO      (opcional)     A dónde llega tu copia de archivo.
 *                                   Por defecto: 'hola@estudiographica.com'
 *   FIRMA_FOTOGRAFO_PNG_B64 (opcional) Tu firma simplificada, en PNG con fondo
 *                                   transparente, codificada en base64 (sin
 *                                   "data:image/png;base64,"). Se estampa SOLO
 *                                   en el PDF que sale por correo, nunca en el
 *                                   PDF que se descarga en la web. Va en una
 *                                   variable de entorno (y no en el repositorio)
 *                                   para que nadie pueda copiarla de GitHub.
 *                                   Netlify limita las variables a unos 4 KB en
 *                                   total: la imagen debe ser pequeña.
 *                                   Si falta, el correo sale igual, sin tu firma.
 *
 * Mientras RESEND_API_KEY no exista, esta función responde 200 con
 * { enviado: false, motivo: 'sin_configurar' } — la página de contrato lo
 * detecta y le dice al cliente que mande el PDF por WhatsApp. Nada se rompe,
 * la firma y la descarga del PDF funcionan igual.
 * ─────────────────────────────────────────────────────────────────────────
 */

const FROM_DEFECTO = 'Estudio Graphica <contratos@estudiographica.com>';
const TO_DEFECTO = 'hola@estudiographica.com';

// Tope de tamaño del adjunto (base64). Un contrato normal pesa 100-400 KB;
// 8 MB en base64 ≈ 6 MB de PDF, muy por encima de lo razonable.
const MAX_BASE64 = 8 * 1024 * 1024;

// Posición de la firma del Fotógrafo en la última página. Tiene que coincidir con
// generarPdf() en contrato/index.html, donde la línea de firmas queda siempre en y = 690
// (medida desde el borde superior) y la columna del Fotógrafo empieza en x = 319.
const FIRMA_X = 319;
const FIRMA_LINEA_Y = 690;
const FIRMA_ANCHO = 190;
const FIRMA_ALTO = 58;

const TIPOS_UBICACION_CAL = /^(attendeeInPerson|inPerson|organizerAddress|attendeeAddress|attendeePhone|attendeeDefined|somewhereElse|phone|userPhone|link|integrations:.*)$/i;

// La firma solo se estampa si el cliente completó todos los datos del contrato.
function datosCompletos(d) {
  const lleno = (v) => typeof v === 'string' && v.trim().length > 1;
  return ['nombre', 'ci', 'negocio', 'direccion', 'whatsapp', 'fecha'].every((k) => lleno(d[k]))
    && !TIPOS_UBICACION_CAL.test(d.direccion.trim())
    && String(d.contratoTexto || '').length > 1500;
}

// Estampa la firma del Fotógrafo en la última página. Si algo falla, devuelve
// el PDF original: el cliente recibe su contrato igual y el correo a Pablo avisa.
async function estamparFirma(pdfBase64) {
  const firma = process.env.FIRMA_FOTOGRAFO_PNG_B64;
  if (!firma) return { base64: pdfBase64, estado: 'sin_firma_configurada' };
  try {
    const bytes = Buffer.from(pdfBase64, 'base64');
    if (bytes.subarray(0, 4).toString() !== '%PDF') return { base64: pdfBase64, estado: 'error_firma' };
    const { PDFDocument } = require('pdf-lib');
    const pdf = await PDFDocument.load(bytes);
    const paginas = pdf.getPages();
    const ultima = paginas[paginas.length - 1];
    const img = await pdf.embedPng(Buffer.from(firma.replace(/^data:image\/png;base64,/, '').trim(), 'base64'));
    const escala = Math.min(FIRMA_ANCHO / img.width, FIRMA_ALTO / img.height);
    ultima.drawImage(img, {
      x: FIRMA_X,
      y: ultima.getHeight() - FIRMA_LINEA_Y + 4,
      width: img.width * escala,
      height: img.height * escala,
    });
    return { base64: Buffer.from(await pdf.save()).toString('base64'), estado: 'firmado' };
  } catch (err) {
    console.error('[contrato] No se pudo estampar la firma del Fotógrafo:', err && err.message);
    return { base64: pdfBase64, estado: 'error_firma' };
  }
}

function respuesta(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Correo que recibe el CLIENTE
function htmlCliente(d) {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;background:#F0EDE6;padding:32px 16px;">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:32px;">
      <div style="background:#181818;color:#FFDD5A;font-weight:700;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;padding:8px 14px;border-radius:999px;display:inline-block;">Estudio Graphica</div>
      <h1 style="font-size:24px;line-height:1.2;margin:20px 0 12px;color:#181818;">Tu contrato está firmado, ${escapeHtml(d.nombre)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#4a4a4a;margin:0 0 20px;">
        Adjuntamos tu copia en PDF. Guárdala, ahí está todo lo que acordamos.
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#181818;margin-bottom:22px;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6B6660;">Servicio</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${escapeHtml(d.servicio)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6B6660;">Paquete</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${escapeHtml(d.paquete)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6B6660;">Fecha de la sesión</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${escapeHtml(d.fecha)}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#6B6660;">Total</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;">Bs. ${escapeHtml(d.precio)}</td></tr>
        <tr><td style="padding:8px 0;color:#6B6660;">Adelanto para apartar tu fecha</td><td style="padding:8px 0;text-align:right;font-weight:700;">Bs. ${escapeHtml(d.adelanto)}</td></tr>
      </table>
      <p style="font-size:14px;line-height:1.6;color:#4a4a4a;margin:0 0 22px;">
        Tu fecha queda apartada cuando confirmemos el adelanto. Puedes pagarlo escaneando el QR desde la página, y mandarnos el comprobante por WhatsApp.
      </p>
      <a href="https://estudiographica.com/gracias-${d.tipoPago}/" style="display:inline-block;background:#FFDD5A;color:#181818;font-weight:700;font-size:15px;padding:14px 26px;border-radius:999px;text-decoration:none;">Ir a pagar mi adelanto →</a>
      <p style="font-size:12px;color:#9a968f;margin-top:26px;line-height:1.5;">
        Estudio Graphica · Cochabamba, Bolivia<br>
        Si tienes cualquier duda, respóndenos este correo o escríbenos al WhatsApp +591 69422335.
      </p>
    </div>
  </div>`;
}

// Correo que recibe PABLO (archivo interno)
function htmlEstudio(d) {
  const notaFirma = {
    firmado: 'Va con tu firma.',
    sin_firma_configurada: '⚠ Va sin tu firma: falta la variable FIRMA_FOTOGRAFO_PNG_B64 en Netlify.',
    error_firma: '⚠ Va sin tu firma: no se pudo estampar, mira los logs de Netlify.',
    datos_incompletos: '⚠ Va sin tu firma: el cliente no completó todos los datos.',
  }[d.firmaEstado] || '';
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px;">
    <h2 style="margin:0 0 14px;color:#181818;">Contrato firmado — ${escapeHtml(d.negocio)}</h2>
    <table style="border-collapse:collapse;font-size:14px;color:#181818;">
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Cliente</td><td style="padding:5px 0;font-weight:600;">${escapeHtml(d.nombre)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">CI / NIT</td><td style="padding:5px 0;">${escapeHtml(d.ci)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Negocio</td><td style="padding:5px 0;">${escapeHtml(d.negocio)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Dirección</td><td style="padding:5px 0;">${escapeHtml(d.direccion)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Correo</td><td style="padding:5px 0;">${escapeHtml(d.email)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">WhatsApp</td><td style="padding:5px 0;">${escapeHtml(d.whatsapp)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Servicio</td><td style="padding:5px 0;">${escapeHtml(d.servicio)} — ${escapeHtml(d.paquete)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Detalle</td><td style="padding:5px 0;">${escapeHtml(d.detalle)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Fecha sesión</td><td style="padding:5px 0;font-weight:600;">${escapeHtml(d.fecha)}</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Total</td><td style="padding:5px 0;font-weight:700;">Bs. ${escapeHtml(d.precio)} (adelanto Bs. ${escapeHtml(d.adelanto)})</td></tr>
      <tr><td style="padding:5px 14px 5px 0;color:#6B6660;">Firmado</td><td style="padding:5px 0;">${escapeHtml(new Date().toLocaleString('es-BO'))}</td></tr>
    </table>
    <p style="font-size:13px;color:#6B6660;margin-top:18px;">El PDF firmado va adjunto. ${escapeHtml(notaFirma)} Falta que confirme el adelanto.</p>
  </div>`;
}

async function enviarCorreo(apiKey, payload) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const cuerpo = await res.json().catch(() => ({}));
  return { ok: res.ok, cuerpo };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return respuesta(405, { enviado: false, motivo: 'metodo_no_permitido' });
  }

  let d;
  try {
    d = JSON.parse(event.body || '{}');
  } catch (e) {
    return respuesta(400, { enviado: false, motivo: 'json_invalido' });
  }

  // Validación mínima: sin correo del cliente no hay a dónde mandar nada.
  if (!d.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) {
    return respuesta(400, { enviado: false, motivo: 'email_invalido' });
  }
  if (!d.pdfBase64) {
    return respuesta(400, { enviado: false, motivo: 'sin_pdf' });
  }
  if (d.pdfBase64.length > MAX_BASE64) {
    return respuesta(413, { enviado: false, motivo: 'pdf_muy_grande' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Sin configurar todavía: no es un error del cliente, es que falta la
    // llave. Respondemos 200 para que la página muestre el mensaje amable
    // de "mándanoslo por WhatsApp" en vez de un error rojo.
    console.log('[contrato] RESEND_API_KEY no configurada — no se envió correo.');
    return respuesta(200, { enviado: false, motivo: 'sin_configurar' });
  }

  const from = process.env.CONTRATO_FROM || FROM_DEFECTO;
  const to = process.env.CONTRATO_TO || TO_DEFECTO;
  const archivo = d.archivo || 'Contrato_EstudioGraphica.pdf';
  // Tu firma va solo en el PDF que sale por correo, y solo si el cliente completó todos los datos.
  let pdfFinal = d.pdfBase64;
  d.firmaEstado = 'datos_incompletos';
  if (datosCompletos(d)) {
    const r = await estamparFirma(d.pdfBase64);
    pdfFinal = r.base64;
    d.firmaEstado = r.estado;
  }
  const adjunto = [{ filename: archivo, content: pdfFinal }];

  // "plan" → /gracias-plan, cualquier otra cosa → /gracias-sesion
  d.tipoPago = /plan/i.test(d.servicio || '') ? 'plan' : 'sesion';

  try {
    const [alCliente, alEstudio] = await Promise.all([
      enviarCorreo(apiKey, {
        from,
        to: [d.email],
        reply_to: to,
        subject: `Tu contrato firmado — ${d.servicio || 'Estudio Graphica'}`,
        html: htmlCliente(d),
        attachments: adjunto,
      }),
      enviarCorreo(apiKey, {
        from,
        to: [to],
        reply_to: d.email,
        subject: `📄 Contrato firmado — ${d.negocio || d.nombre || 'cliente nuevo'}`,
        html: htmlEstudio(d),
        attachments: adjunto,
      }),
    ]);

    if (!alCliente.ok) {
      console.error('[contrato] Resend rechazó el correo al cliente:', alCliente.cuerpo);
    }
    if (!alEstudio.ok) {
      console.error('[contrato] Resend rechazó la copia al estudio:', alEstudio.cuerpo);
    }

    // Con que le llegue al cliente ya damos el envío por bueno; la copia
    // interna que falle se ve en los logs de Netlify.
    return respuesta(200, {
      enviado: alCliente.ok,
      copiaEstudio: alEstudio.ok,
      motivo: alCliente.ok ? null : 'resend_rechazo',
    });
  } catch (err) {
    console.error('[contrato] Error enviando el correo:', err);
    return respuesta(200, { enviado: false, motivo: 'error_envio' });
  }
};
