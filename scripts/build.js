#!/usr/bin/env node
/**
 * scripts/build.js — Estudio Graphica
 *
 * Reads the editable content files under content/ (written by hand or by the
 * Decap CMS admin panel) and renders them into the static HTML templates
 * under templates/, overwriting the served pages at the repo root:
 *
 *   content/home.json      + templates/index.html         -> index.html
 *   content/precios.json   + templates/precios/index.html -> precios/index.html
 *   content/blog/<slug>.md + templates/blog/_post.html    -> blog/<slug>/index.html
 *
 * This script intentionally does NOT touch anything else: /gracias-*,
 * /privacidad, netlify/functions/*, assets/, sitemap.xml, robots.txt,
 * llms.txt, or the pricing CALCULATION logic in assets/js/pricing-logic.js.
 *
 * Templating is a dead-simple {{token}} string replacer — no templating
 * framework. Markdown -> HTML conversion uses `marked` with its defaults;
 * blog post bodies are authored as HTML block content inside the Markdown
 * file (valid CommonMark: raw HTML blocks pass through `marked` unchanged),
 * which is what lets the rebuilt pages match the original hand-authored
 * markup byte-for-byte.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const ROOT = path.join(__dirname, '..');

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// marked defaults are fine for our purposes: we feed it content that is
// already valid HTML block markup, which CommonMark/marked pass through
// unchanged. We disable a couple of options that could otherwise mutate
// raw HTML (smart punctuation, etc.).
marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Replace every {{token}} in `template` using the flat `data` map (dot-path keys -> string). Throws on unresolved tokens so mistakes are caught at build time. */
function render(template, data) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (full, key) => {
    if (!(key in data)) {
      throw new Error(`Unresolved template token {{${key}}} — no value provided in content data.`);
    }
    return data[key];
  });
}

function formatDateEs(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`;
}

function escapeJsonLdString(str) {
  // Values are embedded inside a JSON.stringify'd object below, so no
  // manual escaping is needed here — kept as a no-op passthrough for clarity
  // at call sites.
  return str;
}

/* ─────────────────────────── 1) content/home.json -> index.html ─────────────────────────── */

function buildHome() {
  const homeData = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/home.json'), 'utf8'));
  const template = fs.readFileSync(path.join(ROOT, 'templates/index.html'), 'utf8');
  const data = {
    'home.hero.headline': homeData.hero.headline,
    'home.hero.subheadline': homeData.hero.subheadline,
    'home.hero.cta': homeData.hero.cta,
  };
  const out = render(template, data);
  fs.writeFileSync(path.join(ROOT, 'index.html'), out);
  console.log('✓ index.html');
}

/* ─────────────────────────── 2) content/precios.json -> precios/index.html ─────────────────────────── */

function buildPrecios() {
  // content/precios.json currently holds the base pricing values purely as
  // an editorial reference (see its _readme field): assets/js/pricing-logic.js
  // must stay byte-for-byte untouched, and the current static
  // templates/precios/index.html has no literal price text to substitute
  // (the page computes everything at runtime via pricing-logic.js), so
  // there are no {{precios.*}} tokens to resolve yet. We still read the
  // file and run it through the same render() pipeline for consistency and
  // to fail loudly if a token is ever added to the template without a
  // matching value here.
  const preciosData = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/precios.json'), 'utf8'));
  const template = fs.readFileSync(path.join(ROOT, 'templates/precios/index.html'), 'utf8');
  const data = {}; // no tokens defined in templates/precios/index.html today
  void preciosData;
  const out = render(template, data);
  fs.mkdirSync(path.join(ROOT, 'precios'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'precios/index.html'), out);
  console.log('✓ precios/index.html');
}

/* ─────────────────────────── 3) content/blog/*.md -> blog/<slug>/index.html ─────────────────────────── */

function renderFaqSection(faq) {
  if (!faq || !faq.length) return '';
  const items = faq.map(({ question, answer }) => (
    '    <div class="faq-item">\n' +
    `      <p class="faq-q">${question}</p>\n` +
    `      <p class="faq-a">${answer}</p>\n` +
    '    </div>'
  )).join('\n');
  return '  <h2>Preguntas frecuentes</h2>\n  <div class="faq">\n' + items + '\n  </div>';
}

function renderFaqJsonLd(faq) {
  if (!faq || !faq.length) return '';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ question, answer }) => ({
      '@type': 'Question',
      name: escapeJsonLdString(question),
      acceptedAnswer: { '@type': 'Answer', text: escapeJsonLdString(answer) },
    })),
  };
  return `<script type="application/ld+json">\n${JSON.stringify(jsonLd, null, 2)}\n</script>\n`;
}

function buildBlogPosts() {
  const blogContentDir = path.join(ROOT, 'content/blog');
  const template = fs.readFileSync(path.join(ROOT, 'templates/blog/_post.html'), 'utf8');
  const files = fs.readdirSync(blogContentDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const slug = file.replace(/\.md$/, '');
    const raw = fs.readFileSync(path.join(blogContentDir, file), 'utf8');
    const { data: fm, content } = matter(raw);

    const faqSection = renderFaqSection(fm.faq);
    const faqJsonLd = renderFaqJsonLd(fm.faq);

    // Inject the rendered FAQ HTML in place of the {{post.faq}} marker
    // BEFORE running marked(), so marked only ever sees raw HTML block
    // content (never wraps our marker text in a stray <p>).
    const markdownSource = content.replace('{{post.faq}}', faqSection);
    // Trim only blank *lines* at the start/end — never leading spaces on the
    // first/last content line, since the original hand-authored markup
    // indents top-level elements inside <article> by 2 spaces and that
    // indentation is part of the byte-for-byte output we're reproducing.
    const bodyHtml = marked.parse(markdownSource).replace(/^\n+/, '').replace(/\n+$/, '');

    const canonicalUrl = `https://estudiographica.com/blog/${slug}/`;

    const data = {
      'post.pageTitle': fm.pageTitle,
      'post.description': fm.description,
      'post.canonicalUrl': canonicalUrl,
      'post.ogTitle': fm.ogTitle,
      'post.ogDescription': fm.ogDescription,
      'post.cover': fm.cover,
      'post.date': fm.date,
      'post.dateModified': fm.dateModified,
      'post.twitterTitle': fm.twitterTitle,
      'post.ldHeadline': fm.ldHeadline,
      'post.ldDescription': fm.ldDescription,
      'post.faqJsonLd': faqJsonLd,
      'post.title': fm.title,
      'post.breadcrumb': fm.breadcrumb,
      'post.eyebrow': fm.eyebrow,
      'post.dateFormatted': formatDateEs(fm.date),
      'post.readingTime': fm.readingTime,
      'post.heroAlt': fm.heroAlt,
      'post.bodyHtml': bodyHtml,
      'post.contentName': fm.contentName,
      'post.slug': slug,
    };

    const out = render(template, data);
    const outDir = path.join(ROOT, 'blog', slug);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), out);
    console.log(`✓ blog/${slug}/index.html`);
  }
}

function main() {
  buildHome();
  buildPrecios();
  buildBlogPosts();
}

main();
