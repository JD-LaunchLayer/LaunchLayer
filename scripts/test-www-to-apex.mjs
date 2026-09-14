#!/usr/bin/env node
// Unit tests for netlify/edge-functions/www-to-apex.js
// Run: node scripts/test-www-to-apex.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "netlify/edge-functions/www-to-apex.js");
const source = readFileSync(sourcePath, "utf8");

const {
  default: handler,
  canonicalApexUrl,
  isFileLikePath,
  isWwwHost,
  config,
} = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`);

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`pass  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${err.message}`);
  }
}

async function locationOf(url, extraHeaders) {
  const request = new Request(url, extraHeaders ? { headers: extraHeaders } : undefined);
  const response = await handler(request);
  if (!response) return { status: 0, location: null };
  return { status: response.status, location: response.headers.get("location") };
}

check("config covers root and splat; fail-open on error", () => {
  assert.deepEqual(config.path, ["/", "/*"]);
  assert.equal(config.onError, "bypass");
});

check("source mentions www.launchlayer.uk (no silent host drift)", () => {
  assert.match(source, /www\.launchlayer\.uk/);
  assert.match(source, /https:\/\/launchlayer\.uk/);
});

const htmlCases = [
  ["/wickford-laptop-repair", "https://launchlayer.uk/wickford-laptop-repair/"],
  ["/wickford-laptop-repair/", "https://launchlayer.uk/wickford-laptop-repair/"],
  ["/services", "https://launchlayer.uk/services/"],
  ["/services/", "https://launchlayer.uk/services/"],
  ["/wickford-pc-repair", "https://launchlayer.uk/wickford-pc-repair/"],
  ["/macbook-repair-wickford", "https://launchlayer.uk/macbook-repair-wickford/"],
  ["/", "https://launchlayer.uk/"],
  ["", "https://launchlayer.uk/"],
  ["/blog/clicked-phishing-link-emergency-guide", "https://launchlayer.uk/blog/clicked-phishing-link-emergency-guide/"],
];

for (const [pathname, expected] of htmlCases) {
  check(`canonical HTML ${pathname || "(empty)"}`, () => {
    assert.equal(canonicalApexUrl(pathname || "/", ""), expected);
  });
}

check("query string preserved on HTML", () => {
  assert.equal(
    canonicalApexUrl("/services", "?utm=gsc"),
    "https://launchlayer.uk/services/?utm=gsc"
  );
});

const fileCases = [
  "/assets/css/fonts.css",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/llms.txt",
  "/assets/fonts/font.woff2",
  "/assets/images/hero.webp",
  "/assets/images/logo.svg",
  "/assets/animate/app.js",
  "/assets/css/site.css.map",
];

for (const pathname of fileCases) {
  check(`file-like ${pathname} is path-preserving`, () => {
    assert.equal(isFileLikePath(pathname), true);
    assert.equal(
      canonicalApexUrl(pathname, ""),
      `https://launchlayer.uk${pathname}`
    );
  });
}

check("/assets prefix is file-like even without extension", () => {
  assert.equal(isFileLikePath("/assets/"), true);
  assert.equal(canonicalApexUrl("/assets/css/fonts.css", "?v=1"), "https://launchlayer.uk/assets/css/fonts.css?v=1");
});

check("HTML paths are not file-like", () => {
  assert.equal(isFileLikePath("/wickford-laptop-repair"), false);
  assert.equal(isFileLikePath("/services/"), false);
});

check("isWwwHost true only for www.launchlayer.uk", () => {
  assert.equal(isWwwHost(new Request("https://www.launchlayer.uk/x")), true);
  assert.equal(isWwwHost(new Request("https://launchlayer.uk/x")), false);
  assert.equal(
    isWwwHost(
      new Request("https://deploy-preview-90--launchlayer-preview.netlify.app/x")
    ),
    false
  );
  assert.equal(
    isWwwHost(
      new Request("https://example.netlify.app/x", {
        headers: { host: "www.launchlayer.uk" },
      })
    ),
    true
  );
});

const wwwOneHop = [
  "https://www.launchlayer.uk/wickford-laptop-repair",
  "https://www.launchlayer.uk/wickford-laptop-repair/",
  "https://www.launchlayer.uk/services",
  "https://www.launchlayer.uk/wickford-pc-repair",
  "https://www.launchlayer.uk/macbook-repair-wickford",
  "https://www.launchlayer.uk/",
  "https://www.launchlayer.uk",
];

for (const url of wwwOneHop) {
  const { status, location } = await locationOf(url);
  const path = new URL(url).pathname;
  const expected = canonicalApexUrl(path === "" ? "/" : path, "");
  check(`handler Location for ${url}`, () => {
    assert.equal(status, 301);
    assert.equal(location, expected);
  });
}

{
  const { status, location } = await locationOf(
    "https://www.launchlayer.uk/assets/css/fonts.css"
  );
  check("www asset → apex, no trailing slash", () => {
    assert.equal(status, 301);
    assert.equal(location, "https://launchlayer.uk/assets/css/fonts.css");
  });
}

{
  const { status, location } = await locationOf(
    "https://launchlayer.uk/wickford-laptop-repair"
  );
  check("apex is a no-op (Pretty URLs keep the one-hop slash)", () => {
    assert.equal(status, 0);
    assert.equal(location, null);
  });
}

{
  const { status, location } = await locationOf(
    "https://www.launchlayer.uk/wickford-laptop-repair?utm=gsc"
  );
  check("www query preserved", () => {
    assert.equal(status, 301);
    assert.equal(
      location,
      "https://launchlayer.uk/wickford-laptop-repair/?utm=gsc"
    );
  });
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
