/**
 * pricing-logic.js — Estudio Graphica
 * FUENTE ÚNICA DE VERDAD para los precios de Sesión y Plan Mensual.
 *
 * Extraído tal cual de PricingSection en index.html (no se cambió ningún
 * número). Si algún día cambias un precio, cámbialo AQUÍ UNA SOLA VEZ.
 * Tanto index.html (sección #pricing embebida) como /precios y las
 * páginas /gracias-sesion y /gracias-plan deben leer de este archivo,
 * nunca duplicar la fórmula copiada y pegada.
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

  // ── Sesión de fotos ──
  function calcSesion(cant) {
    if (cant <= 10) {
      return { paquete: 'Básico', precio: cant === 8 ? 680 : Math.round(680 + (cant - 8) * 65) };
    }
    if (cant <= 18) {
      return { paquete: 'Estándar', precio: Math.round(820 + (cant - 10) * 40) };
    }
    return { paquete: 'Premium', precio: Math.round(1150 + (cant - 18) * 55) };
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
    var paquete, precio;
    if (cant <= 14) {
      paquete = 'Básico';
      precio = cant === 12 ? 580 : Math.round(580 + (cant - 12) * 50);
    } else if (cant <= 20) {
      paquete = 'Estándar';
      precio = Math.round(680 + (cant - 14) * 33);
    } else {
      paquete = 'Premium';
      precio = Math.round(880 + (cant - 20) * 33);
    }
    if (dur === 6) precio = Math.round(precio * 0.9);
    else if (dur === 12) precio = Math.round(precio * 0.82);
    if (video) {
      precio = precio + calcVideo(rls, dur);
      paquete += ' + Video';
    }
    return { paquete: paquete, precio: precio };
  }

  // ── Beneficios dinámicos por cantidad (idéntico a PricingSection) ──
  function sesionBenefits(fotos) {
    return [
      'Planificación estratégica',
      'Foodstyling profesional',
      fotos <= 10 ? 'Entrega en menos de 72h' : fotos <= 18 ? 'Entrega en menos de 48h' : 'Entrega en menos de 24h',
      fotos <= 10 ? 'Edición básica' : 'Edición profesional',
      fotos + ' fotos en alta calidad',
    ];
  }

  function planBenefits(planFotos, duracion, addVideo, reels) {
    var b = [
      planFotos + ' fotos/mes',
      '1 visita al mes',
      'Foodstyling de alimentos',
      planFotos <= 14 ? 'Entrega en 72h' : planFotos <= 20 ? 'Entrega en 48h' : 'Entrega en 24h',
      planFotos <= 14 ? 'Edición básica' : 'Edición profesional',
    ];
    if (planFotos >= 16) b.push('Asesoría estratégica de marketing');
    if (duracion >= 3 && planFotos >= 16) b.push('Página web sencilla o tienda Take App');
    if (addVideo) b.push(reels + ' reels/mes', 'Guion + concepto creativo', 'Música con licencia');
    return b;
  }

  // ── Extras a la carta ──
  // Se suman al precio base (sesión o plan) sin importar cuál tab esté
  // activo. PRECIOS DE EJEMPLO — Pablo: ajústalos a lo que realmente
  // cobras antes de publicar (son placeholders razonables, no tarifas
  // validadas).
  //
  // tipo 'flat'    → precio fijo, se suma una sola vez si está marcado.
  // tipo 'stepper' → tiene selector de cantidad (min–max), precio =
  //                  precioUnidad × cantidad. Hoy solo "reels" lo usa.
  var EXTRAS = [
    { id: 'landing', tipo: 'flat', label: 'Landing page básica', desc: 'Página de una sola sección con tu menú, ubicación y contacto directo', precio: 500 },
    { id: 'asesoria', tipo: 'flat', label: 'Asesoría de marketing', desc: 'Sesión estratégica de 1 hora para ordenar redes, delivery y anuncios', precio: 250 },
    { id: 'reels', tipo: 'stepper', label: 'Reel sencillo', desc: 'Grabación y edición simple, sin guion ni concepto creativo', precioUnidad: 180, min: 1, max: 6 },
    { id: 'menuDigital', tipo: 'flat', label: 'Menú animado para pantallas', desc: 'Diseño de menú con movimiento, listo para TV o tablet en el local', precio: 400 },
  ];

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
