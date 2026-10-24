/* Movimiento del menú de Magma Wings.
   Adaptado del sistema de Estudio Graphica (assets/js/eg-ui.js): mismas ideas, sin depender del sitio.
   Si este archivo falla, el menú sigue entero y usable: todo es visible por defecto y el JS solo lo anima.

   1. Entrada al hacer scroll (.rv): blur + subida, con retraso escalonado (--d).
   2. Título palabra por palabra ([data-words]); el resaltado (.mark) entra como una sola palabra.
   3. Navegación de vidrio: barra de progreso, tono claro u oscuro según la sección que tiene debajo y enlace activo.
   4. Botones .btn con atracción magnética sutil (solo mouse).
   5. Foco de luz que sigue al puntero ([data-spot]) y brillo de cristal (.shine).
   6. Paralaje suave en las fotos ([data-img-par]).
   API: window.MagmaMotion.refresh() vuelve a leer el DOM; .reduce indica si el visitante pidió menos movimiento. */
(function () {
  'use strict';

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  var vh = window.innerHeight;
  var ticking = false;
  var nav = null, tones = [], imgs = [], spots = [], sections = [];
  var lockUntil = 0;

  function req() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('resize', function () { vh = window.innerHeight; req(); });

  /* 1. Entrada al hacer scroll */
  function armReveals() {
    var rvs = $$('.rv:not(.is-armed):not(.is-seen)');
    if (!rvs.length) return;
    if (reduce || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-seen'); io.unobserve(en.target); } });
    }, { threshold: 0.08, rootMargin: '0px 0px 4% 0px' });
    rvs.forEach(function (e) { e.classList.add('is-armed'); io.observe(e); });
  }

  /* 2. Título palabra por palabra */
  function splitWords(el) {
    if (!el || el.__split) return;
    el.__split = true;
    var n = 0;
    function walk(node) {
      [].slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            var s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--i', n++); s.textContent = p; frag.appendChild(s);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') {
          if (c.classList.contains('mark')) {
            var w = document.createElement('span'); w.className = 'w'; w.style.setProperty('--i', n++);
            node.replaceChild(w, c); w.appendChild(c);
          } else walk(c);
        }
      });
    }
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
    $$('.w', el).forEach(function (w) { w.setAttribute('aria-hidden', 'true'); });
  }

  /* 4. Botones magnéticos */
  function magnetic() {
    if (!fine || reduce) return;
    $$('.btn:not([data-mag])').forEach(function (b) {
      b.setAttribute('data-mag', '1');
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        b.style.setProperty('--mx2', (((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(1) + 'px');
        b.style.setProperty('--my2', (((e.clientY - r.top) / r.height - 0.5) * 6).toFixed(1) + 'px');
      });
      b.addEventListener('pointerleave', function () { b.style.removeProperty('--mx2'); b.style.removeProperty('--my2'); });
    });
  }

  /* 5. Foco de luz y brillo de cristal */
  function pointerSpots() {
    spots = $$('[data-spot]');
    if (!spots.length || reduce || !fine) return;
    window.addEventListener('pointermove', function (e) {
      spots.forEach(function (s) {
        var r = s.getBoundingClientRect(), sp = $('.spot', s);
        if (!sp) return;
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          sp.style.setProperty('--sx', (e.clientX - r.left) + 'px');
          sp.style.setProperty('--sy', (e.clientY - r.top) + 'px');
          sp.style.setProperty('--so', 1);
        } else sp.style.setProperty('--so', 0);
      });
    }, { passive: true });
  }
  function shine() {
    if (!fine || reduce) return;
    $$('.shine:not([data-sh])').forEach(function (g) {
      g.setAttribute('data-sh', '1');
      g.addEventListener('pointermove', function (e) {
        var r = g.getBoundingClientRect();
        g.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        g.style.setProperty('--my', (e.clientY - r.top) + 'px');
        g.style.setProperty('--hl', 1);
      });
      g.addEventListener('pointerleave', function () { g.style.removeProperty('--hl'); });
    });
  }

  /* 3. Navegación de vidrio */
  function navFrame(y) {
    if (!nav) return;
    var mx = document.documentElement.scrollHeight - vh;
    nav.style.setProperty('--sp', (mx > 0 ? clamp(y / mx, 0, 1) : 0).toFixed(4));
    var cy = nav.offsetTop + nav.offsetHeight / 2 + 4, light = false, current = null;
    tones.forEach(function (s) {
      var r = s.getBoundingClientRect();
      if (r.top <= cy && r.bottom >= cy && s.getAttribute('data-tone') === 'light') light = true;
    });
    nav.classList.toggle('on-light', light);
    if (Date.now() < lockUntil) return;
    sections.forEach(function (s) {
      var r = s.getBoundingClientRect();
      if (r.top <= vh * 0.45 && r.bottom > vh * 0.45) current = s.id;
    });
    $$('.nav-links a', nav).forEach(function (a) {
      var on = a.getAttribute('href') === '#' + current;
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }

  /* 6. Paralaje de fotos */
  function frame() {
    ticking = false;
    var y = window.scrollY;
    navFrame(y);
    if (reduce) return;
    imgs.forEach(function (e) {
      var box = e.parentElement.getBoundingClientRect();
      if (box.bottom < 0 || box.top > vh) return;
      var k = parseFloat(e.getAttribute('data-img-par')) || 0.07, p = (box.top + box.height / 2 - vh / 2) / vh;
      e.style.transform = 'translate3d(0,' + (-clamp(p, -1, 1) * k * box.height * 0.5).toFixed(1) + 'px,0) scale(1.08)';
    });
  }

  function collect() {
    imgs = $$('[data-img-par]');
    tones = $$('[data-tone]');
    sections = $$('main .prod');
  }

  function init() {
    nav = $('#nav');
    collect(); armReveals(); magnetic(); pointerSpots(); shine();
    $$('[data-words]').forEach(function (el) { if (!reduce) splitWords(el); });
    window.addEventListener('scroll', req, { passive: true });
    frame();
    setTimeout(frame, 400);
    window.addEventListener('load', req);
  }

  window.MagmaMotion = {
    reduce: reduce,
    fine: fine,
    lockSpy: function (ms) { lockUntil = Date.now() + ms; },
    refresh: function () { collect(); armReveals(); magnetic(); shine(); req(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
