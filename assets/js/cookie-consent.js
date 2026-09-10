/* Low-key cookie notice. Third-party widgets load as normal; this only
   tells visitors they are in use and can be dismissed. */
(function () {
  'use strict';

  var STORAGE_KEY = 'll_cookie_notice';
  var COOKIE_MAX_AGE = 31536000; /* 1 year */

  function readCookie(name) {
    var parts = ('; ' + document.cookie).split('; ' + name + '=');
    if (parts.length < 2) return '';
    return parts.pop().split(';').shift();
  }

  function isDismissed() {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'dismissed') return true;
    } catch (err) {
      /* private mode / blocked storage */
    }
    return readCookie(STORAGE_KEY) === 'dismissed';
  }

  function saveDismissed() {
    try {
      window.localStorage.setItem(STORAGE_KEY, 'dismissed');
    } catch (err) {
      /* ignore */
    }
    document.cookie =
      STORAGE_KEY + '=dismissed; Max-Age=' + COOKIE_MAX_AGE + '; Path=/; SameSite=Lax';
  }

  function bannerEl() {
    return document.getElementById('ll-cookie-notice');
  }

  function syncBannerHeight() {
    var el = bannerEl();
    var h = 0;
    if (el && !el.hasAttribute('hidden')) h = el.offsetHeight || 0;
    document.documentElement.style.setProperty('--ll-consent-banner-h', h + 'px');
  }

  function hideNotice() {
    var el = bannerEl();
    if (el) el.setAttribute('hidden', '');
    document.body.classList.remove('ll-consent-open');
    syncBannerHeight();
  }

  function showNotice() {
    var el = bannerEl();
    if (!el) return;
    el.removeAttribute('hidden');
    document.body.classList.add('ll-consent-open');
    syncBannerHeight();
  }

  function buildNotice() {
    if (bannerEl()) return;

    var wrap = document.createElement('div');
    wrap.id = 'll-cookie-notice';
    wrap.className = 'll-cookie-notice';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'Cookie notice');
    wrap.setAttribute('hidden', '');

    wrap.innerHTML =
      '<div class="ll-cookie-notice-inner">' +
        '<p class="ll-cookie-notice-text">This site uses Google Maps, review widgets, and a Bark badge. They may set cookies. <a class="ll-cookie-notice-privacy" href="/privacy-policy">Privacy policy</a></p>' +
        '<button type="button" class="ll-cookie-notice-dismiss">OK</button>' +
      '</div>';

    document.body.appendChild(wrap);

    wrap.querySelector('.ll-cookie-notice-dismiss').addEventListener('click', function () {
      saveDismissed();
      hideNotice();
    });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(syncBannerHeight);
      ro.observe(wrap);
    }
    window.addEventListener('resize', syncBannerHeight);
  }

  function start() {
    buildNotice();
    if (isDismissed()) return;
    showNotice();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
