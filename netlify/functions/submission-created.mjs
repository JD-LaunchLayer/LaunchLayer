/**
 * Verified contact-form submissions only.
 *
 * The current typed formSubmitted handler (@netlify/types FormSubmittedEvent)
 * is only `{ data: Record<string, string> }`. It does not include a stable
 * submission id, the display number, or created_at. The legacy
 * submission-created filename event is still supported and its payload does
 * include those, so this file keeps that name.
 *
 * Netlify invokes it after the form has already been accepted, and only for
 * verified submissions. Spam and honeypot rejects do not fire it. background
 * mode means a thrown error is retried by Netlify (once after a minute, then
 * once more). The visitor's thank-you redirect does not wait on this function.
 *
 * Logs are a fixed status line plus the submission id. The sheet id, the
 * service-account key, and every form field stay out of the log.
 */

import { logEnquiry } from "../../lib/enquiry-log.mjs";
import { syncEnquiry } from "../../lib/sync-enquiry.mjs";

function envGet(name) {
  try {
    if (typeof Netlify !== "undefined" && Netlify.env && typeof Netlify.env.get === "function") {
      const value = Netlify.env.get(name);
      if (typeof value === "string" && value.length > 0) return value;
    }
  } catch {
    /* fall through to process.env for local replay */
  }
  const fromProcess = process.env[name];
  return typeof fromProcess === "string" ? fromProcess : "";
}

function readEnv() {
  return {
    sheetId: envGet("ENQUIRY_SHEET_ID").trim(),
    sheetTab: envGet("ENQUIRY_SHEET_TAB").trim(),
    clientEmail: envGet("GOOGLE_SERVICE_ACCOUNT_EMAIL").trim(),
    privateKey: envGet("GOOGLE_PRIVATE_KEY"),
    testToken: envGet("ENQUIRY_TEST_TOKEN").trim(),
    context: envGet("CONTEXT").trim(),
  };
}

function writeLog(line, status) {
  if (status === "logged" || status === "duplicate" || status === "ignored") console.log(line);
  else console.error(line);
}

async function readBody(req) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

export async function handleSubmission(req, deps = {}) {
  const fetchImpl = deps.fetchImpl || globalThis.fetch.bind(globalThis);
  const env = deps.env || readEnv();
  const log = deps.log || writeLog;
  let submissionId = "";
  try {
    const body = await readBody(req);
    const payload = body && typeof body.payload === "object" ? body.payload : null;
    if (payload && typeof payload.id === "string") submissionId = payload.id;
    const result = await syncEnquiry({
      payload,
      env,
      fetchImpl,
      log,
      sleep: deps.sleep,
    });
    if (!result.ok && result.retryable) {
      const status = result.outcome === "missing-config" || result.outcome === "missing-headers"
        ? result.outcome
        : "sheet-sync-failed";
      throw new Error(logEnquiry(submissionId, status, result.httpStatus));
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("enquiry-log ")) throw err;
    throw new Error(logEnquiry(submissionId, "sheet-sync-failed"));
  }
}

export default function handler(req) {
  return handleSubmission(req);
}

export const config = {
  background: true,
};
