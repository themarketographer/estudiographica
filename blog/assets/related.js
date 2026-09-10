// "Quizas te interese": arma 3 tarjetas relacionadas al pie de cada articulo,
// usando window.EG_BLOG_POSTS. Prioriza posts que comparten categoria
// (el texto antes/despues del "·" en el eyebrow), y si no alcanzan, completa
// con los demas posts en el orden en que aparecen en el blog.
(function () {
  var container = document.getElementById('eg-related-posts');
  if (!container || !window.EG_BLOG_POSTS) return;

  var slug = document.body.getAttribute('data-post-slug');
  var all = window.EG_BLOG_POSTS;
  var current = null;
  for (var i = 0; i < all.length; i++) { if (all[i].slug === slug) { current = all[i]; break; } }

  function cats(p) {
    return String(p.eyebrow || '').split('·').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  }
  var currentCats = current ? cats(current) : [];
  var others = all.filter(function (p) { return p.slug !== slug; });

  others.forEach(function (p) {
    var shared = cats(p).filter(function (c) { return currentCats.indexOf(c) !== -1; }).length;
    p._score = shared;
  });
  others.sort(function (a, b) { return b._score - a._score; });

  var picked = others.slice(0, 3);
  if (!picked.length) return;

  function esc(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  container.innerHTML = picked.map(function (p) {
    return '<a class="post-card" href="/blog/' + p.slug + '/">' +
      '<img class="post-img" loading="lazy" src="' + p.img + '" alt="' + esc(p.title) + '" />' +
      '<div class="post-body">' +
        '<p class="post-eyebrow">' + esc(p.eyebrow) + '</p>' +
        '<p class="post-title">' + esc(p.title) + '</p>' +
        '<p class="post-excerpt">' + esc(p.excerpt) + '</p>' +
      '</div>' +
    '</a>';
  }).join('');
})();
