/* ==========================================================================
   Estados de botones — spinner de carga para botones que abren Cal.com
   Cuando alguien hace click en un botón con [data-cal-link], el widget de
   Cal.com tarda un momento en cargar el iframe. Mientras tanto, mostramos
   un spinner (clase .is-loading, definida en button-states.css) para que
   quede claro que el click funcionó y algo está pasando.
   ========================================================================== */
(function () {
  "use strict";

  function addLoading(btn) {
    if (!btn || btn.classList.contains("is-loading")) return;
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
  }

  function removeLoading(btn) {
    if (!btn) return;
    btn.classList.remove("is-loading");
    btn.removeAttribute("aria-busy");
  }

  document.addEventListener(
    "click",
    function (e) {
      var btn = e.target.closest("[data-cal-link]");
      if (!btn) return;

      addLoading(btn);

      var done = false;
      var observer;
      var fallback;

      var finish = function () {
        if (done) return;
        done = true;
        removeLoading(btn);
        if (observer) observer.disconnect();
        clearTimeout(fallback);
      };

      observer = new MutationObserver(function () {
        if (document.querySelector('iframe[src*="cal.com"]')) finish();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // Si algo falla (bloqueador de scripts, red lenta, etc.) el botón
      // no se queda trabado en "cargando" para siempre.
      fallback = setTimeout(finish, 4000);
    },
    true
  );
})();
