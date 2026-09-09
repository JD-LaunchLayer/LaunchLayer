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

(function highlightBlogFilterPills() {
  const pills = document.querySelectorAll('.blog-filters .filter-pill');
  if (!pills.length) return;

  function normalize(path) {
    let value = String(path || '').split('?')[0].split('#')[0];
    try {
      value = decodeURIComponent(value);
    } catch (err) {
      /* keep the raw path if it is not valid URI encoding */
    }
    return value.replace(/\+/g, ' ').replace(/\/index\.html$/i, '').replace(/\/+$/, '').toLowerCase();
  }

  const current = normalize(window.location.pathname);
  let match = null;

  pills.forEach(function (pill) {
    pill.classList.remove('active-filter');
    pill.removeAttribute('aria-current');
    const href = pill.getAttribute('href') || '';
    const target = normalize(href);
    if (target === '/blog') return;
    if (current === target || current.indexOf(target + '/') === 0) {
      match = pill;
    }
  });

  const active = match || document.querySelector('.blog-filters .filter-pill[href="/blog"]');
  if (active) {
    active.classList.add('active-filter');
    active.setAttribute('aria-current', 'page');
  }
})();
