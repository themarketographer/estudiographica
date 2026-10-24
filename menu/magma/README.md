# Menú Magma Wings

Catálogo, pedido y envío por WhatsApp. Sitio estático en `menu/magma/` y dos funciones de Netlify.

## Qué edita quien lleva el negocio

Todo el contenido vive en `menu.json`. Cambiar un precio, agregar una salsa o marcar un producto agotado (`"available": false`) no pide tocar código.

| Campo | Para qué sirve |
|---|---|
| `brand.whatsapp` | Número que recibe los pedidos, con código de país y sin `+` |
| `hours` | `null`, o `{ "text": "Lun a dom, 12:00 a 22:00", "tz": "America/La_Paz", "days": { "0": [["12:00","22:00"]] } }`. Con `days` y `tz` aparece "Abierto ahora" |
| `service.pickup` / `service.delivery` / `service.minOrder` | Recojo, entrega y pedido mínimo (`null` desactiva el mínimo) |
| `service.zones` | Zonas de entrega: `{ id, name, fee }`. `fee: null` significa "se confirma por chat". Sin zonas, no se pide zona |
| `service.freeDeliveryFrom` | Monto de productos desde el cual el envío es gratis en las zonas con tarifa (`null` lo desactiva) |
| `products[]` | Cada producto trae `portions` (cantidad, unidad y precio), `groups` (qué opciones ofrece), `photo` y `photoPos` |
| `optionGroups` | Salsa, papas y salsa extra. Cada opción puede sumar `price` |
| `available: false` | En un producto o en una porción, la marca como agotada |
| `draftNote` | Aviso "Nombres y precios temporales". Con `null` desaparece |
| `tracking.ga4` / `tracking.metaPixel` | IDs propios del negocio. Vacíos, no se carga ningún script externo |

## API

| Ruta | Método | Respuesta |
|---|---|---|
| `/api/magma/menu` | GET | El `menu.json` completo. Abierta a cualquier origen (`Access-Control-Allow-Origin: *`) |
| `/api/magma/order` | POST | Valida el pedido con los precios del menú, genera el número del día (`#01-24OCT`) y devuelve el mensaje y el enlace de WhatsApp |

Cuerpo del POST:

```json
{
  "lines": [{ "id": "alitas", "portion": "12", "sel": { "salsa": ["bufalo"], "papas": ["gajos"], "salsa-extra": ["ranch"] }, "qty": 2 }],
  "customer": { "name": "Ana", "mode": "delivery", "address": "Av. Pando 123", "notes": "" }
}
```

El servidor recalcula el total y nunca usa el que muestra el navegador. Si falla la API, la página arma el pedido con las mismas reglas (`js/pricing.js`) y sigue hasta WhatsApp.

Variable opcional en Netlify: `ORDER_WEBHOOK_URL`. Cada pedido válido se reenvía ahí como JSON (Make, Zapier, un bot de Telegram).

## Eventos personalizados

Cada acción emite un evento de tres formas: `document` (`magma:<nombre>`), `window.Magma.on('<nombre>', fn)` y `dataLayer` (`magma_<nombre>`).

```js
Magma.on('add_to_cart', e => console.log(e.items, e.value));
document.addEventListener('magma:order_sent', e => console.log(e.detail.orderId));
```

`menu_view`, `category_select`, `item_view`, `add_to_cart`, `update_cart`, `remove_from_cart`, `undo_remove`, `edit_cart_item`, `cart_open`, `cart_close`, `checkout_start`, `order_submit`, `order_sent`, `order_fallback`, `order_error`, `order_edit`, `edit_cart_item`, `whatsapp_click`.

Con GA4 o Meta Pixel configurados se mapean a eventos estándar: `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout` y `generate_lead` en GA4; `ViewContent`, `AddToCart`, `InitiateCheckout` y `Lead` en Meta. La moneda se reporta como `BOB`.

Control del carrito desde otros scripts: `Magma.cart.add(id, portion, sel, qty, note)`, `Magma.cart.clear()`, `Magma.cart.total()`, `Magma.open()`.

## Para publicar

1. Reemplaza `draftNote` por `null` cuando los precios sean definitivos.
2. Pon los IDs de GA4 y Meta Pixel del negocio en `tracking`. Los de Estudio Graphica no corresponden aquí.
3. Quita `<meta name="robots" content="noindex">` de `index.html` si el menú debe aparecer en Google.

## Movimiento y tipografía

`js/motion.js` adapta el sistema de movimiento de Estudio Graphica (entradas con blur, título por palabras, botones con relleno, nav de vidrio, foco de luz, paralaje). Tipografía: Bricolage Grotesque (títulos y cifras) e Instrument Sans (texto), alojadas en `fonts/`.

## Dónde se guardan los pedidos

