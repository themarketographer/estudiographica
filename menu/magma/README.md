# Menú Magma Wings

Catálogo, pedido y envío por WhatsApp. Sitio estático en `menu/magma/` y dos funciones de Netlify.

## Qué edita quien lleva el negocio

Todo el contenido vive en `menu.json`. Cambiar un precio, agregar una salsa o marcar un producto agotado (`"available": false`) no pide tocar código.

| Campo | Para qué sirve |
|---|---|
| `brand.whatsapp` | Número que recibe los pedidos, con código de país y sin `+` |
| `brand.hours` | Horario en texto. Con `null` no se muestra |
| `service.pickup` / `service.delivery` | Activa o desactiva recojo y entrega |
| `categories[].products[]` | Productos con `price`, `qty`, `unit` y `groups` (qué opciones se ofrecen) |
| `optionGroups` | Salsa, papas y salsa extra. Cada opción puede sumar `price` |
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
  "lines": [{ "id": "alitas-12", "sel": { "salsa": ["bufalo"], "papas": ["gajos"], "salsa-extra": ["ranch"] }, "qty": 2 }],
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

`menu_view`, `category_select`, `item_view`, `add_to_cart`, `update_cart`, `remove_from_cart`, `undo_remove`, `edit_cart_item`, `cart_open`, `cart_close`, `checkout_start`, `order_submit`, `order_sent`, `order_fallback`, `order_error`, `order_edit`, `whatsapp_click`.

Con GA4 o Meta Pixel configurados se mapean a eventos estándar: `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout` y `generate_lead` en GA4; `ViewContent`, `AddToCart`, `InitiateCheckout` y `Lead` en Meta. La moneda se reporta como `BOB`.

Control del carrito desde otros scripts: `Magma.cart.add(id, sel, qty)`, `Magma.cart.clear()`, `Magma.cart.total()`, `Magma.open()`.

## Para publicar

1. Reemplaza `draftNote` por `null` cuando los precios sean definitivos.
2. Pon los IDs de GA4 y Meta Pixel del negocio en `tracking`. Los de Estudio Graphica no corresponden aquí.
3. Quita `<meta name="robots" content="noindex">` de `index.html` si el menú debe aparecer en Google.
