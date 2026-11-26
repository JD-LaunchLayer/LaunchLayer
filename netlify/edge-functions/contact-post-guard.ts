// Unsigned POSTs that would otherwise land in Netlify Forms as "contact"
// are refused here. The contact function sends x-ll-contact-forward as an
// HMAC of the body after Turnstile succeeds. /api/* is left alone so that
// function can run.

const FORM_NAME = "contact";
const FORWARD_HEADER = "x-ll-contact-forward";
const CUSTOMER_MESSAGE =
  "Sorry, we couldn't confirm you're not a robot. Please tick the box and try again, or call us.";

function secretFromEnv(): string {
  try {
    const netlify = (globalThis as {
      Netlify?: { env?: { get?: (name: string) => string | undefined } };
    }).Netlify;
    const value = netlify?.env?.get?.("TURNSTILE_SECRET_KEY");
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

async function signForward(secret: string, body: string): Promise<string> {
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

function secretsMatch(expected: string, provided: string): boolean {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(provided);
  const length = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < length; i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}

function isContactSubmission(body: string, contentType: string): boolean {
  const urlencoded = contentType.includes("application/x-www-form-urlencoded")
    || contentType === ""
    || body.includes("form-name=");
  if (urlencoded && !contentType.includes("multipart/form-data")) {
    const params = new URLSearchParams(body);
    if (params.get("form-name") === FORM_NAME) return true;
    if (body.includes("form-name%3Dcontact") || body.includes("form-name%3dcontact")) return true;
  }
  return /name="form-name"[\s\S]{0,200}\bcontact\b/.test(body);
}

export default async (
  request: Request,
  context: { next: () => Promise<Response> },
) => {
  if (request.method !== "POST") return context.next();
  const url = new URL(request.url);
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return context.next();

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  const looksLikeForm = contentType.includes("application/x-www-form-urlencoded")
    || contentType.includes("multipart/form-data")
    || contentType === "";
  if (!looksLikeForm) return context.next();

  let body = "";
  try {
    body = await request.clone().text();
  } catch {
    return context.next();
  }
  if (!isContactSubmission(body, contentType)) return context.next();

  const secret = secretFromEnv();
  const provided = request.headers.get(FORWARD_HEADER) || "";
  const expected = secret ? await signForward(secret, body) : "";
  if (!secretsMatch(expected, provided)) {
    return new Response(CUSTOMER_MESSAGE, {
      status: 403,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }
  return context.next();
};
