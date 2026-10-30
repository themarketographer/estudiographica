/* Impresión directa por USB a impresoras térmicas de 80 mm (comandos ESC/POS), sin pasar por el driver de Windows.
   Funciona en Chrome y Edge (WebUSB). La impresora debe usar el driver WinUSB (ver la ayuda del panel). */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.Z0Escpos = factory(); })(this, function () {
  var COLS = 48;
  var CP858 = { 'á': 0xA0, 'í': 0xA1, 'ó': 0xA2, 'ú': 0xA3, 'ñ': 0xA4, 'Ñ': 0xA5, 'é': 0x82, 'ü': 0x81, 'Ü': 0x9A, 'É': 0x90, 'Á': 0xB5, 'Í': 0xD6, 'Ó': 0xE0, 'Ú': 0xE9, '¿': 0xA8, '¡': 0xAD, '·': 0xFA, '×': 0x78, '–': 0x2D, '—': 0x2D, '“': 0x22, '”': 0x22, '’': 0x27, '‘': 0x27 };
  var ESC = 0x1B, GS = 0x1D, LF = 0x0A;

  function enc(str) {
    var out = [], s = String(str == null ? '' : str);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], c = s.charCodeAt(i);
      if (CP858[ch] != null) out.push(CP858[ch]); else if (c >= 32 && c < 127) out.push(c); else if (c === 10) out.push(LF); else out.push(0x3F);
    }
    return out;
  }
  function padRight(a, b, w) { a = String(a); b = String(b); var gap = w - a.length - b.length; if (gap < 1) { a = a.slice(0, Math.max(1, w - b.length - 1)); gap = w - a.length - b.length; } return a + new Array(gap + 1).join(' ') + b; }
  function wrap(text, w) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (x) {
      while (x.length > w) { if (cur) { lines.push(cur); cur = ''; } lines.push(x.slice(0, w)); x = x.slice(w); }
      if (!cur) cur = x; else if ((cur + ' ' + x).length <= w) cur += ' ' + x; else { lines.push(cur); cur = x; }
    });
    if (cur) lines.push(cur); return lines;
  }

  /* ctx: { hm(iso), fmtPhone(p), money(n), payText(o), modeName(o), split(id) -> [numero, resto] } */
  function build(o, ctx, cols) {
    var W = cols || COLS, b = [];
    var raw = function () { for (var i = 0; i < arguments.length; i++) b.push(arguments[i]); };
    var text = function (t) { Array.prototype.push.apply(b, enc(t)); };
    var line = function (t) { text(t); raw(LF); };
    var align = function (n) { raw(ESC, 0x61, n); };           // 0 izq, 1 centro
    var size = function (n) { raw(GS, 0x21, n); };             // 0x00 normal, 0x11 doble, 0x01 alto doble
    var bold = function (on) { raw(ESC, 0x45, on ? 1 : 0); };
    var rule = function () { line(new Array(W + 1).join('-')); };
    var cu = o.customer || {};

    raw(ESC, 0x40);                 // reiniciar
    raw(ESC, 0x74, 19);             // tabla CP858 (acentos)
    align(1); bold(true); size(0x11); line('Zona 0'); size(0); bold(false); line('Cafe Boutique'); align(0); rule();
    align(1);
    if (o.orderId) { var n = ctx.split(o.orderId); bold(true); size(0x11); line('#' + n[0]); size(0); bold(false); line(n[1] + ' - ' + ctx.hm(o.createdAt)); }
    else { bold(true); size(0x11); line('MESA ' + (cu.mesa || '')); size(0); bold(false); line('Cuenta - ' + ctx.hm(o.createdAt)); }
    align(0); rule();
    wrap(ctx.modeName(o), W).forEach(line);
    if (o.mozo) line('Atendio: ' + o.mozo);
    if (cu.phone) line(ctx.fmtPhone(cu.phone));
    if (o.mode === 'delivery') wrap((cu.zoneName ? cu.zoneName + '. ' : '') + (cu.address || ''), W).forEach(line);
    rule();
    (o.lines || []).forEach(function (l) {
      var left = l.qty + ' x ' + l.name, right = String(l.total), room = W - right.length - 1, ls = wrap(left, room);
      ls.forEach(function (t, i) { line(i === 0 ? padRight(t, right, W) : t); });
      (l.choices || []).forEach(function (ch) { wrap('  ' + ch.label + ': ' + ch.options.map(function (x) { return x.name; }).join(', '), W).forEach(line); });
      if (l.note) wrap('  Nota: ' + l.note, W).forEach(line);
    });
    if (o.deliveryFee) line(padRight('Envio', String(o.deliveryFee), W));
    if (o.discount) line(padRight('Descuento', '-' + o.discount, W));
    rule();
    bold(true); size(0x01); line(padRight('TOTAL', ctx.money(o.total), W)); size(0); bold(false);
    align(1); line(ctx.payText(o)); align(0);
    if (cu.notes) { rule(); wrap('Notas: ' + cu.notes, W).forEach(line); }
    rule(); align(1); line('Gracias por rodar con nosotros'); align(0);
    raw(LF, LF, LF, LF);
    raw(GS, 0x56, 0x42, 0x00);      // avanzar y cortar (si la impresora no corta, lo ignora)
    return new Uint8Array(b);
  }

  /* ---------- WebUSB ---------- */
  var dev = null, ep = null, ifc = null;
  function supported() { return typeof navigator !== 'undefined' && !!navigator.usb; }
  function findOut(d) {
    var cfgs = d.configurations || [], best = null;
    cfgs.forEach(function (c) { c.interfaces.forEach(function (i) { i.alternates.forEach(function (a) {
      a.endpoints.forEach(function (e) { if (e.direction === 'out' && e.type === 'bulk') { var sc = a.interfaceClass === 7 ? 2 : 1; if (!best || sc > best.sc) best = { ifc: i.interfaceNumber, alt: a.alternateSetting, ep: e.endpointNumber, cfg: c.configurationValue, sc: sc }; } });
    }); }); });
    return best;
  }
  function open(d) {
    var f = findOut(d); if (!f) return Promise.reject(new Error('Esa impresora no tiene salida de datos USB.'));
    return d.open().then(function () { return d.configuration ? null : d.selectConfiguration(f.cfg); })
      .then(function () { return d.claimInterface(f.ifc); })
      .then(function () { return f.alt ? d.selectAlternateInterface(f.ifc, f.alt) : null; })
      .then(function () { dev = d; ep = f.ep; ifc = f.ifc; return d; });
  }
  function connect(forcePick) {
    if (dev && dev.opened && !forcePick) return Promise.resolve(dev);
    var get = forcePick ? Promise.resolve([]) : navigator.usb.getDevices();
    return get.then(function (list) { return list.length ? list[0] : navigator.usb.requestDevice({ filters: [] }); })
      .then(open).catch(function (e) {
        var m = String((e && e.message) || e);
        if (e && e.name === 'NotFoundError') throw new Error('No elegiste ninguna impresora.');
        if (/access denied|claim|SecurityError|NetworkError|busy/i.test(m)) throw new Error('Windows no deja usar la impresora desde el navegador. Falta cambiar su driver a WinUSB (ver los pasos de ayuda).');
        throw e;
      });
  }
  function send(bytes) {
    var i = 0;
    function next() { if (i >= bytes.length) return Promise.resolve(); var chunk = bytes.slice(i, i + 4096); i += 4096; return dev.transferOut(ep, chunk).then(next); }
    return next();
  }
  function print(o, ctx, cols) {
    if (!supported()) return Promise.reject(new Error('Este navegador no permite imprimir directo. Usa Chrome o Edge.'));
    var data = build(o, ctx, cols);
    return connect().then(function () { return send(data); }).catch(function (e) { dev = null; throw e; });
  }
  function forget() { var d = dev; dev = null; return d && d.opened ? d.close().catch(function () {}) : Promise.resolve(); }
  return { build: build, enc: enc, print: print, connect: connect, supported: supported, forget: forget };
});
