/**
 * Pure mapping for the marketing enquiry log.
 * The sheet row is built only from this allowlist. Names, email addresses,
 * phone numbers and message text are never copied, even if they are present
 * on the Netlify payload.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/** Existing columns stay in this order. New columns are appended after them. */
export const REQUIRED_COLUMNS = [
  "enquiry_id",
  "date",
  "week_start",
  "channel_source",
  "how_heard",
  "service_type",
  "town_area",
  "became_job",
  "job_completed",
  "is_test_or_spam",
  "notes_nonpersonal",
  "submission_id",
  "utm_source",
  "utm_medium",
  "utm_campaign",
];

/** Readable form values Netlify stores, translated into reporting categories. */
export const SERVICE_MAP = new Map([
  ["General Enquiry", "general"],
  ["Custom PC Builds", "custom-build"],
  ["PC Repair & Tech Support", "pc-repair"],
  ["Insurance Damage Report", "insurance-report"],
  ["Scam Support", "scam-support"],
  ["E-Waste or Tech Donation", "e-waste"],
  ["Startup IT Setup", "startup-it-setup"],
  ["Website Setup", "website-setup"],
  ["Laptop Repair", "laptop-repair"],
  ["MacBook Repair", "macbook"],
  ["Screen Replacement", "screen"],
  ["Data Recovery", "data-recovery"],
]);

export const HOW_HEARD_MAP = new Map([
  ["prefer-not-to-say", "unknown"],
  ["google-search", "google-search"],
  ["google-maps", "google-maps"],
  ["facebook", "facebook"],
  ["instagram", "instagram"],
  ["nextdoor", "nextdoor"],
  ["recommendation", "recommendation"],
  ["returning-customer", "returning"],
  ["other", "other"],
]);

export const TOWN_MAP = new Map([
  ["prefer-not-to-say", "unknown"],
  ["wickford", "wickford"],
  ["billericay", "billericay"],
  ["basildon", "basildon"],
  ["rayleigh", "rayleigh"],
  ["brentwood", "brentwood"],
  ["chelmsford", "chelmsford"],
  ["southend", "southend"],
  ["other", "other"],
]);

export const WEBSITE_CHANNEL = "web-form";

const LOG_STATUSES = new Set([
  "logged",
  "duplicate",
  "ignored",
  "sheet-sync-failed",
  "missing-config",
  "missing-headers",
  "bad-payload",
]);

const UTM_PATTERN = /^[a-z0-9_-]{1,40}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MIN_TEST_TOKEN_LENGTH = 16;

export function safeSubmissionId(id) {
  if (typeof id !== "string") return null;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return null;
  return id;
}

export function websiteEnquiryId(number) {
  let value = number;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) value = Number(value);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 999999) {
    return null;
  }
  return `W${String(value).padStart(4, "0")}`;
}

export function sanitiseUtm(value) {
  if (value == null) return "none";
  const text = String(value).trim().toLowerCase();
  if (!text) return "none";
  return UTM_PATTERN.test(text) ? text : "none";
}

export function sanitiseTestToken(value) {
  if (value == null) return "";
  const text = String(value).trim();
  return TOKEN_PATTERN.test(text) ? text : "";
}

function hashesEqual(left, right) {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

/**
 * A public ?ll_test=1 on the live site must not hide a real enquiry from the
 * marketing count, and it must never stop a row being written.
 *
 * The flag is honoured only when:
 * - ENQUIRY_TEST_TOKEN is set to a long random value and the hidden field matches it, or
 * - no long token is set, the deploy is not production, and the field is exactly "1"
 *   (deploy previews and local dev).
 */
export function isExplicitTest({ llTest, context, testToken }) {
  const submitted = sanitiseTestToken(llTest);
  if (!submitted) return false;
  const configured = sanitiseTestToken(testToken);
  if (configured.length >= MIN_TEST_TOKEN_LENGTH) {
    return hashesEqual(submitted, configured);
  }
  if (context && context !== "production") return submitted === "1";
  return false;
}

export function londonCivilDate(iso, timeZone = "Europe/London") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  if (!map.year || !map.month || !map.day) return null;
  return `${map.year}-${map.month}-${map.day}`;
}

/** Monday of the London civil date, as YYYY-MM-DD. Does not shift across BST. */
export function mondayOnOrBefore(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate || "");
  if (!match) return null;
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(utc.getTime())) return null;
  const weekday = utc.getUTCDay();
  const sinceMonday = weekday === 0 ? 6 : weekday - 1;
  utc.setUTCDate(utc.getUTCDate() - sinceMonday);
  return utc.toISOString().slice(0, 10);
}

