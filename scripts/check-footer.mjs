// LaunchLayer site-wide footer checker.
// Usage (from /workspace/ll-footer, where node_modules resolves playwright):
//   MODE=live  node scripts/check-footer.mjs            # launchlayer.uk (+ /contact/ from the PR #124 preview)
//   MODE=proto node scripts/check-footer.mjs            # proto/site overlay (new CSS/JS/markup), rest from live/preview
// Env: ENGINE=webkit,chromium  PAGES=/,/faqs/  WIDTHS=360,390,430,1024,1440  CHROMIUM_WIDTHS=1024,1440  JSON_OUT=file  SHOTS=dir  STATIC_ROOT=dir
// Safety: Umami /api/send is fulfilled '{}' and the Umami script host is blocked on every load; /api/contact is stubbed.
import fs from 'node:fs';
import path from 'node:path';
import { engines, open, guard, PAGES, slug, ROOT } from './lib.mjs';

const MODE = process.env.MODE || 'live';
const ENGINES = (process.env.ENGINE || 'webkit,chromium').split(',');
const pages = process.env.PAGES ? process.env.PAGES.split(',') : PAGES;
const ALLV = [[360, 780], [390, 844], [430, 932], [1024, 768], [1440, 900]];
const WIDTHS = process.env.WIDTHS ? process.env.WIDTHS.split(',').map(Number) : ALLV.map(v => v[0]);
const VIEWPORTS = ALLV.filter(v => WIDTHS.includes(v[0]));
// WebKit (iPhone UA, DPR 3, touch) covers phones; Chromium covers desktop unless CHROMIUM_WIDTHS says otherwise.
const CHROMIUM_WIDTHS = (process.env.CHROMIUM_WIDTHS || '1024,1440').split(',').map(Number);
const vpFor = eng => eng === 'chromium' ? VIEWPORTS.filter(v => CHROMIUM_WIDTHS.includes(v[0])) : VIEWPORTS;
const STATIC_ROOT = process.env.STATIC_ROOT || (MODE === 'proto' ? path.join(ROOT, 'proto/site') : path.join(ROOT, 'src'));
const results = [], dump = {};
const report = (eng, pg, w, name, ok, extra = '') => { results.push({ eng, pg, w, name, ok, extra }); console.log(`${ok ? 'PASS' : 'FAIL'} ${eng} ${w} ${pg} ${name}${extra ? '  — ' + extra : ''}`); };
const warn = (msg) => { results.push({ warn: msg }); console.log('WARN ' + msg); };

// ---------------------------------------------------------------- in-page helpers (stringified)
const HELPERS = `
window.__ff = (() => {
  const q = s => document.querySelector(s), qa = (s, r = document) => [...r.querySelectorAll(s)];
  const raf = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const vis = e => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.01) return false; } return true; };
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = el => { const chain = []; for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.unshift(n); let c = [255, 255, 255, 1], img = false; for (const n of chain) { const s = getComputedStyle(n); if (s.backgroundImage && s.backgroundImage !== 'none' && n.closest('footer')) img = true; c = over(rgba(s.backgroundColor), c); } return { c, img }; };
  const hex = c => '#' + c.slice(0, 3).map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const label = e => (e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent || e.getAttribute('alt') || '').trim().replace(/\\s+/g, ' ').slice(0, 26);
  const targets = () => qa('footer.launchlayer-master-footer a[href], footer.launchlayer-master-footer button').filter(e => vis(e) && e.getBoundingClientRect().width);
  return { q, qa, raf, vis, rgba, over, ratio, bgOf, hex, label, targets };
})();`;

