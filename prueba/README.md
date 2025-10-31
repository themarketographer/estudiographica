
# Wireframe demo — Sitio de ejemplo para clase

Este repositorio contiene una landing demo pensada para enseñar estructura HTML/CSS/JS.

## Estructura

```
/index.html
/css/styles.css
/js/main.js
/assets/*
/404.html
/robots.txt
/sitemap.xml
/netlify.toml
```

## Cómo desplegar en GitHub y Netlify (rápido)

1. Crea un repositorio nuevo en GitHub (sin README). 
2. Clona localmente o sube los archivos desde la interfaz web (arrastrar y soltar).
3. En Netlify: New site -> Import from Git -> selecciona el repo -> Deploy site. No hace falta build (publish directory: `/`).
4. Para apuntar un dominio, sigue las instrucciones que Netlify te da (registros DNS). Netlify mostrará exactamente los registros que debes crear en tu proveedor.
5. HTTPS se activa automáticamente.

## Notas para la clase
- Cambia textos en `index.html`.
- Coloca imágenes reales en `/assets/` y actualiza las rutas.
- Colores en `css/styles.css` (variables :root).
- Para integrar GA4 o Pixel, pega los scripts en `index.html` en el head solo si tienes los IDs.