Cada pedido que sale del menú se guarda en **Netlify Blobs** (almacenamiento del propio sitio, sin cuentas extra). Se ve en el panel:

**/menu/magma/pedidos/** (no aparece en Google). Pide la clave que está en Netlify como `MAGMA_ADMIN_TOKEN`.

- El panel muestra lo pedido, el cliente, el total y permite marcar el estado: nuevo, preparando, listo, entregado o cancelado. Se actualiza solo cada 30 segundos y descarga todo en CSV.
- Los pedidos nuevos aparecen al instante; un cambio de estado puede tardar hasta un minuto en verse desde otro dispositivo. Los pedidos reales (deploy de producción) van al almacén `magma-orders`. Los de previews y pruebas van a `magma-orders-test`, para que una prueba no ensucie las ventas reales.
- Si la API no responde, el cliente igual completa su pedido por WhatsApp, pero ese pedido no queda guardado.
- Los datos del cliente (nombre, dirección, notas) quedan guardados. Avísalo en la política de privacidad del negocio.
- Para cambiar la clave: Netlify, Site configuration, Environment variables, `MAGMA_ADMIN_TOKEN`, y vuelve a desplegar.

## Datos para Meta (audiencias, API de Conversiones y eventos)

El pedido pide nombre, apellido, celular y correo (opcional; para exigirlo pon `"requireEmail": true` en `service`). Hay una casilla, sin marcar, para aceptar ofertas y anuncios.

- **Píxel en el navegador:** pon el ID del píxel del negocio en `tracking.metaPixel`. Envía ViewContent, AddToCart, InitiateCheckout y Lead, más eventos propios (MagmaCategoria, MagmaWhatsApp). Si el cliente aceptó, el píxel recibe sus datos para mejorar la coincidencia.
- **API de Conversiones (servidor):** crea en Netlify `MAGMA_META_PIXEL_ID` y `MAGMA_META_ACCESS_TOKEN` (token del píxel del negocio, no el de Estudio Graphica). Para probar, agrega `MAGMA_META_TEST_CODE` con el código de Administrador de eventos. Al enviar un pedido sale `Lead` con el mismo número de pedido que el del navegador, así Meta no lo cuenta doble. Al marcar un pedido como **Entregado** en el panel sale `Purchase`, una sola vez, con el valor real de la venta.
- Los datos personales viajan en hash SHA-256 y solo si el cliente aceptó. Sin aceptación el evento sale sin datos personales.
- **Audiencias:** en el panel, "Audiencia para Meta (CSV)" descarga solo a quienes aceptaron, con el formato que pide Meta para listas de clientes.

## Números de pedido

El primer pedido de cada día es el `#01`, el segundo el `#02`, y así. Después del número va la fecha: `#07-24OCT` es el séptimo pedido del 24 de octubre (hora de Bolivia). Cada día vuelve a empezar en `#01`. Si el servidor no responde y el pedido sale sin guardarse, el número lleva la hora en vez de la cuenta (`#T1432-24OCT`).

## Envío por zona

El cliente que elige entrega escoge su zona y ve el costo antes de enviar. El servidor calcula el envío igual que el total de productos (nunca confía en el navegador). Si los productos superan `freeDeliveryFrom`, el envío sale gratis en las zonas con tarifa. Una zona con `fee: null` deja el envío por confirmar y el mensaje de WhatsApp lo dice.

## Seguimiento del pedido para el cliente

**/menu/magma/pedido/**. El cliente escribe el número (`07-24OCT`) y los últimos 4 dígitos de su celular, y ve en qué estado va su pedido (recibido, en la freidora, listo o en camino, entregado). La página se abre sola con el último pedido hecho desde ese mismo teléfono y se actualiza cada 15 segundos. La API es `GET /api/magma/track?n=07-24OCT&p=0828` y solo devuelve el estado, nunca datos personales. Un pedido que no se pudo guardar (`#T1432-24OCT`) no tiene seguimiento.

## Avisos y respaldo (variables en Netlify)

| Variable | Para qué |
|---|---|
| `MAGMA_TELEGRAM_BOT_TOKEN` y `MAGMA_TELEGRAM_CHAT_ID` | Cada pedido nuevo llega al celular de quien atiende, por Telegram. Se crea el bot con @BotFather. Solo avisa en producción |
| `MAGMA_BACKUP_EMAIL` | Cada lunes a las 8:00 (Bolivia) llega un CSV con los pedidos de la última semana. Usa `RESEND_API_KEY`. Opcional `MAGMA_BACKUP_FROM` |
| `ORDER_WEBHOOK_URL` | Reenvío del pedido a Make, Zapier u otro servicio |

## Publicidad de Estudio Graphica

El banner del final del menú vive en `index.html` (`<aside class="eg">`) con su estilo en `css/magma.css`. Lleva `utm_source=magma-menu` y emite el evento `eg_banner_click`.
