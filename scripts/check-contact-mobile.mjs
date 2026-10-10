// LaunchLayer /contact/ mobile acceptance checks (WebKit ≈ iOS Safari engine).
// Usage:  npm i -D playwright && npx playwright install webkit chromium
//         ENGINE=chromium node scripts/check-contact-mobile.mjs   # default engine: webkit
//         node check-contact.mjs                      # checks https://launchlayer.uk
//         BASE=https://deploy-preview-12--xyz.netlify.app node check-contact.mjs
// With BASE set, pages are still loaded as https://launchlayer.uk/* but served from BASE,
// so Umami's data-domains filter stays active. Umami /api/send and contact-form POSTs are
// intercepted and answered locally: no analytics hits, no real enquiries are sent.
// LOCAL_ROOT=/path/to/repo serves any launchlayer.uk path that exists in the local checkout
// (e.g. /contact/index.html, /assets/images/coverage-map.svg) instead of BASE, to test uncommitted work.
// Checks tagged [lower] cover the coverage section + footer on mobile (SPEC §17–§23).
import { webkit, chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ENGINE = process.env.ENGINE || 'webkit';
const guard = { umamiSend: 0, umamiOther: 0, contactStubbed: 0, seen: {} };
const SITE = 'https://launchlayer.uk', BASE = process.env.BASE || SITE, PAGE = SITE + '/contact/', LOCAL_ROOT = process.env.LOCAL_ROOT ? path.resolve(process.env.LOCAL_ROOT) : '';
const MAX_BAND = 48; // SPEC §17: largest empty vertical band below the form (mobile)
const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.css': 'text/css', '.js': 'text/javascript' };
const localFile = p => { if (!LOCAL_ROOT) return null; for (const c of [p, p.endsWith('/') ? p + 'index.html' : null]) { if (!c) continue; const f = path.join(LOCAL_ROOT, decodeURIComponent(c)); if (f.startsWith(path.resolve(LOCAL_ROOT)) && fs.existsSync(f) && fs.statSync(f).isFile()) return f; } return null; };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const OPTIONS = ['', 'General Enquiry', 'Custom PC Builds', 'PC Repair & Tech Support', 'Insurance Damage Report', 'Scam Support', 'E-Waste or Tech Donation', 'Startup IT Setup', 'Website Setup'];
let failed = false;
const report = (w, name, ok, extra = '') => { if (!ok) failed = true; console.log(`${w}px ${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  — ' + extra : ''}`); };

async function open(browser, w, h, { firstVisit = false } = {}) {
  const m = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: m ? 3 : 1, isMobile: m, hasTouch: m, userAgent: m ? UA : undefined });
  await ctx.route('**/api/send', r => { guard.umamiSend++; r.fulfill({ status: 200, body: '{}' }); });
  await ctx.route(/umami\.(is|dev)\//, r => { const u = r.request().url(); if (/cloud\.umami\.is\/script\.js/.test(u)) return r.fallback(); guard.umamiOther++; r.fulfill({ status: 200, body: '{}' }); });
  await ctx.route(/launchlayer\.uk\/(?:\?.*)?$/, r => {
    if (r.request().method() !== 'POST') return r.fallback();
    const body = r.request().postData() || '';
    if (!body.includes('form-name=contact') && !body.includes('form-name%3Dcontact')) return r.fallback();
    guard.contactStubbed++;
    return r.fulfill({ status: 500, contentType: 'text/plain', body: 'stubbed' });
  });
  ctx.on('request', q => { const u = q.url(); if (/umami|\/api\/send|form-name=contact|form-name%3Dcontact/.test(u + (q.postData() || ''))) { const k = q.method() + ' ' + u.split('?')[0]; guard.seen[k] = (guard.seen[k] || 0) + 1; } });
  if (!firstVisit) await ctx.addInitScript(() => localStorage.setItem('ll_cookie_notice', 'dismissed'));
  const page = await ctx.newPage();
  const events = [];
  await page.route('**/api/send', r => { guard.umamiSend++; const p = r.request().postDataJSON()?.payload || {}; if (p.name) events.push({ name: p.name, data: p.data }); r.fulfill({ status: 200, body: '{}' }); });
  if (BASE !== SITE || LOCAL_ROOT) await page.route(SITE + '/**', async r => { const u = new URL(r.request().url()); if (u.pathname === '/api/send' || (r.request().method() === 'POST' && u.pathname === '/')) return r.fallback();
    const f = localFile(u.pathname); if (f) return r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
    if (BASE === SITE) return r.fallback(); r.fulfill({ response: await r.fetch({ url: BASE + u.pathname + u.search }) }); });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  return { ctx, page, events, m };
}


