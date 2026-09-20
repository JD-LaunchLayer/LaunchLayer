const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const WEB3FORMS_SUBMIT_URL = "https://api.web3forms.com/submit";
const SUCCESS_PATH = "/contact/?submitted=true";

const DEFAULT_SUBJECT = "New Contact Form Submission - LaunchLayer";
const DEFAULT_FROM_NAME = "LaunchLayer Website";

function env(name: string): string {
  const runtime = (globalThis as {
    Netlify?: { env?: { get?: (key: string) => string | undefined } };
  }).Netlify;
  const fromRuntime = runtime?.env?.get?.(name);
  if (fromRuntime) return fromRuntime;
  return process.env[name] || "";
}

function json(
  status: number,
  body: { success: boolean; error?: string; redirect?: string },
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function wantsJson(req: Request): boolean {
  const accept = req.headers.get("Accept") || "";
  const requested = req.headers.get("X-Requested-With") || "";
  return accept.includes("application/json") || requested === "fetch";
}

function asText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async (req: Request, context: { ip?: string }) => {
  if (req.method !== "POST") {
    return json(405, { success: false, error: "Method not allowed." });
  }

  const secret = env("TURNSTILE_SECRET_KEY");
  const accessKey = env("WEB3FORMS_ACCESS_KEY");
  if (!secret || !accessKey) {
    return json(500, {
      success: false,
      error:
        "The contact form is not configured yet. Please try again later or call the workshop.",
    });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { success: false, error: "Invalid form data." });
  }

  if (asText(form.get("botcheck"))) {
    return json(400, { success: false, error: "Submission rejected." });
  }

  const token = asText(
    form.get("cf-turnstile-response") || form.get("turnstileToken"),
  );
  if (!token) {
    return json(400, {
      success: false,
      error: "Please complete the verification check and try again.",
    });
  }

  let verification: { success?: boolean };
  try {
    const verifyRes = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: context.ip,
      }),
    });
    verification = (await verifyRes.json()) as { success?: boolean };
  } catch {
    return json(502, {
      success: false,
      error: "Verification failed. Please try again.",
    });
  }

  if (!verification.success) {
    return json(400, {
      success: false,
      error: "Verification failed. Please try again.",
    });
  }

  const firstName = asText(form.get("First Name"));
  const lastName = asText(form.get("Last Name"));
  const email = asText(form.get("Email"));
  const phone = asText(form.get("Phone"));
  const service = asText(form.get("Service"));
  const message = asText(form.get("Message"));

  if (!firstName || !lastName || !email || !service || !message) {
    return json(400, {
      success: false,
      error: "Please fill in all required fields.",
    });
  }

  if (!looksLikeEmail(email)) {
    return json(400, {
      success: false,
      error: "Please enter a valid email address.",
    });
  }

  const payload = {
    access_key: accessKey,
    subject: asText(form.get("subject")) || DEFAULT_SUBJECT,
    from_name: asText(form.get("from_name")) || DEFAULT_FROM_NAME,
    "First Name": firstName,
    "Last Name": lastName,
    Email: email,
    Phone: phone,
    Service: service,
    Message: message,
  };

  try {
    const forwarded = await fetch(WEB3FORMS_SUBMIT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const delivered = (await forwarded.json()) as { success?: boolean };
    if (!forwarded.ok || delivered.success === false) {
      return json(502, {
        success: false,
        error:
          "We could not send your message just now. Please try again or call the workshop.",
      });
    }
  } catch {
    return json(502, {
      success: false,
      error:
        "We could not send your message just now. Please try again or call the workshop.",
    });
  }

  if (wantsJson(req)) {
    return json(200, { success: true, redirect: SUCCESS_PATH });
  }

  return Response.redirect(new URL(SUCCESS_PATH, req.url), 303);
};

export const config = {
  path: "/api/contact",
  method: ["POST"],
};