async function measure(page, w) {
  await page.evaluate(HELPERS);
  return page.evaluate(async () => {
    const { q, qa, raf, vis, rgba, over, ratio, bgOf, hex, label, targets } = window.__ff;
    const F = q('footer.launchlayer-master-footer'); if (!F) return { nofooter: true };
    const vw = document.documentElement.clientWidth, m = vw < 768, G = vw < 390 ? 16 : 20;
    const out = { vw, G, m };
    const fs_ = getComputedStyle(F);
    out.footer = { pt: parseFloat(fs_.paddingTop), pr: parseFloat(fs_.paddingRight), pb: parseFloat(fs_.paddingBottom), pl: parseFloat(fs_.paddingLeft), mt: parseFloat(fs_.marginTop), bg: hex(bgOf(F).c), h: Math.round(F.getBoundingClientRect().height) };
    const body = getComputedStyle(document.body); out.bodyPb = parseFloat(body.paddingBottom);
    const fb = F.getBoundingClientRect(); out.belowFooter = Math.round(document.documentElement.scrollHeight - (fb.bottom + scrollY));
    // blocks + gutters
    out.blocks = {};
    for (const s of ['.footer-top-segment', '.footer-matrix-section', '.footer-compliance-bar']) { const e = F.querySelector(s); if (!e) { out.blocks[s] = null; continue; } const b = e.getBoundingClientRect(); out.blocks[s] = { l: +b.left.toFixed(1), r: +(vw - b.right).toFixed(1), w: +b.width.toFixed(1) }; }
    out.outside = [];
    for (const e of qa('*', F)) { if (!vis(e) || ['SCRIPT', 'STYLE', 'PATH'].includes(e.tagName.toUpperCase())) continue; const b = e.getBoundingClientRect(); if (!b.width || !b.height) continue; const tol = 0.6; if (m ? (b.left < G - tol || b.right > vw - G + tol) : (b.left < 0 || b.right > vw)) out.outside.push(`${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').split(' ')[0]} ${b.left.toFixed(1)}→${b.right.toFixed(1)}`); }
    out.sw = document.documentElement.scrollWidth; out.cw = vw; out.fsw = F.scrollWidth; out.fcw = F.clientWidth;
    // logo
    const logo = F.querySelector('.footer-brand-block > a'); if (logo) { const b = logo.getBoundingClientRect(); out.logo = { w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; }
    // nav geometry
    const nav = qa('.inline-nav-links a', F).map(a => { const b = a.getBoundingClientRect(); const tb = (() => { const r = document.createRange(); r.selectNodeContents(a); const c = r.getBoundingClientRect(); return c; })(); return { t: a.textContent.trim(), l: +b.left.toFixed(1), top: +(b.top + scrollY).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), tl: +tb.left.toFixed(1) }; });
    out.nav = nav;
    const cols = [...new Set(nav.map(n => Math.round(n.tl)))], rows = [...new Set(nav.map(n => Math.round(n.top)))];
    out.navCols = cols.length; out.navRows = rows.length;
    // social
    out.social = qa('.footer-social-strip a', F).map(a => { const b = a.getBoundingClientRect(); return { t: a.title, w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; });
    // bark
    const bw = F.querySelector('.bark-widget-wrapper'); out.bark = bw ? { html: bw.innerHTML.replace(/\s+/g, ' ').slice(0, 300), h: Math.round(bw.getBoundingClientRect().height) } : null;
    // coverage disclosure
    const btn = F.querySelector('.footer-matrix-title'); const grid = F.querySelector('.footer-matrix-grid');
    out.cov = { tag: btn && btn.tagName.toLowerCase(), links: qa('.footer-matrix-grid a[href]', F).length, expanded: btn && btn.getAttribute('aria-expanded'), gridVisible: !!grid && vis(grid) };
    // tap targets: size, 44×44 hit test, spacing
    out.small = []; out.close = [];
    const hideSel = '.launchlayer-floating-pill-container, .ll-site-header, #ll-cookie-notice, .ll-cookie-notice'; qa(hideSel).forEach(e => e.style.setProperty('visibility', 'hidden', 'important'));
    let T = targets(); const rects = [];
    for (const a of T) {
      a.scrollIntoView({ block: 'center' }); await raf();
      const b = a.getBoundingClientRect(), cxp = b.left + b.width / 2, cyp = b.top + b.height / 2; let bad = 0;
      for (const dx of [-21, -10, 0, 10, 21]) for (const dy of [-21, -10, 0, 10, 21]) { const x = Math.min(Math.max(cxp + dx, 0), vw - 1), t = document.elementFromPoint(x, cyp + dy); if (!t || !(t === a || a.contains(t))) bad++; }
      if (b.width < 44 || b.height < 44 || bad) out.small.push(`${a.tagName.toLowerCase()} "${label(a)}" ${b.width.toFixed(0)}×${b.height.toFixed(0)}${bad ? ` (${bad}/25 miss)` : ''}`);
    }
    F.scrollIntoView({ block: 'start' }); await raf();
    for (const a of T) { const b = a.getBoundingClientRect(); rects.push({ a, l: b.left, r: b.right, t: b.top + scrollY, b: b.bottom + scrollY }); }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const A = rects[i], B = rects[j]; if (A.a.contains(B.a) || B.a.contains(A.a)) continue; const dx = Math.max(0, B.l - A.r, A.l - B.r), dy = Math.max(0, B.t - A.b, A.t - B.b); const d = Math.hypot(dx, dy); if (d < 7.5) out.close.push(`"${label(A.a)}"↔"${label(B.a)}" ${d.toFixed(1)}px`); }
    qa(hideSel).forEach(e => e.style.removeProperty('visibility'));
    // contrast: text + icons
    const fbg = bgOf(F).c; out.contrast = []; out.bgImage = false;
    const tw = document.createTreeWalker(F, NodeFilter.SHOW_TEXT); const seen = new Map();
    while (tw.nextNode()) { const n = tw.currentNode, el = n.parentElement; if (!n.textContent.trim() || !el || !vis(el) || el.closest('script,style,.bark-widget-wrapper')) continue;
      const s = getComputedStyle(el), bg = bgOf(el); if (bg.img) out.bgImage = true; const fg = over(rgba(s.color), bg.c); const r = ratio(fg, bg.c); const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700; const large = size >= 24 || (bold && size >= 18.66);
      const key = (el.className && typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName.toLowerCase()) + '|' + hex(fg) + '|' + hex(bg.c) + '|' + size;
      if (!seen.has(key)) seen.set(key, { el: key.split('|')[0], sample: n.textContent.trim().slice(0, 22), fg: hex(fg), bg: hex(bg.c), size, weight: s.fontWeight, ratio: +r.toFixed(2), need: large ? 3 : 4.5 }); }
    out.contrast = [...seen.values()];
    out.icons = qa('.footer-social-strip a svg', F).map(svg => { const a = svg.closest('a'), bg = bgOf(a), fill = over(rgba(getComputedStyle(svg).fill === 'none' ? getComputedStyle(a).color : getComputedStyle(svg).fill), bg.c); return { t: a.title, fg: hex(fill), bg: hex(bg.c), ratio: +ratio(fill, bg.c).toFixed(2), need: 3 }; });
    const tb = F.querySelector('.footer-matrix-title'); if (tb && vis(tb)) { const s = getComputedStyle(tb, '::after'); if (s.content && s.content !== 'none') { const bg = bgOf(tb).c; const c = over(rgba(s.color), bg); out.icons.push({ t: 'coverage chevron', fg: hex(c), bg: hex(bg), ratio: +ratio(c, bg).toFixed(2), need: 3 }); } }
    // reduced motion data (transition durations inside the footer)
    out.transitions = [...new Set(qa('*', F).map(e => getComputedStyle(e).transitionDuration).filter(d => d.split(',').some(x => parseFloat(x) > 0)))];
    scrollTo(0, 0); await raf();
    return out;
  });
}