// ---- [lower] coverage section + footer (SPEC §17–§23), mobile only ----
async function lowerChecks(page, w) {
  const r = await page.evaluate(async ({ MAX_BAND }) => {
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    const vw = document.documentElement.clientWidth, G = vw < 390 ? 16 : 20, out = { outside: [], edge: [], gaps: [], small: [] };
    const vis = e => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } return true; };
    const raf = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    // (a) gutters: every lower block inside [16, vw-16]; outer blocks sit exactly on the page gutter (16 <390, 20 ≥390; centred when 560 max applies)
    const inner = ['.llcov-panel', '.llcov-loc-badge', '.llcov-ops-card', '.llcov-map-wrap', 'footer .footer-top-segment', 'footer .inline-nav-links', 'footer .inline-nav-links a', 'footer .footer-matrix-section', 'footer .footer-compliance-bar', 'footer .footer-legal-stack', 'footer .bark-widget-wrapper'];
    for (const s of inner) qa(s).forEach(e => { if (!vis(e)) return; const b = e.getBoundingClientRect(); if (b.width && (b.left < 15.5 || b.right > vw - 15.5)) out.outside.push(`${s} ${b.left.toFixed(1)}→${b.right.toFixed(1)}`); });
    const wantL = Math.max(G, (vw - 560) / 2);
    for (const s of ['.llcov-panel', 'footer .footer-top-segment', 'footer .footer-matrix-section', 'footer .footer-compliance-bar']) { const e = q(s); if (!e) { out.edge.push(`${s} missing`); continue; } const b = e.getBoundingClientRect(); if (Math.abs(b.left - wantL) > 1 || Math.abs(vw - b.right - wantL) > 1) out.edge.push(`${s} ${b.left.toFixed(1)}→${b.right.toFixed(1)} (want ${wantL}→${vw - wantL})`); }
    // double inset: card content must start 16px (card padding) + border inside the card
    const pn = q('.llcov-panel'); if (pn) { const pb = pn.getBoundingClientRect(), bl = parseFloat(getComputedStyle(pn).borderLeftWidth) || 0; qa('.llcov-panel .llcov-loc-grid, .llcov-panel .llcov-ops-card, .llcov-panel .llcov-map-wrap').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && Math.abs(b.left - pb.left - bl - 16) > 1.5) out.edge.push(`${e.className.split(' ')[0]} inset ${(b.left - pb.left).toFixed(1)} (want ${16 + bl})`); }); }
    // (b) largest empty vertical band between consecutive visible content blocks below the form panel
    const start = q('.ll-contact-panel').getBoundingClientRect().bottom + scrollY, blocks = [];
    for (const e of qa('body *')) {
      if (e.closest('.ll-site-header, .launchlayer-floating-pill-container, #ll-cookie-notice, [data-netlify-deploy-id], script, style, noscript')) continue;
      const s = getComputedStyle(e); if (['fixed', 'sticky'].includes(s.position)) continue;
      const b = e.getBoundingClientRect(); if (!b.width || !b.height || b.bottom + scrollY <= start || !vis(e)) continue;
      const hasText = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      const media = ['IMG', 'SVG', 'IFRAME', 'VIDEO', 'CANVAS', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(e.tagName.toUpperCase());
      const boxed = b.width < vw - 1 && ((s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') || s.backgroundImage !== 'none' || (parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none'));
      if (hasText || media || boxed) blocks.push({ t: b.top + scrollY, b: b.bottom + scrollY, d: e.tagName.toLowerCase() + '.' + (typeof e.className === 'string' ? e.className.split(' ')[0] : '') });
    }
    blocks.sort((a, b) => a.t - b.t); let cur = { b: start, d: 'form panel' };
    for (const k of blocks) { if (k.t > cur.b + 0.5) out.gaps.push({ gap: +(k.t - cur.b).toFixed(1), from: cur.d, to: k.d }); if (k.b > cur.b) cur = { b: k.b, d: k.d }; }
    out.gaps.sort((a, b) => b.gap - a.gap); out.maxBand = out.gaps[0] || { gap: 0 };
    // (c) map resolution
    const img = q('.llcov-map img, .llcov-map-wrap img');
    if (img) { const attrs = { w: img.getAttribute('width'), h: img.getAttribute('height'), decoding: img.getAttribute('decoding'), loading: img.getAttribute('loading'), alt: img.getAttribute('alt') }; img.loading = 'eager'; img.scrollIntoView({ block: 'center' }); for (let i = 0; i < 40 && !(img.complete && img.naturalWidth); i++) await new Promise(res => setTimeout(res, 100)); const src = img.currentSrc || img.src; out.map = { src, svg: /\.svg(\?|$)/i.test(src), nat: img.naturalWidth, ren: +img.getBoundingClientRect().width.toFixed(1), dpr: devicePixelRatio, ...attrs }; }
    // (e) chips wrap: more than one chip on the first row
    const chips = qa('.llcov-loc-badge').filter(vis).map(e => e.getBoundingClientRect()); out.chips = { n: chips.length, firstRow: chips.filter(b => Math.abs(b.top - chips[0].top) < 2).length, rows: new Set(chips.map(b => Math.round(b.top))).size, minH: Math.min(...chips.map(b => b.height)) };
    // (f) tap targets: a 44×44 box centred on each coverage/footer link must resolve to that link (pill + header hidden while sampling)
    const hideSel = '.launchlayer-floating-pill-container, .ll-site-header, #ll-cookie-notice'; qa(hideSel).forEach(e => e.style.setProperty('visibility', 'hidden', 'important'));
    for (const a of qa('.llcov-panel a[href], footer a[href], footer button')) {
      if (!vis(a) || !a.getBoundingClientRect().width) continue;
      a.scrollIntoView({ block: 'center' }); await raf();
      const b = a.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2; let bad = 0;
      for (const dx of [-21, -10, 0, 10, 21]) for (const dy of [-21, -10, 0, 10, 21]) { const x = Math.min(Math.max(cx + dx, 0), vw - 1), t = document.elementFromPoint(x, cy + dy); if (!t || !(t === a || a.contains(t))) bad++; }
      if (bad) out.small.push(`${a.tagName.toLowerCase()} "${(a.textContent || a.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24)}" ${b.width.toFixed(0)}x${b.height.toFixed(0)} (${bad}/25 miss)`);
    }
    // (f2) SPEC §20: a contact row that holds a link is one full-width tap target ≥48px tall (icon tile to chevron)
    out.rows = [];
    for (const row of qa('.llcov-ops-card')) { const a = row.querySelector('a[href]'); if (!a || !vis(row)) continue; row.scrollIntoView({ block: 'center' }); await raf();
      const b = row.getBoundingClientRect(), y = b.top + b.height / 2, pts = [b.left + 6, b.left + b.width / 2, b.right - 6].map(x => document.elementFromPoint(x, y));
      out.rows.push({ t: row.textContent.trim().replace(/\s+/g, ' ').slice(0, 20), h: +b.height.toFixed(1), ok: b.height >= 48 && pts.every(t => t && (t === a || a.contains(t))) }); }
    qa(hideSel).forEach(e => e.style.removeProperty('visibility'));
    scrollTo(0, 0); await raf();
    return out;
  }, { MAX_BAND });
  report(w, '[lower a] coverage card, chips, rows, map, footer inside [16, vw-16]', !r.outside.length, r.outside.slice(0, 4).join('; '));
  report(w, '[lower a] one gutter: card + footer blocks on the page gutter, card content inset 16px', !r.edge.length, r.edge.slice(0, 5).join('; '));
  report(w, `[lower b] largest empty band below the form ≤ ${MAX_BAND}px`, r.maxBand.gap <= MAX_BAND, r.gaps.slice(0, 3).map(g => `${g.gap}px ${g.from} → ${g.to}`).join('; '));
  report(w, '[lower c] map crisp at DPR 3 (SVG, or naturalWidth ≥ rendered × 3)', !!r.map && (r.map.svg || r.map.nat >= r.map.ren * 3), r.map ? `${r.map.src.split('/').pop()} natural ${r.map.nat} / rendered ${r.map.ren} = ${(r.map.nat / r.map.ren).toFixed(2)}×` : 'no map img');
  report(w, '[lower c] map img has width/height, loading=lazy, decoding=async, alt', !!r.map && !!r.map.w && !!r.map.h && r.map.loading === 'lazy' && r.map.decoding === 'async' && !!r.map.alt, r.map ? `width=${r.map.w} height=${r.map.h} loading=${r.map.loading} decoding=${r.map.decoding}` : '');
  report(w, '[lower e] area chips wrap into a grid (>1 chip per row)', r.chips.firstRow > 1 && r.chips.minH >= 36, `${r.chips.n} chips, ${r.chips.firstRow} on first row, ${r.chips.rows} rows, min height ${r.chips.minH.toFixed(1)}`);
  report(w, '[lower f] contact rows with a link: whole row is the tap target, ≥48px tall', r.rows.length > 0 && r.rows.every(x => x.ok), r.rows.map(x => `"${x.t}" h ${x.h} ${x.ok ? 'row-wide' : 'link only'}`).join('; '));
  report(w, '[lower f] coverage + footer links: 44×44 target around each', !r.small.length, r.small.slice(0, 5).join('; '));
}

