/* Optional embed cookies (Maps, Featurable, Trustpilot, Bark).
   First-party preference only — no third-party scripts until Accept. */
(function () {
  'use strict';

  var STORAGE_KEY = 'll_embed_consent';
  var COOKIE_MAX_AGE = 15552000; /* 180 days */
  var TTL_MS = COOKIE_MAX_AGE * 1000;
  var EVENT_NAME = 'll-embeds-allowed';

  window.llEmbedsAllowed = false;

  function now() {
    return Date.now ? Date.now() : new Date().getTime();
  }

  function readCookie(name) {
    var parts = ('; ' + document.cookie).split('; ' + name + '=');
    if (parts.length < 2) return '';
    return parts.pop().split(';').shift();
  }

  function writeCookie(value) {
    document.cookie =
      STORAGE_KEY +
      '=' +
      value +
      '; Max-Age=' +
      COOKIE_MAX_AGE +
      '; Path=/; SameSite=Lax';
  }

  function readStored() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && (data.c === 'accept' || data.c === 'reject') && typeof data.t === 'number') {
          if (now() - data.t < TTL_MS) return data.c;
        }
      }
    } catch (err) {
      /* private mode / blocked storage */
    }
    var cookie = readCookie(STORAGE_KEY);
    if (cookie === 'accept' || cookie === 'reject') return cookie;
    return '';
  }

  function saveChoice(choice) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ c: choice, t: now() })
      );
    } catch (err) {
      /* ignore */
    }
    writeCookie(choice);
  }

  function fireAllowed() {
    window.llEmbedsAllowed = true;
    var ev;
    try {
      ev = new Event(EVENT_NAME);
    } catch (err) {
      ev = document.createEvent('Event');
      ev.initEvent(EVENT_NAME, false, false);
    }
    document.dispatchEvent(ev);
  }

  function activateEmbeds() {
    var nodes = document.querySelectorAll('script[data-ll-consent="embeds"]');
    var i;
    for (i = 0; i < nodes.length; i++) {
      var old = nodes[i];
      if (!old || !old.parentNode) continue;
      var s = document.createElement('script');
      var src = old.getAttribute('src');
      if (src) s.src = src;
      else s.text = old.textContent || '';
      if (old.charset) s.charset = old.charset;
      if (old.hasAttribute('defer')) s.defer = true;
      if (old.hasAttribute('async')) s.async = true;
      var cross = old.getAttribute('crossorigin') || old.getAttribute('crossOrigin');
      if (cross) s.crossOrigin = cross;
      old.parentNode.replaceChild(s, old);
    }
    fireAllowed();
  }

  function bannerEl() {
    return document.getElementById('ll-consent-banner');
  }

  function syncBannerHeight() {
    var el = bannerEl();
    var h = 0;
    if (el && !el.hasAttribute('hidden')) h = el.offsetHeight || 0;
    document.documentElement.style.setProperty('--ll-consent-banner-h', h + 'px');
  }

  function showBanner(fromSettings) {
    var el = bannerEl();
    if (!el) return;
    el.removeAttribute('hidden');
    document.body.classList.add('ll-consent-open');
    syncBannerHeight();
    if (fromSettings) {
      var title = document.getElementById('ll-consent-title');
      if (title && title.focus) title.focus();
    }
  }

  function hideBanner() {
    var el = bannerEl();
    if (el) el.setAttribute('hidden', '');
    document.body.classList.remove('ll-consent-open');
    syncBannerHeight();
  }

  function buildBanner() {
    if (bannerEl()) return;

    var wrap = document.createElement('div');
    wrap.id = 'll-consent-banner';
    wrap.className = 'll-consent-banner';
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-labelledby', 'll-consent-title');
    wrap.setAttribute('hidden', '');

    wrap.innerHTML =
      '<div class="ll-consent-inner">' +
        '<div class="ll-consent-copy">' +
          '<h2 id="ll-consent-title" class="ll-consent-title" tabindex="-1">Optional cookies</h2>' +
          '<p class="ll-consent-text">We use a few tools from other companies — Google Maps, review widgets (Featurable and Trustpilot), and a Bark badge. They can set cookies. We do not use advertising or analytics cookies. You can reject these and still use the site.</p>' +
        '</div>' +
        '<div class="ll-consent-controls">' +
          '<a class="ll-consent-privacy" href="/privacy-policy">Privacy policy</a>' +
          '<div class="ll-consent-actions">' +
            '<button type="button" class="ll-consent-btn ll-consent-reject">Reject</button>' +
            '<button type="button" class="ll-consent-btn ll-consent-accept">Accept</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);

    wrap.querySelector('.ll-consent-accept').addEventListener('click', function () {
      saveChoice('accept');
      hideBanner();
      activateEmbeds();
    });

    wrap.querySelector('.ll-consent-reject').addEventListener('click', function () {
      var prev = readStored();
      saveChoice('reject');
      hideBanner();
      if (prev === 'accept') {
        window.location.reload();
        return;
      }
      window.llEmbedsAllowed = false;
    });

    if (window.ResizeObserver) {
      var ro = new ResizeObserver(syncBannerHeight);
      ro.observe(wrap);
    }
    window.addEventListener('resize', syncBannerHeight);
  }

  function privacyHref(href) {
    if (!href) return false;
    var path = href.split('?')[0].split('#')[0];
    return (
      path === '/privacy-policy' ||
      path === '/privacy-policy/' ||
      /\/privacy-policy\/?$/.test(path)
    );
  }

  function injectSettingsLink() {
    var links = document.querySelectorAll('a[href]');
    var i;
    for (i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.closest && a.closest('#ll-consent-banner')) continue;
      if (!privacyHref(a.getAttribute('href'))) continue;
      var label = (a.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (label !== 'privacy' && label !== 'privacy policy') continue;

      var parent = a.parentNode;
      var list = parent && parent.parentNode;
      if (!list) continue;
      if (list.querySelector('.ll-cookie-settings')) continue;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'll-cookie-settings';
      btn.textContent = 'Cookie settings';
      btn.addEventListener('click', function () {
        showBanner(true);
      });

      if (parent.tagName && parent.tagName.toLowerCase() === 'li') {
        var li = document.createElement('li');
        li.appendChild(btn);
        if (parent.nextSibling) list.insertBefore(li, parent.nextSibling);
        else list.appendChild(li);
      } else {
        if (a.nextSibling) parent.insertBefore(btn, a.nextSibling);
        else parent.appendChild(btn);
      }
    }
  }

  function start() {
    buildBanner();
    injectSettingsLink();

    var choice = readStored();
    if (choice === 'accept') {
      activateEmbeds();
      return;
    }
    if (choice === 'reject') {
      window.llEmbedsAllowed = false;
      return;
    }
    showBanner(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