async function focusCheck(page) {
  await page.evaluate(HELPERS);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); });
  await page.keyboard.press('Tab'); // keyboard modality
  return page.evaluate(async () => {
    const { targets, rgba, over, ratio, bgOf, hex, label, raf } = window.__ff;
    const res = [];
    for (const a of targets()) { a.focus({ preventScroll: false }); await raf(); const s = getComputedStyle(a); const fv = a.matches(':focus-visible');
      const ow = parseFloat(s.outlineWidth) || 0, style = s.outlineStyle; const bg = bgOf(a.parentElement).c; const oc = over(rgba(s.outlineColor), bg);
      const ok = fv && ((style !== 'none' && ow >= 2 && ratio(oc, bg) >= 3) || (s.boxShadow && s.boxShadow !== 'none'));
      res.push({ t: label(a), fv, style, ow, oc: hex(oc), bg: hex(bg), ratio: +ratio(oc, bg).toFixed(2), ok }); a.blur(); }
    return res;
  });
}

async function pillScan(page) {
  await page.evaluate(HELPERS);
  return page.evaluate(async () => {
    const { q, qa, raf } = window.__ff;
    const hit = (a, b) => a.width && b.width && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
    const pill = q('.launchlayer-floating-pill-container'); if (!pill) return { none: true };
    const shown = () => { for (let n = pill; n && n.nodeType === 1; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.01) return false; } return true; };
    const pb = () => { const b = q('.launchlayer-floating-btn'); return (b || pill).getBoundingClientRect(); };
    const F = q('footer.launchlayer-master-footer');
    const tg = () => { const t = []; for (const e of qa('a, button, img, svg, iframe', F)) { const b = e.getBoundingClientRect(); if (b.width && b.height) t.push([`${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('alt') || e.getAttribute('title') || '').trim().slice(0, 20)}"`, b]); }
      const tw = document.createTreeWalker(F, NodeFilter.SHOW_TEXT), rg = document.createRange(); while (tw.nextNode()) { const n = tw.currentNode; if (!n.textContent.trim() || n.parentElement.closest('script,style')) continue; rg.selectNodeContents(n); for (const b of rg.getClientRects()) if (b.width && b.height) t.push([`text "${n.textContent.trim().slice(0, 20)}"`, b]); } return t; };
    const max = document.documentElement.scrollHeight - innerHeight, fTop = F.getBoundingClientRect().top + scrollY;
    const hits = [], seenPos = []; let everShown = false;
    scrollTo(0, 0); await raf(); if (shown()) everShown = true;
    const start = Math.max(0, Math.floor((fTop - innerHeight) / 20) * 20 - 40);
    for (let y = start; y <= max + 19; y += 20) { const yy = Math.min(y, max); scrollTo(0, yy); await raf(); await raf(); if (!shown()) continue; everShown = true; seenPos.push(yy); const p = pb();
      for (const [d, b] of tg()) if (hit(p, b)) { hits.push(`${d} @${yy}`); break; } }
    const notice = q('#ll-cookie-notice, .ll-cookie-notice'); scrollTo(0, 0); await raf();
    return { hits, seen: seenPos.length, everShown, first: seenPos[0], last: seenPos[seenPos.length - 1], max, notice: !!notice && getComputedStyle(notice).display !== 'none' && !notice.hidden };
  });
}

