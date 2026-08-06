document.addEventListener('click', function(e) {
  const trigger = e.target.closest('.footer-matrix-title, .service-coverage-accordion-header');
  if (!trigger) return;

  e.preventDefault();
  e.stopPropagation();

  trigger.classList.toggle('active');

  const panel = trigger.nextElementSibling;
  if (panel) {
    panel.classList.toggle('open');
  }
}, true);
