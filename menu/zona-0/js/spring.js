/* Resortes y gestos de Zona 0, con la idea de Apple: respuesta y amortiguación en vez de duración,
   arrancar siempre desde el valor actual, heredar la velocidad del dedo y poder agarrar el movimiento en pleno vuelo.
   damping 1 = sin rebote. Menos de 1 = rebote, solo cuando el gesto traía impulso. */
(function (root) {
  'use strict';
  var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Mueve un valor numérico hacia "to". Devuelve un objeto con stop() y el valor vivo en .value */
  function spring(from, to, o, onUpdate, onDone) {
    o = o || {};
    var response = o.response || 0.4, damping = o.damping == null ? 1 : o.damping;
    var k = Math.pow(2 * Math.PI / response, 2), c = 4 * Math.PI * damping / response;
    var s = { value: from, velocity: o.velocity || 0, stopped: false, stop: function () { s.stopped = true; } };
    if (reduce) { s.value = to; onUpdate(to); if (onDone) onDone(); return s; }
    var last = performance.now();
    function frame(now) {
      if (s.stopped) return;
      var dt = Math.min(0.032, (now - last) / 1000); last = now;
      var steps = Math.max(1, Math.ceil(dt / 0.004)), h = dt / steps;
      for (var i = 0; i < steps; i++) {
        var a = -k * (s.value - to) - c * s.velocity;
        s.velocity += a * h; s.value += s.velocity * h;
      }
      onUpdate(s.value);
      if (Math.abs(s.value - to) < 0.3 && Math.abs(s.velocity) < 4) { s.value = to; onUpdate(to); s.stopped = true; if (onDone) onDone(); return; }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return s;
  }

  /* Hacia dónde llegaría el gesto si siguiera con su inercia (px/s -> px). */
  function project(v, rate) { rate = rate || 0.998; return (v / 1000) * rate / (1 - rate); }

  /* Resistencia progresiva pasado el borde. */
  function rubber(over, dim, c) { c = c || 0.55; return (over * dim * c) / (dim + c * Math.abs(over)); }

  /* Hoja inferior arrastrable. el = la hoja, scrim = el fondo oscuro, handle = zona desde donde se agarra.
     Devuelve { open(), close(), isOpen }. */
  function sheet(el, scrim, handle, opts) {
    opts = opts || {};
    var h = 0, y = 0, anim = null, openState = false, drag = null;
    function apply(v) {
      y = v; el.style.transform = 'translate3d(0,' + v.toFixed(1) + 'px,0)';
      if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(1, 1 - v / (h || 1))));
    }
    function go(to, vel, damping) {
      if (anim) anim.stop();
      anim = spring(y, to, { response: 0.42, damping: damping == null ? 1 : damping, velocity: vel || 0 }, apply, function () {
        if (to >= h) { el.hidden = true; if (scrim) scrim.hidden = true; el.classList.remove('is-open'); if (opts.onClosed) opts.onClosed(); }
      });
    }
    function open() {
      if (openState) return;
      openState = true; el.hidden = false; if (scrim) scrim.hidden = false;
      h = el.offsetHeight + 40; apply(h); void el.offsetHeight; el.classList.add('is-open');
      go(0, 0, 0.86);
      if (opts.onOpen) opts.onOpen();
    }
    function close(vel) {
      if (!openState) return;
      openState = false; h = el.offsetHeight + 40; go(h, vel || 0, 1);
    }
    var pts = [];
    handle.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      if (anim) anim.stop();
      h = el.offsetHeight + 40; drag = { y0: e.clientY, base: y }; pts = [{ t: e.timeStamp, y: e.clientY }];
      handle.setPointerCapture(e.pointerId); el.classList.add('is-drag');
    });
    handle.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var d = e.clientY - drag.y0 + drag.base;
      apply(d < 0 ? -rubber(-d, 300) : d);
      pts.push({ t: e.timeStamp, y: e.clientY }); if (pts.length > 6) pts.shift();
    });
    function end(e) {
      if (!drag) return; drag = null; el.classList.remove('is-drag');
      var a = pts[0], b = pts[pts.length - 1], v = a && b && b.t > a.t ? (b.y - a.y) / (b.t - a.t) * 1000 : 0;
      var target = y + project(v);
      if (target > h * 0.5) { openState = false; go(h, v, 1); } else go(0, v, Math.abs(v) > 300 ? 0.82 : 1);
    }
    handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    if (scrim) scrim.addEventListener('pointerdown', function () { close(); });
    return { open: open, close: close, get isOpen() { return openState; } };
  }

  /* Respuesta inmediata: el botón se hunde al tocar, no al soltar. */
  function press(root_) {
    (root_ || document).addEventListener('pointerdown', function (e) {
      var t = e.target.closest && e.target.closest('[data-press]');
      if (!t) return;
      t.classList.add('is-pressed');
      var off = function () { t.classList.remove('is-pressed'); window.removeEventListener('pointerup', off); window.removeEventListener('pointercancel', off); };
      window.addEventListener('pointerup', off); window.addEventListener('pointercancel', off);
    }, { passive: true });
  }

  root.Z0Spring = { spring: spring, project: project, rubber: rubber, sheet: sheet, press: press, reduce: reduce };
})(window);
