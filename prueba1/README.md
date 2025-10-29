
# Fotografía Gastronómica | Estudio Graphica

## 🚀 ¿Cómo subo mi web a GitHub y la publico en Netlify?
### 1. **Sube todo este contenido a un nuevo repositorio en GitHub**
- Arrastra todo el ZIP o sube carpeta por carpeta.
- Tu estructura debe verse así:
  ```
  /
  ├── index.html
  ├── css/styles.css
  ├── js/main.js
  ├── assets/...
  ├── 404.html
  ├── robots.txt
  ├── sitemap.xml
  ├── netlify.toml
  ```

### 2. **Conecta tu repositorio a Netlify**
- Ve a [netlify.com](https://netlify.com) y regístrate (usa tu GitHub).
- Click en "Add new site" → "Import an existing project".
- Selecciona tu repo, y dale a "Deploy site".
- **NO necesita build command** (es HTML estático).

### 3. **Apunta tu dominio**
- En Netlify, ve a "Domain management" → "Add custom domain".
- Sigue los pasos, copia los registros DNS que te muestra Netlify.
- Ve al panel de tu proveedor de dominio (GoDaddy, Namecheap, etc), pega esos DNS.
- Espera ~10min. Activa HTTPS automático desde Netlify (viene por defecto).

### 4. **Edita tu web fácilmente**
- Textos: Cambia lo que quieras en `index.html`
- Colores o fuentes: Modifica `/css/styles.css`
- Imágenes: Reemplaza archivos en `/assets/`
- Enlaces: Edita los `href` en tu HTML

### 5. **SEO y buen rendimiento**
- Tu web ya tiene `<title>`, `description`, OG tags, favicon, `robots.txt` y `sitemap.xml`
- Para mejores resultados, sube tus propias imágenes y reemplaza las rutas en HTML.

---
¿Dudas? Manda un mensaje al desarrollador, o mejor aún, prueba y aprende toqueteando.

---
