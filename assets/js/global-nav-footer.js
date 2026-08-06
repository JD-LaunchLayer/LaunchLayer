document.addEventListener('DOMContentLoaded', function() {
  // Find all accordion triggers in the footer
  const triggers = document.querySelectorAll('.footer-matrix-title, .service-coverage-accordion-header, [data-accordion-trigger]');

  triggers.forEach(function(trigger) {
    trigger.style.cursor = 'pointer';

    trigger.addEventListener('click', function(e) {
      e.stopPropagation();

      // Toggle active class on button
      this.classList.toggle('active');

      // Find sibling panel (next element or parent container list)
      let panel = this.nextElementSibling;
      if (!panel) {
        panel = this.parentElement.querySelector('ul, .service-coverage-grid, .footer-matrix-list');
      }

      if (panel) {
        panel.classList.toggle('open');
      }
    });
  });
});
