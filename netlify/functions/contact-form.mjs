/**
 * Contact form gate. The page posts here. We check the honeypot and
 * Cloudflare Turnstile, then forward a successful enquiry to Netlify Forms.
 *
 * TURNSTILE_SECRET_KEY is read with Netlify.env (set it in the Netlify UI
 * for every deploy context). It is never written into the page.
 */

export const CUSTOMER_MESSAGE =
  "Sorry, we couldn't confirm you're not a robot. Please tick the box and try again, or call us.";

export const FORM_NAME = "contact";
export const FORWARD_HEADER = "x-ll-contact-forward";
export const TURNSTILE_ACTION = "contact";

export async function signForward(secret, body) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function envGet(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env && typeof Netlify.env.get === "function") {
      const value = Netlify.env.get(name);
      if (typeof value === "string") return value.trim();
    }
  } catch {
    /* fail closed below when the secret is empty */
  }
  return "";
}

export function clientIp(req) {
  const fromNetlify = req.headers.get("x-nf-client-connection-ip");
  const fromCloudflare = req.headers.get("cf-connecting-ip");
  return (fromNetlify || fromCloudflare || "").trim();
}

export function forwardOrigin(req) {
  const url = new URL(req.url);
  if (url.hostname.toLowerCase() === "www.launchlayer.uk") return "https://launchlayer.uk";
  return url.origin;
}

function wantsHtmlNavigation(req) {
  const accept = req.headers.get("accept") || "";
  if (accept.includes("application/json")) return false;
  return accept.includes("text/html");
}

function customerFailure(req, status) {
  if (wantsHtmlNavigation(req)) {
    return Response.redirect(new URL("/contact/?sent=0", req.url), 303);
  }
  return new Response(CUSTOMER_MESSAGE, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function customerSuccess(req) {
  if (wantsHtmlNavigation(req)) {
    return Response.redirect(new URL("/contact/?submitted=true", req.url), 303);
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function verifyTurnstile({ secret, token, remoteip, fetchImpl }) {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "missing-token" };
  }
  if (typeof secret !== "string" || secret.length === 0) {
    return { ok: false, reason: "missing-secret" };
  }
  const body = new URLSearchParams({ secret, response: token });
  if (remoteip) body.set("remoteip", remoteip);
  let response;
  try {
    response = await fetchImpl(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    return { ok: false, reason: "siteverify-unreachable" };
  }
  if (!response.ok) return { ok: false, reason: "siteverify-status" };
  let result;
  try {
    result = await response.json();
  } catch {
    return { ok: false, reason: "siteverify-body" };
  }
  if (!result || result.success !== true) return { ok: false, reason: "rejected" };
  if (typeof result.action === "string" && result.action !== "" && result.action !== TURNSTILE_ACTION) {
    return { ok: false, reason: "action" };
  }
  return { ok: true };
}

function forwardedBody(params) {
  const forwarded = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === "cf-turnstile-response" || key === "form-name") continue;
    forwarded.append(key, value);
  }
  forwarded.set("form-name", FORM_NAME);
  return forwarded;
}

export async function handleContact(req, deps = {}) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const fetchImpl = deps.fetchImpl || globalThis.fetch.bind(globalThis);
  const secret = (deps.secret !== undefined ? deps.secret : envGet("TURNSTILE_SECRET_KEY")).trim();

  let params;
  try {
    params = new URLSearchParams(await req.text());
  } catch {
    return customerFailure(req, 400);
  }

  if ((params.get("bot-field") || "").trim() !== "") {
    return customerFailure(req, 403);
  }

  const verdict = await verifyTurnstile({
    secret,
    token: params.get("cf-turnstile-response") || "",
    remoteip: clientIp(req),
    fetchImpl,
  });
  if (!verdict.ok) return customerFailure(req, 403);

  const body = forwardedBody(params).toString();
  let upstream;
  try {
    upstream = await fetchImpl(`${forwardOrigin(req)}/`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        [FORWARD_HEADER]: await signForward(secret, body),
      },
      body,
      redirect: "manual",
    });
  } catch {
    return new Response(CUSTOMER_MESSAGE, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  if (!upstream || upstream.status < 200 || upstream.status >= 400) {
    return new Response(CUSTOMER_MESSAGE, {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }
  return customerSuccess(req);
}

export default async function handler(req) {
  return handleContact(req);
}

export const config = {
  path: "/api/contact",
  method: ["POST"],
};