// ---- [lower d] pill never over coverage-card content or footer links/text (20px steps), notice dismissed + open ----
async function pillScan(page, w, label) {
  const r = await page.evaluate(async () => {
    const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
    const raf = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const hit = (a, b) => a.width && b.width && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const pill = q('.launchlayer-floating-pill-container'); if (!pill) return { none: true };
    const shown = () => { for (let n = pill; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.01) return false; } return true; };
    const pb = () => { const b = q('.launchlayer-floating-btn'); return (b || pill).getBoundingClientRect(); };
    const targets = () => { const t = []; const pn = q('.llcov-panel'); if (pn) t.push(['coverage card', pn.getBoundingClientRect()]);
      for (const e of qa('footer a, footer button, footer img, footer svg, footer iframe')) { const b = e.getBoundingClientRect(); if (b.width && b.height) t.push([`footer ${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('alt') || e.getAttribute('aria-label') || '').trim().slice(0, 20)}"`, b]); }
      const tw = document.createTreeWalker(q('footer') || document.body, NodeFilter.SHOW_TEXT); const rg = document.createRange();
      while (tw.nextNode()) { const n = tw.currentNode; if (!n.textContent.trim()) continue; rg.selectNodeContents(n); for (const b of rg.getClientRects()) if (b.width && b.height) t.push([`footer text "${n.textContent.trim().slice(0, 20)}"`, b]); }
      return t; };
    const max = document.documentElement.scrollHeight - innerHeight, hits = [], seen = [];
    for (let y = 0; y <= max + 19; y += 20) { scrollTo(0, Math.min(y, max)); await raf(); await raf();
      if (!shown()) continue; seen.push(Math.min(y, max)); const p = pb();
      for (const [d, b] of targets()) if (hit(p, b)) { hits.push(`${d} at scrollY ${Math.min(y, max)}`); break; } }
    scrollTo(0, 0); await raf();
    return { hits, seen: seen.length, first: seen[0], last: seen[seen.length - 1], notice: !!q('#ll-cookie-notice') && getComputedStyle(q('#ll-cookie-notice')).display !== 'none' };
  });
  if (r.none) return report(w, `[lower d] pill vs coverage/footer (${label})`, true, 'no pill on page');
  report(w, `[lower d] pill never over coverage-card content or footer links/text (${label})`, !r.hits.length, `${r.hits.length} hits${r.hits.length ? ': ' + r.hits.slice(0, 3).join('; ') : ''}; pill visible at ${r.seen} positions${r.seen ? ` (${r.first}–${r.last})` : ''}; notice ${r.notice ? 'open' : 'closed'}`);
  if (label === 'notice dismissed') report(w, '[lower d] pill still reachable somewhere on the page', r.seen > 0, `visible at ${r.seen} scroll positions`);
}

