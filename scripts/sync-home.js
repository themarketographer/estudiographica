#!/usr/bin/env node
/**
 * scripts/sync-home.js — Estudio Graphica
 *
 * Reescribe en index.html el HTML estático de las secciones editables del
 * inicio (hero, marcas, plan, portafolio, FAQ...) a partir de los arreglos
 * que edita el panel (const landingHero = [...], etc.) y actualiza la
 * "huella" data-eg-hash del <body>.
 *
 * Por qué: si la huella no coincide con los datos, assets/js/eg-home.js
 * repinta esas secciones en el navegador en cada visita. Eso retrasa el LCP
 * (la foto del hero aparece recién cuando corre el JS) y mueve el diseño (CLS).
 *
 * Uso (desde la raíz del repo, después de que el panel cambie los datos):
 *   npm i --no-save parse5 && node scripts/sync-home.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const parse5 = require('parse5');
const EGHome = require('../assets/js/eg-home.js');

const FILE = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(FILE, 'utf8');

// 1) Datos del panel: "const NOMBRE = [ ... ];" dentro del script inline
const names = ['landingHero', 'landingCopy', 'marcas', 'proceso', 'promesa', 'portafolio', 'heroFotos', 'planMeses', 'faqs'];
const data = {};
names.forEach((n) => {
  const m = html.match(new RegExp('const ' + n + ' = (\\[[\\s\\S]*?\\n\\s*\\]);'));
  if (!m) throw new Error('No encontré const ' + n + ' en index.html');
  data[n] = vm.runInNewContext(m[1]);
});

// 2) HTML nuevo por contenedor
const out = EGHome.renderAll(data);
const hash = EGHome.dataHash(data);

// 3) Reemplazar el innerHTML de cada contenedor (de atrás hacia adelante)
const doc = parse5.parse(html, { sourceCodeLocationInfo: true });
const edits = [];
(function walk(n) {
  (n.childNodes || []).forEach((c) => {
    const id = c.attrs && (c.attrs.find((a) => a.name === 'id') || {}).value;
    if (id && Object.prototype.hasOwnProperty.call(out, id) && c.sourceCodeLocation && c.sourceCodeLocation.startTag && c.sourceCodeLocation.endTag) {
      edits.push({ s: c.sourceCodeLocation.startTag.endOffset, e: c.sourceCodeLocation.endTag.startOffset, v: out[id], id });
    }
    walk(c);
  });
})(doc);
const missing = Object.keys(out).filter((id) => !edits.some((x) => x.id === id));
if (missing.length) console.warn('Sin contenedor en index.html:', missing.join(', '));
edits.sort((a, b) => b.s - a.s).forEach((x) => { html = html.slice(0, x.s) + x.v + html.slice(x.e); });

// 4) Huella y JSON-LD de preguntas frecuentes
html = html.replace(/(<body[^>]*data-eg-hash=")[^"]*(")/, '$1' + hash + '$2');
html = html.replace(/(<script type="application\/ld\+json" id="eg-faq-ld">)[\s\S]*?(<\/script>)/, (_, a, b) => a + JSON.stringify(EGHome.faqSchema(data)) + b);

fs.writeFileSync(FILE, html);
console.log('index.html sincronizado. Huella:', hash, '| contenedores:', edits.length);
