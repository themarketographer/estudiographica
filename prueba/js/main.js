
document.addEventListener('click', function(e){
  if(e.target && e.target.classList.contains('faq-btn')){
    const btn = e.target;
    const id = btn.getAttribute('aria-controls');
    const panel = document.getElementById(id);
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  }
});