const browser = await (ENGINE === 'chromium' ? chromium : webkit).launch();
console.log('engine', ENGINE, 'BASE', BASE);
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
        for (const t of ['.ll-contact-submit']) { const el = q(t); if (el && hit(f.getBoundingClientRect(), el.getBoundingClientRect())) out.overlaps.push(`${f.className} over ${t} at scrollY ${y}`); }
      }
    }
    scrollTo(0, 0); await new Promise(res => requestAnimationFrame(res));
    for (const s of ['.llct-intro .llsite-eyebrow', '.llct-intro .llsite-brand', '.llct-intro .llsite-h1', '.llct-intro .llsite-lead', '.ll-contact-panel', '.llct-card', '.llct-actions']) {
      document.querySelectorAll(s).forEach(e => { const b = e.getBoundingClientRect(); if (b.width && (b.left < g || b.right > vw - g)) out.outside.push(`${s} ${b.left.toFixed(1)}→${b.right.toFixed(1)}`); });
    }
    out.hero = { top: q('.llct-intro .llsite-eyebrow').getBoundingClientRect().top, header: q('.ll-site-header').getBoundingClientRect().bottom };
    out.fonts = [...document.querySelectorAll('.ll-contact-form input:not([type=hidden]):not([type=checkbox]):not([name=bot-field]), .ll-contact-form select, .ll-contact-form textarea')].map(e => parseFloat(getComputedStyle(e).fontSize));
    out.options = [...document.querySelectorAll('#ll-contact-service option')].map(o => o.value);
    const form = q('.ll-contact-form');
    const netlifyAttr = form && form.getAttribute('data-netlify');
    const honeypotAttr = form && form.getAttribute('netlify-honeypot');
    out.hidden = !!form && ['form-name', 'subject', 'bot-field', 'First Name', 'Last Name', 'Email', 'Phone', 'Service', 'Message'].every(n => form.querySelector(`[name="${n}"]`)) && form.getAttribute('action') === '/' && form.getAttribute('name') === 'contact' && (form.querySelector('[name="form-name"]') || {}).value === 'contact' && (netlifyAttr == null || netlifyAttr === 'true') && (honeypotAttr == null || honeypotAttr === 'bot-field');
    for (const e of document.querySelectorAll('main a[href], main button, main input:not([type=hidden]):not([name=bot-field]), main select, main textarea, .launchlayer-floating-btn')) {
      const b = e.getBoundingClientRect(), ps = getComputedStyle(e, '::after'), pw = parseFloat(ps.width) || 0, ph = parseFloat(ps.height) || 0, hw = Math.max(b.width, ps.position === 'absolute' ? pw : 0), hh = Math.max(b.height, ps.position === 'absolute' ? ph : 0); if (b.width && (hw < 44 || hh < 44)) out.small.push(`${e.tagName} "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}" ${b.width.toFixed(0)}x${b.height.toFixed(0)}`);
    }
    document.querySelectorAll('a[href^="tel:"]').forEach(a => { if (a.dataset.umamiEvent !== 'call-click') out.untracked.push(a.outerHTML.slice(0, 80)); });
    return out;
  }, m);
  report(w, 'no horizontal scroll', r.sw === r.cw, `scrollWidth ${r.sw} / clientWidth ${r.cw}`);
  report(w, 'nothing fixed over the submit button at any scroll position', !r.overlaps.length, r.overlaps.slice(0, 3).join('; '));
  if (m) report(w, 'hero + panels inside 16px gutters', !r.outside.length, r.outside.slice(0, 4).join('; '));
  report(w, 'hero below sticky header at load', r.hero.top >= r.hero.header, `eyebrow top ${r.hero.top.toFixed(1)} / header bottom ${r.hero.header.toFixed(1)}`);
  report(w, 'form controls ≥16px (no iOS focus zoom)', r.fonts.every(f => f >= 16), r.fonts.join(', '));
  report(w, 'Service options unchanged', JSON.stringify(r.options) === JSON.stringify(OPTIONS));
  report(w, 'Netlify form name, action, honeypot, and fields intact', r.hidden);
  report(w, 'tap targets ≥44px', !r.small.length, r.small.join('; '));
  report(w, 'every tel: link carries data-umami-event="call-click"', !r.untracked.length, r.untracked.join('; '));
  if (m) { await lowerChecks(page, w); await pillScan(page, w, 'notice dismissed');
    const fv = await open(browser, w, h, { firstVisit: true }); await pillScan(fv.page, w, 'cookie notice open'); await fv.ctx.close(); }
  if (w === 390) {
    // Umami call-click on the first visible call button (preventDefault so tel: is not opened)
    const call = page.locator('a[href^="tel:"]:visible').first();
    await call.evaluate(a => a.addEventListener('click', e => e.preventDefault(), { once: true }));
    await call.click(); await page.waitForTimeout(1200);
    report(w, 'Umami call-click fires', events.some(e => e.name === 'call-click'), JSON.stringify(events));
    // Submit flow with a stubbed Netlify Forms POST (slow 2xx). No real enquiry is sent.
    await page.route(/launchlayer\.uk\/(?:\?.*)?$/, async r => {
      if (r.request().method() !== 'POST') return r.fallback();
      guard.contactStubbed++;
      await new Promise(res => setTimeout(res, 1500));
      return r.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
    });
    await page.fill('#ll-contact-first', 'Test'); await page.fill('#ll-contact-last', 'User'); await page.fill('#ll-contact-email', 'test@example.com');
    await page.selectOption('#ll-contact-service', 'Insurance Damage Report'); await page.fill('#ll-contact-message', 'Automated layout check — stubbed, not sent.');
    await page.click('.ll-contact-submit'); await page.waitForTimeout(400);
    const busy = await page.evaluate(() => { const b = document.querySelector('.ll-contact-submit'); return { disabled: b.disabled, ariaBusy: b.getAttribute('aria-busy') }; });
    report(w, 'loading state: submit disabled + aria-busy while sending', busy.disabled && busy.ariaBusy === 'true', JSON.stringify(busy));
    await page.waitForURL(/submitted=true/, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500);
    report(w, 'Umami contact-form-submit fires with service', events.some(e => e.name === 'contact-form-submit' && e.data?.service === 'Insurance Damage Report'), JSON.stringify(events));
    report(w, 'success panel shown after redirect', await page.locator('.ll-contact-success').isVisible().catch(() => false));
  }
  await page.screenshot({ path: `${process.env.SHOTS || '.'}/check-${ENGINE}-${w}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log('GUARD', JSON.stringify(guard));
process.exit(failed ? 1 : 0);