async function signature(page) {
  return page.evaluate(async () => {
    const html = await (await fetch(location.href, { cache: 'no-store' })).text();
    const d = new DOMParser().parseFromString(html, 'text/html'); return window.__sig ? window.__sig(d) : null;
  });
}
const SIG = `window.__sig = (d) => {
  const F = d.querySelector('footer.launchlayer-master-footer'); if (!F) return null;
  const strip = t => t.replace(/[\\u{1F000}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{FE0F}]/gu, '').replace(/\\s+/g, ' ').trim();
  const walk = (e, dep) => [dep + ':' + e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].sort().join('.') : '')].concat(...[...e.children].filter(c => !['path'].includes(c.tagName.toLowerCase())).map(c => walk(c, dep + 1)));
  const links = [...F.querySelectorAll('a[href]')].map(a => a.getAttribute('href') + ' | ' + strip(a.textContent));
  const rawTexts = [...F.querySelectorAll('a[href]')].map(a => a.textContent.replace(/\\s+/g, ' ').trim());
  const text = [...F.querySelectorAll('p')].map(p => p.textContent.replace(/\\s+/g, ' ').trim());
  const umami = [...F.querySelectorAll('[data-umami-event]')].map(e => e.getAttribute('data-umami-event') + ':' + (e.getAttribute('data-umami-event-location') || ''));
  const cssLinks = [...d.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')).filter(h => /global-nav-footer\\.css/.test(h));
  const jsLinks = [...d.querySelectorAll('script[src]')].map(s => s.getAttribute('src')).filter(h => /global-nav-footer\\.js/.test(h));
  return { tree: walk(F, 0).join('\\n'), links, rawTexts, text, umami, cssLinks, jsLinks, pill: !!d.querySelector('.launchlayer-floating-pill-container'), jsonld: [...d.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent.length) };
};`;

