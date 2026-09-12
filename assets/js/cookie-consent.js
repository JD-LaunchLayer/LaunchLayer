/* Dismissible cookie notice only. Third-party widgets (Maps, Featurable, Bark) load as normal; this does not gate them or collect consent. */
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
        '<p class="ll-cookie-notice-text">This site loads Google Maps, review widgets, and a Bark badge as part of the page. Those tools may set cookies. <a class="ll-cookie-notice-privacy" href="/privacy-policy">Privacy policy</a></p>' +
        '<button type="button" class="ll-cookie-notice-dismiss">Got it</button>' +
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
