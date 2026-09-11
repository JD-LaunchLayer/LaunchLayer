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
  trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
}, true);

(function syncFooterAccordionState() {
  const mobile = window.matchMedia('(max-width: 767px)').matches;
  document.querySelectorAll('.footer-matrix-title[data-accordion], .service-coverage-accordion-header[data-accordion]').forEach(function (trigger) {
    const section = trigger.closest('.footer-matrix-section');
    const panel =
      trigger.nextElementSibling ||
      (section && section.querySelector('.footer-matrix-grid, .footer-matrix-list, .service-coverage-panel, .service-coverage-grid'));
    const open = mobile ? !!(panel && panel.classList.contains('open')) : true;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
})();

(function syncServicesDropdownExpanded() {
  document.querySelectorAll('.ll-dropdown-container').forEach(function (box) {
    const btn = box.querySelector('.ll-dropdown-trigger');
    if (!btn) return;
    function sync() {
      btn.setAttribute('aria-expanded', box.matches(':hover, :focus-within') ? 'true' : 'false');
    }
    box.addEventListener('mouseenter', sync);
    box.addEventListener('mouseleave', sync);
    box.addEventListener('focusin', sync);
    box.addEventListener('focusout', sync);
  });
})();

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

(function loadFeaturableWhenVisible() {
  var mount = document.querySelector('[data-featurable-async]');
  if (!mount) return;

  function inject() {
    if (document.querySelector('script[data-ll-featurable]')) return;
    var s = document.createElement('script');
    s.src = '/assets/animate/bundle.js';
    s.charset = 'UTF-8';
    s.dataset.llFeaturable = '1';
    document.body.appendChild(s);
  }

  // Empty mount nodes often have 0×0 boxes and never intersect. Observe a
  // sized parent (reviews section / reviews page) so load still fires.
  var target =
    mount.closest('.llhm-section, .llrevpg-page, .llrevpg-widget-wrap, .llhm-reviews-widget') ||
    mount.parentElement ||
    mount;

  if (typeof IntersectionObserver !== 'function') {
    inject();
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      if (entries.some(function (entry) { return entry.isIntersecting; })) {
        io.disconnect();
        inject();
      }
    },
    { rootMargin: '200px 0px', threshold: 0 }
  );
  io.observe(target);
})();

(function containReviewsFeaturable() {
  var wrap = document.querySelector('.llrevpg-widget-wrap');
  if (!wrap) return;

  /* Height/flow only. Never max-width slick slides/track — Featurable's
     multi-card mobile layout needs natural slide widths. */
  var css = [
    ':host { display: block !important; position: relative !important; box-sizing: border-box !important; width: 100% !important; height: auto !important; overflow: hidden !important; }',
    ':host > div { position: relative !important; height: auto !important; top: auto !important; }',
    '.slick-slider, .slick-list, .slick-track, .slick-slide { height: auto !important; max-height: none !important; }',
    '.slick-slider { position: relative !important; top: auto !important; }',
    /* Featurable buttons (and default slick arrows) can sit slightly outside;
       keep them inside the overlap clip without adding page gutters. */
    '.slick-prev, [class*="Carousel-module__btnLeft"] { left: 4px !important; z-index: 2 !important; }',
    '.slick-next, [class*="Carousel-module__btnRight"] { right: 4px !important; z-index: 2 !important; }',
    '[class*="App-module__container"], [class*="Carousel-module__parent"], [class*="Carousel-module__carousel"] {',
    '  position: relative !important; top: auto !important; height: auto !important; margin-top: 0 !important;',
    '}'
  ].join('\n');

  function inject() {
    var host = wrap.querySelector('.shadow-wrapper');
    if (!host || !host.shadowRoot) return false;
    if (host.shadowRoot.getElementById('ll-reviews-contain')) return true;
    var style = document.createElement('style');
    style.id = 'll-reviews-contain';
    style.textContent = css;
    host.shadowRoot.appendChild(style);
    return true;
  }

  if (inject()) return;
  var observer = new MutationObserver(function () {
    if (inject()) observer.disconnect();
  });
  observer.observe(wrap, { childList: true, subtree: true });
})();
