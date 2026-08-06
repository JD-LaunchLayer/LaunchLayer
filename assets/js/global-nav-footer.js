document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    const trigger = e.target.closest('.service-coverage-accordion-header, .footer-matrix-title, [data-accordion]');
    if (!trigger) return;

    e.preventDefault();
    e.stopPropagation();

    trigger.classList.toggle('active');

    // Find the sibling or child list panel
    const container = trigger.closest('.footer-matrix-column, .service-coverage-block') || trigger.parentElement;
    const panel = trigger.nextElementSibling || (container ? container.querySelector('.footer-matrix-list, .service-coverage-panel, ul, grid') : null);

    if (panel) {
      panel.classList.toggle('open');
    }
  });
});
