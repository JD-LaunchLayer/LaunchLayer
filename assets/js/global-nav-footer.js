document.addEventListener('click', function(e) {
  const trigger = e.target.closest('.footer-matrix-title, .service-coverage-accordion-header, [data-accordion]');
  if (!trigger) return;

  // Ignore clicks that originate on links inside the header (none today,
  // but keep navigation safe if markup changes).
  if (e.target.closest('a') && e.target.closest('a') !== trigger) return;

  e.preventDefault();
  e.stopPropagation();

  const section = trigger.closest('.footer-matrix-section');
  const panel =
    trigger.nextElementSibling ||
    (section && section.querySelector('.footer-matrix-grid, .footer-matrix-list, .service-coverage-panel, .service-coverage-grid'));

  const willOpen = !(panel && panel.classList.contains('open'));

  trigger.classList.toggle('active', willOpen);
  if (section) section.classList.toggle('active', willOpen);
  if (panel) panel.classList.toggle('open', willOpen);
}, true);
