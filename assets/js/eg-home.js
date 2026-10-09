/**
 * eg-home.js | Estudio Graphica
 * Todo lo que hace la página de inicio, en un solo archivo:
 *
 *  A) RENDER: arma el HTML de cada sección a partir de los arreglos que edita
 *     el panel (landingHero, landingCopy, marcas, proceso, promesa,
 *     portafolio, faqs, heroFotos, planMeses). El index.html trae ese mismo
 *     HTML ya escrito (para buscadores y lectores de IA que no ejecutan JS) y
 *     una "huella" de los datos: si el panel cambia un arreglo, la huella ya
 *     no coincide y este archivo repinta la sección con los datos nuevos.
 *
 *  B) COMPORTAMIENTO: carrusel del hero, marcas arrastrables, texto que se
 *     enciende al hacer scroll, comparador, tarjetas 3D, portafolio con
 *     lightbox, preguntas frecuentes y botón fijo del celular.
 *
 *  Este archivo NO toca el tracking: eso vive en el script de eventos al
 *  final de index.html y en assets/js/tracking.js.
 *
 *  También funciona en Node (module.exports) para generar el HTML estático
 *  al construir la página.
 */
(function (root) {
  'use strict';

  /* ======================================================================
     A) RENDER
     ====================================================================== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Optimiza al vuelo fotos de Cloudinary (ancho, calidad y formato automáticos).
  function egOpt(url, w) {
    if (!url || url.indexOf('/image/upload/') === -1 || url.indexOf('f_auto') !== -1) return url;
    return url.replace('/image/upload/', '/image/upload/c_limit,w_' + (w || 1100) + ',q_auto,f_auto/');
  }
  // Logos de marcas: recorta el margen transparente, los centra en un cuadrado
  // blanco y los pasa a escala de grises para que todos se vean parejos.
  function egLogo(url) {
    var m = '/image/upload/';
    if (!url) return url;
    var i = url.indexOf(m);
    if (i === -1) return url;
    var rest = url.slice(i + m.length).replace(/^(?:[a-z]{1,3}_[^/]+\/)+/, '');
    return url.slice(0, i + m.length) + 'e_trim/c_fit,w_230,h_230/c_lpad,w_320,h_320,b_white/e_grayscale/q_auto,f_auto/' + rest;
  }
  var ARROW = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h12M10 4l5 5-5 5"/></svg>';
  var ICONS = {
    menu: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5C6.5 4 9.5 4 12 5.5v14C9.5 18 6.5 18 4 19.5z"/><path d="M20 5.5C17.5 4 14.5 4 12 5.5v14c2.5-1.5 5.5-1.5 8 0z"/></svg>',
    historias: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><circle cx="12" cy="12" r="3"/><path d="M10.5 5.5h3"/></svg>',
    redes: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    anuncios: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9.5a4 4 0 0 1 0 5"/><path d="M7 14l1 5h2.5l-1-4.5"/></svg>',
    whatsapp: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1.2-4A8 8 0 1 1 8 18.8z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/></svg>',
    delivery: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="17" r="2.5"/><circle cx="18" cy="17" r="2.5"/><path d="M8.5 17H14l2-8h2.5"/><path d="M5 12h7l-1 5"/><path d="M13 6h3"/></svg>',
    web: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/></svg>',
    banners: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="11" rx="2"/><path d="M8 21l1.5-5M16 21l-1.5-5"/></svg>'
  };
  function first(a) { return (a && a[0]) || {}; }
  function oneLine(s) { return esc(String(s == null ? '' : s).replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim()); }

  var R = {
    heroTitle: function (d) { return first(d.landingHero).titulo || ''; },
    heroSub: function (d) { return esc(first(d.landingHero).subtitulo || ''); },
    heroStats: function (d) {
      var h = first(d.landingHero), out = [];
      [1, 2, 3].forEach(function (n) {
        var v = h['statValor' + n], l = h['statLabel' + n];
        if (v == null || v === '') return;
        out.push('<span class="stat"><b data-count="' + esc(v) + '">' + esc(v) + '</b> ' + oneLine(l) + '</span>');
      });
      return out.join('');
    },
    heroSlides: function (d) {
      return (d.heroFotos || []).map(function (f, i) {
        return '<img src="' + esc(egOpt(f.imagen, 900)) + '" alt="' + esc(f.alt) + '" width="760" height="950"' +
          (i === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async">';
      }).join('');
    },
    heroDots: function (d) { return (d.heroFotos || []).map(function () { return '<i></i>'; }).join(''); },
    logos: function (d) {
      return (d.marcas || []).map(function (m) {
        return '<img src="' + esc(egLogo(m.logo)) + '" alt="' + esc(m.nombre) + '" width="176" height="176" loading="lazy" decoding="async" draggable="false">';
      }).join('');
    },
    formats: function (d) {
      return (d.promesa || []).map(function (p) {
        var ic = ICONS[p.icono] || (p.icono ? '<span class="fmt-emoji">' + esc(p.icono) + '</span>' : ICONS.menu);
        return '<li><span class="fmt-ico" aria-hidden="true">' + ic + '</span><span class="fmt-t">' + esc(p.titulo) + '</span><span class="fmt-d">' + esc(p.detalle) + '</span></li>';
      }).join('');
    },
    plan: function (d) {
      return (d.planMeses || []).map(function (c) {
        return '<article class="mcard shine" data-card data-snap><div class="in"><figure><img src="' + esc(egOpt(c.imagen, 700)) + '" alt="' + esc(c.alt) + '" width="700" height="714" loading="lazy" decoding="async"></figure><div class="mcard-b"><span class="pill">' + esc(c.mes) + '</span><h3>' + esc(c.titulo) + '</h3><p>' + esc(c.texto) + '</p></div></div></article>';
      }).join('');
    },
    rail: function (d) {
      return (d.portafolio || []).map(function (p, i) {
        return '<figure class="tile" data-snap data-idx="' + i + '" role="button" tabindex="0" aria-label="Ampliar foto: ' + esc(p.alt) + '"><img src="' + esc(egOpt(p.imagen, 800)) + '" alt="' + esc(p.alt) + '" data-img-par=".1" width="700" height="800" loading="lazy" decoding="async" draggable="false"><figcaption>' + esc(p.alt) + '</figcaption></figure>';
      }).join('');
    },
    steps: function (d) {
      return (d.proceso || []).map(function (s, i) {
        return '<li class="pstep is-on"><span class="n">' + esc(s.numero || (i + 1)) + '</span><div><h3>' + esc(s.titulo) + '</h3><p>' + esc(s.texto) + '</p></div></li>';
      }).join('');
    },
    bio1: function (d) { return first(d.landingCopy).sobreBio1 || ''; },
    bio2: function (d) { return first(d.landingCopy).sobreBio2 || ''; },
    creds: function (d) {
      var raw = first(d.landingCopy).sobreCredenciales || '';
      return String(raw).split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return '<li>' + esc(l.trim()) + '</li>'; }).join('');
    },
    badgeNum: function (d) { return esc(first(d.landingCopy).sobreBadgeNumero || ''); },
    badgeTxt: function (d) { return esc(first(d.landingCopy).sobreBadgeTexto || ''); },
    cmpBefore: function (d) { return esc(first(d.landingCopy).cmpLabelAntes || ''); },
    cmpAfter: function (d) { return esc(first(d.landingCopy).cmpLabelDespues || ''); },
    faqs: function (d) {
      return (d.faqs || []).map(function (f, i) {
        var open = i === 0;
        return '<div class="faq-i' + (open ? ' is-open' : '') + '"><h3><button class="faq-q" type="button" id="faq-q-' + i + '" aria-expanded="' + (open ? 'true' : 'false') + '" aria-controls="faq-a-' + i + '"><span>' + esc(f.q) + '</span><i class="faq-x" aria-hidden="true"></i></button></h3><div class="faq-a" id="faq-a-' + i + '" role="region" aria-labelledby="faq-q-' + i + '"><div><p>' + esc(f.a) + '</p></div></div></div>';
      }).join('');
    },
    ctaTitle: function (d) { return first(d.landingCopy).ctaTitulo || ''; },
    ctaText: function (d) { return esc(first(d.landingCopy).ctaTexto || ''); },
    ctaMicro: function (d) { return esc(first(d.landingCopy).ctaMicro || ''); },
    footer: function (d) { return first(d.landingCopy).footerCopyright || ''; }
  };

  // Mapa: id del contenedor → función que genera su HTML
  var TARGETS = {
    'eg-hero-h1': 'heroTitle', 'eg-hero-sub': 'heroSub', 'eg-hero-stats': 'heroStats',
    'slides': 'heroSlides', 'dots': 'heroDots', 'logosTrack': 'logos', 'fmt': 'formats',
    'track': 'plan', 'rail': 'rail', 'steps': 'steps',
    'eg-sobre-bio-1': 'bio1', 'eg-sobre-bio-2': 'bio2', 'eg-sobre-creds': 'creds',
    'eg-sobre-badge-num': 'badgeNum', 'eg-sobre-badge-text': 'badgeTxt',
    'eg-cmp-label-before': 'cmpBefore', 'eg-cmp-label-after': 'cmpAfter',
    'eg-faq-list': 'faqs', 'eg-cta-h2': 'ctaTitle', 'eg-cta-p': 'ctaText', 'eg-cta-micro': 'ctaMicro',
    'eg-footer-copy': 'footer'
  };
  var DATA_KEYS = ['landingHero', 'landingCopy', 'marcas', 'proceso', 'promesa', 'portafolio', 'heroFotos', 'planMeses', 'faqs'];

  function dataHash(d) {
    var s = JSON.stringify(DATA_KEYS.map(function (k) { return d[k] || null; }));
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function renderAll(d) {
    var out = {};
    Object.keys(TARGETS).forEach(function (id) { out[id] = R[TARGETS[id]](d); });
    return out;
  }

  // JSON-LD de preguntas frecuentes, siempre sincronizado con el texto visible
  function faqSchema(d) {
    return {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: (d.faqs || []).map(function (f) {
        return { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } };
      })
    };
  }

  /* ======================================================================
     B) COMPORTAMIENTO (solo navegador)
     ====================================================================== */
  function mount(d) {
    if (typeof document === 'undefined') return;
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
    var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var touchOnly = window.matchMedia && matchMedia('(hover:none)').matches;
    var vh = window.innerHeight;
    window.addEventListener('resize', function () { vh = window.innerHeight; });
    var UI = window.EGUI || { onFrame: function () {}, requestFrame: function () {} };

    /* ---- 1. Pintar los datos del panel (solo si cambiaron respecto al HTML estático) ---- */
    var body = document.body;
    if (body.getAttribute('data-eg-hash') !== dataHash(d)) {
      var html = renderAll(d);
      Object.keys(html).forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = html[id];
      });
    }
    // Esquema de preguntas frecuentes para Google y asistentes de IA
    try {
      var tag = document.getElementById('eg-faq-ld');
      if (!tag) {
        tag = document.createElement('script');
        tag.type = 'application/ld+json'; tag.id = 'eg-faq-ld';
        document.head.appendChild(tag);
      }
      if (body.getAttribute('data-eg-hash') !== dataHash(d) || !tag.textContent.trim()) tag.textContent = JSON.stringify(faqSchema(d));
    } catch (e) {}
    // Fotos del comparador y portada desde el panel
    (function () {
      var c = first(d.landingCopy);
      var a = document.getElementById('eg-cmp-img-antes'), b = document.getElementById('eg-cmp-img-despues');
      if (a && c.cmpImgAntes) { a.src = egOpt(c.cmpImgAntes, 1000); if (c.cmpImgAntesAlt != null) a.alt = c.cmpImgAntesAlt; }
      if (b && c.cmpImgDespues) { b.src = egOpt(c.cmpImgDespues, 1000); if (c.cmpImgDespuesAlt != null) b.alt = c.cmpImgDespuesAlt; }
    })();

    /* ---- Textos e imágenes sueltos de la página (editables desde el panel) ----
       Cada elemento declara qué clave lee: data-eg-t (texto), data-eg-h (texto con
       resaltados), data-eg-src / data-eg-alt (foto), data-eg-href (link) y
       data-eg-lines (una línea por viñeta). Si la clave viene vacía se deja el
       texto que ya trae el HTML, así nunca queda un hueco en la página. */
    (function () {
      var c = first(d.landingCopy), hh = first(d.landingHero);
      function val(k) { var v = c[k]; return (v == null || v === '') ? hh[k] : v; }
      function tick(n) { return '<svg width="' + n + '" height="' + n + '" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9"/></svg>'; }
      $$('[data-eg-t]').forEach(function (el) { var v = val(el.getAttribute('data-eg-t')); if (v != null && v !== '' && el.textContent !== v) el.textContent = v; });
      $$('[data-eg-h]').forEach(function (el) { var v = val(el.getAttribute('data-eg-h')); if (v != null && v !== '' && el.innerHTML !== v) el.innerHTML = v; });
      $$('[data-eg-src]').forEach(function (el) {
        var v = val(el.getAttribute('data-eg-src'));
        if (v) { var u = egOpt(v, parseInt(el.getAttribute('data-eg-w'), 10) || 900); if (el.getAttribute('src') !== u) el.src = u; }
      });
      $$('[data-eg-alt]').forEach(function (el) { var v = val(el.getAttribute('data-eg-alt')); if (v != null) el.alt = v; });
      $$('[data-eg-href]').forEach(function (el) { var v = val(el.getAttribute('data-eg-href')); if (v) el.setAttribute('href', v); });
      $$('[data-eg-lines]').forEach(function (el) {
        var v = val(el.getAttribute('data-eg-lines'));
        if (!v) return;
        var t = tick(parseInt(el.getAttribute('data-eg-tick'), 10) || 18);
        var html = String(v).split('\n').filter(function (l) { return l.trim(); }).map(function (l) { return '<li>' + t + esc(l.trim()) + '</li>'; }).join('');
        if (html && el.innerHTML !== html) el.innerHTML = html;
      });
    })();

    /* ---- 2. Hero: título palabra por palabra, números que cuentan ---- */
    var h1 = $('#eg-hero-h1');
    if (h1 && !reduce && window.EGUI) window.EGUI.splitWords(h1);

    (function () {
      var els = $$('#eg-hero-stats [data-count]');
      if (!els.length) return;
      function run(el) {
        var raw = el.getAttribute('data-count') || '';
        var m = raw.match(/^([^\d]*)(\d+)([^\d]*)$/);
        if (!m || reduce) { el.textContent = raw; return; }
        var pre = m[1], target = parseInt(m[2], 10), suf = m[3], start = null, dur = window.innerWidth <= 880 ? 700 : 1300;
        function f(ts) {
          if (start === null) start = ts;
          var p = Math.min((ts - start) / dur, 1), e = 1 - Math.pow(1 - p, 3);
          el.textContent = pre + Math.round(target * e) + suf;
          if (p < 1) requestAnimationFrame(f);
        }
        requestAnimationFrame(f);
      }
      if (!('IntersectionObserver' in window)) return;
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (en) { if (en.isIntersecting) { run(en.target); io.unobserve(en.target); } });
      }, { threshold: 0.6 });
      els.forEach(function (e) { io.observe(e); });
    })();

    /* ---- 3. Hero: carrusel tipo Instagram ---- */
    (function () {
      var plate = $('#plate'), track = $('#slides'), dots = $$('#dots i'), count = $('#count');
      if (!plate || !track || !track.children.length) return;
      var n = track.children.length, idx = 0, timer = null, vis = true, sx = null;
      function go(i) {
        idx = (i + n) % n;
        track.style.transform = 'translateX(' + (-idx * 100) + '%)';
        dots.forEach(function (dd, k) { dd.classList.toggle('on', k === idx); });
        if (count) count.textContent = (idx + 1) + '/' + n;
      }
      function play() {
        clearInterval(timer);
        if (reduce) return;
        timer = setInterval(function () { if (vis && !document.hidden) go(idx + 1); }, 3400);
      }
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; }, { threshold: 0.25 }).observe(plate);
      plate.addEventListener('pointerdown', function (e) { sx = e.clientX; });
      plate.addEventListener('pointerup', function (e) {
        if (sx === null) return;
        var dx = e.clientX - sx; sx = null;
        if (Math.abs(dx) > 40) { go(idx + (dx < 0 ? 1 : -1)); play(); }
      });
      plate.addEventListener('pointercancel', function () { sx = null; });
      go(0); play();
    })();

    /* ---- 4. Hero: el plato se inclina con puntero, dedo, giroscopio y scroll ---- */
    var hx = 0, hy = 0, plateEl = $('#plate');
    if (!reduce) {
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        hx = e.clientX / window.innerWidth - 0.5; hy = e.clientY / window.innerHeight - 0.5; UI.requestFrame();
      }, { passive: true });
      window.addEventListener('deviceorientation', function (e) {
        if (e.gamma == null) return;
        hx = clamp(e.gamma / 40, -0.5, 0.5); hy = clamp((e.beta - 50) / 80, -0.5, 0.5); UI.requestFrame();
      }, { passive: true });
      window.addEventListener('pointerdown', function (e) {
        if (e.pointerType === 'touch') { hx = e.clientX / window.innerWidth - 0.5; hy = e.clientY / window.innerHeight - 0.5; UI.requestFrame(); }
      }, { passive: true });
    }
    function heroFrame(y) {
      if (reduce || !plateEl || y > vh * 1.4) return;
      var p = clamp(y / vh, 0, 1);
      plateEl.style.setProperty('--rx', (p * 12 - hy * 10).toFixed(2) + 'deg');
      plateEl.style.setProperty('--ry', (-hx * 14 - p * 6).toFixed(2) + 'deg');
      plateEl.style.setProperty('--tx', (hx * -16).toFixed(1) + 'px');
      plateEl.style.setProperty('--ty', (p * 60).toFixed(1) + 'px');
    }

    /* ---- 5. Marcas: avance automático + arrastre con inercia ---- */
    (function () {
      var wrap = $('#logos'), trk = $('#logosTrack');
      if (!wrap || !trk) return;
      if (reduce) { wrap.classList.add('is-native'); return; }
      $$('img', trk).forEach(function (n) { var c = n.cloneNode(true); c.alt = ''; c.setAttribute('aria-hidden', 'true'); trk.appendChild(c); });
      var pos = 0, speed = 46, mult = 1, hov = false, boost = 0, dragging = false, startX = 0, startPos = 0, lastX = 0, lastT = 0, vel = 0, visible = true, last = performance.now();
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }, { threshold: 0 }).observe(wrap);
      function half() { return trk.scrollWidth / 2; }
      function norm() { var h = half(); if (h > 0) pos = ((pos % h) + h) % h; }
      function loop(now) {
        var dt = Math.min(64, now - last); last = now;
        if (visible && !document.hidden && !dragging) {
          boost *= 0.94; mult += ((hov ? 0.22 : 1) - mult) * 0.08;
          pos += (speed * mult + boost) * dt / 1000; norm();
          trk.style.transform = 'translate3d(' + (-pos) + 'px,0,0)';
        }
        requestAnimationFrame(loop);
      }
      wrap.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') hov = true; });
      wrap.addEventListener('pointerleave', function () { hov = false; });
      wrap.addEventListener('pointerdown', function (e) {
        dragging = true; wrap.classList.add('dragging'); startX = e.clientX; startPos = pos; lastX = e.clientX; lastT = performance.now(); vel = 0;
        try { wrap.setPointerCapture(e.pointerId); } catch (er) {}
      });
      wrap.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        pos = startPos - (e.clientX - startX); norm();
        trk.style.transform = 'translate3d(' + (-pos) + 'px,0,0)';
        var t = performance.now(); vel = 0.8 * vel + 0.2 * ((e.clientX - lastX) / Math.max(1, t - lastT)); lastX = e.clientX; lastT = t;
      });
      function up() { if (!dragging) return; dragging = false; wrap.classList.remove('dragging'); boost = clamp(-vel * 1000, -600, 600); }
      wrap.addEventListener('pointerup', up); wrap.addEventListener('pointercancel', up);
      requestAnimationFrame(loop);
    })();

    /* ---- 6. Manifiesto: las palabras se encienden con el scroll ---- */
    var words = [], stmt = $('#statement');
    (function () {
      if (!stmt) return;
      var out = [];
      stmt.childNodes.forEach(function (n) {
        if (n.nodeType === 3) n.textContent.trim().split(/\s+/).forEach(function (w) { if (!w) return; var sp = document.createElement('span'); sp.textContent = w; out.push(sp); });
        else if (n.nodeType === 1 && n.classList.contains('hl')) n.textContent.trim().split(/\s+/).forEach(function (w) { var sp = document.createElement('span'); sp.className = 'hl'; sp.textContent = w; out.push(sp); });
      });
      var label = stmt.textContent.replace(/\s+/g, ' ').trim();
      stmt.textContent = '';
      out.forEach(function (n) { stmt.appendChild(n); stmt.appendChild(document.createTextNode(' ')); });
      stmt.setAttribute('aria-label', label);
      words = $$('span', stmt);
      words.forEach(function (w) { w.setAttribute('aria-hidden', 'true'); });
      if (!reduce) stmt.classList.add('is-armed');
    })();

    /* ---- 7. Comparador celular vs Graphica: la línea baja con el scroll, el dedo manda si lo tocas ---- */
    var cmpBox = $('#cmp'), cmpRng = $('#cmpRange'), cmpManual = false;
    function cmpSet(v) { cmpBox.style.setProperty('--pos', v + '%'); }
    if (cmpBox && cmpRng) cmpRng.addEventListener('input', function () { cmpManual = true; cmpSet(cmpRng.value); });
    function cmpFrame() {
      if (!cmpBox || reduce) return;
      var r = cmpBox.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) { cmpManual = false; return; }
      if (cmpManual) return;
      var p = clamp((vh * 0.9 - r.top) / (vh * 0.72), 0, 1), v = 92 - 84 * p;
      cmpRng.value = v; cmpSet(v);
    }

    /* ---- 8. Arrastre con mouse + inercia, reutilizable (el dedo usa el scroll nativo) ---- */
    function dragScroll(el) {
      var drag = null, vel = 0, lastX = 0, lastT = 0;
      el.__moved = false;
      el.addEventListener('pointerdown', function (e) {
        if (e.pointerType !== 'mouse' || e.button !== 0) return;
        drag = { x: e.clientX, s: el.scrollLeft }; el.__moved = false; lastX = e.clientX; lastT = performance.now(); vel = 0;
        el.classList.add('is-drag');
        try { el.setPointerCapture(e.pointerId); } catch (er) {}
      });
      el.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var dx = e.clientX - drag.x;
        if (Math.abs(dx) > 5) el.__moved = true;
        el.scrollLeft = drag.s - dx;
        var t = performance.now(); vel = 0.8 * vel + 0.2 * ((e.clientX - lastX) / Math.max(1, t - lastT)); lastX = e.clientX; lastT = t;
      });
      function end() {
        if (!drag) return; drag = null;
        var items = $$('[data-snap]', el), c = el.getBoundingClientRect(), mid = c.left + c.width / 2, base = el.scrollLeft, target = base - vel * 420, best = base, bd = 1e9;
        items.forEach(function (k) { var r = k.getBoundingClientRect(), ctr = base + (r.left + r.width / 2 - mid), dd = Math.abs(ctr - target); if (dd < bd) { bd = dd; best = ctr; } });
        el.classList.remove('is-drag');
        el.scrollTo({ left: best, behavior: reduce ? 'auto' : 'smooth' });
        setTimeout(function () { el.__moved = false; }, 60);
      }
      el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
      el.addEventListener('click', function (e) { if (el.__moved) { e.preventDefault(); e.stopPropagation(); el.__moved = false; } }, true);
    }

    /* ---- 9. Plan de 6 meses ---- */
    var track = $('#track'), cards = $$('[data-card]'), prog = $('#prog'), prev = $('#prev'), next = $('#next');
    if (track && cards.length > 1) {
      var cardStep = function () { var a = cards[0].getBoundingClientRect(), b = cards[1].getBoundingClientRect(); return b.left - a.left; };
      if (prev) prev.addEventListener('click', function () { track.scrollBy({ left: -cardStep(), behavior: reduce ? 'auto' : 'smooth' }); });
      if (next) next.addEventListener('click', function () { track.scrollBy({ left: cardStep(), behavior: reduce ? 'auto' : 'smooth' }); });
      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); next && next.click(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); prev && prev.click(); }
      });
      dragScroll(track);
      track.addEventListener('scroll', UI.requestFrame, { passive: true });
    }

    /* ---- 10. Portafolio: avanza solo, se detiene cuando lo tocas, abre lightbox ---- */
    var rail = $('#rail');
    if (rail) {
      dragScroll(rail);
      if (!reduce) {
        var tiles = $$('.tile', rail), idx = 0, inView = false, lastScroll = 0, hold = 0;
        if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { inView = es[0].isIntersecting; }, { threshold: 0.4 }).observe(rail);
        window.addEventListener('scroll', function () { lastScroll = Date.now(); }, { passive: true });
        ['pointerdown', 'touchstart', 'wheel', 'keydown'].forEach(function (ev) { rail.addEventListener(ev, function () { hold = Date.now() + 7000; }, { passive: true }); });
        var go = function (i) { var t = tiles[i], r = t.getBoundingClientRect(), c = rail.getBoundingClientRect(); rail.scrollTo({ left: rail.scrollLeft + (r.left + r.width / 2 - (c.left + c.width / 2)), behavior: 'smooth' }); };
        setInterval(function () { var now = Date.now(); if (!inView || now < hold || now - lastScroll < 1200 || document.hidden || !tiles.length) return; idx = (idx + 1) % tiles.length; go(idx); }, 3400);
        rail.addEventListener('scroll', function () {
          var c = rail.getBoundingClientRect(), m = c.left + c.width / 2, b = 0, bd = 1e9;
          tiles.forEach(function (t, i) { var r = t.getBoundingClientRect(), dd = Math.abs(r.left + r.width / 2 - m); if (dd < bd) { bd = dd; b = i; } });
          idx = b;
        }, { passive: true });
      }
    }

    /* ---- 11. Lightbox del portafolio ---- */
    (function () {
      var lb = $('#lb'), items = $$('.tile', rail || document);
      if (!lb || !items.length) return;
      var img = $('#lb-img'), cap = $('#lb-cap'), cnt = $('#lb-count'), cur = 0, openEl = null, lastFocus = null;
      function paint() {
        var t = items[cur], im = $('img', t);
        img.classList.remove('in'); void img.offsetWidth;
        img.src = im.currentSrc || im.src; img.alt = im.alt;
        cap.textContent = im.alt; cnt.textContent = (cur + 1) + ' / ' + items.length;
        img.classList.add('in');
      }
      function open(i) {
        cur = i; lastFocus = document.activeElement; paint();
        lb.hidden = false; openEl = lb;
        requestAnimationFrame(function () { lb.classList.add('on'); });
        document.documentElement.style.overflow = 'hidden';
        $('#lb-close').focus();
      }
      function close() {
        lb.classList.remove('on'); openEl = null;
        document.documentElement.style.overflow = '';
        setTimeout(function () { lb.hidden = true; }, reduce ? 0 : 320);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
      }
      function step(k) { cur = (cur + k + items.length) % items.length; paint(); }
      items.forEach(function (t, i) {
        t.addEventListener('click', function () { if (rail && rail.__moved) return; open(i); });
        t.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
      });
      $('#lb-close').addEventListener('click', close);
      $('#lb-prev').addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
      $('#lb-next').addEventListener('click', function (e) { e.stopPropagation(); step(1); });
      lb.addEventListener('click', function (e) { if (e.target === lb || e.target.classList.contains('lb-stage')) close(); });
      document.addEventListener('keydown', function (e) {
        if (!openEl) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowRight') step(1);
        else if (e.key === 'ArrowLeft') step(-1);
        else if (e.key === 'Tab') {
          var f = $$('button', lb); if (!f.length) return;
          var a = f[0], b = f[f.length - 1];
          if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
          else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
        }
      });
      var sx = null;
      lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
      lb.addEventListener('touchend', function (e) {
        if (sx === null) return; var dx = e.changedTouches[0].clientX - sx; sx = null;
        if (Math.abs(dx) > 45) step(dx < 0 ? 1 : -1);
      });
    })();

    /* ---- 12. Preguntas frecuentes ---- */
    (function () {
      var list = $('#eg-faq-list');
      if (!list) return;
      list.addEventListener('click', function (e) {
        var btn = e.target.closest('.faq-q');
        if (!btn) return;
        var item = btn.closest('.faq-i'), open = item.classList.contains('is-open');
        $$('.faq-i', list).forEach(function (o) { o.classList.remove('is-open'); $('.faq-q', o).setAttribute('aria-expanded', 'false'); });
        if (!open) { item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
      });
    })();

    /* ---- 13. En el celular, la opción que cruza el centro de la pantalla se anima sola ---- */
    var actEls = [];
    function collectActive() { actEls = $$('#fmt li,.way'); }
    collectActive();
    function activeFrame() {
      if (!touchOnly || reduce) return;
      var mid = vh * 0.52, best = null, bd = 1e9;
      actEls.forEach(function (el) {
        var r = el.getBoundingClientRect(), c = r.top + r.height / 2, dd = Math.abs(c - mid), inBand = r.top < mid && r.bottom > mid;
        if (inBand && dd < bd) { bd = dd; best = el; }
      });
      actEls.forEach(function (el) { el.classList.toggle('is-active', el === best); });
    }

    /* ---- 14. Proceso: la línea y los pasos se llenan con el scroll ---- */
    var steps = $('#steps'), stepEls = $$('.pstep');
    if (steps && !reduce) { steps.classList.add('is-armed'); stepEls.forEach(function (s) { s.classList.remove('is-on'); }); }

    /* ---- 15. Botón fijo del celular: se esconde cuando llega el cierre ---- */
    (function () {
      var dock = $('.dock'), end = $('#agendar');
      if (!dock || !end || !('IntersectionObserver' in window)) return;
      new IntersectionObserver(function (es) { dock.classList.toggle('is-hidden', es[0].isIntersecting); }, { threshold: 0.25 }).observe(end);
    })();

    /* ---- Cuadro de scroll: todo en un solo requestAnimationFrame (vía EGUI) ---- */
    UI.onFrame(function (y, h) {
      vh = h;
      heroFrame(y);
      cmpFrame();
      activeFrame();
      if (!reduce) {
        if (stmt && words.length) {
          var sr = stmt.getBoundingClientRect(), sp = clamp((vh * 0.85 - sr.top) / (sr.height + vh * 0.35), 0, 1);
          words.forEach(function (w, i) { w.style.setProperty('--w', clamp(sp * (words.length + 3) - i, 0, 1).toFixed(3)); });
        }
        if (steps) {
          var sr2 = steps.getBoundingClientRect();
          steps.style.setProperty('--pp', clamp((vh * 0.6 - sr2.top) / sr2.height, 0, 1).toFixed(3));
          stepEls.forEach(function (s) {
            var r = s.getBoundingClientRect(), p = clamp((vh * 0.85 - r.top) / (vh * 0.3), 0, 1);
            s.style.setProperty('--p', p.toFixed(3)); s.classList.toggle('is-on', p > 0.92);
          });
        }
      }
      if (track && cards.length) {
        var c = track.getBoundingClientRect(), mid = c.left + c.width / 2, best = null, bd = 9;
        cards.forEach(function (k) {
          var r = k.getBoundingClientRect(), dd = clamp((r.left + r.width / 2 - mid) / (c.width * 0.62), -1.4, 1.4);
          k.style.setProperty('--d', dd.toFixed(3));
          if (Math.abs(dd) < bd) { bd = Math.abs(dd); best = k; }
        });
        cards.forEach(function (k) { k.classList.toggle('is-center', k === best); });
        var mx = track.scrollWidth - track.clientWidth;
        if (prog) prog.style.setProperty('--pr', (mx > 0 ? 0.17 + 0.83 * track.scrollLeft / mx : 1).toFixed(3));
        if (prev) prev.disabled = track.scrollLeft < 4;
        if (next) next.disabled = track.scrollLeft > mx - 4;
      }
    });
    if (window.EGUI) window.EGUI.refresh();
  }

  var API = { renderAll: renderAll, dataHash: dataHash, mount: mount, faqSchema: faqSchema, egOpt: egOpt, egLogo: egLogo, ICONS: ICONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.EGHome = API;
})(typeof window !== 'undefined' ? window : this);