// ---------------------------------------------------------------- static pass over every HTML page in the repo tree
async function staticPass(browser) {
  const files = fs.readFileSync(path.join(ROOT, 'data/html-files.txt'), 'utf8').split('\n').filter(Boolean);
  const ctx = await browser.newContext(); const page = await ctx.newPage(); await page.setContent('<html></html>'); await page.evaluate(SIG);
  const rows = [];
  for (const f of files) { const p = path.join(STATIC_ROOT, f); if (!fs.existsSync(p)) continue; const html = fs.readFileSync(p, 'utf8'); if (!/global-nav-footer\.css/.test(html)) continue;
    rows.push({ f, s: await page.evaluate(h => window.__sig(new DOMParser().parseFromString(h, 'text/html')), html) }); }
  await ctx.close();
  const real = rows.filter(r => r.f !== 'template.html');
  const by = k => { const g = {}; for (const r of real) { const v = typeof k === 'function' ? k(r) : JSON.stringify(r.s[k]); (g[v] = g[v] || []).push(r.f); } return g; };
  const trees = by('tree'), links = by('links'), texts = by('text'), css = by('cssLinks'), js = by('jsLinks');
  const emoji = by(r => JSON.stringify(r.s.rawTexts));
  console.log(`STATIC root=${STATIC_ROOT}: ${rows.length} pages link global-nav-footer.css (${real.length} excl. template.html); css hrefs: ${Object.entries(css).map(([k, v]) => `${k}×${v.length}`).join(', ')}; js srcs: ${Object.entries(js).map(([k, v]) => `${k}×${v.length}`).join(', ')}`);
  const odd = g => Object.values(g).sort((a, b) => b.length - a.length).slice(1).flat();
  report('static', 'all', '-', `footer element tree identical on all ${real.length} pages`, Object.keys(trees).length === 1, Object.keys(trees).length > 1 ? `${Object.keys(trees).length} variants; odd: ${odd(trees).join(', ')}` : '');
  report('static', 'all', '-', 'footer link set (href + text, emoji-insensitive) identical', Object.keys(links).length === 1, Object.keys(links).length > 1 ? `odd: ${odd(links).join(', ')}` : '');
  report('static', 'all', '-', 'footer legal/company/tagline text identical', Object.keys(texts).length === 1, Object.keys(texts).length > 1 ? `odd: ${odd(texts).join(', ')}` : '');
  report('static', 'all', '-', 'one global-nav-footer.css href (same ?v=) on every page', Object.keys(css).length === 1, Object.keys(css).join(' vs '));
  report('static', 'all', '-', 'one global-nav-footer.js src (same ?v=) on every page', Object.keys(js).length === 1, Object.keys(js).join(' vs '));
  if (Object.keys(emoji).length > 1) warn(`Data Recovery link text differs by a leading 🛡️ emoji (visible copy, needs Jordan's decision): with emoji ${Object.values(emoji).sort((a, b) => b.length - a.length)[0].length}, without ${odd(emoji).length} (${odd(emoji).slice(0, 4).join(', ')}…)`);
  dump.static = { pages: rows.length, trees: Object.fromEntries(Object.entries(trees).map(([k, v]) => [k.slice(0, 40), v])), css: Object.keys(css), js: Object.keys(js) };
}

