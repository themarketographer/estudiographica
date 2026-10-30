# Zona 0 · sistema de pedidos (versión 1)

Pedidos para la cafetería Zona 0. El cliente pide desde el celular y el local lo ve en su computadora al momento.
El local registra las mesas desde la computadora, cobra, lleva el libro diario y la cocina marca cada plato que prepara.

| Qué | Dónde |
|---|---|
| App del cliente (celular) | `/menu/zona-0/` |
| Panel del local (computadora) | `/menu/zona-0/panel/` (Mesas, Pedidos, Ventas, Libro diario, Menú) |
| Pantalla de cocina | `/menu/zona-0/cocina/` |
| Menú y precios | `menu/zona-0/menu.json` |
| Funciones | `netlify/functions/zona0-order.js`, `zona0-orders.js`, `zona0-track.js` y `lib-zona0/` |
| Redirecciones y caché | `netlify.toml` (bloque "Zona 0") |

## Puesta en marcha (una sola vez)

En Netlify, en Site configuration, Environment variables, crear:

- `ZONA0_ADMIN_TOKEN`: la clave del local para entrar al panel. Cualquier texto largo. **No va en el repositorio**, que es público.
- `ZONA0_KITCHEN_TOKEN`: la clave de cocina. Sirve solo para ver comandas y marcar platos. No abre ventas, libro diario ni teléfonos de clientes. La clave del local también abre la cocina.
- Opcionales, para avisar a cocina por Telegram: `ZONA0_TELEGRAM_BOT_TOKEN` y `ZONA0_TELEGRAM_CHAT_ID`.

Sin `ZONA0_ADMIN_TOKEN` el panel responde "Falta configurar ZONA0_ADMIN_TOKEN" y el celular sigue pudiendo pedir, pero nadie ve los pedidos.

## Cómo funciona

1. El celular manda el pedido a `/api/zona0/order`. El servidor recalcula el total con `menu.json` (nunca confía en el precio que manda el celular), reserva el número del día (`#07-30OCT`) y lo guarda en Netlify Blobs.
2. El panel pregunta cada 20 segundos por lo que cambió (`?since=`). Entra el pedido, suena el aviso y aparece la tarjeta.
3. El personal mueve el pedido: Nuevo, En cocina, Listo, Entregado. El celular del cliente lo ve en su pantalla de seguimiento (consulta cada 10 a 40 segundos).
4. **Mesas** es la vista principal. Se toca una mesa, se agregan productos y hay dos caminos: "Enviar a cocina" deja la cuenta abierta (pendiente de cobro) y se pueden sumar más rondas después, o "Cobrar" cierra la mesa con efectivo, QR o tarjeta. Los pedidos de la app del celular que dicen "mesa" se suman a la cuenta de esa mesa.
5. **Cocina** ve dos columnas, Comidas y Bebidas. Cada comanda muestra la mesa en grande y cada plato tiene su casilla. Al marcar el último plato de un pedido, la mesa se pone en verde en el panel ("Lista para servir"). Los combos de desayuno aparecen en las dos columnas y cada estación marca su parte.
6. **Ventas** lista los cobros de un día, por medio de pago y lo más vendido, con CSV.
7. **Libro diario** suma las ventas cobradas y los movimientos de caja que se anotan a mano (por ejemplo "leche para el café", con responsable). Tiene Resumen, Ingresos y Gastos, con rangos de hoy, 7 días, 30 días, mes o fechas elegidas. Los movimientos anulados quedan tachados, nunca se borran.

Es sondeo (consulta periódica), no tiempo real puro. El retraso normal es de hasta 20 segundos.

## Cuidado de créditos de Netlify

- Menú, estilos y código salen del CDN con caché (ver `netlify.toml`).
- El panel baja a una consulta cada 60 segundos si no hay movimiento, no consulta con la pestaña oculta y se pausa tras 15 minutos sin tocarlo (salvo que el sonido esté activado).
- El seguimiento del cliente se espacia hasta 40 segundos, y se detiene al entregar o pasadas 3 horas.
- El interruptor "Recibiendo pedidos" del panel cierra los pedidos del celular fuera de horario.

## Datos de clientes

- Cada pedido guarda nombre y celular. El seguimiento público pide número de pedido y los últimos 4 dígitos del celular, y solo devuelve estados, nunca datos personales.
- El panel exige la clave. No hay datos de clientes en el repositorio.
- Conviene avisar en el local qué datos se guardan y para qué.

## Cambiar el menú

Editar `menu.json`: categorías (cada una dice si es `bebida` o `comida`, que decide la columna de cocina), grupos de opciones y productos. Un producto puede llevar `kinds: ["comida","bebida"]` si se prepara en las dos estaciones. Las mesas se definen en `service.tables`. El menú cargado es el oficial de las dos fotos del local.

## Pendiente para una próxima versión

- Pago con QR y comprobante (ya existe el patrón en `menu/magma`).
- Agotar productos desde el panel.
- Conexión con una plataforma de delivery, cuando se sepa cuál usan.
