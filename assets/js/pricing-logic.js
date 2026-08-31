/**
 * pricing-logic.js — Estudio Graphica
 * FUENTE ÚNICA DE VERDAD para los precios de Sesión y Plan Mensual.
 *
 * Los números editables desde el panel (tarifas base, textos de "lo que
 * incluye" y extras a la carta) viven acá como bloques "const NOMBRE = [...]"
 * — el mismo patrón que usa el resto del sitio (ver /home/claude/cms) — así
 * Pablo los edita desde el CMS sin tocar código. Si algún día cambias un
 * precio a mano, cámbialo AQUÍ UNA SOLA VEZ. Tanto index.html (sección
 * #pricing embebida) como /precios y las páginas /gracias-sesion y
 * /gracias-plan deben leer de este archivo, nunca duplicar la fórmula
 * copiada y pegada.
 *
 * NOTA TÉCNICA: index.html usa React inline vía Babel, así que su
 * PricingSection sigue teniendo su propia copia de estas funciones
 * (por cómo está armado el bundle actual). Este archivo es la referencia
 * canónica: cualquier cambio de precio se hace aquí PRIMERO, y luego se
 * refleja a mano en PricingSection dentro de index.html. Es una
 * limitación conocida mientras index.html no se refactorice para
 * importar este script directamente.
 */