// ---------------------------------------------------------------- main
const sigs = {};
for (const eng of ENGINES) {
  const browser = await engines[eng].launch();
  if (eng === ENGINES[0]) await staticPass(browser);
  for (const pg of pages) for (const [w, h] of vpFor(eng)) {
    const { ctx, page, m } = await open(browser, { w, h, path: pg, mode: MODE });
    const r = await measure(page, w);
    const key = `${eng}|${pg}|${w}`; dump[key] = r;
    if (r.nofooter) { report(eng, pg, w, 'footer present', false); await ctx.close(); continue; }
    report(eng, pg, w, 'no horizontal overflow (page + footer)', r.sw <= r.cw && r.fsw <= r.fcw, `page ${r.sw}/${r.cw}, footer ${r.fsw}/${r.fcw}`);
    const B = Object.entries(r.blocks);
    if (m) {
      const bad = B.filter(([, b]) => !b || Math.abs(b.l - r.G) > 1 || Math.abs(b.r - r.G) > 1).map(([s, b]) => b ? `${s} ${b.l}|${b.r}` : `${s} missing`);
      report(eng, pg, w, `gutter: footer blocks on the ${r.G}px page gutter`, !bad.length, bad.join('; ') || `blocks at ${r.G}px`);
      report(eng, pg, w, `gutter: all visible footer content inside [${r.G}, vw−${r.G}]`, !r.outside.length, r.outside.slice(0, 4).join('; ') + (r.outside.length > 4 ? ` (+${r.outside.length - 4})` : ''));
      const n = r.nav, hs = new Set(n.map(x => Math.round(x.h)));
      report(eng, pg, w, 'nav: tidy 2-column grid, equal 44px+ rows, shared left edges', r.navCols === 2 && r.navRows === 3 && hs.size === 1 && n.every(x => x.h >= 44), `${r.navCols} text columns, ${r.navRows} rows, heights ${[...hs].join('/')}`);
    } else {
      const ls = new Set(B.filter(([, b]) => b).map(([, b]) => Math.round(b.l))), rs = new Set(B.filter(([, b]) => b).map(([, b]) => Math.round(b.r)));
      report(eng, pg, w, 'desktop: footer blocks share one left and one right edge (centred container)', ls.size === 1 && rs.size === 1 && Math.abs([...ls][0] - [...rs][0]) <= 2, `lefts ${[...ls].join('/')} rights ${[...rs].join('/')}`);
      report(eng, pg, w, 'desktop: nav on one row', r.navRows === 1, `${r.navRows} rows`);
    }
    report(eng, pg, w, 'tap targets ≥44×44 (logo, nav, coverage, social, badge) + 44px hit test', !r.small.length, r.small.slice(0, 5).join('; ') + (r.small.length > 5 ? ` (+${r.small.length - 5})` : ''));
    report(eng, pg, w, 'tap targets ≥8px apart', !r.close.length, r.close.slice(0, 4).join('; ') + (r.close.length > 4 ? ` (+${r.close.length - 4})` : ''));
    const lowC = r.contrast.filter(c => c.ratio < c.need), lowI = r.icons.filter(c => c.ratio < c.need);
    report(eng, pg, w, 'contrast AA: footer text ≥4.5:1 (large ≥3:1), icons ≥3:1', !lowC.length && !lowI.length && !r.bgImage, (lowC.concat(lowI).map(c => `${c.el || c.t} ${c.fg}/${c.bg} ${c.ratio}`).join('; ') || `min text ${Math.min(...r.contrast.map(c => c.ratio)).toFixed(2)}, min icon ${r.icons.length ? Math.min(...r.icons.map(c => c.ratio)).toFixed(2) : '-'}`) + (r.bgImage ? ' (bg image in footer)' : ''));
    report(eng, pg, w, 'coverage disclosure: 11 links in the HTML, toggle is a <button>', r.cov.links === 11 && r.cov.tag === 'button', `${r.cov.links} links, toggle <${r.cov.tag}>`);
    const fc = await focusCheck(page); dump[key].focus = fc;
    const badF = fc.filter(x => !x.ok);
    report(eng, pg, w, 'focus-visible ring on every footer target (≥2px, ≥3:1 vs footer bg)', !badF.length, badF.slice(0, 3).map(x => `"${x.t}" fv=${x.fv} ${x.style} ${x.ow}px ${x.oc}/${x.bg} ${x.ratio}`).join('; ') || `${fc.length} targets, ring ${fc[0] ? `${fc[0].style} ${fc[0].ow}px ${fc[0].oc} (${fc[0].ratio}:1)` : '-'}`);
    const ps = await pillScan(page); dump[key].pill = ps;
    if (ps.none || !ps.everShown) report(eng, pg, w, 'pill never over footer links/text (20px steps)', true, ps.none ? 'no pill in markup' : 'pill not shown at this width');
    else {
      report(eng, pg, w, 'pill never over footer links/text (20px steps)', !ps.hits.length, `${ps.hits.length} hits${ps.hits.length ? ': ' + ps.hits.slice(0, 3).join('; ') : ''}; pill visible at ${ps.seen} footer-zone positions`);
      report(eng, pg, w, `footer tail clears the pill: padding-bottom ≥104px`, r.footer.pb >= 104, `padding-bottom ${r.footer.pb}px, body padding-bottom ${r.bodyPb}px, below footer ${r.belowFooter}px`);
    }
    if (w === 390 && eng === ENGINES[0]) {
      const fv = await open(browser, { w, h, path: pg, mode: MODE, firstVisit: true });
      const p2 = await pillScan(fv.page); dump[key].pillNotice = p2;
      if (!p2.none && p2.everShown) report(eng, pg, w, 'pill never over footer links/text, cookie notice open', !p2.hits.length, `${p2.hits.length} hits; notice ${p2.notice ? 'open' : 'closed'}; visible at ${p2.seen}`);
      await fv.ctx.close();
      const rm = await open(browser, { w, h, path: pg, mode: MODE, reduced: true });
      const t = await rm.page.evaluate(() => { const F = document.querySelector('footer.launchlayer-master-footer'); const pill = document.querySelector('.launchlayer-floating-pill-container'); return { footer: [...new Set([...F.querySelectorAll('*')].map(e => getComputedStyle(e).transitionDuration).filter(d => d.split(',').some(x => parseFloat(x) > 0.011)))], pill: pill ? getComputedStyle(pill).transitionDuration : null }; });
      report(eng, pg, w, 'prefers-reduced-motion: no footer transitions', !t.footer.length, `footer ${t.footer.join(' ') || 'none'}; pill ${t.pill}`);
      await rm.ctx.close();
    }
    if ((w === 390 || w === 1440)) { await page.evaluate(SIG); const s = await signature(page); (sigs[`${eng}|${w}`] = sigs[`${eng}|${w}`] || {})[pg] = s; }
    if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); const f = await page.$('footer.launchlayer-master-footer'); await f.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await f.screenshot({ path: path.join(process.env.SHOTS, `${MODE}-${eng}-${w}-${slug(pg)}.png`) }); }
    await ctx.close();
  }
  await browser.close();
}
for (const [k, g] of Object.entries(sigs)) {
  const [eng, w] = k.split('|'); const ent = Object.entries(g).filter(([, s]) => s);
  const trees = new Set(ent.map(([, s]) => s.tree)), links = new Set(ent.map(([, s]) => JSON.stringify(s.links))), um = new Set(ent.map(([, s]) => JSON.stringify(s.umami)));
  const base = ent[0] && ent[0][1];
  const odd = ent.filter(([, s]) => s.tree !== base.tree || JSON.stringify(s.links) !== JSON.stringify(base.links)).map(([p]) => p);
  report(eng, 'sampled pages', w, `identical footer structure + link set across ${ent.length} sampled pages`, trees.size === 1 && links.size === 1, odd.length ? `differs from ${ent[0][0]}: ${odd.join(', ')}` : '');
}
const fails = results.filter(r => r.ok === false), passes = results.filter(r => r.ok === true);
const byName = {}; for (const r of results.filter(r => 'ok' in r)) { const k = r.name.replace(/\d+px page gutter/, 'Npx page gutter').replace(/\[\d+, vw−\d+\]/, '[G, vw−G]').replace(/across \d+ sampled/, 'across sampled'); byName[k] = byName[k] || [0, 0]; byName[k][r.ok ? 0 : 1]++; }
console.log('\nSUMMARY by check (pass/fail):'); for (const [k, [p, f]] of Object.entries(byName)) console.log(`  ${f ? 'FAIL' : 'PASS'} ${p}/${p + f}  ${k}`);
console.log(`TOTAL ${passes.length} pass, ${fails.length} fail, ${results.filter(r => r.warn).length} warn`);
console.log('GUARD', JSON.stringify(guard));
if (process.env.JSON_OUT) fs.writeFileSync(process.env.JSON_OUT, JSON.stringify({ results, dump, sigs }, null, 1));
process.exit(fails.length ? 1 : 0);