/** Missing field -> not-asked. Blank, prefer-not-to-say, or anything unmapped -> unknown. */
export function mappedChoice(present, raw, map) {
  if (!present) return "not-asked";
  const text = raw == null ? "" : String(raw).trim();
  if (!text || text === "prefer-not-to-say") return "unknown";
  return map.has(text) ? map.get(text) : "unknown";
}

/**
 * Copy only the fields the sheet is allowed to see. Everything else on the
 * Netlify payload, including human_fields and the message, is dropped here.
 */
export function pickAllowlisted(payload) {
  const data = payload && payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data
    : {};
  const has = (key) => Object.prototype.hasOwnProperty.call(data, key);
  const text = (key) => (has(key) && data[key] != null ? String(data[key]) : "");
  return {
    id: payload && typeof payload.id === "string" ? payload.id : "",
    number: payload ? payload.number : undefined,
    createdAt: payload && typeof payload.created_at === "string" ? payload.created_at : "",
    servicePresent: has("Service"),
    service: text("Service"),
    howHeardPresent: has("how_heard"),
    howHeard: text("how_heard"),
    townAreaPresent: has("town_area"),
    townArea: text("town_area"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    llTest: text("ll_test"),
  };
}

export function buildEnquiryRow(input, options = {}) {
  const submissionId = safeSubmissionId(input && input.id);
  const enquiryId = websiteEnquiryId(input && input.number);
  const date = londonCivilDate(input && input.createdAt);
  const weekStart = date ? mondayOnOrBefore(date) : null;
  if (!submissionId || !enquiryId || !date || !weekStart) return null;

  const row = {
    enquiry_id: enquiryId,
    date,
    week_start: weekStart,
    channel_source: WEBSITE_CHANNEL,
    how_heard: mappedChoice(input.howHeardPresent, input.howHeard, HOW_HEARD_MAP),
    service_type: mappedChoice(input.servicePresent, input.service, SERVICE_MAP),
    town_area: mappedChoice(input.townAreaPresent, input.townArea, TOWN_MAP),
    became_job: "pending",
    job_completed: "n",
    is_test_or_spam: isExplicitTest({
      llTest: input.llTest,
      context: options.context || "",
      testToken: options.testToken || "",
    })
      ? "y"
      : "n",
    notes_nonpersonal: "",
    submission_id: submissionId,
    utm_source: sanitiseUtm(input.utmSource),
    utm_medium: sanitiseUtm(input.utmMedium),
    utm_campaign: sanitiseUtm(input.utmCampaign),
  };

  return rowContainsPersonalData(row) ? null : row;
}

export function rowContainsPersonalData(row) {
  for (const [key, value] of Object.entries(row || {})) {
    const text = String(value ?? "");
    if (text.includes("@")) return true;
    if (key !== "submission_id" && key !== "enquiry_id" && /\d{10,}/.test(text)) return true;
  }
  return false;
}

export function rowToCells(headers, row) {
  return headers.map((header) => {
    if (!header || !Object.prototype.hasOwnProperty.call(row, header)) return "";
    return String(row[header]);
  });
}

export function missingColumns(headers) {
  const have = new Set(headers || []);
  return REQUIRED_COLUMNS.filter((name) => !have.has(name));
}

export function logEnquiry(submissionId, status, httpStatus) {
  const safeStatus = LOG_STATUSES.has(status) ? status : "sheet-sync-failed";
  const id = safeSubmissionId(submissionId) || "unknown";
  const code = Number.isInteger(httpStatus) && httpStatus >= 0 && httpStatus <= 599 ? String(httpStatus) : "";
  return code ? `enquiry-log ${safeStatus} ${id} ${code}` : `enquiry-log ${safeStatus} ${id}`;
}

export function normaliseBackfillRecord(record, formName = "contact") {
  if (!record || typeof record !== "object") return null;
  const payload = record.payload && typeof record.payload === "object" ? record.payload : record;
  const name = typeof payload.form_name === "string" && payload.form_name ? payload.form_name : formName;
  if (name !== "contact") return null;
  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data : {};
  return {
    id: payload.id,
    number: payload.number,
    created_at: payload.created_at,
    form_name: "contact",
    data,
    spam: payload.spam === true,
    state: typeof payload.state === "string" ? payload.state : "",
  };
}

export function recordsFromExport(parsed, formName = "contact") {
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && Array.isArray(parsed.submissions)
      ? parsed.submissions
      : null;
  if (!list) return [];
  return list.map((record) => normaliseBackfillRecord(record, formName)).filter(Boolean);
}
