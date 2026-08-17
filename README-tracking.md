# Configuración de tracking — Estudio Graphica

Este documento cubre los pasos que **no se resuelven con código** y que
tienes que hacer tú directo en los dashboards de Meta, Cal.com y Netlify.

---

## 1. Meta Events Manager

1. Crea o confirma tu Pixel de Estudio Graphica en business.facebook.com/events_manager.
2. Copia el **Pixel ID** y reemplázalo en TODOS los archivos que dicen `TU_PIXEL_ID`:
   - `index.html`
   - `precios/index.html`
   - `gracias-reunion/index.html`
   - `gracias-sesion/index.html`
   - `gracias-plan/index.html`
3. Genera un **Access Token** de sistema (System User Token) con permiso
   `ads_management` para la API de Conversiones. Este token va en Netlify
   como variable de entorno `META_ACCESS_TOKEN` (nunca en el código, ya
   viene así de `capi.js`).
4. En "Configuración de eventos" del Pixel, activa **Deduplicación de eventos**
   (viene activada por defecto si usas `eventID` en el Pixel y `event_id`
   en CAPI con el mismo valor — que es justo lo que hace este sistema).

## 2. Google Analytics 4

1. Crea la propiedad GA4 (o usa la que ya tengas, `G-9H6Z8N5DTP` en tus
   notas si sigue siendo la misma cuenta).
2. Reemplaza `TU_GA4_ID` en los mismos 5 archivos de arriba.

## 3. Variables de entorno en Netlify

En Netlify → Site settings → Environment variables, agrega:

| Variable | Valor |
|---|---|
| `META_PIXEL_ID` | El mismo Pixel ID de arriba |
| `META_ACCESS_TOKEN` | El System User Token de Meta |
| `META_AD_ACCOUNT_ID` | Tu ID de cuenta publicitaria (sin `act_`) |
| `CALCOM_WEBHOOK_SECRET` | Ver paso 4 abajo |

## 4. Webhook de Cal.com → Netlify Function

1. En Cal.com → Settings → Developer → Webhooks, crea un webhook nuevo:
   - **Target URL**: `https://estudiographica.com/.netlify/functions/cal-webhook`
   - **Trigger**: `BOOKING_CREATED`
   - **Secret**: genera uno random (ej. con `openssl rand -hex 32`) y
     pégalo TANTO en Cal.com como en la variable `CALCOM_WEBHOOK_SECRET`
     de Netlify. Deben ser idénticos, es lo que verifica la firma HMAC.
2. Repite esto para cada evento que quieras rastrear: `reunion`, `sesion`,
   `jornada`, `plan-mensual` — o configura un solo webhook a nivel de
   cuenta que dispare para todos los tipos de evento (más simple).

## 5. Pasar `event_id` y `origen` a Cal.com (deduplicación + atribución) — YA IMPLEMENTADO

Esto es lo que resuelve tu pregunta de "el reenvío de URLs en Cal".

Confirmado contra la documentación oficial de Cal.com
(cal.com/help/embedding/prefill-booking-form-embed): la sintaxis del
embed para metadata custom es una **clave plana con corchetes** dentro
del objeto de configuración, no un objeto anidado:

```js
"metadata[miClave]": "miValor"
```

Cal.com guarda ese valor en la columna `metadata` del booking y lo
reenvía en el webhook como `payload.metadata.miClave`. Esto YA está
implementado en `/precios/index.html`, función `refreshCalConfig()`:

```js
function refreshCalConfig() {
  var eventId = window.EG.prepareCalBooking(tipo === 'sesion' ? 'sesion' : 'plan-mensual', 'Schedule');
  var origen = window.EG.getOrigen();
  var config = { layout: 'month_view', useSlotsViewOnSmallScreen: 'true', theme: 'light' };
  config['metadata[eventId]'] = eventId;
  config['metadata[origen]'] = origen;
  btnReservar.setAttribute('data-cal-config', JSON.stringify(config));
  return eventId;
}
```

Este `data-cal-config` se regenera en el evento `mousedown` del botón
(se dispara antes que `click`, así el atributo ya tiene el `eventId`
correcto cuando Cal.com lee la configuración al abrir el modal), con un
fallback en `touchstart` para móvil.

`cal-webhook.js` ya está preparado para leer `payload.payload.metadata.eventId`
y `payload.payload.metadata.origen` (funciones `extraerEventId` y
`extraerOrigen`), que es la ruta real del campo confirmada contra un
payload de ejemplo de `BOOKING_CREATED` documentado por Cal.com.

**No hace falta ningún ajuste adicional en el código para esto** — solo
verificar en producción con un booking real que el valor efectivamente
llega (ver checklist al final de este documento).

## 6. Redirect on Booking → páginas de gracias

En cada tipo de evento de Cal.com (Settings → Event Types → [tu evento] →
Advanced → "Redirect on booking"), configura la URL de redirect:

| Evento Cal.com | Redirige a |
|---|---|
| `reunion` | `https://estudiographica.com/gracias-reunion?origen={ORIGEN}` |
| `sesion` | `https://estudiographica.com/gracias-sesion?origen={ORIGEN}` |
| `jornada` | `https://estudiographica.com/gracias-sesion?origen={ORIGEN}` |
| `plan-mensual` | `https://estudiographica.com/gracias-plan?origen={ORIGEN}` |

Donde `{ORIGEN}` lo reemplazas manualmente por `ads` si vas a poner ese
link específicamente en un anuncio, o lo dejas fuera (sin parámetro) para
tráfico orgánico — las páginas de gracias ya asumen `organico` por
defecto si no viene el parámetro (ver `EG.getOrigen()` en `tracking.js`).

Si quieres distinguir de qué campaña específica vino (no solo ads vs
orgánico), puedes agregar más parámetros a la URL de redirect, ej.
`?origen=ads&campana=lanzamiento-agosto`, y capturarlos con el mismo
patrón en `tracking.js` (agregando una función `getCampana()` análoga a
`getOrigen()`).

## 7. Checklist antes de lanzar la campaña

- [ ] Pixel ID reemplazado en las 5 páginas
- [ ] GA4 ID reemplazado en las 5 páginas
- [ ] Variables de entorno configuradas en Netlify
- [ ] Webhook de Cal.com apuntando a la función y con secret coincidente
- [ ] Redirect on booking configurado en cada evento de Cal.com
- [ ] Probar un booking de prueba en cada evento y confirmar en Meta
      Events Manager → Test Events que el evento llega (busca `Lead` para
      reunión y `Schedule` para sesión/plan)
- [ ] Confirmar en Facebook Ads Manager → Audiencias que aparecen las dos
      audiencias nuevas: "Leads - Reunión" y "Clientes - Sesión o Plan"
