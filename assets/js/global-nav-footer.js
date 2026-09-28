document.addEventListener('click', function(e) {
  const trigger = e.target.closest('.footer-matrix-title, .service-coverage-accordion-header, [data-accordion]');
  if (!trigger) return;

  // The footer coverage list is always open from 768px up: don't toggle it there,
  // so aria-expanded="true" stays truthful.
  if (trigger.closest('.launchlayer-master-footer') && !window.matchMedia('(max-width: 767px)').matches) return;

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
  const mq = window.matchMedia('(max-width: 767px)');
  function sync() {
  const mobile = mq.matches;
  document.querySelectorAll('.footer-matrix-title[data-accordion], .service-coverage-accordion-header[data-accordion]').forEach(function (trigger) {
    const section = trigger.closest('.footer-matrix-section');
    const panel =
      trigger.nextElementSibling ||
      (section && section.querySelector('.footer-matrix-grid, .footer-matrix-list, .service-coverage-panel, .service-coverage-grid'));
    const open = mobile ? !!(panel && panel.classList.contains('open')) : true;
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  }
  sync();
  if (mq.addEventListener) mq.addEventListener('change', sync);
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

(function fixBarkWidgetImageAlt() {
  // Bark's embed injects a badge <img> with no alt — fails PSI a11y + SEO.
  var ALT = 'LaunchLayer on Bark';

  function apply(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.bark-widget img, .bark-widget-wrapper img').forEach(function (img) {
      if (!img.hasAttribute('alt')) img.setAttribute('alt', ALT);
    });
  }

  apply(document);

  var mount = document.querySelector('.bark-widget-wrapper');
  if (!mount || typeof MutationObserver !== 'function') return;

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var nodes = mutations[i].addedNodes;
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        if (node.nodeType !== 1) continue;
        if (node.matches && node.matches('img')) {
          if (!node.hasAttribute('alt')) node.setAttribute('alt', ALT);
        } else {
          apply(node);
        }
      }
    }
  });
  observer.observe(mount, { childList: true, subtree: true });
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

(function keepCallPillOffFooterContent() {
  // The fixed "Call Workshop" pill hides instantly while any footer block overlaps the strip it
  // occupies, and comes back in the footer's 104px tail. Class-based, so page scripts that also
  // manage the pill (e.g. /contact/) keep working independently.
  // Measured from the blocks' boxes on scroll. WebKit's IntersectionObserver drops the overlap
  // at the bottom of a long page once the cookie notice has lifted the pill.
  var pill = document.querySelector('.launchlayer-floating-pill-container');
  var footer = document.querySelector('.launchlayer-master-footer');
  if (!pill || !footer) return;
  var btn = pill.querySelector('.launchlayer-floating-btn');
  var blocks = [].slice.call(footer.querySelectorAll('.footer-top-segment, .footer-matrix-section, .footer-compliance-bar'));
  if (!blocks.length) return;
  // Band = pill's bottom offset + its height + 16px breathing room (grows while the cookie notice lifts the pill).
  function band() { return Math.ceil((parseFloat(getComputedStyle(pill).bottom) || 24) + ((btn && btn.offsetHeight) || 48) + 16); }
  function hiding() {
    var line = window.innerHeight - band();
    return blocks.some(function (el) {
      var r = el.getBoundingClientRect();
      return r.width && r.bottom > line && r.top < window.innerHeight + 160;
    });
  }
  function sync() { pill.classList.toggle('ll-fab-footer', hiding()); }
  var noticeWatch;
  function watchNotice() {
    var n = document.getElementById('ll-cookie-notice');
    if (!n || noticeWatch || !window.ResizeObserver) return;
    noticeWatch = new ResizeObserver(function () { sync(); requestAnimationFrame(sync); });
    noticeWatch.observe(n);
  }
  sync();
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync);
  watchNotice();
  new MutationObserver(function () { watchNotice(); sync(); requestAnimationFrame(sync); }).observe(document.body, { attributes: true, attributeFilter: ['class'], childList: true });
})();
