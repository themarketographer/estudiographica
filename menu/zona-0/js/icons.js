/* Iconos dibujados a mano, trazo simple de 2 px. Se inyectan una sola vez y se usan con <use href="#i-nombre">. */
(function () {
  var S = {
    wheel: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2.5v7.5M12 14v7.5M2.5 12H10M14 12h7.5M5.3 5.3l5.3 5.3M13.4 13.4l5.3 5.3M18.7 5.3l-5.3 5.3M10.6 13.4l-5.3 5.3"/>',
    cup: '<path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.8 1 .8 1.6 0 2.5M12 3.5c-.8 1 .8 1.6 0 2.5"/>',
    bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    drop: '<path d="M12 3c3.5 4.2 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 8.5 7.2 12 3z"/><path d="M9.5 14a2.6 2.6 0 0 0 2 2.5"/>',
    cookie: '<path d="M20.5 12.5A8.5 8.5 0 1 1 11.5 3.5a3 3 0 0 0 4 3 3 3 0 0 0 3.5 3 3 3 0 0 0 1.5 3z"/><path d="M9 10v.01M13 14v.01M8.5 15v.01M15.5 17v.01"/>',
    bag: '<path d="M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
    check: '<path d="M5 12.5 9.5 17 19 7.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
    print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    bike: '<circle cx="5.5" cy="16" r="3.5"/><circle cx="18.5" cy="16" r="3.5"/><path d="M5.5 16 9 8h5l4.5 8M9 8 7.5 5.5H5.5M14 8l-3 8h-5.5M14 8h2"/>',
    table: '<path d="M4 9h16M6 9v10M18 9v10M9 5h6l1 4H8z"/>',
    pin: '<path d="M12 21s7-6 7-11.5a7 7 0 0 0-14 0C5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    sound: '<path d="M4 10v4h4l5 4V6L8 10zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>',
    mute: '<path d="M4 10v4h4l5 4V6L8 10zM17 9.5l4 5M21 9.5l-4 5"/>',
    dots: '<path d="M5 12v.01M12 12v.01M19 12v.01" stroke-width="3"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6v.01M4 12v.01M4 18v.01"/>',
    download: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    out: '<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 .2 1.5 1 2 1.5 2C10 8 10.5 5.5 12 3z"/>',
    wallet: '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h13a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5zM16 13.5h.01"/>'
  };
  var out = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true" focusable="false">';
  for (var k in S) out += '<symbol id="i-' + k + '" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + S[k] + '</g></symbol>';
  out += '</svg>';
  function put() { document.body.insertAdjacentHTML('afterbegin', out); }
  if (document.body) put(); else document.addEventListener('DOMContentLoaded', put);
  window.Z0Icon = function (id, cls) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ic' + (cls ? ' ' + cls : '')); s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-' + id); s.appendChild(u); return s;
  };
})();
