# Menú Magma Wings

Catálogo, pedido y envío por WhatsApp. Sitio estático en `menu/magma/` y dos funciones de Netlify.

## Qué edita quien lleva el negocio

Todo el contenido vive en `menu.json`. Cambiar un precio, agregar una salsa o marcar un producto agotado (`"available": false`) no pide tocar código.

| Campo | Para qué sirve |
|---|---|
| `brand.whatsapp` | Número que recibe los pedidos, con código de país y sin `+` |
| `hours` | `null`, o `{ "text": "Lun a dom, 12:00 a 22:00", "tz": "America/La_Paz", "days": { "0": [["12:00","22:00"]] } }`. Con `days` y `tz` aparece "Abierto ahora" |
| `service.pickup` / `service.delivery` / `service.minOrder` | Recojo, entrega y pedido mínimo (`null` desactiva el mínimo) |
| `products[]` | Cada producto trae `portions` (cantidad, unidad y precio), `groups` (qué opciones ofrece), `photo` y `photoPos` |
| `optionGroups` | Salsa, papas y salsa extra. Cada opción puede sumar `price` |
| `available: false` | En un producto o en una porción, la marca como agotada |
| `draftNote` | Aviso "Nombres y precios temporales". Con `null` desaparece |
| `tracking.ga4` / `tracking.metaPixel` | IDs propios del negocio. Vacíos, no se carga ningún script externo |

## API

| Ruta | Método | Respuesta |
|---|---|---|
| `/api/magma/menu` | GET | El `menu.json` completo. Abierta a cualquier origen (`Access-Control-Allow-Origin: *`) |
| `/api/magma/order` | POST | Valida el pedido con los precios del menú, genera el número `MW-XXXXX` y devuelve el mensaje y el enlace de WhatsApp |

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
