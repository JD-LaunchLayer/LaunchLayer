document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(e) {
    const trigger = e.target.closest('.service-coverage-accordion-header, [data-accordion]');
    if (!trigger) return;
    
    e.preventDefault();
    trigger.classList.toggle('active');
    
    // Find the matrix grid or panel list
    const panel = trigger.nextElementSibling || trigger.parentElement.querySelector('.footer-matrix-list, .service-coverage-panel, .service-coverage-grid');
    if (panel) {
      panel.classList.toggle('open');
    }
  });
});
