// Shared Playwright harness for the LaunchLayer site-wide footer work.
// Every context: Umami /api/send fulfilled '{}', Umami script host blocked, contact-form POSTs stubbed,
// Netlify preview drawer blocked. Pages are always addressed as https://launchlayer.uk/* .
import { webkit, chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
export const SITE = 'https://launchlayer.uk';
export const PREVIEW = 'https://deploy-preview-124--launchlayer-preview.netlify.app';
// MODE=live: set BASE to a deploy-preview origin to load every page from that preview.
// Unset, production is used and only /contact/ is proxied from PREVIEW.
export const BASE = (process.env.BASE || '').replace(/\/$/, '');
export const ROOT = '/workspace/ll-footer';
export const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
export const engines = { webkit, chromium };
// Headless Chromium's UA makes Bark's badge JSONP fail (ERR_BLOCKED_BY_ORB), so desktop Chromium uses a normal Chrome UA.
export const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const guard = { loads: 0, umamiSendFulfilled: 0, umamiScriptBlocked: 0, umamiOtherFulfilled: 0, contactStubbed: 0, netlifyBlocked: 0, overlayServed: 0, leaked: [] };
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
function overlayFile(root, p) {
  if (!root) return null;
  const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
  for (const c of [p, p.endsWith('/') ? p + 'index.html' : p + '/index.html']) {
    const rel = decodeURIComponent(c).replace(/^\/+/, '');
    if (!rel || rel.split('/').includes('..')) continue;
    const f = path.join(root, rel);
    if ((f === root || f.startsWith(rootPrefix)) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
  }
  return null;
}
// mode: 'live' (network; /contact/ proxied from the PR #124 preview) | 'proto' (overlay dir first, then as live)
export async function open(browser, o) {
  const { w, h, path: p = '/', mode = 'live', overlay = path.join(ROOT, 'proto/site'), firstVisit = false, reduced = false, abortBark = false, waitMs = 2500 } = o;
  const m = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: m ? 3 : 1, isMobile: m, hasTouch: m, userAgent: m ? UA : (browser.browserType().name() === 'chromium' ? CHROME_UA : undefined), reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.route('**/api/send', r => { guard.umamiSendFulfilled++; r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await ctx.route(/umami\.(is|dev)\//, r => { const u = r.request().url(); if (/\/api\/send/.test(u)) { guard.umamiSendFulfilled++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); } if (/\.js(\?|$)/.test(u)) { guard.umamiScriptBlocked++; return r.abort(); } guard.umamiOtherFulfilled++; r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await ctx.route(/launchlayer\.uk\/(?:\?.*)?$/, r => {
    if (r.request().method() !== 'POST') return r.fallback();
    const body = r.request().postData() || '';
    if (!body.includes('form-name=contact') && !body.includes('form-name%3Dcontact')) return r.fallback();
    guard.contactStubbed++;
    return r.fulfill({ status: 500, contentType: 'text/plain', body: 'stubbed' });
  });
  await ctx.route(/\/\.netlify\//, r => { guard.netlifyBlocked++; r.abort(); });
  if (abortBark) await ctx.route(/bark\.com/, r => r.abort());
  const viaPreview = BASE ? true : p.startsWith('/contact');
  const fetchOrigin = BASE || PREVIEW;
  const root = mode === 'proto' ? overlay : null;
  if (viaPreview || root) await ctx.route(SITE + '/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname.startsWith('/.netlify/')) { guard.netlifyBlocked++; return r.abort(); } // the SITE route wins over the /.netlify/ route above
    if (u.pathname === '/api/send') return r.fallback();
    if (r.request().method() === 'POST' && u.pathname === '/') return r.fallback();
    const f = overlayFile(root, u.pathname);
    if (f) { guard.overlayServed++; return r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); }
    if (!viaPreview) return r.fallback();
    try { r.fulfill({ response: await r.fetch({ url: fetchOrigin + u.pathname + u.search }) }); } catch (e) { r.abort(); }
  });
  ctx.on('request', q => { const u = q.url(); if (/umami|\/api\/send/.test(u) && !/cloud\.umami\.is\/script\.js/.test(u)) { /* routed above */ } });
  if (!firstVisit) await ctx.addInitScript(() => { try { localStorage.setItem('ll_cookie_notice', 'dismissed'); } catch (e) {} });
  const page = await ctx.newPage();
  guard.loads++;
  await page.goto(SITE + p, { waitUntil: 'load', timeout: 90000 });
  await page.waitForTimeout(waitMs);
  if (o.settle !== false) await settle(page);
  return { ctx, page, m };
}
export const PAGES = ['/', '/contact/', '/wickford-laptop-repair/', '/blog/fix-overheating-laptop-wickford-essex/', '/blog/cracked-laptop-screen-wickford-essex/', '/faqs/', '/reviews/', '/privacy-policy/', '/services/'];
export const slug = p => (p === '/' ? 'home' : p.replace(/^\/|\/$/g, '').replace(/[\/+]/g, '_'));

// Instant scrolling for measurement (the site sets smooth scrolling) and one pass down the page so
// lazy widgets (reviews, Bark) have loaded and the layout is stable before anything is measured.
export async function settle(page) {
  await page.addStyleTag({ content: 'html, body { scroll-behavior: auto !important; }' });
  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 60; i++) { const y = i * innerHeight; if (y > document.documentElement.scrollHeight) break; scrollTo(0, y); await wait(120); }
    scrollTo(0, document.documentElement.scrollHeight); await wait(1200); scrollTo(0, 0); await wait(400);
  });
}
