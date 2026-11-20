/* Zona 0 · ventas del día, libro diario (ingresos y gastos) y menú. Usa los pedidos que ya carga el panel. */
(function () {
  'use strict';
  var Z = window.Z0Panel; if (!Z) return;
  var P = Z.P, $ = Z.$, $$ = Z.$$, el = Z.el, money = Z.money, toast = Z.toast;
  var DEF_CATS = { egreso: ['Insumos', 'Servicios', 'Sueldos', 'Transporte', 'Mantenimiento', 'Retiro del dueño', 'Otros'], ingreso: ['Aporte a caja', 'Cambio', 'Otros ingresos'] };
  var METHOD = { efectivo: 'Efectivo', qr: 'QR', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };
  var MODE = { mesa: 'Mesa', recojo: 'Para llevar', delivery: 'Delivery' };

  /* ---------- Fechas (Bolivia) ---------- */
  function todayKey() { return P.boliviaDate(new Date()).key; }
  function shift(key, n) { return new Date(Date.parse(key + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10); }
  function diff(a, b) { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000); }
  function label(key, long) { return new Date(key + 'T12:00:00Z').toLocaleDateString('es-BO', { weekday: long ? 'long' : 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function hmOf(iso) { return new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/La_Paz' }); }
  function parts(o) { var p = o.payment || {}; return p.parts && p.parts.length ? p.parts : [{ method: p.method || 'efectivo', amount: o.total }]; }
  function methLabel(o) { return parts(o).map(function (q) { return METHOD[q.method] || q.method; }).join(' + '); }
  function addByMethod(acc, o) { parts(o).forEach(function (q) { acc[q.method] = (acc[q.method] || 0) + q.amount; }); }
  function cashOf(o) { return parts(o).reduce(function (s, q) { return s + (q.method === 'efectivo' ? q.amount : 0); }, 0); }
  function dayOf(iso) { return P.boliviaDate(new Date(iso)).key; }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function api(path, method, body) {
    return fetch('/api/zona0/' + path, { method: method, headers: { Authorization: 'Bearer ' + Z.token(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().then(function (d) { d.http = r.status; return d; }); })
      .then(function (d) { if (d.http === 401) { Z.leave('Clave incorrecta.'); throw new Error('auth'); } if (!d.ok) throw new Error(d.error || 'Error del servidor.'); return d; });
  }
  function kpi(box, items) {
    items.forEach(function (d) { var k = el('div', 'kpi' + (d[2] ? ' hot' : '')); k.appendChild(el('span', '', d[0])); k.appendChild(el('b', 'num', d[1])); if (d[3]) k.appendChild(el('small', '', d[3])); box.appendChild(k); });
  }
  function bars(title, rows, total, cls) {
    var c = el('div', 'bcard'); c.appendChild(el('h3', '', title));
    if (!rows.length) { c.appendChild(el('p', 'muted', 'Sin movimientos en este rango.')); return c; }
    rows.forEach(function (r) {
      var row = el('div', 'brow'), top = el('div', 'bt'); top.appendChild(el('span', '', r[0])); top.appendChild(el('b', 'num', money(r[1]) + (total ? ' · ' + Math.round(r[1] * 100 / total) + '%' : '')));
      var tr = el('div', 'track'), f = el('i', cls || ''); f.style.width = total ? Math.max(3, r[1] * 100 / total) + '%' : '0'; tr.appendChild(f); row.appendChild(top); row.appendChild(tr); c.appendChild(row);
    });
    return c;
  }
  function csvDownload(name, rows) {
    var text = '﻿' + rows.map(function (r) { return r.map(function (v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function head(title, actions) { var h = el('div', 'vhead'); h.appendChild(el('h1', '', title)); var a = el('div', 'vact'); (actions || []).forEach(function (x) { a.appendChild(x); }); h.appendChild(a); return h; }
  function btn(text, cls, fn, icon) { var b = el('button', cls || 'tool dark'); b.type = 'button'; b.setAttribute('data-press', ''); if (icon) b.appendChild(Z0Icon(icon)); b.appendChild(el('span', '', text)); b.addEventListener('click', fn); return b; }
  function table(cols, rows, foot) {
    var wrap = el('div', 'tblwrap'), t = el('table', 'tbl'), th = el('thead'), tr = el('tr');
    cols.forEach(function (c) { tr.appendChild(el('th', c[1] || '', c[0])); }); th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody'); rows.forEach(function (r) { var row = el('tr', r.cls || ''); r.cells.forEach(function (v, i) { var td = el('td', cols[i][1] || ''); if (v && v.nodeType) td.appendChild(v); else td.textContent = v == null ? '' : v; row.appendChild(td); }); tb.appendChild(row); });
    if (!rows.length) { var e = el('tr'); var td = el('td', 'emptyrow', 'Nada para mostrar en este rango.'); td.colSpan = cols.length; e.appendChild(td); tb.appendChild(e); }
    t.appendChild(tb);
    if (foot) { var tf = el('tfoot'), fr = el('tr'); foot.forEach(function (v, i) { fr.appendChild(el('td', cols[i][1] || '', v)); }); tf.appendChild(fr); t.appendChild(tf); }
    wrap.appendChild(t); return wrap;
  }

  /* ---------- Ventas ---------- */
  function paidSales(from, to) {
    return Z.list().filter(function (o) { return o.status !== 'cancelado' && o.payment && o.payment.status === 'pagado'; })
      .map(function (o) { var at = o.payment.updatedAt || o.createdAt; return { o: o, at: at, day: dayOf(at) }; })
      .filter(function (x) { return x.day >= from && x.day <= to; }).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }
  function summary(o) { return (o.lines || []).map(function (l) { return l.qty + '× ' + l.name; }).join(', '); }
  function who(o) { var c = o.customer || {}; return o.mode === 'mesa' ? 'Mesa ' + (c.mesa || 's/n') + (o.mozo ? ' · ' + o.mozo : '') : (MODE[o.mode] || '') + (c.name && c.name !== 'Mostrador' && c.name !== 'Delivery' ? ' · ' + c.name : ''); }
  function importHistory(file) {
    var rd = new FileReader();
    rd.onload = function () {
      var d; try { d = JSON.parse(rd.result); } catch (e) { toast('Ese archivo no se puede leer.'); return; }
      var all = [].concat.apply([], Object.keys(d.days || {}).map(function (k) { return d.days[k]; })), led = d.ledger || [], added = 0, skipped = 0, i = 0, j = 0;
      var oc = Math.ceil(all.length / 50), lc = Math.ceil(led.length / 250), steps = Math.max(oc, lc), n = 0;
      toast('Importando ' + all.length + ' pedidos y ' + led.length + ' gastos...');
      (function next() {
        if (n >= steps) { toast('Listo: ' + added + ' registros nuevos, ' + skipped + ' que ya estaban.'); Z.ensureDays(120); vs.day = todayKey(); return; }
        var body = { orders: all.slice(n * 50, n * 50 + 50), ledger: led.slice(n * 250, n * 250 + 250) };
        api('import', 'POST', body).then(function (r) { added += r.orders.added + r.ledger.added; skipped += r.orders.skipped + r.ledger.skipped; n++; next(); })
          .catch(function (e) { toast('Se detuvo en el tramo ' + (n + 1) + ': ' + e.message + '. Puedes repetir, no se duplica.'); });
      })();
    };
    rd.readAsText(file);
  }
  /* Una mesa, un registro: los pedidos de la misma mesa cobrados juntos (separados por menos de 2 minutos) se muestran como una sola cuenta. */
  function mk(m) { return String(m == null ? '' : m).trim().toLowerCase().replace(/^0+(?=\d)/, ''); }
  function groupMesa(rows) {
    var asc = rows.toSorted(function (a, b) { return String(a.at).localeCompare(String(b.at)); }), groups = [];
    asc.forEach(function (x) {
      var o = x.o, g = null;
      if (o.mode === 'mesa' && o.customer && o.customer.mesa) {
        for (var i = groups.length - 1; i >= 0; i--) {
          var h = groups[i][0].o;
          if (h.mode === 'mesa' && h.customer && mk(h.customer.mesa) === mk(o.customer.mesa)) {
            var last = groups[i][groups[i].length - 1];
            if (Date.parse(x.at) - Date.parse(last.at) <= 120000) g = groups[i];
            break;
          }
        }
      }
      if (g) g.push(x); else groups.push([x]);
    });
    return groups.map(mergeGroup).sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
  }
  function mergeGroup(items) {
    if (items.length === 1) return items[0];
    var os = items.map(function (x) { return x.o; }), by = {}, lines = [];
    os.forEach(function (o) { parts(o).forEach(function (q) { by[q.method] = (by[q.method] || 0) + q.amount; }); (o.lines || []).forEach(function (l) { lines.push(l); }); });
    var arr = Object.keys(by).map(function (m) { return { method: m, amount: Math.round(by[m] * 100) / 100 }; });
    var main = arr.toSorted(function (a, b) { return b.amount - a.amount; })[0], first = os[0], at = items[items.length - 1].at;
    var ids = os.map(function (o, i) { return i ? String(o.orderId).split('-')[0] : o.orderId; });
    return { at: at, day: items[0].day, o: {
      key: first.key, keys: os.map(function (o) { return o.key; }), orderId: ids.join(' + '), createdAt: first.createdAt, mode: 'mesa', customer: first.customer, mozo: first.mozo,
      lines: lines, deliveryFee: 0, total: Math.round(os.reduce(function (s, o) { return s + o.total; }, 0) * 100) / 100,
      payment: { status: 'pagado', method: main ? main.method : 'efectivo', parts: arr, updatedAt: at }, _n: os.length
    } };
  }
  var vs = { day: '' };
  function renderVentas() {
    var box = $('#v-ventas'); if (!vs.day) vs.day = todayKey();
    var back = Math.min(120, Math.max(0, diff(todayKey(), vs.day))); if (back >= 2) Z.ensureDays(back + 1);
    box.textContent = '';
    var inp = el('input', 'dateinp'); inp.type = 'date'; inp.value = vs.day; inp.max = todayKey(); inp.addEventListener('change', function () { if (inp.value) { vs.day = inp.value; renderVentas(); } });
    var nav = el('div', 'daynav');
    var prev = btn('', 'tool dark ico', function () { vs.day = shift(vs.day, -1); renderVentas(); }, 'arrow'); prev.firstChild.style.transform = 'scaleX(-1)'; prev.setAttribute('aria-label', 'Día anterior');
    var next = btn('', 'tool dark ico', function () { if (vs.day < todayKey()) { vs.day = shift(vs.day, 1); renderVentas(); } }, 'arrow'); next.setAttribute('aria-label', 'Día siguiente'); next.disabled = vs.day >= todayKey();
    nav.appendChild(prev); nav.appendChild(inp); nav.appendChild(next); nav.appendChild(btn('Hoy', 'tool dark', function () { vs.day = todayKey(); renderVentas(); }));
    var rows = groupMesa(paidSales(vs.day, vs.day));
    var exp = btn('Exportar', 'tool dark', function () {
      Z.popMenu(exp, [
        { text: 'Descargar CSV del día', fn: function () { csvDownload('ventas-zona0-' + vs.day + '.csv', [['hora', 'pedido', 'tipo', 'productos', 'medio', 'total']].concat(rows.map(function (x) { return [hmOf(x.at), x.o.orderId, who(x.o), summary(x.o), methLabel(x.o), x.o.total]; }))); } },
        { text: 'Importar historial (JSON)', fn: function () { var f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json'; f.addEventListener('change', function () { if (f.files[0]) importHistory(f.files[0]); }); f.click(); } }
      ]);
    }, 'download');
    box.appendChild(head('Ventas del día', [nav, exp]));
    box.appendChild(el('p', 'daylab', cap(label(vs.day, true))));
    var total = rows.reduce(function (s, x) { return s + x.o.total; }, 0), byM = {};
    rows.forEach(function (x) { addByMethod(byM, x.o); });
    var kp = el('section', 'kpis k3'); kpi(kp, [['Vendido', money(total), true], ['Cobros', String(rows.length)], ['Cobro promedio', rows.length ? money(Math.round(total / rows.length * 10) / 10) : '0 Bs']]); box.appendChild(kp);
    var meth = el('div', 'chips'); ['efectivo', 'qr', 'tarjeta'].forEach(function (m) { var c = el('span', 'mchip'); c.appendChild(el('small', '', METHOD[m])); c.appendChild(el('b', 'num', money(byM[m] || 0))); meth.appendChild(c); }); box.appendChild(meth);
    var grid = el('div', 'two-col');
    var cells = rows.map(function (x) { var pr = el('button', 'mini', 'Ticket'); pr.type = 'button'; pr.addEventListener('click', function () { Z.printTicket(x.o._n ? Object.assign({}, x.o, { orderId: '', customer: Object.assign({}, x.o.customer, { name: 'Mesa ' + x.o.customer.mesa }) }) : x.o); });
      var bx = el('button', 'mini ico', ''); bx.type = 'button'; bx.setAttribute('aria-label', 'Más acciones del registro ' + x.o.orderId); bx.setAttribute('aria-haspopup', 'menu');
      bx.appendChild(Z0Icon('dots'));
      bx.addEventListener('click', function (e) {
        e.stopPropagation();
        Z.popMenu(bx, [{ text: 'Borrar registro', danger: true, confirm: '¿Borrar ' + x.o.orderId + '?', fn: function () {
          (x.o.keys || [x.o.key]).reduce(function (pr2, k) { return pr2.then(function () { return Z.removeOrder(k); }); }, Promise.resolve()).then(function () { Z.toast('Registro ' + x.o.orderId + ' borrado'); }).catch(function (er) { Z.toast(er.message || 'No se pudo borrar'); });
        } }]);
      });
      var act = el('div', 'racts'); act.appendChild(pr); act.appendChild(bx);
      return { cells: [hmOf(x.at), x.o.orderId, who(x.o), summary(x.o), methLabel(x.o), money(x.o.total), act] }; });
    grid.appendChild(table([['Hora'], ['Pedido'], ['Tipo'], ['Productos', 'wide'], ['Medio'], ['Total', 'r'], ['']], cells));
    var prod = {}; rows.forEach(function (x) { (x.o.lines || []).forEach(function (l) { prod[l.name] = (prod[l.name] || 0) + l.qty; }); });
    var top = Object.keys(prod).map(function (k) { return [k, prod[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
    var side = el('div', 'bcard'); side.appendChild(el('h3', '', 'Lo más vendido'));
    if (!top.length) side.appendChild(el('p', 'muted', 'Todavía no hay ventas este día.')); top.forEach(function (t, i) { var r = el('div', 'rank'); r.appendChild(el('b', 'num', String(i + 1))); r.appendChild(el('span', '', t[0])); r.appendChild(el('i', 'num', t[1] + ' u.')); side.appendChild(r); });
    grid.appendChild(side);
    if (rows.length) box.appendChild(grid);
    else {
      var em = el('div', 'bcard empty'); em.appendChild(el('h3', '', vs.day === todayKey() ? 'Todavía no hay cobros hoy' : 'Sin cobros este día'));
      em.appendChild(el('p', 'muted', vs.day === todayKey() ? 'Los pedidos aparecen aquí apenas se cobran. Las cuentas abiertas se suman al cobrar.' : 'Prueba con otro día para ver sus ventas.'));
      var ea = el('div', 'vact'); ea.appendChild(btn('Ver ayer', 'tool dark', function () { vs.day = shift(todayKey(), -1); renderVentas(); }));
      if (vs.day !== todayKey()) ea.appendChild(btn('Ir a hoy', 'tool go', function () { vs.day = todayKey(); renderVentas(); }));
      em.appendChild(ea); box.appendChild(em);
    }
    var open = Z.list().filter(function (o) { return o.status !== 'cancelado' && !(o.payment && o.payment.status === 'pagado'); }).reduce(function (s, o) { return s + o.total; }, 0);
    if (vs.day === todayKey() && open) box.appendChild(el('p', 'muted foot', 'Hay ' + money(open) + ' en cuentas abiertas que todavía no se cobran. Se suman a las ventas cuando se cobran.'));
  }

  /* ---------- Libro diario ---------- */
  var lb = { sub: 'resumen', preset: 'hoy', from: '', to: '', entries: [], cats: DEF_CATS, busy: false, key: '' };
  function range() {
    var t = todayKey();
    if (lb.preset === 'hoy') return [t, t]; if (lb.preset === '7') return [shift(t, -6), t]; if (lb.preset === '30') return [shift(t, -29), t];
    if (lb.preset === 'mes') return [t.slice(0, 8) + '01', t];
    var f = lb.from || t, e = lb.to || t; if (e < f) e = f; if (diff(e, f) > 30) f = shift(e, -30); return [f, e];
  }
  function loadLibro(force) {
    var r = range(), k = r[0] + '|' + r[1];
    var need = Math.min(120, diff(todayKey(), r[0]) + 1); Z.ensureDays(need);
    if (!force && lb.key === k) return renderLibro();
    lb.busy = true; renderLibro();
    api('ledger?from=' + r[0] + '&to=' + r[1], 'GET').then(function (d) { lb.entries = d.entries; lb.cats = d.categories || DEF_CATS; lb.key = k; })
      .catch(function (e) { if (e.message !== 'auth') toast('No se pudo leer el libro diario: ' + e.message); })
      .then(function () { lb.busy = false; renderLibro(); });
  }
  function figures() {
    var r = range(), sales = paidSales(r[0], r[1]), en = lb.entries.filter(function (e) { return !e.voided; });
    var inc = en.filter(function (e) { return e.type === 'ingreso'; }), exp = en.filter(function (e) { return e.type === 'egreso'; });
    var sum = function (a) { return a.reduce(function (s, x) { return s + (x.amount != null ? x.amount : x.o.total); }, 0); };
    var cash = sales.reduce(function (t, x) { return t + cashOf(x.o); }, 0) + sum(inc.filter(function (e) { return e.method === 'efectivo'; })) - sum(exp.filter(function (e) { return e.method === 'efectivo'; }));
    return { r: r, sales: sales, inc: inc, exp: exp, vSales: sum(sales), vInc: sum(inc), vExp: sum(exp), cash: cash };
  }
  function renderLibro() {
    var box = $('#v-libro'); box.textContent = ''; var F = figures();
    var add = btn(lb.sub === 'ingresos' ? 'Registrar ingreso' : 'Registrar gasto', 'tool go', function () { openLedger(lb.sub === 'ingresos' ? 'ingreso' : 'egreso'); }, 'plus');
    box.appendChild(head('Libro diario', [add]));
    var bar = el('div', 'lbar');
    var subs = el('div', 'subtabs'); [['resumen', 'Resumen'], ['ingresos', 'Ingresos'], ['gastos', 'Gastos']].forEach(function (s) { var b = el('button', '', s[1]); b.type = 'button'; b.setAttribute('data-press', ''); b.setAttribute('aria-pressed', lb.sub === s[0] ? 'true' : 'false'); b.addEventListener('click', function () { lb.sub = s[0]; renderLibro(); }); subs.appendChild(b); });
    bar.appendChild(subs);
    var pre = el('div', 'subtabs light'); [['hoy', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['mes', 'Este mes'], ['custom', 'Elegir']].forEach(function (s) { var b = el('button', '', s[1]); b.type = 'button'; b.setAttribute('aria-pressed', lb.preset === s[0] ? 'true' : 'false'); b.addEventListener('click', function () { lb.preset = s[0]; if (s[0] === 'custom') { lb.from = lb.from || F.r[0]; lb.to = lb.to || F.r[1]; } loadLibro(); }); pre.appendChild(b); });
    bar.appendChild(pre);
    if (lb.preset === 'custom') {
      var c = el('div', 'custom'), a = el('input'), b = el('input'); a.type = b.type = 'date'; a.value = F.r[0]; b.value = F.r[1]; a.max = b.max = todayKey();
      var go = function () { lb.from = a.value; lb.to = b.value; loadLibro(); }; a.addEventListener('change', go); b.addEventListener('change', go);
      c.appendChild(el('span', '', 'Del')); c.appendChild(a); c.appendChild(el('span', '', 'al')); c.appendChild(b); bar.appendChild(c);
    }
    box.appendChild(bar);
    box.appendChild(el('p', 'daylab', F.r[0] === F.r[1] ? cap(label(F.r[0], true)) : cap(label(F.r[0])) + ' al ' + label(F.r[1])));
    if (lb.busy) { box.appendChild(el('p', 'muted', 'Cargando movimientos...')); return; }
    if (lb.sub === 'resumen') libroResumen(box, F); else if (lb.sub === 'ingresos') libroIngresos(box, F); else libroGastos(box, F);
  }
  function libroResumen(box, F) {
    var tot = F.vSales + F.vInc, net = tot - F.vExp;
    var kp = el('section', 'kpis'); kpi(kp, [['Ingresos', money(tot), false, 'Ventas ' + money(F.vSales) + (F.vInc ? ' · otros ' + money(F.vInc) : '')], ['Gastos', money(F.vExp), false, F.exp.length + (F.exp.length === 1 ? ' movimiento' : ' movimientos')], ['Resultado', money(net), net >= 0, net >= 0 ? 'Ingresos menos gastos' : 'Los gastos superan a los ingresos'], ['Efectivo esperado en caja', money(F.cash), false, 'Ventas y aportes en efectivo menos gastos en efectivo']]); box.appendChild(kp);
    /* Barras por día */
    var days = {}, d0 = F.r[0]; for (var d = d0; d <= F.r[1]; d = shift(d, 1)) days[d] = { i: 0, g: 0 };
    F.sales.forEach(function (x) { if (days[x.day]) days[x.day].i += x.o.total; }); F.inc.forEach(function (e) { if (days[e.day]) days[e.day].i += e.amount; }); F.exp.forEach(function (e) { if (days[e.day]) days[e.day].g += e.amount; });
    var keys = Object.keys(days).sort(), mx = Math.max(1, Math.max.apply(null, keys.map(function (k) { return Math.max(days[k].i, days[k].g); })));
    var chart = el('div', 'bcard wide'); chart.appendChild(el('h3', '', 'Ingresos y gastos por día'));
    var legend = el('div', 'lgd'); legend.innerHTML = '<span><i class="a"></i>Ingresos</span><span><i class="b"></i>Gastos</span>'; chart.appendChild(legend);
    var cols = el('div', 'cols'); cols.style.setProperty('--n', keys.length);
    keys.forEach(function (k) { var c = el('div', 'colm'), pair = el('div', 'pair'); var a = el('i', 'a'), g = el('i', 'b'); a.style.height = (days[k].i * 100 / mx) + '%'; g.style.height = (days[k].g * 100 / mx) + '%'; a.title = 'Ingresos ' + money(days[k].i); g.title = 'Gastos ' + money(days[k].g); pair.appendChild(a); pair.appendChild(g); c.appendChild(pair); c.appendChild(el('small', '', keys.length > 12 ? k.slice(8) : label(k))); cols.appendChild(c); });
    chart.appendChild(cols); box.appendChild(chart);
    var g3 = el('div', 'three-col');
    var byCat = {}, byWho = {}, byM = {};
    F.exp.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + e.amount; byWho[e.responsible] = (byWho[e.responsible] || 0) + e.amount; });
    F.sales.forEach(function (x) { addByMethod(byM, x.o); });
    var srt = function (o) { return Object.keys(o).map(function (k) { return [k, o[k]]; }).sort(function (a, b) { return b[1] - a[1]; }); };
    g3.appendChild(bars('Gastos por categoría', srt(byCat), F.vExp, 'b')); g3.appendChild(bars('Gastos por responsable', srt(byWho), F.vExp, 'b'));
    g3.appendChild(bars('Ventas por medio de pago', srt(byM).map(function (r) { return [METHOD[r[0]] || r[0], r[1]]; }), F.vSales, 'a')); box.appendChild(g3);
    box.appendChild(el('p', 'muted foot', 'Las ventas salen solas de los pedidos cobrados. Lo que se saca o se pone en la caja sin ser una venta se anota en Gastos o Ingresos, con su responsable.'));
  }
  function libroIngresos(box, F) {
    var rows = [];
    F.sales.forEach(function (x) { rows.push({ at: x.at, cells: [label(x.day) + ' ' + hmOf(x.at), 'Venta ' + x.o.orderId + ' · ' + who(x.o), 'Venta', methLabel(x.o), x.o.mozo || 'Automático', money(x.o.total)] }); });
    F.inc.forEach(function (e) { rows.push({ at: e.createdAt, cells: [label(e.day) + ' ' + hmOf(e.createdAt), e.concept, e.category, METHOD[e.method] || '', e.responsible, money(e.amount)] }); });
    rows.sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    box.appendChild(table([['Fecha y hora'], ['Concepto', 'wide'], ['Categoría'], ['Medio'], ['Responsable'], ['Monto', 'r']], rows, ['', 'Total ingresos', '', '', '', money(F.vSales + F.vInc)]));
  }
  function libroGastos(box, F) {
    var all = lb.entries.filter(function (e) { return e.type === 'egreso'; });
    var rows = all.map(function (e) {
      var act = el('span');
      if (!e.voided) { var x = el('button', 'mini danger', 'Anular'); x.type = 'button'; var armed = 0; x.addEventListener('click', function () { if (!armed) { armed = 1; x.textContent = '¿Seguro?'; x.classList.add('armed'); setTimeout(function () { armed = 0; x.textContent = 'Anular'; x.classList.remove('armed'); }, 3000); } else voidEntry(e); }); act.appendChild(x); } else act.textContent = 'Anulado';
      return { cls: e.voided ? 'voided' : '', cells: [label(e.day) + ' ' + hmOf(e.createdAt), e.concept, e.category, METHOD[e.method] || '', e.responsible, money(e.amount), act] };
    });
    box.appendChild(table([['Fecha y hora'], ['Concepto', 'wide'], ['Categoría'], ['Medio'], ['Responsable'], ['Monto', 'r'], ['']], rows, ['', 'Total gastos', '', '', '', money(F.vExp), '']));
    box.appendChild(el('p', 'muted foot', 'Los movimientos anulados quedan en la lista tachados y no suman. Así el libro conserva todo lo que pasó.'));
  }
  function voidEntry(e) {
    api('ledger', 'POST', { void: e.id, by: Z.ls('z0.resp') }).then(function () { toast('Movimiento anulado'); loadLibro(true); }).catch(function (er) { if (er.message !== 'auth') toast(er.message); });
  }

  /* Registrar movimiento */
  var lt = 'egreso';
  function resps() { try { return JSON.parse(Z.ls('z0.resps') || '[]'); } catch (e) { return []; } }
  function openLedger(type) {
    lt = type; var dlg = $('#ldg'); $('#ldgForm').reset(); $('#lErr').hidden = true;
    $('#ldgT').textContent = type === 'ingreso' ? 'Registrar ingreso' : 'Registrar gasto';
    $('#lConceptL').textContent = type === 'ingreso' ? 'De dónde viene' : 'En qué se usó';
    $('#lConcept').placeholder = type === 'ingreso' ? 'Ejemplo: cambio para la caja' : 'Ejemplo: leche para el café';
    var sel = $('#lCat'); sel.textContent = ''; (lb.cats[type] || DEF_CATS[type]).forEach(function (c) { var o = el('option', '', c); o.value = c; sel.appendChild(o); });
    if (type === 'egreso') sel.value = 'Insumos';
    $('#lDay').value = todayKey(); $('#lDay').max = todayKey(); $('#lResp').value = Z.ls('z0.resp');
    var dl = $('#lRespList'); dl.textContent = ''; resps().forEach(function (n) { var o = el('option'); o.value = n; dl.appendChild(o); });
    dlg.showModal(); $('#lAmt').focus();
  }
  $('#ldgForm').addEventListener('submit', function (e) {
    e.preventDefault(); var err = $('#lErr'); err.hidden = true;
    var body = { type: lt, amount: Number($('#lAmt').value), concept: $('#lConcept').value, category: $('#lCat').value, responsible: $('#lResp').value, method: $('#lMethod').value, day: $('#lDay').value };
    var b = $('#lSave'); b.classList.add('is-loading'); b.disabled = true;
    api('ledger', 'POST', body).then(function (d) {
      var n = String(body.responsible).trim(), list = resps().filter(function (x) { return x !== n; }); list.unshift(n); Z.ls('z0.resps', JSON.stringify(list.slice(0, 8))); Z.ls('z0.resp', n);
      $('#ldg').close(); toast((lt === 'ingreso' ? 'Ingreso' : 'Gasto') + ' de ' + money(d.entry.amount) + ' registrado a nombre de ' + d.entry.responsible);
      if (lt === 'ingreso' && lb.sub !== 'resumen') lb.sub = 'ingresos'; if (lt === 'egreso' && lb.sub !== 'resumen') lb.sub = 'gastos';
      loadLibro(true);
    }).catch(function (er) { if (er.message !== 'auth') { err.textContent = er.message; err.hidden = false; } })
      .then(function () { b.classList.remove('is-loading'); b.disabled = false; });
  });

  /* ---------- Menú ---------- */
  /* Se ve como la comanda: categorías arriba, productos agrupados en secciones con tarjetas simples.
     Tocar una tarjeta abre todo lo editable (nombre, precio, agotado, quitar). El precio también se cambia ahí mismo. */
  var mc = 'todo', mq = '';
  var norm = function (t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
  /* QR de pago que se imprime en el recibo: se sube una vez y queda guardado para todos los dispositivos. */
  /* Reconstruye el QR módulo por módulo: lee la cuadrícula de la imagen y la guarda como una imagen de N x N puntos.
     Así se imprime con módulos de tamaño entero (nítidos y escaneables) aunque el QR del banco sea muy denso. */
  function qrRebuild(im) {
    var W = Math.min(im.width, 1400), k0 = W / im.width, w = Math.round(im.width * k0), h = Math.round(im.height * k0);
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
    var px = g.getImageData(0, 0, w, h).data, dark = function (x, y) { var i = (y * w + x) * 4; return (px[i] * 0.3 + px[i + 1] * 0.59 + px[i + 2] * 0.11) < 140; };
    var x0 = w, x1 = -1, y0 = h, y1 = -1, x, y;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (dark(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    var plain = function () {
      var S = 520, k = Math.min(S / im.width, S / im.height, 1), pw = Math.round(im.width * k), ph = Math.round(im.height * k);
      var c2 = document.createElement('canvas'); c2.width = pw; c2.height = ph; var g2 = c2.getContext('2d'); g2.fillStyle = '#fff'; g2.fillRect(0, 0, pw, ph); g2.drawImage(im, 0, 0, pw, ph);
      var d = g2.getImageData(0, 0, pw, ph), q2 = d.data;
      for (var i = 0; i < q2.length; i += 4) { var v = (q2[i] * 0.3 + q2[i + 1] * 0.59 + q2[i + 2] * 0.11) < 140 ? 0 : 255; q2[i] = q2[i + 1] = q2[i + 2] = v; q2[i + 3] = 255; }
      g2.putImageData(d, 0, 0); return { img: c2.toDataURL('image/png'), n: 0 };
    };
    if (x1 < 0 || (x1 - x0) < 40 || Math.abs((x1 - x0) - (y1 - y0)) > 6) return plain();
    var run = 0; for (x = x0; x <= x1 && dark(x, y0); x++) run++;
    var m = run / 7, N = Math.round((x1 - x0 + 1) / m);
    if (!(N >= 21 && N <= 177 && (N - 17) % 4 === 0)) return plain();
    var m2 = (x1 - x0 + 1) / N, out = document.createElement('canvas'); out.width = N; out.height = N; var go = out.getContext('2d'); go.fillStyle = '#fff'; go.fillRect(0, 0, N, N); go.fillStyle = '#000';
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) {
      var cx = Math.round(x0 + (c + 0.5) * m2), cy = Math.round(y0 + (r + 0.5) * m2), n = 0, t = 0;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var xx = cx + dx, yy = cy + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { t++; if (dark(xx, yy)) n++; } }
      if (n * 2 > t) go.fillRect(c, r, 1, 1);
    }
    var od = go.getImageData(0, 0, N, N).data, mat = []; for (var rr = 0; rr < N; rr++) { mat.push([]); for (var cc = 0; cc < N; cc++) mat[rr].push(od[(rr * N + cc) * 4] < 128); }
    return { img: out.toDataURL('image/png'), n: N, mat: mat };
  }
  function loadJs(src) {
    return new Promise(function (ok, no) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = function () { no(new Error('No cargó ' + src)); }; document.head.appendChild(sc); });
  }
  function drawMat(mat, K, B) {
    var N = mat.length, W = N * K + B * 2, cv = document.createElement('canvas'); cv.width = cv.height = W;
    var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, W); g.fillStyle = '#000';
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) if (mat[r][c]) g.fillRect(B + c * K, B + r * K, K, K);
    return { cv: cv, data: g.getImageData(0, 0, W, W) };
  }
  /* El QR del banco trae mucha información y es denso (puntos diminutos). Se lee su texto y se vuelve a dibujar con la
     corrección de errores más baja, que usa menos módulos y deja puntos más grandes: se lee mejor en papel térmico.
     Si algo falla en el camino se queda con el QR original reconstruido. */
  function qrSimplify(res) {
    if (!res.n || !res.mat) { res.why = 'no se reconoció la cuadrícula del QR'; return Promise.resolve(res); }
    return Promise.all([loadJs('../js/vendor/jsQR.js'), loadJs('../js/vendor/qrcode.js')]).then(function () {
      var hit = window.jsQR(drawMat(res.mat, 6, 24).data.data, res.n * 6 + 48, res.n * 6 + 48);
      if (!hit || !hit.data || /[^\x20-\x7e]/.test(hit.data)) { res.why = 'no se pudo leer el texto del QR'; return res; }
      var q = window.qrcode(0, 'L'); q.addData(hit.data, 'Byte'); q.make();
      var n2 = q.getModuleCount(); if (n2 >= res.n) { res.why = 'ya era lo más simple posible'; return res; }
      var mat2 = []; for (var r = 0; r < n2; r++) { mat2.push([]); for (var c = 0; c < n2; c++) mat2[r].push(q.isDark(r, c)); }
      var chk = drawMat(mat2, 6, 24), back = window.jsQR(chk.data.data, chk.cv.width, chk.cv.width);
      if (!back || back.data !== hit.data) { res.why = 'la verificación no coincidió'; return res; }
      var o = drawMat(mat2, 1, 0).cv;
      return { img: o.toDataURL('image/png'), n: n2, simplified: true, from: res.n, orig: res.n };
    }).catch(function (e) { res.why = 'no cargó el lector (' + (e && e.message ? e.message : 'error') + ')'; return res; });
  }
  /* Busca el QR dentro de la imagen tal como viene (captura de pantalla, foto, con márgenes o textos alrededor). */
  function qrDecodeAny(im) {
    var ks = [1, 0.6, 1.6, 0.4, 0.25];
    for (var i = 0; i < ks.length; i++) {
      var w = Math.round(im.width * ks[i]), h = Math.round(im.height * ks[i]);
      if (w < 80 || h < 80 || w > 2400 || h > 2400) continue;
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h; var g = cv.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(im, 0, 0, w, h);
      var hit = window.jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
      if (hit && hit.data) return hit;
    }
    return null;
  }
  function qrReencode(text, from) {
    if (!text || /[^\x20-\x7e]/.test(text)) return null;
    var q = window.qrcode(0, 'L'); q.addData(text, 'Byte'); q.make();
    var n2 = q.getModuleCount(), mat2 = []; for (var r = 0; r < n2; r++) { mat2.push([]); for (var c = 0; c < n2; c++) mat2[r].push(q.isDark(r, c)); }
    var chk = drawMat(mat2, 6, 24), back = window.jsQR(chk.data.data, chk.cv.width, chk.cv.width);
    if (!back || back.data !== text) return null;
    return { img: drawMat(mat2, 1, 0).cv.toDataURL('image/png'), n: n2, simplified: true, from: from || n2 };
  }
  /* Camino completo: leer el QR de la imagen y volver a dibujarlo más simple. Si no se logra, se guarda reconstruido o tal cual. */
  function qrProcess(im) {
    return Promise.all([loadJs('../js/vendor/jsQR.js'), loadJs('../js/vendor/qrcode.js')]).then(function () {
      var hit = qrDecodeAny(im), why = 'no se encontró un QR legible en la imagen';
      if (hit) {
        var r = qrReencode(hit.data, hit.version ? 17 + 4 * hit.version : 0);
        if (r) return r;
        why = 'el texto del QR tiene símbolos que no se pueden redibujar';
      }
      return qrSimplify(qrRebuild(im)).then(function (r2) { if (!r2.simplified) r2.why = why + '; ' + (r2.why || ''); return r2; });
    }).catch(function (e) { var r3 = qrRebuild(im); r3.why = 'no cargó el lector (' + (e && e.message ? e.message : 'error') + ')'; return r3; });
  }
  function qrCard() {
    var c = el('div', 'bcard qrc'), q = Z.qr();
    var info = el('div', 'qrt');
    info.appendChild(el('b', '', 'QR de pago en el recibo'));
    info.appendChild(el('small', '', q ? 'Se imprime debajo del total para que el cliente pague escaneando.' : 'Sube la imagen del QR del banco y saldrá impreso en el recibo.'));
    var file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    var acts = el('div', 'qra');
    acts.appendChild(btn(q ? 'Cambiar QR' : 'Subir QR', 'btn', function () { file.click(); }, 'plus'));
    if (q) {
      var sel = el('select'); sel.setAttribute('aria-label', 'Cuándo imprimir el QR');
      [['unpaid', 'Solo en cuentas por cobrar'], ['all', 'En todos los tickets']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; if (q.mode === o[0]) op.selected = true; sel.appendChild(op); });
      sel.addEventListener('change', function () { Z.saveQr({ img: q.img, n: q.n, s: q.s, mode: sel.value }).then(function () { Z.toast('Listo, guardado'); }).catch(function (e) { Z.toast(e.message); }); });
      acts.appendChild(sel);
      acts.appendChild(btn('Quitar', 'mini', function () { Z.saveQr(null).then(function () { Z.toast('QR quitado'); refresh(); }).catch(function (e) { Z.toast(e.message); }); }));
    }
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      var url = URL.createObjectURL(f), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(url);
        Z.toast('Leyendo el QR…');
        qrProcess(im).then(function (r) {
          return Z.saveQr({ img: r.img, n: r.n, s: r.simplified ? r.from : 0, mode: q ? q.mode : 'unpaid' }).then(function () { Z.toast(r.simplified ? 'QR guardado y simplificado (' + r.from + ' a ' + r.n + ' puntos por lado)' : 'QR guardado sin simplificar: ' + (r.why || 'motivo desconocido')); refresh(); });
        }).catch(function (e) { Z.toast(e.message); });
      };
      im.onerror = function () { URL.revokeObjectURL(url); Z.toast('No se pudo leer la imagen.'); };
      im.src = url;
    });
    function refresh() { var n = qrCard(); c.parentNode.replaceChild(n, c); }
    if (q) { var pv = el('img', 'qrp'); pv.src = q.img; pv.alt = 'QR de pago guardado'; c.appendChild(pv); }
    if (q) info.appendChild(el('small', 'qrs', q.s ? 'Estado: simplificado, ' + q.n + ' puntos por lado (el original tenía ' + q.s + '). Es más fácil de leer en papel térmico.' : q.n ? 'Estado: ' + q.n + ' puntos por lado, sin simplificar. Sube de nuevo la imagen para intentarlo otra vez.' : 'Estado: imagen simple, sin reconstruir.'));
    info.appendChild(acts); c.appendChild(info); c.appendChild(file);
    return c;
  }
  function renderMenu() {
    var m = Z.menu(), box = $('#v-menu'); if (!m) return; box.textContent = '';
    var open = el('a', 'tool dark'); open.href = '../'; open.target = '_blank'; open.rel = 'noopener'; open.appendChild(Z0Icon('arrow')); open.appendChild(el('span', '', 'Ver menú del cliente'));
    box.appendChild(head('Menú', [btn('Agregar producto', 'btn', function () { prodDialog(null, mc !== 'todo' ? mc : ''); }, 'plus'), open]));
    box.appendChild(qrCard());
    var bar = el('div', 'mbar'), q = el('input', 'msearch'); q.type = 'search'; q.placeholder = 'Buscar producto…'; q.value = mq; q.setAttribute('aria-label', 'Buscar producto');
    q.addEventListener('input', function () { mq = q.value; menuBody(); });
    bar.appendChild(Z0Icon('list')); bar.appendChild(q); box.appendChild(bar);
    var chips = el('div', 'pos-cats mchips'); box.appendChild(chips);
    var body = el('div', 'mbody'); box.appendChild(body);
    menuBody();
  }
  function menuBody() {
    var m = Z.menu(), box = $('#v-menu'), body = box.querySelector('.mbody'), chips = box.querySelector('.mchips'); if (!body) return;
    var nq = norm(mq), match = function (p) { return !nq || norm(p.title + ' ' + p.sub).indexOf(nq) > -1; };
    var live = m.products.filter(function (p) { return !p.hidden; });
    chips.textContent = '';
    [{ id: 'todo', name: 'Todo', icon: 'list' }].concat(m.categories).forEach(function (c) {
      var n = live.filter(function (p) { return (c.id === 'todo' || p.category === c.id) && match(p); }).length;
      var b = el('button', 'chip'); b.type = 'button'; b.setAttribute('data-press', ''); b.setAttribute('aria-pressed', c.id === mc ? 'true' : 'false');
      b.appendChild(Z0Icon(c.icon)); b.appendChild(document.createTextNode(c.name)); b.appendChild(el('small', 'cnt', String(n)));
      b.addEventListener('click', function () { mc = c.id; menuBody(); }); chips.appendChild(b);
    });
    body.textContent = ''; var any = false;
    m.categories.filter(function (c) { return mc === 'todo' || c.id === mc; }).forEach(function (c) {
      var ps = live.filter(function (p) { return p.category === c.id && match(p); });
      if (!ps.length && nq) return;
      any = any || ps.length > 0;
      var sec = el('section', 'msec'), h = el('div', 'msech'), t = el('h2'); t.appendChild(Z0Icon(c.icon)); t.appendChild(document.createTextNode(c.name)); t.appendChild(el('small', '', ps.length + (ps.length === 1 ? ' producto' : ' productos')));
      h.appendChild(t); h.appendChild(btn('Agregar aquí', 'mini', function () { prodDialog(null, c.id); }, 'plus')); sec.appendChild(h);
      var grid = el('div', 'mtiles'); ps.forEach(function (p) { grid.appendChild(menuTile(p)); }); sec.appendChild(grid);
      if (!ps.length) grid.appendChild(el('p', 'muted', 'Sin productos en esta categoría.'));
      body.appendChild(sec);
    });
    if (nq && !any) body.appendChild(el('p', 'muted mempty', 'Ningún producto coincide con "' + mq + '".'));
    var gone = m.products.filter(function (p) { return p.hidden && (mc === 'todo' || p.category === mc) && match(p); });
    if (gone.length) {
      var g2 = el('section', 'msec mgone'), h2 = el('div', 'msech'); h2.appendChild(el('h2', '', 'Quitados del menú')); g2.appendChild(h2);
      var gg = el('div', 'mtiles'); gone.forEach(function (p) { gg.appendChild(menuTile(p)); }); g2.appendChild(gg); body.appendChild(g2);
    }
  }
  function menuTile(p) {
    var t = el('article', 'mt' + (p.available === false ? ' off' : '') + (p.hidden ? ' gone' : ''));
    var main = el('button', 'mtm'); main.type = 'button'; main.setAttribute('data-press', '');
    main.appendChild(el('b', '', p.title)); if (p.sub) main.appendChild(el('span', 'mts', p.sub));
    var st = el('span', 'mtt');
    if (p.hidden) st.appendChild(el('i', 'out', 'Quitado'));
    else if (p.available === false) st.appendChild(el('i', 'out', 'Agotado'));
    if (p.custom) st.appendChild(el('i', 'new', p.until ? 'Hasta ' + label(p.until) : 'Nuevo'));
    else if (p.until) st.appendChild(el('i', 'new', 'Hasta ' + label(p.until)));
    if (p.staffOnly) st.appendChild(el('i', '', 'Solo en caja'));
    if (p.kinds && p.kinds.indexOf('tienda') > -1) st.appendChild(el('i', '', 'No se prepara'));
    if (p.basePrice) st.appendChild(el('i', 'chg', 'Antes ' + p.basePrice));
    if ((p.groups || []).length) st.appendChild(el('i', '', 'Con opciones'));
    if (st.childNodes.length) main.appendChild(st);
    main.addEventListener('click', function () { if (p.hidden) { if (confirm('¿Volver a poner "' + p.title + '" en el menú?')) menuCall({ hide: p.id, value: false }); } else prodDialog(p); });
    t.appendChild(main);
    var pr = el('label', 'mprice'); pr.appendChild(el('span', '', 'Bs'));
    var inp = el('input'); inp.type = 'number'; inp.inputMode = 'decimal'; inp.min = '0'; inp.step = '0.5'; inp.value = String(p.price); inp.disabled = !!p.hidden; inp.setAttribute('aria-label', 'Precio de ' + p.title);
    var save = function () { var v = Math.round(Number(inp.value) * 100) / 100; if (!(v > 0)) { inp.value = String(p.price); return; } if (v === p.price) return; menuCall(p.custom ? { update: p.id, patch: { price: v } } : { over: p.id, patch: { price: v } }).catch(function () { inp.value = String(p.price); }); };
    inp.addEventListener('change', save); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); inp.blur(); } });
    pr.appendChild(inp); t.appendChild(pr);
    return t;
  }

  function menuCall(body) {
    return api('menu', 'POST', body).then(function (d) { Z.setExtra(d.extra); menuBody(); toast('Menú actualizado.'); return d; })
      .catch(function (e) { if (e.message !== 'auth') toast('No se pudo guardar: ' + e.message); throw e; });
  }
  /* Editar o agregar un producto: todo en una sola ventana. */
  var KIND_OPTS = [['comida', 'Cocina'], ['bebida', 'Barra'], ['comida,bebida', 'Cocina y barra'], ['tienda', 'No se prepara']];
  function prodDialog(p, preCat) {
    var m = Z.menu(), dlg = $('#prodDlg');
    if (!dlg) {
      dlg = el('dialog', 'dlg ldg pdlg'); dlg.id = 'prodDlg';
      dlg.innerHTML = '<form id="prodForm" novalidate><div class="pos-h"><h2 id="prodT"></h2><button class="x" type="button" data-press aria-label="Cerrar"></button></div>' +
        '<div class="pgrid">' +
        '<label class="field pwide"><span>Nombre</span><input id="prName" maxlength="60" required autocomplete="off"></label>' +
        '<label class="field pwide"><span>Descripción <i>(opcional, se ve en el menú)</i></span><input id="prSub" maxlength="90" placeholder="Ejemplo: con leche de almendra" autocomplete="off"></label>' +
        '<label class="field"><span>Precio (Bs)</span><input id="prPrice" type="number" inputmode="decimal" min="0" step="0.5" required></label>' +
        '<label class="field"><span>Categoría</span><select id="prCat"></select></label>' +
        '<div class="field pwide"><span>Se prepara en</span><div class="seg" id="prKind" role="radiogroup"></div></div>' +
        '<label class="field"><span>Disponible hasta <i>(opcional)</i></span><input id="prUntil" type="date"></label>' +
        '<div class="field pchecks"><label class="chk"><input type="checkbox" id="prOff"><span>Agotado por ahora</span></label>' +
        '<label class="chk"><input type="checkbox" id="prStaff"><span>Solo en caja (no sale en el menú del celular)</span></label></div>' +
        '</div><p class="muted" id="prHint"></p><p class="formerr" id="prErr" hidden></p>' +
        '<button class="btn btn--block" id="prSave" type="submit" data-press>Guardar</button>' +
        '<div class="practs" id="prActs"></div></form>';
      document.body.appendChild(dlg);
      dlg.querySelector('.x').appendChild(Z0Icon('x'));
      dlg.querySelector('.x').addEventListener('click', function () { dlg.close(); });
    }
    var catKindOf = function (id) { var c = m.categories.filter(function (x) { return x.id === id; })[0]; return c ? c.kind || 'comida' : 'comida'; };
    var cat = $('#prCat'); cat.textContent = ''; m.categories.forEach(function (c) { var o = el('option', '', c.name); o.value = c.id; cat.appendChild(o); });
    cat.value = p ? p.category : (preCat || (mc !== 'todo' ? mc : m.categories[0].id));
    var kind = p && p.kinds && p.kinds.length ? p.kinds.join(',') : catKindOf(cat.value), kindTouched = !!(p && p.kinds && p.kinds.length);
    var seg = $('#prKind'), paintKind = function () { seg.textContent = ''; KIND_OPTS.forEach(function (k) { var b = el('button', '', k[1]); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', k[0] === kind ? 'true' : 'false'); b.addEventListener('click', function () { kind = k[0]; kindTouched = true; paintKind(); }); seg.appendChild(b); }); };
    cat.onchange = function () { if (!kindTouched) { kind = catKindOf(cat.value); paintKind(); } };
    paintKind();
    $('#prodT').textContent = p ? 'Editar ' + p.title : 'Agregar producto';
    $('#prName').value = p ? p.title : ''; $('#prSub').value = p ? p.sub || '' : ''; $('#prPrice').value = p ? p.price : '';
    $('#prUntil').value = p ? p.until || '' : ''; $('#prOff').checked = !!(p && p.available === false); $('#prStaff').checked = !!(p && p.staffOnly);
    $('#prHint').textContent = p && p.groups && p.groups.length ? 'Este producto tiene opciones (tamaños o extras). Esas opciones y sus recargos no se cambian aquí.' : '';
    $('#prErr').hidden = true;
    var acts = $('#prActs'); acts.textContent = '';
    if (p) {
      acts.appendChild(btn('Duplicar', 'tool dark', function () { var q = Object.assign({}, p, { title: p.title + ' (copia)' }); delete q.id; dlg.close(); prodDialog(null, p.category); $('#prName').value = q.title; $('#prSub').value = q.sub || ''; $('#prPrice').value = q.price; $('#prName').select(); }, 'plus'));
      if (p.basePrice) acts.appendChild(btn('Precio original (' + p.basePrice + ' Bs)', 'tool dark', function () { menuCall({ over: p.id, patch: { price: p.basePrice } }).then(function () { dlg.close(); }); }));
      if (!p.custom && p.edited) acts.appendChild(btn('Deshacer todos los cambios', 'tool dark', function () { if (confirm('¿Volver "' + p.title + '" a como estaba en el menú original?')) menuCall({ over: p.id, patch: { reset: true } }).then(function () { dlg.close(); }); }));
      acts.appendChild(btn('Quitar del menú', 'tool dark danger', function () { if (!confirm('¿Quitar "' + p.title + '" del menú? Se puede volver a poner desde "Quitados del menú".')) return; menuCall(p.custom ? { remove: p.id } : { hide: p.id, value: true }).then(function () { dlg.close(); }); }));
    }
    $('#prodForm').onsubmit = function (e) {
      e.preventDefault(); var er = $('#prErr'); er.hidden = true;
      var f = { title: $('#prName').value.trim(), sub: $('#prSub').value.trim(), price: Number($('#prPrice').value), until: $('#prUntil').value, category: cat.value, kinds: kind.split(','), staffOnly: $('#prStaff').checked };
      if (f.title.length < 2) { er.textContent = 'Escribe el nombre del producto.'; er.hidden = false; return; }
      if (!(f.price > 0)) { er.textContent = 'Escribe el precio.'; er.hidden = false; return; }
      var off = $('#prOff').checked, wasOff = !!(p && p.available === false);
      $('#prSave').classList.add('is-loading');
      var call = p ? (p.custom ? { update: p.id, patch: f } : { over: p.id, patch: f }) : { add: f };
      api('menu', 'POST', call).then(function (d) {
        var id = p ? p.id : (d.extra.custom[d.extra.custom.length - 1] || {}).id;
        return (off !== wasOff && id) ? api('menu', 'POST', { off: id, value: off }) : d;
      }).then(function (d) { Z.setExtra(d.extra); menuBody(); toast(p ? 'Producto guardado.' : 'Producto agregado.'); dlg.close(); })
        .catch(function (x) { if (x.message !== 'auth') { er.textContent = x.message; er.hidden = false; } })
        .then(function () { $('#prSave').classList.remove('is-loading'); });
    };
    dlg.showModal(); $('#prName').focus();
  }

  window.Z0Books = { show: function (t) { if (t === 'ventas') renderVentas(); else if (t === 'libro') loadLibro(); else if (t === 'menu') renderMenu(); } };
  Z.onChange(function () { var t = Z.tab(); if (t === 'ventas') renderVentas(); else if (t === 'libro' && !lb.busy) renderLibro(); });
})();
