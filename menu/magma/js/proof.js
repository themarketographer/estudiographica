/* Pago por QR con comprobante. Lo usan el menú (al terminar el pedido) y la página de seguimiento.
   MagmaProof.mount(caja, { n:'07-24OCT', p:'0828', amount:82, status:'pendiente', qr:{image,holder,note}, onStatus })
   Reduce la foto en el navegador (máx. 1280 px, JPEG) para que suba rápido con datos móviles. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function ico(id) { var s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); var u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s; }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Sube una foto o captura de pantalla.'));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No pudimos leer esa foto. Prueba con otra.')); };
      img.src = url;
    });
  }

  function mount(box, o) {
    box.textContent = '';
    var st = o.status || 'pendiente';
    var card = el('div', 'pay pay--' + st);
    var head = el('div', 'pay-head'); head.appendChild(ico(st === 'verificado' ? 'i-check' : 'i-receipt'));
    var titles = { pendiente: 'Paga con QR', comprobante: 'Comprobante recibido', verificado: 'Pago confirmado', rechazado: 'Revisa tu comprobante' };
    head.appendChild(el('b', '', titles[st] || titles.pendiente)); card.appendChild(head);

    if (st === 'verificado') { card.appendChild(el('p', 'pay-note', 'El local confirmó tu pago. Gracias.')); box.appendChild(card); return; }
    if (st === 'comprobante') card.appendChild(el('p', 'pay-note', 'El local lo está verificando. Si te equivocaste de foto, puedes subir otra.'));
    if (st === 'rechazado') card.appendChild(el('p', 'pay-note warn', 'No pudimos confirmar tu pago con esa imagen. Sube otro comprobante o escríbenos por WhatsApp.'));

    if (st === 'pendiente' || st === 'rechazado') {
      var q = o.qr || {};
      var amt = el('div', 'pay-amt'); amt.appendChild(el('span', '', 'Monto exacto')); amt.appendChild(el('b', 'display', o.amount + ' Bs')); card.appendChild(amt);
      if (q.image) { var im = el('img', 'pay-qr'); im.src = (o.base || '') + q.image; im.alt = 'QR de pago de ' + (q.holder || 'Magma Wings'); im.width = 240; im.height = 240; card.appendChild(im); }
      if (q.holder) card.appendChild(el('p', 'pay-holder', 'A nombre de ' + q.holder));
      if (q.note) card.appendChild(el('p', 'pay-note', q.note));
    }

    if (o.noUpload) { card.appendChild(el('p', 'pay-note', 'Cuando pagues, envía la foto del comprobante por WhatsApp.')); box.appendChild(card); return; }
    var msg = el('p', 'pay-err'); msg.setAttribute('role', 'alert'); msg.hidden = true;
    var input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
    var pick = el('button', 'btn btn--block pay-pick'); pick.type = 'button'; pick.appendChild(ico('i-up')); var lab = document.createTextNode(st === 'comprobante' ? 'Subir otro comprobante' : 'Subir comprobante'); pick.appendChild(lab);
    var prev = el('img', 'pay-prev'); prev.alt = 'Vista previa del comprobante'; prev.hidden = true;
    pick.addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      var f = input.files && input.files[0]; if (!f) return;
      msg.hidden = true; pick.disabled = true; lab.nodeValue = 'Subiendo…'; pick.classList.add('is-loading');
      shrink(f).then(function (data) {
        prev.src = data; prev.hidden = false;
        return fetch('/api/magma/proof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ n: o.n, p: o.p, image: data }) })
          .then(function (r) { return r.json().then(function (d) { if (!d.ok) throw new Error(d.error || 'No pudimos subir el comprobante.'); return d; }); });
      }).then(function (d) {
        if (o.onStatus) o.onStatus(d.status || 'comprobante');
        mount(box, Object.assign({}, o, { status: d.status || 'comprobante' }));
      }).catch(function (e) {
        pick.disabled = false; pick.classList.remove('is-loading'); lab.nodeValue = 'Subir comprobante';
        msg.textContent = e.message || 'No pudimos subir el comprobante.'; msg.hidden = false;
      });
    });
    card.appendChild(pick); card.appendChild(input); card.appendChild(prev); card.appendChild(msg);
    box.appendChild(card);
  }

  window.MagmaProof = { mount: mount };
})();
