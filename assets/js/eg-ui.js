/**
 * eg-ui.js | Estudio Graphica
 * Comportamientos visuales compartidos por todas las páginas. NO toca el
 * tracking ni los datos: solo anima. Si este archivo falla o no carga, el
 * sitio sigue funcionando (todo queda visible y usable, sin animaciones).
 *
 * Lo que hace, en orden:
 *  1. Entrada al hacer scroll para todo lo que tenga .rv (blur + subida).
 *  2. Navegación de vidrio: cambia a oscuro sobre secciones .s-ink / .foot
 *     y dibuja una barra de progreso de lectura en su borde inferior.
 *  3. Botones .btn con atracción magnética sutil (solo mouse).
 *  4. Foco de luz que sigue al puntero en secciones [data-spot].
 *  5. Brillo de cristal e inclinación 3D en tarjetas .shine / [data-tilt].
 *  6. Paralaje suave en [data-par] y [data-img-par].
 *  7. Relleno de las barras deslizantes (input[type=range]).
 *  8. Texto que se divide en palabras para animar el título ([data-words]).
 *
 * API pública mínima (para los scripts propios de cada página):
 *   window.EGUI.onFrame(fn)  → fn(scrollY, viewportHeight) en cada cuadro de scroll
 *   window.EGUI.reduce       → true si el visitante pidió menos movimiento
 *   window.EGUI.refresh()    → vuelve a leer elementos (después de pintar contenido dinámico)
 */
