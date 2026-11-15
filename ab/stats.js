/* Reglas de decisión de las pruebas A/B. Sin dependencias: lo usa el panel y se prueba con `node ab/stats.js`. */
(function (root) {
  'use strict';
  var RULES = { minDays: 14, maxDays: 42, minViews: 200, minConversions: 20, alpha: 0.05 };

  // Función de distribución normal estándar (aproximación de Abramowitz y Stegun, error < 1e-7).
  function cdf(z) {
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989423 * Math.exp(-z * z / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }
  // Prueba z de dos proporciones, a dos colas.
  function pValue(c1, n1, c2, n2) {
    if (!n1 || !n2) return 1;
    var p = (c1 + c2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
    if (!se) return 1;
    return 2 * (1 - cdf(Math.abs((c1 / n1 - c2 / n2) / se)));
  }
  // a y b: { views, conv }. days: días corridos desde el primer visitante.
  function verdict(a, b, days) {
    var p = pValue(a.conv, a.views, b.conv, b.views);
    var enough = days >= RULES.minDays && a.views >= RULES.minViews && b.views >= RULES.minViews &&
      a.conv >= RULES.minConversions && b.conv >= RULES.minConversions;
    var out = { p: p, rateA: a.views ? a.conv / a.views : 0, rateB: b.views ? b.conv / b.views : 0 };
    if (!enough) {
      if (days >= RULES.maxDays) { out.state = 'sin-conclusion'; out.text = 'Sin conclusión. Pasaron ' + RULES.maxDays + ' días y no se juntó la muestra mínima. Deja la versión original y pasa a la siguiente prueba.'; }
      else { out.state = 'juntando'; out.text = 'Juntando datos. Hacen falta ' + RULES.minDays + ' días, ' + RULES.minViews + ' visitantes y ' + RULES.minConversions + ' conversiones por variante. No decidas todavía.'; }
    } else if (p < RULES.alpha) {
      out.state = out.rateB > out.rateA ? 'gana-b' : 'gana-a';
      out.text = (out.rateB > out.rateA ? 'Gana la variante B.' : 'Gana la original (A).') + ' La diferencia es mayor a la que daría el azar (p = ' + p.toFixed(3) + ').';
    } else if (days >= RULES.maxDays) {
      out.state = 'sin-conclusion'; out.text = 'Sin conclusión. Con la muestra completa la diferencia puede ser azar (p = ' + p.toFixed(2) + '). Deja la original y pasa a la siguiente prueba.';
    } else {
      out.state = 'juntando'; out.text = 'Muestra mínima completa, pero la diferencia todavía puede ser azar (p = ' + p.toFixed(2) + '). Sigue hasta el día ' + RULES.maxDays + '.';
    }
    return out;
  }
  var api = { RULES: RULES, pValue: pValue, verdict: verdict };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (require.main === module) {
      var assert = require('assert');
      assert(Math.abs(pValue(50, 1000, 50, 1000) - 1) < 1e-6);                 // iguales: p = 1
      assert(Math.abs(pValue(100, 1000, 150, 1000) - 0.00072) < 0.0003);       // valor conocido: z = 3.38
      assert.strictEqual(verdict({ views: 50, conv: 5 }, { views: 50, conv: 20 }, 3).state, 'juntando');      // aunque B "gane", sin muestra no hay veredicto
      assert.strictEqual(verdict({ views: 1000, conv: 100 }, { views: 1000, conv: 150 }, 20).state, 'gana-b');
      assert.strictEqual(verdict({ views: 1000, conv: 150 }, { views: 1000, conv: 100 }, 20).state, 'gana-a');
      assert.strictEqual(verdict({ views: 1000, conv: 100 }, { views: 1000, conv: 104 }, 20).state, 'juntando');
      assert.strictEqual(verdict({ views: 1000, conv: 100 }, { views: 1000, conv: 104 }, 45).state, 'sin-conclusion');
      assert.strictEqual(verdict({ views: 90, conv: 4 }, { views: 80, conv: 9 }, 50).state, 'sin-conclusion');
      console.log('stats.js: 8 comprobaciones pasan');
    }
  } else root.ABStats = api;
})(this);
