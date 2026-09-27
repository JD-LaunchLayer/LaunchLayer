// LaunchLayer /contact/ mobile acceptance checks (WebKit ≈ iOS Safari engine).
// Usage:  npm i -D playwright && npx playwright install webkit
//         node check-contact.mjs                      # checks https://launchlayer.uk
//         BASE=https://deploy-preview-12--xyz.netlify.app node check-contact.mjs
// With BASE set, pages are still loaded as https://launchlayer.uk/* but served from BASE,
// so Umami's data-domains filter stays active. Umami /api/send and /api/contact are
// intercepted and answered locally: no analytics hits, no real enquiries are sent.
import { webkit } from 'playwright';
const SITE = 'https://launchlayer.uk', BASE = process.env.BASE || SITE, PAGE = SITE + '/contact/';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const OPTIONS = ['', 'General Enquiry', 'Custom PC Builds', 'PC Repair & Tech Support', 'Insurance Damage Report', 'Scam Support', 'E-Waste or Tech Donation', 'Startup IT Setup', 'Website Setup'];
let failed = false;
const report = (w, name, ok, extra = '') => { if (!ok) failed = true; console.log(`${w}px ${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  — ' + extra : ''}`); };

async function open(browser, w, h) {
  const m = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: m ? 3 : 1, isMobile: m, hasTouch: m, userAgent: m ? UA : undefined });
  await ctx.addInitScript(() => localStorage.setItem('ll_cookie_notice', 'dismissed'));
  const page = await ctx.newPage();
  const events = [];
  await page.route('**/api/send', r => { const p = r.request().postDataJSON()?.payload || {}; if (p.name) events.push({ name: p.name, data: p.data }); r.fulfill({ status: 200, body: '{}' }); });
  if (BASE !== SITE) await page.route(SITE + '/**', async r => { const u = new URL(r.request().url()); if (u.pathname === '/api/contact') return r.fallback(); r.fulfill({ response: await r.fetch({ url: BASE + u.pathname + u.search }) }); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  return { ctx, page, events, m };
}

const browser = await webkit.launch();
for (const [w, h] of [[360, 780], [390, 844], [430, 932], [1440, 900]]) {
  const { ctx, page, events, m } = await open(browser, w, h);
  const r = await page.evaluate(async (m) => {
    const vw = document.documentElement.clientWidth, g = m ? 15.5 : 0;
    const hit = (a, b) => a.width && b.width && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const q = s => document.querySelector(s);
    const out = { sw: document.documentElement.scrollWidth, cw: vw, overlaps: [], outside: [], small: [], untracked: [] };
    const fixed = [...document.querySelectorAll('body *')].filter(e => ['fixed', 'sticky'].includes(getComputedStyle(e).position) && !e.closest('.ll-site-header'));
    const max = document.documentElement.scrollHeight - innerHeight;
    for (let y = 0; y <= max; y += 20) {
      scrollTo(0, y); await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      for (const f of fixed) {
        const s = getComputedStyle(f); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.01) continue;
        for (const t of ['.ll-contact-form .ll-turnstile', '.ll-contact-submit']) { const el = q(t); if (el && hit(f.getBoundingClientRect(), el.getBoundingClientRect())) out.overlaps.push(`${f.className} over ${t} at scrollY ${y}`); }
      }
    }
    scrollTo(0, 0); await new Promise(res => requestAnimationFrame(res));
    for (const s of ['.llct-intro .llsite-eyebrow', '.llct-intro .llsite-brand', '.llct-intro .llsite-h1', '.llct-intro .llsite-lead', '.ll-contact-panel', '.llct-card', '.llct-actions', '.ll-contact-form .cf-turnstile']) {
      document.querySelectorAll(s).forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.left < g || b.right > vw - g)) out.outside.push(`${s} ${b.left.toFixed(1)}→${b.right.toFixed(1)}`); });
    }
    out.hero = { top: q('.llct-intro .llsite-eyebrow').getBoundingClientRect().top, header: q('.ll-site-header').getBoundingClientRect().bottom };
    out.fonts = [...document.querySelectorAll('.ll-contact-form input:not([type=hidden]):not([type=checkbox]), .ll-contact-form select, .ll-contact-form textarea')].map(e => parseFloat(getComputedStyle(e).fontSize));
    out.options = [...document.querySelectorAll('#ll-contact-service option')].map(o => o.value);
    out.hidden = ['subject', 'from_name', 'botcheck'].every(n => q(`.ll-contact-form [name="${n}"]`)) && q('.ll-contact-form').getAttribute('action') === '/api/contact' && !!q('.ll-contact-form .cf-turnstile[data-sitekey]');
    for (const e of document.querySelectorAll('main a[href], main button, main input:not([type=hidden]):not([name=botcheck]), main select, main textarea, .launchlayer-floating-btn')) {
      const b = e.getBoundingClientRect(), ps = getComputedStyle(e, '::after'), pw = parseFloat(ps.width) || 0, ph = parseFloat(ps.height) || 0, hw = Math.max(b.width, ps.position === 'absolute' ? pw : 0), hh = Math.max(b.height, ps.position === 'absolute' ? ph : 0); if (b.width && (hw < 44 || hh < 44)) out.small.push(`${e.tagName} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}" ${b.width.toFixed(0)}x${b.height.toFixed(0)}`);
    }
    document.querySelectorAll('a[href^="tel:"]').forEach(a => { if (a.dataset.umamiEvent !== 'call-click') out.untracked.push(a.outerHTML.slice(0, 80)); });
    return out;
  }, m);
  report(w, 'no horizontal scroll', r.sw === r.cw, `scrollWidth ${r.sw} / clientWidth ${r.cw}`);
  report(w, 'nothing fixed over Turnstile/submit at any scroll position', !r.overlaps.length, r.overlaps.slice(0, 3).join('; '));
  if (m) report(w, 'hero + panels inside 16px gutters', !r.outside.length, r.outside.slice(0, 4).join('; '));
  report(w, 'hero below sticky header at load', r.hero.top >= r.hero.header, `eyebrow top ${r.hero.top.toFixed(1)} / header bottom ${r.hero.header.toFixed(1)}`);
  report(w, 'form controls ≥16px (no iOS focus zoom)', r.fonts.every(f => f >= 16), r.fonts.join(', '));
  report(w, 'Service options unchanged', JSON.stringify(r.options) === JSON.stringify(OPTIONS));
  report(w, 'form action/hidden fields/Turnstile markup intact', r.hidden);
  report(w, 'tap targets ≥44px', !r.small.length, r.small.join('; '));
  report(w, 'every tel: link carries data-umami-event="call-click"', !r.untracked.length, r.untracked.join('; '));
  if (w === 390) {
    // Umami call-click on the first visible call button (preventDefault so tel: is not opened)
    const call = page.locator('a[href^="tel:"]:visible').first();
    await call.evaluate(a => a.addEventListener('click', e => e.preventDefault(), { once: true }));
    await call.click(); await page.waitForTimeout(1200);
    report(w, 'Umami call-click fires', events.some(e => e.name === 'call-click'), JSON.stringify(events));
    // Submit flow with a stubbed /api/contact (slow success) and a fake Turnstile token
    await page.route('**/api/contact', async r => { await new Promise(res => setTimeout(res, 1500)); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, redirect: '/contact/?submitted=true' }) }); });
    await page.fill('#ll-contact-first', 'Test'); await page.fill('#ll-contact-last', 'User'); await page.fill('#ll-contact-email', 'test@example.com');
    await page.selectOption('#ll-contact-service', 'Insurance Damage Report'); await page.fill('#ll-contact-message', 'Automated layout check — stubbed, not sent.');
    await page.evaluate(() => { const f = document.querySelector('.ll-contact-form'); let t = f.querySelector('[name="cf-turnstile-response"]'); if (!t) { t = document.createElement('input'); t.type = 'hidden'; t.name = 'cf-turnstile-response'; f.appendChild(t); } t.value = 'stub-token'; });
    await page.click('.ll-contact-submit'); await page.waitForTimeout(400);
    const busy = await page.evaluate(() => { const b = document.querySelector('.ll-contact-submit'); return { disabled: b.disabled, ariaBusy: b.getAttribute('aria-busy') }; });
    report(w, 'loading state: submit disabled + aria-busy while sending', busy.disabled && busy.ariaBusy === 'true', JSON.stringify(busy));
    await page.waitForURL(/submitted=true/, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    report(w, 'Umami contact-form-submit fires with service', events.some(e => e.name === 'contact-form-submit' && e.data?.service === 'Insurance Damage Report'), JSON.stringify(events));
    report(w, 'success panel shown after redirect', await page.locator('.ll-contact-success').isVisible().catch(() => false));
  }
  await page.screenshot({ path: `check-${w}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