(function () {
  'use strict';

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };

  var vh = window.innerHeight;
  var ticking = false;
  var frameFns = [];
  var nav, darkEls = null, pars = [], imgs = [], spots = [];

  function req() { if (!ticking) { ticking = true; requestAnimationFrame(frame); } }
  window.addEventListener('resize', function () { vh = window.innerHeight; darkEls = null; req(); });

  /* ---------- 1. Entrada al hacer scroll ---------- */
  function armReveals() {
    // las tarjetas del blog las genera el panel con un marcado fijo, así que el reveal se les pone aquí
    $$('.posts .post-card:not(.rv)').forEach(function (c) { c.classList.add('rv'); });
    var rvs = $$('.rv:not(.is-armed):not(.is-seen)');
    if (!rvs.length) return;
    if (reduce || !('IntersectionObserver' in window)) return; // visibles por defecto
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-seen'); io.unobserve(en.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px 4% 0px' });
    rvs.forEach(function (e) { e.classList.add('is-armed'); io.observe(e); });
  }

  /* ---------- 2. Navegación ---------- */
  function navFrame(y) {
    if (!nav) return;
    var mx = document.documentElement.scrollHeight - vh;
    nav.style.setProperty('--sp', (mx > 0 ? clamp(y / mx, 0, 1) : 0).toFixed(4));
    if (!darkEls) darkEls = $$('.s-ink,.foot');
    var cy = nav.offsetTop + nav.offsetHeight / 2 + 4, dark = false;
    for (var i = 0; i < darkEls.length; i++) {
      var r = darkEls[i].getBoundingClientRect();
      if (r.top <= cy && r.bottom >= cy) { dark = true; break; }
    }
    nav.classList.toggle('on-dark', dark);
  }

  /* ---------- 3. Botones magnéticos ---------- */
  function magnetic() {
    if (!fine || reduce) return;
    $$('.btn:not([data-mag])').forEach(function (b) {
      b.setAttribute('data-mag', '1');
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        b.style.setProperty('--mx2', (x * 8).toFixed(1) + 'px');
        b.style.setProperty('--my2', (y * 6).toFixed(1) + 'px');
      });
      b.addEventListener('pointerleave', function () {
        b.style.removeProperty('--mx2'); b.style.removeProperty('--my2');
      });
    });
  }

  /* ---------- 4. Foco de luz ---------- */
  function pointerSpots() {
    spots = $$('[data-spot]');
    if (!spots.length || reduce) return;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
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

  /* ---------- 5. Brillo de cristal e inclinación ---------- */
  function shine() {
    $$('.shine:not([data-sh])').forEach(function (g) {
      g.setAttribute('data-sh', '1');
      var isCard = g.hasAttribute('data-card');
      var tiltEl = isCard ? g.firstElementChild : (g.hasAttribute('data-tilt') ? g : null);
      g.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var r = g.getBoundingClientRect();
        g.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        g.style.setProperty('--my', (e.clientY - r.top) + 'px');
        g.style.setProperty('--hl', 1);
        if (tiltEl && !reduce) {
          var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          if (isCard) { tiltEl.style.setProperty('--tx', (x * 9).toFixed(2) + 'deg'); tiltEl.style.setProperty('--ty', (-y * 9).toFixed(2) + 'deg'); }
          else g.style.transform = 'perspective(900px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 6).toFixed(2) + 'deg)';
        }
      });
      g.addEventListener('pointerleave', function () {
        g.style.removeProperty('--hl');
        if (isCard && tiltEl) { tiltEl.style.setProperty('--tx', '0deg'); tiltEl.style.setProperty('--ty', '0deg'); }
        else if (g.hasAttribute('data-tilt')) g.style.transform = '';
      });
    });
  }

  /* ---------- 7. Relleno de barras deslizantes ---------- */
  function fillRange(el) {
    var min = parseFloat(el.min || 0), max = parseFloat(el.max || 100), v = parseFloat(el.value || 0);
    var p = max > min ? ((v - min) / (max - min)) * 100 : 0;
    el.style.setProperty('--rp', p.toFixed(2) + '%');
  }
  function ranges() {
    $$('input[type=range]:not([data-rp])').forEach(function (el) {
      el.setAttribute('data-rp', '1');
      fillRange(el);
      el.addEventListener('input', function () { fillRange(el); });
      el.addEventListener('change', function () { fillRange(el); });
    });
  }
  // Algunos scripts de página cambian .value por código (restaurar paquete): se repinta al cargar y al cambiar de pestaña.
  function syncRanges() { $$('input[type=range]').forEach(fillRange); }

  /* ---------- 8. Título palabra por palabra ---------- */
  function splitWords(el) {
    if (!el || el.__split) return;
    el.__split = true;
    var n = 0;
    function walk(node) {
      [].slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var parts = c.textContent.split(/(\s+)/), frag = document.createDocumentFragment();
          var glue = c.previousSibling && c.previousSibling.nodeType === 1 && c.previousSibling.classList.contains('w') && !/^\s/.test(c.textContent) ? c.previousSibling : null;
          parts.forEach(function (p, pi) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            // la coma o el punto pegados a un resaltado viajan con él (no quedan solos en otra línea)
            if (glue && pi === 0) { glue.appendChild(document.createTextNode(p)); return; }
            var s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--i', n++); s.textContent = p; frag.appendChild(s);
          });
          node.replaceChild(frag, c);
        } else if (c.nodeType === 1 && c.tagName !== 'BR') {
          if (c.classList.contains('mark') || c.classList.contains('eg-accent') || c.classList.contains('eg-cursive') || c.classList.contains('h1-accent') || c.classList.contains('cursive')) {
            // el resaltado queda entero: se anima como una sola palabra para que el subrayado no se parta
            var s2 = document.createElement('span'); s2.className = 'w'; s2.style.setProperty('--i', n++);
            node.replaceChild(s2, c); s2.appendChild(c);
          } else walk(c);
        }
      });
    }
    var label = el.textContent;
    el.setAttribute('aria-label', label.replace(/\s+/g, ' ').trim());
    walk(el);
    $$('.w', el).forEach(function (w) { w.setAttribute('aria-hidden', 'true'); });
  }

  /* ---------- Cuadro de scroll único ---------- */
  function frame() {
    ticking = false;
    var y = window.scrollY;
    navFrame(y);
    if (!reduce) {
      pars.forEach(function (e) {
        var r = e.parentElement.getBoundingClientRect();
        if (r.bottom < -300 || r.top > vh + 300) return;
        var k = parseFloat(e.dataset.par);
        e.style.transform = 'translate3d(0,' + ((r.top + r.height / 2 - vh / 2) * k).toFixed(1) + 'px,0)';
      });
      imgs.forEach(function (e) {
        var box = e.parentElement.getBoundingClientRect();
        if (box.bottom < 0 || box.top > vh) return;
        var k = parseFloat(e.dataset.imgPar), p = (box.top + box.height / 2 - vh / 2) / vh;
        e.style.transform = 'translate3d(0,' + (-clamp(p, -1, 1) * k * box.height * 0.5 - box.height * 0.04).toFixed(1) + 'px,0) scale(1.02)';
      });
    }
    for (var i = 0; i < frameFns.length; i++) { try { frameFns[i](y, vh); } catch (e) {} }
  }

  function collect() {
    pars = $$('[data-par]');
    imgs = $$('[data-img-par]');
  }

  function init() {
    nav = $('#nav');
    collect(); armReveals(); magnetic(); pointerSpots(); shine(); ranges();
    $$('[data-words]').forEach(function (el) { if (!reduce) splitWords(el); });
    window.addEventListener('scroll', req, { passive: true });
    frame();
    setTimeout(frame, 400);
    setTimeout(syncRanges, 60);
    window.addEventListener('load', function () { syncRanges(); req(); });
  }

  window.EGUI = {
    reduce: reduce,
    fine: fine,
    onFrame: function (fn) { frameFns.push(fn); req(); },
    requestFrame: req,
    splitWords: splitWords,
    syncRanges: syncRanges,
    refresh: function () { collect(); armReveals(); magnetic(); shine(); ranges(); req(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
