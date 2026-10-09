/**
 * Headless checks for the privacy opt-out and the custom-build handoff.
 * Serves the repo and maps launchlayer.uk to 127.0.0.1 so Umami's
 * data-domains check allows the real tracker. /api/send is intercepted
 * and is not forwarded to Umami Cloud.
 *
 *   node tests/privacy-fixes.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = 'launchlayer.uk';
const PORT = 8765;
const TOKEN = 'ZXQ-Private-Note-8841';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${HOST}`);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

function attachSendCapture(page) {
  const sends = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.endsWith('/api/send')) {
      sends.push({ url: req.url(), body: req.postData() || '' });
    }
  });
  return sends;
}

async function settle(page) {
  await page.waitForLoadState('load');
  await page.waitForTimeout(1200);
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}

const server = await startServer();
const browser = await chromium.launch({
  headless: true,
  args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`],
});

try {
  const context = await browser.newContext();
  await context.route('**/api/send', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
  const page = await context.newPage();
  const sends = attachSendCapture(page);
  const origin = `http://${HOST}:${PORT}`;

  // Statistics on: the real tracker should POST a pageview.
  const before = sends.length;
  await page.goto(`${origin}/privacy-policy/`, { waitUntil: 'load' });
  await settle(page);
  const pageviews = sends.slice(before);
  check(
    'stats on: pageview reaches /api/send',
    pageviews.length > 0 && pageviews.every((hit) => hit.url.includes('/api/send')),
    `count=${pageviews.length}`
  );

  const email = page.locator('[data-umami-event="email-click"]').first();
  const beforeEvent = sends.length;
  await email.click({ noWaitAfter: true });
  await page.waitForTimeout(800);
  const eventHits = sends.slice(beforeEvent).map((hit) => hit.body);
  check(
    'stats on: existing email-click event is sent',
    eventHits.some((body) => body.includes('email-click')),
    `payloads=${eventHits.length}`
  );

  await page.goto(`${origin}/privacy-policy/#website-statistics`, { waitUntil: 'load' });
  await settle(page);
  await page.getByRole('button', { name: 'Turn off website statistics on this device' }).click();
  const storedOff = await page.evaluate(() => localStorage.getItem('umami.disabled'));
  const statusOff = await page.locator('#ll-stats-status').innerText();
  const offPressed = await page.locator('#ll-stats-off').getAttribute('aria-pressed');
  check(
    'opt-out writes umami.disabled=1 and shows off',
    storedOff === '1' && statusOff.includes('off') && offPressed === 'true',
    `value=${storedOff} status=${statusOff}`
  );

  const beforeReload = sends.length;
  await page.reload({ waitUntil: 'load' });
  await settle(page);
  const reloadHits = sends.slice(beforeReload);
  const stillOff = await page.evaluate(() => localStorage.getItem('umami.disabled'));
  check(
    'stats off: reload sends nothing and the setting stays',
    reloadHits.length === 0 && stillOff === '1',
    `sends=${reloadHits.length} value=${stillOff}`
  );

  const beforeNext = sends.length;
  await page.goto(`${origin}/contact/`, { waitUntil: 'load' });
  await settle(page);
  const nextHits = sends.slice(beforeNext);
  check(
    'stats off: a new page sends nothing',
    nextHits.length === 0,
    `sends=${nextHits.length}`
  );

  await page.goto(`${origin}/privacy-policy/#website-statistics`, { waitUntil: 'load' });
  await settle(page);
  await page.getByRole('button', { name: 'Turn them back on' }).click();
  const storedOn = await page.evaluate(() => localStorage.getItem('umami.disabled'));
  const statusOn = await page.locator('#ll-stats-status').innerText();
  check(
    'opt-in removes umami.disabled and shows on',
    storedOn === null && statusOn.includes('are on'),
    `value=${storedOn} status=${statusOn}`
  );

  const beforeResume = sends.length;
  await page.reload({ waitUntil: 'load' });
  await settle(page);
  const resumeHits = sends.slice(beforeResume);
  check(
    'stats back on: reload sends /api/send again',
    resumeHits.length > 0,
    `sends=${resumeHits.length}`
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/privacy-policy/#website-statistics`, { waitUntil: 'load' });
  const box = await page.locator('#ll-stats-off').boundingBox();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(
    'opt-out control is phone-sized and does not overflow',
    !!box && box.height >= 44 && box.width >= 44 && !overflow,
    box ? `h=${Math.round(box.height)} w=${Math.round(box.width)} overflow=${overflow}` : 'no box'
  );
  await page.setViewportSize({ width: 1280, height: 800 });

  // Custom-build handoff.
  const beforeBuild = sends.length;
  await page.goto(`${origin}/custom-pc-builds/`, { waitUntil: 'load' });
  await settle(page);
  await page.locator('input[name="use"][value="Gaming"]').check();
  await page.locator('input[name="budget"][value="Under £800"]').check();
  await page.locator('#ll-build-games').fill(TOKEN);
  await page.locator('#ll-build-intake button[type="submit"]').click();
  await page.waitForURL(/\/contact\/?$/);
  await settle(page);
  const contactUrl = new URL(page.url());
  const messageValue = await page.locator('#ll-contact-message').inputValue();
  const serviceValue = await page.locator('#ll-contact-service').inputValue();
  const storageLeft = await page.evaluate(() => sessionStorage.getItem('ll-contact-prefill'));
  const handoffHits = sends.slice(beforeBuild);
  const leaked = handoffHits.filter((hit) => hit.body.includes(TOKEN) || hit.url.includes(TOKEN));
  check(
    'build handoff: contact URL has no free-text query',
    contactUrl.pathname.endsWith('/contact/') && !contactUrl.search && !page.url().includes(TOKEN) && !page.url().includes('message='),
    page.url()
  );
  check(
    'build handoff: form is pre-filled and storage is cleared',
    serviceValue === 'Custom PC Builds' &&
      messageValue === `Use: Gaming. Budget: Under £800. Games: ${TOKEN}.` &&
      storageLeft === null,
    `service=${serviceValue} message=${messageValue}`
  );
  check(
    'build handoff: Umami payloads do not contain the games text',
    leaked.length === 0,
    `payloads=${handoffHits.length} leaked=${leaked.length}`
  );

  // Legacy query string is stripped before the tracker reads the URL.
  const beforeLegacy = sends.length;
  await page.goto(
    `${origin}/contact/?service=Custom%20PC%20Builds&message=${encodeURIComponent(TOKEN)}&utm_source=newsletter`,
    { waitUntil: 'load' }
  );
  await settle(page);
  const legacyUrl = new URL(page.url());
  const legacyMessage = await page.locator('#ll-contact-message').inputValue();
  const legacyService = await page.locator('#ll-contact-service').inputValue();
  const legacyHits = sends.slice(beforeLegacy);
  const legacyLeak = legacyHits.filter((hit) => hit.body.includes(TOKEN));
  check(
    'legacy message query is removed and UTM is kept',
    !legacyUrl.searchParams.has('message') &&
      !page.url().includes(TOKEN) &&
      legacyUrl.searchParams.get('utm_source') === 'newsletter' &&
      legacyMessage === TOKEN &&
      legacyService === 'Custom PC Builds' &&
      legacyLeak.length === 0,
    page.url()
  );

  await context.close();

  // Embeds: record Set-Cookie and storage on load. Do not change the pages.
  const embedContext = await browser.newContext();
  const embedPage = await embedContext.newPage();
  const setCookies = [];
  const hosts = new Set();
  embedPage.on('request', (req) => {
    try { hosts.add(new URL(req.url()).host); } catch { /* ignore */ }
  });
  embedPage.on('response', async (res) => {
    let values = [];
    try {
      values = await res.headerValues('set-cookie');
    } catch (err) {
      const raw = res.headers()['set-cookie'];
      if (raw) values = [raw];
    }
    if (!values || !values.length) return;
    let host = '';
    try { host = new URL(res.url()).host; } catch { host = res.url(); }
    for (const value of values) {
      setCookies.push({ host, url: res.url().slice(0, 160), cookie: String(value).split(';')[0] });
    }
  });

  async function readStorage(target) {
    return target.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
      cookie: document.cookie,
    }));
  }

  async function scan(pathName) {
    const beforeKeys = new Set((await embedContext.cookies()).map((c) => c.name + '@' + c.domain));
    await embedPage.goto(`${origin}${pathName}`, { waitUntil: 'load' });
    await embedPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await embedPage.waitForTimeout(4000);
    const storage = await readStorage(embedPage);
    const cookies = await embedContext.cookies();
    const fresh = cookies.filter((c) => !beforeKeys.has(c.name + '@' + c.domain));
    return { pathName, storage, fresh, jar: cookies };
  }

  const home = await scan('/');
  const reviews = await scan('/reviews/');
  await embedContext.close();

  const interesting = setCookies.filter((row) =>
    /google|featurable|trustpilot|bark|gstatic|doubleclick/i.test(row.host)
  );
  console.log('EMBED_HOSTS ' + JSON.stringify([...hosts].filter((host) =>
    /google|featurable|trustpilot|bark|gstatic|doubleclick|youtube/i.test(host)
  )));
  console.log('EMBED_SET_COOKIE ' + JSON.stringify(interesting.map((row) => ({
    host: row.host,
    name: row.cookie.split('=')[0],
  }))));
  console.log('EMBED_HOME_STORAGE ' + JSON.stringify(home.storage));
  console.log('EMBED_REVIEWS_STORAGE ' + JSON.stringify(reviews.storage));
  console.log('EMBED_COOKIE_JAR ' + JSON.stringify(
    [...home.jar, ...reviews.jar].map((c) => ({ name: c.name, domain: c.domain }))
  ));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

const failed = results.filter((row) => !row.ok);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length) process.exit(1);