window.EGPricing = (function () {
  'use strict';

  // ── Tarifas base ──
  // "Base" = precio en el primer valor de cada tramo (ej. sesionBasicoBase
  // es el precio A LAS 8 FOTOS); "Incremento" = cuánto sube el precio por
  // cada foto adicional dentro de ese mismo tramo. Los tramos en sí (a
  // partir de cuántas fotos pasás de Básico a Estándar, etc) siguen siendo
  // código — cambiar ESO también movería los sliders de la calculadora,
  // así que no es un simple número y se deja fuera del panel a propósito.
  // "Descuento" es el % que se resta al pagar 6 o 12 meses de una vez.
  const preciosBase = [
    {
      sesionBasicoBase: 680,
      sesionBasicoIncremento: 65,
      sesionEstandarBase: 820,
      sesionEstandarIncremento: 40,
      sesionPremiumBase: 1150,
      sesionPremiumIncremento: 55,
      planBasicoBase: 580,
      planBasicoIncremento: 50,
      planEstandarBase: 680,
      planEstandarIncremento: 33,
      planPremiumBase: 880,
      planPremiumIncremento: 33,
      descuento6meses: 10,
      descuento12meses: 18,
    },
  ];

  // ── Textos de "lo que incluye" que no dependen de la cantidad de fotos
  // (los que sí dependen, como "Entrega en 24h" o "Edición profesional",
  // siguen en código más abajo porque están atados a los mismos umbrales
  // que definen los tramos de precio). ──
  const preciosTextos = [
    {
      beneficioSesion1: 'Planificación estratégica',
      beneficioSesion2: 'Foodstyling profesional',
      beneficioPlan1: '1 visita al mes',
      beneficioPlan2: 'Foodstyling de alimentos',
      beneficioAsesoria: 'Asesoría estratégica de marketing',
      beneficioPaginaWeb: 'Página web sencilla o tienda Take App',
      beneficioGuion: 'Guion + concepto creativo',
      beneficioMusica: 'Música con licencia',
    },
  ];

  // ── Extras a la carta ──
  // Se suman al precio base (sesión o plan) sin importar cuál tab esté
  // activo. Editables desde el panel: se pueden agregar, quitar o cambiar
  // precio/nombre/descripción libremente — "id" es una clave interna que
  // el panel genera solo (no se edita) y que no usa ningún otro archivo,
  // así que agregar o quitar extras acá nunca rompe nada más del sitio.
  //
  // tipo 'flat'    → precio fijo, se suma una sola vez si está marcado.
  // tipo 'stepper' → tiene selector de cantidad (min–max), precio =
  //                  precioUnidad × cantidad.
  const EXTRAS = [
    { id: 'landing', tipo: 'flat', label: 'Landing page básica', desc: 'Página de una sola sección con tu menú, ubicación y contacto directo', precio: 500 },
    { id: 'asesoria', tipo: 'flat', label: 'Asesoría de marketing', desc: 'Sesión estratégica de 1 hora para ordenar redes, delivery y anuncios', precio: 250 },
    { id: 'reels', tipo: 'stepper', label: 'Reel sencillo', desc: 'Grabación y edición simple, sin guion ni concepto creativo', precioUnidad: 180, min: 1, max: 6 },
    { id: 'menuDigital', tipo: 'flat', label: 'Menú animado para pantallas', desc: 'Diseño de menú con movimiento, listo para TV o tablet en el local', precio: 400 },
  ];

  // ── Sesión de fotos ──
  function calcSesion(cant) {
    var pb = preciosBase[0];
    if (cant <= 10) {
      return { paquete: 'Básico', precio: cant === 8 ? pb.sesionBasicoBase : Math.round(pb.sesionBasicoBase + (cant - 8) * pb.sesionBasicoIncremento) };
    }
    if (cant <= 18) {
      return { paquete: 'Estándar', precio: Math.round(pb.sesionEstandarBase + (cant - 10) * pb.sesionEstandarIncremento) };
    }
    return { paquete: 'Premium', precio: Math.round(pb.sesionPremiumBase + (cant - 18) * pb.sesionPremiumIncremento) };
  }

  // ── Video adicional (para plan mensual) ──
  function calcVideo(rls, dur) {
    var table = {
      3:  [1900, 2900, 3400],
      6:  [1850, 2750, 3000],
      12: [1750, 2600, 2800],
    };
    var t = table[dur] || table[3];
    var pv = rls <= 8
      ? t[0] + (t[1] - t[0]) * (rls - 4) / 4
      : t[1] + (t[2] - t[1]) * (rls - 8) / 4;
    return Math.round(pv);
  }

  // ── Plan mensual ──
  function calcPlan(cant, dur, video, rls) {
    var pb = preciosBase[0];
    var paquete, precio;
    if (cant <= 14) {
      paquete = 'Básico';
      precio = cant === 12 ? pb.planBasicoBase : Math.round(pb.planBasicoBase + (cant - 12) * pb.planBasicoIncremento);
    } else if (cant <= 20) {
      paquete = 'Estándar';
      precio = Math.round(pb.planEstandarBase + (cant - 14) * pb.planEstandarIncremento);
    } else {
      paquete = 'Premium';
      precio = Math.round(pb.planPremiumBase + (cant - 20) * pb.planPremiumIncremento);
    }
    if (dur === 6) precio = Math.round(precio * (1 - pb.descuento6meses / 100));
    else if (dur === 12) precio = Math.round(precio * (1 - pb.descuento12meses / 100));
    if (video) {
      precio = precio + calcVideo(rls, dur);
      paquete += ' + Video';
    }
    return { paquete: paquete, precio: precio };
  }

  // ── Beneficios dinámicos por cantidad (idéntico a PricingSection) ──
  function sesionBenefits(fotos) {
    var t = preciosTextos[0];
    return [
      t.beneficioSesion1,
      t.beneficioSesion2,
      fotos <= 10 ? 'Entrega en menos de 72h' : fotos <= 18 ? 'Entrega en menos de 48h' : 'Entrega en menos de 24h',
      fotos <= 10 ? 'Edición básica' : 'Edición profesional',
      fotos + ' fotos en alta calidad',
    ];
  }

  function planBenefits(planFotos, duracion, addVideo, reels) {
    var t = preciosTextos[0];
    var b = [
      planFotos + ' fotos/mes',
      t.beneficioPlan1,
      t.beneficioPlan2,
      planFotos <= 14 ? 'Entrega en 72h' : planFotos <= 20 ? 'Entrega en 48h' : 'Entrega en 24h',
      planFotos <= 14 ? 'Edición básica' : 'Edición profesional',
    ];
    if (planFotos >= 16) b.push(t.beneficioAsesoria);
    if (duracion >= 3 && planFotos >= 16) b.push(t.beneficioPaginaWeb);
    if (addVideo) b.push(reels + ' reels/mes', t.beneficioGuion, t.beneficioMusica);
    return b;
  }

  // seleccion: { [id]: cantidad }. Para los "flat" cualquier cantidad > 0
  // cuenta como una sola vez (el precio no cambia con la cantidad).
  function calcExtras(seleccion) {
    seleccion = seleccion || {};
    return EXTRAS.reduce(function (sum, ex) {
      var cant = seleccion[ex.id] || 0;
      if (cant <= 0) return sum;
      return sum + (ex.tipo === 'stepper' ? ex.precioUnidad * cant : ex.precio);
    }, 0);
  }

  return {
    calcSesion: calcSesion,
    calcPlan: calcPlan,
    calcVideo: calcVideo,
    sesionBenefits: sesionBenefits,
    planBenefits: planBenefits,
    EXTRAS: EXTRAS,
    calcExtras: calcExtras,
  };
})();
