// Reveal on scroll
(function(){
  var els = document.querySelectorAll('.reveal');
  if(!('IntersectionObserver' in window)){ els.forEach(function(e){ e.classList.add('is-visible'); }); return; }
  var io = new IntersectionObserver(function(entries){ entries.forEach(function(entry){ if(entry.isIntersecting){ entry.target.classList.add('is-visible'); io.unobserve(entry.target);} }); },{threshold:.15});
  els.forEach(function(e){ io.observe(e); });
})();
// Modal imágenes portafolio
(function(){
  var pf = document.getElementById('pf');
  var modal = document.getElementById('modal');
  var modalImg = document.getElementById('modalImg');
  var modalCap = document.getElementById('modalCap');
  var close = document.getElementById('modalClose');
  if(!pf) return;
  pf.addEventListener('click', function(e){
    var img = e.target.closest('img');
    if(!img) return;
    modal.style.display='flex';
    modal.style.flexDirection='column';
    modal.style.alignItems='center';
    modal.style.justifyContent='center';
    modalImg.src = img.src; modalImg.alt = img.alt || '';
    modalCap.textContent = img.getAttribute('data-caption')||'';
    document.body.style.overflow='hidden';
  });
  function closeModal(){ modal.style.display='none'; document.body.style.overflow='auto'; }
  if(close) close.addEventListener('click', closeModal);
  modal && modal.addEventListener('click', function(ev){ if(ev.target===modal) closeModal(); });
})();
// Comparador Before/After
(function(){
  var slider = document.getElementById('cmpSlider');
  var before = document.getElementById('cmpBefore');
  var divider = document.getElementById('cmpDivider');
  var box = document.getElementById('cmp');
  if(!slider||!before||!box) return;
  function setPos(px){
    var r = box.getBoundingClientRect();
    var p = ((px - r.left)/r.width)*100; if(p<0) p=0; if(p>100) p=100;
    before.style.clipPath = 'polygon(0 0,'+p+'% 0,'+p+'% 100%,0 100%)';
    slider.style.left = p+'%';
    divider.style.left = p+'%';
  }
  function move(e){ setPos(e.touches?e.touches[0].clientX:e.clientX); }
  function start(e){ e.preventDefault(); document.addEventListener('mousemove',move); document.addEventListener('touchmove',move,{passive:false}); }
  function end(){ document.removeEventListener('mousemove',move); document.removeEventListener('touchmove',move); }
  slider.addEventListener('mousedown',start); slider.addEventListener('touchstart',start,{passive:false});
  document.addEventListener('mouseup',end); document.addEventListener('touchend',end);
})();
// Logos autoscroll + drag
(function(){
  var wrap = document.getElementById('logosWrap');
  var track = document.getElementById('logos');
  if(!wrap||!track) return;
  var items = Array.prototype.slice.call(track.children);
  items.forEach(function(n){ track.appendChild(n.cloneNode(true)); });
  var pos = 0, baseSpeed = 2.6, speed = baseSpeed, raf = null;
  var dragging=false, startX=0, startPos=0, lastX=0, lastT=0, velocity=0;
  var THROW_MULTIPLIER = 3.2, FRICTION = 0.94, MAX_THROW = 4.5;
  function loop(){ pos += speed; var half = track.scrollWidth/2; if(pos>=half) pos=0; track.style.transform='translateX(' + (-pos) + 'px)'; raf = requestAnimationFrame(loop); }
  function startLoop(){ if(!raf) raf = requestAnimationFrame(loop); }
  function stopLoop(){ if(raf){ cancelAnimationFrame(raf); raf=null; } }
  function normalize(){ var half = track.scrollWidth/2; if(pos<0) pos = half + pos%half; if(pos>=half) pos%=half; }
  function onDown(e){ dragging=true; wrap.classList.add('dragging'); stopLoop(); startX=(e.touches?e.touches[0].pageX:e.pageX); startPos=pos; lastX=startX; lastT=performance.now(); velocity=0; }
  function onMove(e){ if(!dragging) return; e.preventDefault(); var x=(e.touches?e.touches[0].pageX:e.pageX); var now=performance.now(); var dx=x-startX; pos=startPos-dx; normalize(); track.style.transform='translateX(' + (-pos) + 'px)'; var dt=Math.max(1, now-lastT); var v=(x-lastX)/dt; velocity=0.8*velocity+0.2*v; lastX=x; lastT=now; }
  function onUp(){ if(!dragging) return; dragging=false; wrap.classList.remove('dragging'); var throwBoost = Math.max(Math.min(velocity*THROW_MULTIPLIER, MAX_THROW), -MAX_THROW); speed = baseSpeed + (-throwBoost); (function decay(){ speed = baseSpeed + (speed - baseSpeed)*FRICTION; if(Math.abs(speed - baseSpeed) > 0.05){ requestAnimationFrame(decay); } else { speed = baseSpeed; } })(); startLoop(); }
  wrap.addEventListener('mousedown', onDown); wrap.addEventListener('touchstart', onDown, {passive:false});
  window.addEventListener('mousemove', onMove, {passive:false}); window.addEventListener('touchmove', onMove, {passive:false});
  window.addEventListener('mouseup', onUp); window.addEventListener('touchend', onUp);
  wrap.addEventListener('mouseenter', stopLoop); wrap.addEventListener('mouseleave', function(){ if(!dragging) startLoop(); });
  document.addEventListener('visibilitychange', function(){ if(document.hidden) stopLoop(); else if(!dragging) startLoop(); });
  startLoop(); track.setAttribute('data-autoscroll','on');
})();
// Tracking de conversiones: botones
(function(){
  function sendEvents(tag, params){
    try { gtag('event', tag, params || {}); } catch(e){}
    try { fbq('trackCustom', tag.replace(/_/g,' ').replace(/\w/g,c=>c.toUpperCase()), params || {}); } catch(e){}
  }
  function addClickTracking(selector, eventName){
    document.querySelectorAll(selector).forEach(function(el){
      el.addEventListener('click', function(){
        var where = el.textContent.trim();
        sendEvents(eventName, { location: where });
      });
    });
  }
  addClickTracking('a.track-agendar', 'agendar_reunion');
  addClickTracking('a.track-portafolio', 'ver_portafolio');
})();
