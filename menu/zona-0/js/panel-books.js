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
    var rows = paidSales(vs.day, vs.day);
    box.appendChild(head('Ventas del día', [nav, btn('Importar historial', 'tool dark', function () { var f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json'; f.addEventListener('change', function () { if (f.files[0]) importHistory(f.files[0]); }); f.click(); }, 'download'), btn('Descargar CSV', 'tool dark', function () { csvDownload('ventas-zona0-' + vs.day + '.csv', [['hora', 'pedido', 'tipo', 'productos', 'medio', 'total']].concat(rows.map(function (x) { return [hmOf(x.at), x.o.orderId, who(x.o), summary(x.o), methLabel(x.o), x.o.total]; }))); }, 'download')]));
    box.appendChild(el('p', 'daylab', cap(label(vs.day, true))));
    var total = rows.reduce(function (s, x) { return s + x.o.total; }, 0), byM = {};
    rows.forEach(function (x) { addByMethod(byM, x.o); });
    var kp = el('section', 'kpis k3'); kpi(kp, [['Vendido', money(total), true], ['Cobros', String(rows.length)], ['Cobro promedio', rows.length ? money(Math.round(total / rows.length * 10) / 10) : '0 Bs']]); box.appendChild(kp);
    var meth = el('div', 'chips'); ['efectivo', 'qr', 'tarjeta'].forEach(function (m) { var c = el('span', 'mchip'); c.appendChild(el('small', '', METHOD[m])); c.appendChild(el('b', 'num', money(byM[m] || 0))); meth.appendChild(c); }); box.appendChild(meth);
    var grid = el('div', 'two-col');
    var cells = rows.map(function (x) { var pr = el('button', 'mini', 'Ticket'); pr.type = 'button'; pr.addEventListener('click', function () { Z.printTicket(x.o); }); return { cells: [hmOf(x.at), x.o.orderId, who(x.o), summary(x.o), methLabel(x.o), money(x.o.total), pr] }; });
    grid.appendChild(table([['Hora'], ['Pedido'], ['Tipo'], ['Productos', 'wide'], ['Medio'], ['Total', 'r'], ['']], cells));
    var prod = {}; rows.forEach(function (x) { (x.o.lines || []).forEach(function (l) { prod[l.name] = (prod[l.name] || 0) + l.qty; }); });
    var top = Object.keys(prod).map(function (k) { return [k, prod[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 10);
    var side = el('div', 'bcard'); side.appendChild(el('h3', '', 'Lo más vendido'));
    if (!top.length) side.appendChild(el('p', 'muted', 'Todavía no hay ventas este día.')); top.forEach(function (t, i) { var r = el('div', 'rank'); r.appendChild(el('b', 'num', String(i + 1))); r.appendChild(el('span', '', t[0])); r.appendChild(el('i', 'num', t[1] + ' u.')); side.appendChild(r); });
    grid.appendChild(side); box.appendChild(grid);
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
  var mc = '', mq = '';
  function renderMenu() {
    var m = Z.menu(), box = $('#v-menu'); if (!m) return; box.textContent = ''; if (!mc) mc = 'todo';
    var open = el('a', 'tool dark'); open.href = '../'; open.target = '_blank'; open.rel = 'noopener'; open.appendChild(Z0Icon('arrow')); open.appendChild(el('span', '', 'Abrir el menú del cliente'));
    var add = btn('Agregar producto', 'tool', function () { prodDialog(null); }, 'list');
    box.appendChild(head('Menú', [add, open]));
    var catName = {}, catKind = {}, count = { todo: 0 }; m.categories.forEach(function (c) { catName[c.id] = c.name; catKind[c.id] = c.kind; count[c.id] = 0; });
    m.products.forEach(function (p) { if (!p.hidden) { count.todo++; count[p.category]++; } });
    var bar = el('div', 'mbar'), q = el('input', 'msearch'); q.type = 'search'; q.placeholder = 'Buscar producto'; q.value = mq; q.setAttribute('aria-label', 'Buscar producto');
    q.addEventListener('input', function () { mq = q.value; var pos = q.selectionStart; renderMenu(); var n = $('#v-menu .msearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
    bar.appendChild(q); box.appendChild(bar);
    var chips = el('div', 'pos-cats'); [{ id: 'todo', name: 'Todo', icon: 'list' }].concat(m.categories).forEach(function (c) { var b = el('button', 'chip'); b.type = 'button'; b.setAttribute('data-press', ''); b.setAttribute('aria-pressed', c.id === mc ? 'true' : 'false'); b.appendChild(Z0Icon(c.icon)); b.appendChild(document.createTextNode(c.name)); b.appendChild(el('small', 'cnt', String(count[c.id]))); b.addEventListener('click', function () { mc = c.id; renderMenu(); }); chips.appendChild(b); });
    box.appendChild(chips);
    var norm = function (t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }, nq = norm(mq);
    var list_ = m.products.filter(function (p) { return (mc === 'todo' || p.category === mc) && (!nq || norm(p.title + ' ' + p.sub).indexOf(nq) > -1); });
    var shown = list_.filter(function (p) { return !p.hidden; }), gone = list_.filter(function (p) { return p.hidden; });
    var grid = el('div', 'mgrid');
    shown.forEach(function (p) { grid.appendChild(menuCard(m, p, catName, catKind)); });
    if (!shown.length) box.appendChild(el('p', 'muted', nq ? 'Ningún producto coincide con la búsqueda.' : 'No hay productos en esta categoría.'));
    box.appendChild(grid);
    if (gone.length) {
      var g2 = el('div', 'mgone'); g2.appendChild(el('h3', '', 'Quitados del menú (' + gone.length + ')'));
      var gg = el('div', 'mgrid'); gone.forEach(function (p) { gg.appendChild(menuCard(m, p, catName, catKind)); }); g2.appendChild(gg); box.appendChild(g2);
    }
  }

  function menuCard(m, p, catName, catKind) {
    var c = el('article', 'mcard'), h = el('div', 'mh'); h.appendChild(el('b', '', p.title));
    var pr = el('label', 'mprice'); pr.appendChild(el('span', '', 'Bs'));
    var inp = el('input'); inp.type = 'number'; inp.inputMode = 'decimal'; inp.min = '0'; inp.step = '0.5'; inp.value = String(p.price); inp.disabled = !!p.hidden; inp.setAttribute('aria-label', 'Precio de ' + p.title);
    var save = function () {
      var v = Math.round(Number(inp.value) * 100) / 100;
      if (!(v > 0)) { inp.value = String(p.price); return; }
      if (v === p.price) return;
      menuCall(p.custom ? { update: p.id, patch: { price: v } } : { over: p.id, patch: { price: v } }).catch(function () { inp.value = String(p.price); });
    };
    inp.addEventListener('change', save); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    pr.appendChild(inp); h.appendChild(pr); c.appendChild(h);
    if (p.sub) c.appendChild(el('p', '', p.sub));
    var ks = p.kinds || [catKind[p.category] || 'comida'], tg = el('div', 'tags');
    tg.appendChild(el('span', 'tag', catName[p.category])); ks.forEach(function (k) { tg.appendChild(el('span', 'tag ' + (k === 'bebida' ? 'drink' : 'food'), k === 'bebida' ? 'Bebida' : 'Comida')); });
    (p.groups || []).forEach(function (gid) { var g = m.optionGroups[gid]; tg.appendChild(el('span', 'tag', g.label + ': ' + g.options.map(function (o) { return o.name + (o.price ? ' +' + o.price : ''); }).join(' / '))); });
    if (p.custom) tg.appendChild(el('span', 'tag new', p.until ? 'Temporal hasta ' + label(p.until) : 'Nuevo'));
    if (p.basePrice) tg.appendChild(el('span', 'tag chg', 'Antes Bs ' + p.basePrice));
    if (p.available === false && !p.hidden) { tg.appendChild(el('span', 'tag out', 'Agotado')); c.classList.add('is-off'); }
    if (p.hidden) c.classList.add('is-off');
    c.appendChild(tg);
    var act = el('div', 'macts');
    if (p.hidden) act.appendChild(btn('Volver al menú', 'mini', function () { menuCall({ hide: p.id, value: false }); }));
    else {
      act.appendChild(btn(p.available === false ? 'Volver a vender' : 'Marcar agotado', 'mini', function () { menuCall({ off: p.id, value: p.available !== false }); }));
      act.appendChild(btn('Editar', 'mini', function () { prodDialog(p); }));
      if (p.basePrice) act.appendChild(btn('Precio original', 'mini', function () { menuCall({ over: p.id, patch: { price: p.basePrice } }); }));
      act.appendChild(btn('Quitar', 'mini', function () {
        if (!confirm('¿Quitar "' + p.title + '" del menú? Se puede volver a poner desde "Quitados del menú".')) return;
        menuCall(p.custom ? { remove: p.id } : { hide: p.id, value: true });
      }));
    }
    c.appendChild(act); return c;
  }

  function menuCall(body) {
    return api('menu', 'POST', body).then(function (d) { Z.setExtra(d.extra); renderMenu(); toast('Menú actualizado.'); return d; })
      .catch(function (e) { if (e.message !== 'auth') toast('No se pudo guardar: ' + e.message); throw e; });
  }
  function prodDialog(p) {
    var m = Z.menu(), dlg = $('#prodDlg');
    if (!dlg) {
      dlg = el('dialog', 'dlg ldg'); dlg.id = 'prodDlg';
      dlg.innerHTML = '<form id="prodForm" novalidate><div class="pos-h"><h2 id="prodT"></h2><button class="x" type="button" data-press data-close aria-label="Cerrar"></button></div>' +
        '<label class="field"><span>Nombre</span><input id="prName" maxlength="60" required></label>' +
        '<label class="field"><span>Detalle <i>(opcional)</i></span><input id="prSub" maxlength="90" placeholder="Ejemplo: con leche de almendra"></label>' +
        '<div class="two"><label class="field"><span>Precio (Bs)</span><input id="prPrice" type="number" inputmode="decimal" min="0" step="0.5" required></label>' +
        '<label class="field"><span>Categoría</span><select id="prCat"></select></label></div>' +
        '<label class="field"><span>Disponible hasta <i>(opcional, para productos temporales)</i></span><input id="prUntil" type="date"></label>' +
        '<p class="muted" id="prHint"></p><p class="formerr" id="prErr" hidden></p>' +
        '<button class="btn btn--block" id="prSave" type="submit" data-press>Guardar</button></form>';
      document.body.appendChild(dlg);
      dlg.querySelector('.x').appendChild(Z0Icon('x'));
      dlg.querySelector('.x').addEventListener('click', function () { dlg.close(); });
    }
    var cat = $('#prCat'); cat.textContent = ''; m.categories.forEach(function (c) { var o = el('option', '', c.name + (c.kind === 'bebida' ? ' (barra)' : ' (cocina)')); o.value = c.id; cat.appendChild(o); });
    $('#prodT').textContent = p ? 'Editar producto' : 'Agregar producto';
    $('#prName').value = p ? p.title : ''; $('#prSub').value = p ? p.sub : ''; $('#prPrice').value = p ? p.price : ''; cat.value = p ? p.category : (mc !== 'todo' ? mc : m.categories[0].id); cat.disabled = !!p; $('#prUntil').value = p ? p.until || '' : ''; $('#prUntil').closest('label').hidden = !!(p && !p.custom);
    $('#prHint').textContent = 'Va a cocina o a barra según la categoría. Los productos agregados aquí no tienen opciones. Las opciones de los productos del menú base no se editan desde aquí.'; $('#prErr').hidden = true;
    $('#prodForm').onsubmit = function (e) {
      e.preventDefault(); var er = $('#prErr'); er.hidden = true;
      var f = { title: $('#prName').value, sub: $('#prSub').value, price: Number($('#prPrice').value), until: $('#prUntil').value };
      if (f.title.trim().length < 2) { er.textContent = 'Escribe el nombre del producto.'; er.hidden = false; return; }
      if (!(f.price > 0)) { er.textContent = 'Escribe el precio.'; er.hidden = false; return; }
      $('#prSave').classList.add('is-loading');
      menuCall(p ? (p.custom ? { update: p.id, patch: f } : { over: p.id, patch: { title: f.title, sub: f.sub, price: f.price } }) : { add: Object.assign({ category: cat.value }, f) })
        .then(function () { dlg.close(); }).catch(function (x) { er.textContent = x.message; er.hidden = false; })
        .then(function () { $('#prSave').classList.remove('is-loading'); });
    };
    dlg.showModal();
  }

  window.Z0Books = { show: function (t) { if (t === 'ventas') renderVentas(); else if (t === 'libro') loadLibro(); else if (t === 'menu') renderMenu(); } };
  Z.onChange(function () { var t = Z.tab(); if (t === 'ventas') renderVentas(); else if (t === 'libro' && !lb.busy) renderLibro(); });
})();
