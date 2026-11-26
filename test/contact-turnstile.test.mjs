import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CUSTOMER_MESSAGE,
  FORWARD_HEADER,
  FORM_NAME,
  handleContact,
  signForward,
  verifyTurnstile,
} from "../netlify/functions/contact-form.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_SECRET = "1x0000000000000000000000000000000AA";
const FAIL_SECRET = "2x0000000000000000000000000000000AA";
const DUMMY_TOKEN = "XXXX.DUMMY.TOKEN.XXXX";

function request(body, { accept = "application/json", url = "https://launchlayer.uk/api/contact", ip = "203.0.113.8" } = {}) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept,
      "x-nf-client-connection-ip": ip,
    },
    body,
  });
}

test("Cloudflare's always-pass test secret accepts a dummy token", async () => {
  const verdict = await verifyTurnstile({
    secret: PASS_SECRET,
    token: DUMMY_TOKEN,
    remoteip: "203.0.113.8",
    fetchImpl: globalThis.fetch.bind(globalThis),
  });
  assert.equal(verdict.ok, true);
});

test("Cloudflare's always-fail test secret rejects a dummy token", async () => {
  const verdict = await verifyTurnstile({
    secret: FAIL_SECRET,
    token: DUMMY_TOKEN,
    remoteip: "203.0.113.8",
    fetchImpl: globalThis.fetch.bind(globalThis),
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, "rejected");
});

test("a filled honeypot is dropped before Turnstile or Netlify", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("should not be called");
  };
  const res = await handleContact(
    request("form-name=contact&bot-field=spam&Email=a@example.com&cf-turnstile-response=token"),
    { secret: PASS_SECRET, fetchImpl },
  );
  assert.equal(res.status, 403);
  assert.equal(await res.text(), CUSTOMER_MESSAGE);
  assert.equal(calls, 0);
});

test("a passing token is forwarded to the site root without the token", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (String(url).includes("siteverify")) {
      return new Response(JSON.stringify({ success: true, action: "contact", hostname: "launchlayer.uk" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(null, { status: 302, headers: { location: "/contact/?submitted=true" } });
  };
  const res = await handleContact(
    request("bot-field=&First+Name=Alex&Email=a%40example.com&cf-turnstile-response=fresh-token&Message=Hello"),
    { secret: PASS_SECRET, fetchImpl },
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(calls.length, 2);
  const verify = new URLSearchParams(calls[0].init.body);
  assert.equal(verify.get("secret"), PASS_SECRET);
  assert.equal(verify.get("response"), "fresh-token");
  assert.equal(verify.get("remoteip"), "203.0.113.8");
  assert.equal(calls[1].url, "https://launchlayer.uk/");
  assert.equal(calls[1].init.headers[FORWARD_HEADER], await signForward(PASS_SECRET, calls[1].init.body));
  assert.notEqual(calls[1].init.headers[FORWARD_HEADER], PASS_SECRET);
  const forwarded = new URLSearchParams(calls[1].init.body);
  assert.equal(forwarded.get("form-name"), FORM_NAME);
  assert.equal(forwarded.get("First Name"), "Alex");
  assert.equal(forwarded.get("Email"), "a@example.com");
  assert.equal(forwarded.get("Message"), "Hello");
  assert.equal(forwarded.get("cf-turnstile-response"), null);
  assert.equal(forwarded.get("bot-field"), "");
});

test("a failed check returns 403 for the page script and redirects a normal form post", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 });
  const ajax = await handleContact(request("bot-field=&cf-turnstile-response=nope"), { secret: FAIL_SECRET, fetchImpl });
  assert.equal(ajax.status, 403);
  assert.equal(await ajax.text(), CUSTOMER_MESSAGE);

  const browser = await handleContact(
    request("bot-field=&cf-turnstile-response=nope", { accept: "text/html" }),
    { secret: FAIL_SECRET, fetchImpl },
  );
  assert.equal(browser.status, 303);
  assert.equal(browser.headers.get("location"), "https://launchlayer.uk/contact/?sent=0");
});

test("a normal form post is sent to the same thank-you page", async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes("siteverify")) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(null, { status: 200 });
  };
  const res = await handleContact(
    request("bot-field=&cf-turnstile-response=ok&Email=a@example.com", { accept: "text/html" }),
    { secret: PASS_SECRET, fetchImpl },
  );
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "https://launchlayer.uk/contact/?submitted=true");
});

test("www submissions are forwarded to the apex", async () => {
  let forwardedTo = "";
  const fetchImpl = async (url) => {
    if (String(url).includes("siteverify")) return new Response(JSON.stringify({ success: true }), { status: 200 });
    forwardedTo = String(url);
    return new Response(null, { status: 200 });
  };
  const res = await handleContact(
    request("bot-field=&cf-turnstile-response=ok", { url: "https://www.launchlayer.uk/api/contact" }),
    { secret: PASS_SECRET, fetchImpl },
  );
  assert.equal(res.status, 200);
  assert.equal(forwardedTo, "https://launchlayer.uk/");
});

test("the contact page keeps the honeypot and posts through the function", () => {
  const html = readFileSync(join(ROOT, "contact/index.html"), "utf8");
  const key = readFileSync(join(ROOT, "assets/js/turnstile-site-key.js"), "utf8");
  assert.match(html, /name="bot-field" type="text" tabindex="-1" autocomplete="off"/);
  assert.match(html, /action="\/api\/contact"/);
  assert.match(html, /data-netlify="true" netlify-honeypot="bot-field" hidden/);
  assert.match(html, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?onload=llTurnstileReady/);
  assert.match(html, /id="ll-turnstile"/);
  assert.match(key, /TURNSTILE_SITE_KEY = "1x00000000000000000000AA"/);
});
