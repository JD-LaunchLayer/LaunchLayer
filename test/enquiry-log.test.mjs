import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  buildEnquiryRow,
  logEnquiry,
  mondayOnOrBefore,
  londonCivilDate,
  pickAllowlisted,
  recordsFromExport,
  REQUIRED_COLUMNS,
  sanitiseUtm,
  websiteEnquiryId,
} from "../lib/enquiry-log.mjs";
import { normalisePrivateKey, signServiceAccountJwt } from "../lib/google-sheets.mjs";
import { SHEETS_SCOPE } from "../lib/enquiry-log.mjs";
import { syncEnquiry, SYNC_ATTEMPTS, SYNC_BACKOFF_MS } from "../lib/sync-enquiry.mjs";
import { handleSubmission } from "../netlify/functions/submission-created.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const PII = {
  first: "ZaraUnique",
  last: "PembrokeUnique",
  email: "zara.pembroke.unique@example.com",
  phone: "07100999888",
  message: "Please fix the hinge UNIQUE-MESSAGE-TOKEN",
  ip: "203.0.113.50",
};

const NEEDLES = [PII.first, PII.last, PII.email, PII.phone, "UNIQUE-MESSAGE-TOKEN", PII.ip, "LLTEST"];

const SUBMISSION_ID = "5c3e5813f203baba9782ba13";
const SHEET_ID = "SheetSecretValue1234567890";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: "pkcs8", format: "pem" });

function assertClean(text, extra = []) {
  const haystack = String(text);
  for (const needle of [...NEEDLES, ...extra]) {
    assert.equal(haystack.includes(needle), false, `unexpected personal data: ${needle}`);
  }
}

function baseData(extra = {}) {
  return {
    "form-name": "contact",
    subject: "New Contact Form Submission - LaunchLayer",
    "bot-field": "",
    "First Name": PII.first,
    "Last Name": PII.last,
    Email: PII.email,
    Phone: PII.phone,
    Service: "PC Repair & Tech Support",
    Message: `${PII.message} LLTEST`,
    how_heard: "google-maps",
    town_area: "wickford",
    utm_source: "gbp",
    utm_medium: "organic_local",
    utm_campaign: "gbp_website",
    ll_test: "",
    ip: PII.ip,
    user_agent: "Mozilla/5.0",
    referrer: "https://www.google.com/",
    ...extra,
  };
}

function submission(extra = {}, dataExtra = {}) {
  return {
    id: SUBMISSION_ID,
    number: 42,
    created_at: "2026-10-12T09:00:00.000Z",
    form_name: "contact",
    email: PII.email,
    name: `${PII.first} ${PII.last}`,
    first_name: PII.first,
    last_name: PII.last,
    body: PII.message,
    summary: `<strong>${PII.first}</strong> ${PII.message}`,
    human_fields: {
      "First Name": PII.first,
      Email: PII.email,
      Phone: PII.phone,
      Message: PII.message,
    },
    data: baseData(dataExtra),
    ...extra,
  };
}

function env(extra = {}) {
  return {
    sheetId: SHEET_ID,
    sheetTab: "Enquiries",
    clientEmail: "enquiry-logger@launchlayer-test.iam.gserviceaccount.com",
    privateKey: PRIVATE_PEM,
    testToken: "",
    context: "production",
    ...extra,
  };
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}

function mockSheets({
  appendStatuses = [200],
  columnForAttempt,
  headers = REQUIRED_COLUMNS,
  tokenStatus = 200,
}) {
  const calls = [];
  const appendBodies = [];
  let appends = 0;
  let columnReads = 0;
  const fetchImpl = async (url, options = {}) => {
    const href = String(url);
    calls.push({ url: href, method: options.method || "GET", body: options.body ? String(options.body) : "" });
    if (href.startsWith("https://oauth2.googleapis.com/token")) {
      return jsonResponse(tokenStatus, tokenStatus === 200 ? { access_token: "token-not-a-secret-row" } : {});
    }
    const decoded = decodeURIComponent(href);
    if (decoded.includes(":append")) {
      appendBodies.push(String(options.body || ""));
      const status = appendStatuses[Math.min(appends, appendStatuses.length - 1)];
      appends += 1;
      return jsonResponse(status, { updates: { updatedRows: status === 200 ? 1 : 0 } });
    }
    if (decoded.includes("!1:1")) {
      return jsonResponse(200, { values: [headers] });
    }
    columnReads += 1;
    const values = columnForAttempt ? columnForAttempt(columnReads, appends) : [["submission_id"]];
    return jsonResponse(200, { values });
  };
  return {
    fetchImpl,
    calls,
    appendBodies,
    appendCount: () => appends,
  };
}

test("website enquiry ids are W-prefixed and padded", () => {
  assert.equal(websiteEnquiryId(1), "W0001");
  assert.equal(websiteEnquiryId(42), "W0042");
  assert.equal(websiteEnquiryId("7"), "W0007");
  assert.equal(websiteEnquiryId(10000), "W10000");
  assert.equal(websiteEnquiryId(42.5), null);
  assert.equal(websiteEnquiryId(-1), null);
  assert.equal(websiteEnquiryId("W0042"), null);
  assert.equal(websiteEnquiryId("E0001"), null);
});

test("week_start is the Monday of the Europe/London civil date", () => {
  assert.equal(londonCivilDate("2026-10-12T09:00:00.000Z"), "2026-10-12");
  assert.equal(mondayOnOrBefore("2026-10-12"), "2026-10-12");

  assert.equal(londonCivilDate("2026-10-11T21:30:00.000Z"), "2026-10-11");
  assert.equal(mondayOnOrBefore(londonCivilDate("2026-10-11T21:30:00.000Z")), "2026-10-05");

  assert.equal(londonCivilDate("2026-10-11T23:30:00.000Z"), "2026-10-12");
  assert.equal(mondayOnOrBefore(londonCivilDate("2026-10-11T23:30:00.000Z")), "2026-10-12");

  // 28 March 2026 23:30 GMT is still Saturday. Clocks go forward at 01:00 GMT on the 29th.
  assert.equal(londonCivilDate("2026-03-28T23:30:00.000Z"), "2026-03-28");
  assert.equal(mondayOnOrBefore("2026-03-28"), "2026-03-23");
  assert.equal(londonCivilDate("2026-03-29T00:30:00.000Z"), "2026-03-29");
  assert.equal(mondayOnOrBefore(londonCivilDate("2026-03-29T00:30:00.000Z")), "2026-03-23");
  assert.equal(londonCivilDate("2026-03-29T01:30:00.000Z"), "2026-03-29");

  // Clocks go back at 01:00 UTC on 25 October 2026. Both sides of that hour are Sunday.
  assert.equal(londonCivilDate("2026-10-25T00:30:00.000Z"), "2026-10-25");
  assert.equal(mondayOnOrBefore("2026-10-25"), "2026-10-19");
  assert.equal(londonCivilDate("2026-10-25T01:30:00.000Z"), "2026-10-25");
  assert.equal(mondayOnOrBefore(londonCivilDate("2026-10-25T01:30:00.000Z")), "2026-10-19");
});

test("blank and unexpected answers become not-asked or unknown, never a guess", () => {
  const absent = buildEnquiryRow(pickAllowlisted(submission({}, {})), { context: "production" });
  const data = { ...submission().data };
  delete data.how_heard;
  delete data.town_area;
  const notAsked = buildEnquiryRow(pickAllowlisted(submission({}, {})), { context: "production" });
  const stripped = pickAllowlisted({ ...submission(), data });
  const row = buildEnquiryRow(stripped, { context: "production" });
  assert.equal(row.how_heard, "not-asked");
  assert.equal(row.town_area, "not-asked");

  const blank = buildEnquiryRow(pickAllowlisted(submission({}, { how_heard: "", town_area: "" })), { context: "production" });
  assert.equal(blank.how_heard, "unknown");
  assert.equal(blank.town_area, "unknown");

  const declined = buildEnquiryRow(
    pickAllowlisted(submission({}, { how_heard: "prefer-not-to-say", town_area: "prefer-not-to-say" })),
    { context: "production" },
  );
  assert.equal(declined.how_heard, "unknown");
  assert.equal(declined.town_area, "unknown");

  const injected = buildEnquiryRow(
    pickAllowlisted(submission({}, { how_heard: PII.email, town_area: "SS11 7AB", Service: `Call ${PII.phone}` })),
    { context: "production" },
  );
  assert.equal(injected.how_heard, "unknown");
  assert.equal(injected.town_area, "unknown");
  assert.equal(injected.service_type, "unknown");
  assertClean(JSON.stringify(injected));
  assert.equal(absent.service_type, "pc-repair");
  assert.equal(notAsked.how_heard, "google-maps");
});

test("utm values are sanitised and kept out of how_heard", () => {
  assert.equal(sanitiseUtm("GBP"), "gbp");
  assert.equal(sanitiseUtm("organic_local"), "organic_local");
  assert.equal(sanitiseUtm("gbp_website"), "gbp_website");
  assert.equal(sanitiseUtm(""), "none");
  assert.equal(sanitiseUtm("   "), "none");
  assert.equal(sanitiseUtm("a".repeat(41)), "none");
  assert.equal(sanitiseUtm("bad value"), "none");
  assert.equal(sanitiseUtm(PII.email), "none");
  assert.equal(sanitiseUtm("gbp/organic_local"), "none");
  assert.equal(sanitiseUtm("<script>"), "none");

  const row = buildEnquiryRow(pickAllowlisted(submission({}, {
    utm_source: "GBP",
    utm_medium: PII.email,
    utm_campaign: "gbp_website",
    how_heard: "",
  })), { context: "production" });
  assert.equal(row.utm_source, "gbp");
  assert.equal(row.utm_medium, "none");
  assert.equal(row.utm_campaign, "gbp_website");
  assert.equal(row.how_heard, "unknown");
  assertClean(JSON.stringify(row));
});

test("the test flag is explicit and cannot be set from the message", () => {
  const flags = (llTest, context, testToken) => buildEnquiryRow(
    pickAllowlisted(submission({}, { ll_test: llTest })),
    { context, testToken },
  ).is_test_or_spam;

  assert.equal(flags("1", "production", ""), "n");
  assert.equal(flags("1", "deploy-preview", ""), "y");
  assert.equal(flags("1", "dev", ""), "y");
  assert.equal(flags("1", "branch-deploy", ""), "y");
  assert.equal(flags("", "deploy-preview", ""), "n");
  assert.equal(flags("1", "production", "preview-token-value"), "n");
  assert.equal(flags("preview-token-value", "production", "preview-token-value"), "y");
  assert.equal(flags("1", "production", "1"), "n");
  assert.equal(flags("nope", "deploy-preview", ""), "n");

  const fromMessage = buildEnquiryRow(pickAllowlisted(submission()), { context: "production" });
  assert.equal(fromMessage.is_test_or_spam, "n");
  assert.match(submission().data.Message, /LLTEST/);
  assert.match(submission().data.Email, /@example\.com$/);
});

test("the output row is an allowlist and contains no personal data", () => {
  const payload = submission();
  const picked = pickAllowlisted(payload);
  assert.deepEqual(Object.keys(picked).sort(), [
    "createdAt",
    "howHeard",
    "howHeardPresent",
    "id",
    "llTest",
    "number",
    "service",
    "servicePresent",
    "townArea",
    "townAreaPresent",
    "utmCampaign",
    "utmMedium",
    "utmSource",
  ]);
  assert.equal(JSON.stringify(picked).includes(PII.email), false);
  assert.equal(JSON.stringify(picked).includes(PII.message), false);
  assert.equal(JSON.stringify(picked).includes(PII.phone), false);

  const row = buildEnquiryRow(picked, { context: "production" });
  assert.deepEqual(Object.keys(row), REQUIRED_COLUMNS);
  assert.equal(row.enquiry_id, "W0042");
  assert.equal(row.date, "2026-10-12");
  assert.equal(row.week_start, "2026-10-12");
  assert.equal(row.channel_source, "web-form");
  assert.equal(row.how_heard, "google-maps");
  assert.equal(row.service_type, "pc-repair");
  assert.equal(row.town_area, "wickford");
  assert.equal(row.became_job, "pending");
  assert.equal(row.job_completed, "n");
  assert.equal(row.is_test_or_spam, "n");
  assert.equal(row.notes_nonpersonal, "");
  assert.equal(row.submission_id, SUBMISSION_ID);
  assert.equal(row.utm_source, "gbp");
  assert.equal(row.utm_medium, "organic_local");
  assert.equal(row.utm_campaign, "gbp_website");
  assertClean(JSON.stringify(row));
  assert.equal(row.enquiry_id.startsWith("E"), false);
});

const ALLOWED_HOW_HEARD = new Set([
  "google-search",
  "google-maps",
  "facebook",
  "instagram",
  "nextdoor",
  "bark",
  "friend-family",
  "recommendation",
  "returning",
  "passing",
  "ai-assistant",
  "other",
  "unknown",
  "not-asked",
]);

const ALLOWED_SERVICE = new Set([
  "laptop-repair",
  "pc-repair",
  "macbook",
  "screen",
  "liquid-damage",
  "data-recovery",
  "virus-removal",
  "custom-build",
  "business-it",
  "general",
  "insurance-report",
  "scam-support",
  "e-waste",
  "startup-it-setup",
  "website-setup",
  "other",
  "unknown",
  "not-asked",
]);

const ALLOWED_TOWN = new Set([
  "wickford",
  "billericay",
  "basildon",
  "rayleigh",
  "brentwood",
  "chelmsford",
  "southend",
  "other",
  "unknown",
  "not-asked",
]);

function decodeEntities(text) {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function selectOptions(html, id) {
  const start = html.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `missing select ${id}`);
  const open = html.lastIndexOf("<select", start);
  const close = html.indexOf("</select>", start);
  const block = html.slice(open, close);
  const options = [];
  const re = /<option\b([^>]*)>([^<]*)<\/option>/g;
  let match;
  while ((match = re.exec(block))) {
    const valueMatch = /value="([^"]*)"/.exec(match[1]);
    options.push({
      value: decodeEntities(valueMatch ? valueMatch[1] : ""),
      label: decodeEntities(match[2].trim()),
    });
  }
  return options;
}

function rowFromFields(fields) {
  const payload = submission();
  const data = { ...baseData() };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete data[key];
    else data[key] = value;
  }
  payload.data = data;
  return buildEnquiryRow(pickAllowlisted(payload), { context: "production" });
}

test("every contact dropdown maps to an allowed reporting value", () => {
  const contact = readFileSync(join(ROOT, "contact/index.html"), "utf8");
  const builds = readFileSync(join(ROOT, "custom-pc-builds/index.html"), "utf8");
  const mapper = readFileSync(join(ROOT, "lib/enquiry-log.mjs"), "utf8");
  assert.equal(mapper.includes("website-form"), false);

  const services = selectOptions(contact, "ll-contact-service");
  const heard = selectOptions(contact, "ll-contact-heard");
  const towns = selectOptions(contact, "ll-contact-area");
  const chosenServices = services.filter((option) => option.value);
  assert.equal(chosenServices.length, 12);

  for (const option of chosenServices) {
    const row = rowFromFields({ Service: option.value });
    assert.equal(ALLOWED_SERVICE.has(row.service_type), true, option.value);
    assert.equal(row.channel_source, "web-form");
    assert.equal(JSON.stringify(row).includes("website-form"), false);
  }
  for (const option of heard) {
    const row = rowFromFields({ how_heard: option.value });
    assert.equal(ALLOWED_HOW_HEARD.has(row.how_heard), true, option.value);
  }
  for (const option of towns) {
    const row = rowFromFields({ town_area: option.value });
    assert.equal(ALLOWED_TOWN.has(row.town_area), true, option.value);
  }

  const serviceExpected = {
    "General Enquiry": "general",
    "Custom PC Builds": "custom-build",
    "PC Repair & Tech Support": "pc-repair",
    "Insurance Damage Report": "insurance-report",
    "Scam Support": "scam-support",
    "E-Waste or Tech Donation": "e-waste",
    "Startup IT Setup": "startup-it-setup",
    "Website Setup": "website-setup",
    "Laptop Repair": "laptop-repair",
    "MacBook Repair": "macbook",
    "Screen Replacement": "screen",
    "Data Recovery": "data-recovery",
  };
  for (const [label, slug] of Object.entries(serviceExpected)) {
    assert.equal(rowFromFields({ Service: label }).service_type, slug);
    assert.equal(chosenServices.some((option) => option.value === label), true, label);
  }

  const heardExpected = {
    "prefer-not-to-say": "unknown",
    "google-search": "google-search",
    "google-maps": "google-maps",
    facebook: "facebook",
    instagram: "instagram",
    nextdoor: "nextdoor",
    recommendation: "recommendation",
    "returning-customer": "returning",
    other: "other",
  };
  for (const [value, slug] of Object.entries(heardExpected)) {
    assert.equal(rowFromFields({ how_heard: value }).how_heard, slug);
  }
  assert.equal(rowFromFields({ how_heard: "returning-customer" }).how_heard, "returning");

  const townExpected = {
    "prefer-not-to-say": "unknown",
    wickford: "wickford",
    billericay: "billericay",
    basildon: "basildon",
    rayleigh: "rayleigh",
    brentwood: "brentwood",
    chelmsford: "chelmsford",
    southend: "southend",
    other: "other",
  };
  for (const [value, slug] of Object.entries(townExpected)) {
    assert.equal(rowFromFields({ town_area: value }).town_area, slug);
  }

  const missing = rowFromFields({
    Service: undefined,
    how_heard: undefined,
    town_area: undefined,
  });
  assert.equal(missing.service_type, "not-asked");
  assert.equal(missing.how_heard, "not-asked");
  assert.equal(missing.town_area, "not-asked");

  const blank = rowFromFields({
    Service: "   ",
    how_heard: "",
    town_area: "prefer-not-to-say",
  });
  assert.equal(blank.service_type, "unknown");
  assert.equal(blank.how_heard, "unknown");
  assert.equal(blank.town_area, "unknown");

  const unmapped = rowFromFields({
    Service: "liquid-damage",
    how_heard: "bark",
    town_area: "SS11 7AB",
  });
  assert.equal(unmapped.service_type, "unknown");
  assert.equal(unmapped.how_heard, "unknown");
  assert.equal(unmapped.town_area, "unknown");
  assert.equal(JSON.stringify(unmapped).includes("website-form"), false);
  assert.equal(unmapped.channel_source, "web-form");
  assert.equal(["y", "n", "pending"].includes(unmapped.became_job), true);
  assert.equal(["y", "n"].includes(unmapped.job_completed), true);
  assert.equal(["y", "n"].includes(unmapped.is_test_or_spam), true);

  assert.match(builds, /service:\s*'Custom PC Builds'/);
  assert.equal(services.some((option) => option.value === "Custom PC Builds"), true);
});

test("log lines only carry a safe id and a status", () => {
  assert.equal(logEnquiry(SUBMISSION_ID, "logged"), `enquiry-log logged ${SUBMISSION_ID}`);
  assert.equal(logEnquiry(SUBMISSION_ID, "sheet-sync-failed", 401), `enquiry-log sheet-sync-failed ${SUBMISSION_ID} 401`);
  assert.equal(logEnquiry(`${PII.email} ${PII.message}`, "logged"), "enquiry-log logged unknown");
  assert.equal(logEnquiry(SUBMISSION_ID, PII.message), `enquiry-log sheet-sync-failed ${SUBMISSION_ID}`);
  assertClean(logEnquiry(SUBMISSION_ID, "sheet-sync-failed", 500));
});

test("a private key stored with escaped newlines is restored", () => {
  const escaped = PRIVATE_PEM.replace(/\n/g, "\\n");
  assert.equal(normalisePrivateKey(escaped).includes("BEGIN PRIVATE KEY"), true);
  assert.equal(normalisePrivateKey(`"${escaped}"`).includes("\n"), true);
});

test("duplicate submission_id skips the append", async () => {
  const logs = [];
  const sheets = mockSheets({
    columnForAttempt: () => [["submission_id"], [SUBMISSION_ID]],
  });
  const delays = [];
  const result = await syncEnquiry({
    payload: submission(),
    env: env(),
    fetchImpl: sheets.fetchImpl,
    sleep: async (ms) => delays.push(ms),
    log: (line) => logs.push(line),
  });
  assert.equal(result.outcome, "duplicate");
  assert.equal(sheets.appendCount(), 0);
  assert.deepEqual(delays, []);
  assert.equal(logs.length, 1);
  assert.match(logs[0], new RegExp(`^enquiry-log duplicate ${SUBMISSION_ID}$`));
  for (const line of logs) assertClean(line, [SHEET_ID]);
});

test("sheets failures retry with backoff and then give up", async () => {
  const logs = [];
  const delays = [];
  const sheets = mockSheets({ appendStatuses: [500, 500, 500] });
  const result = await syncEnquiry({
    payload: submission(),
    env: env(),
    fetchImpl: sheets.fetchImpl,
    sleep: async (ms) => delays.push(ms),
    log: (line) => logs.push(line),
  });
  assert.equal(result.ok, false);
  assert.equal(result.retryable, true);
  assert.equal(result.outcome, "sheet-sync-failed");
  assert.equal(result.httpStatus, 500);
  assert.equal(sheets.appendCount(), SYNC_ATTEMPTS);
  assert.deepEqual(delays, SYNC_BACKOFF_MS.slice(1));
  assert.equal(logs.length, SYNC_ATTEMPTS);
  for (const line of logs) {
    assert.match(line, new RegExp(`^enquiry-log sheet-sync-failed ${SUBMISSION_ID} 500$`));
    assertClean(line, [SHEET_ID, PRIVATE_PEM.slice(30, 60)]);
  }
  for (const body of sheets.appendBodies) {
    const values = JSON.parse(body).values[0];
    assert.equal(values[0], "W0042");
    assert.equal(values[11], SUBMISSION_ID);
    assertClean(body, [SHEET_ID]);
  }
  const appendCall = sheets.calls.find((call) => call.url.includes(":append"));
  assert.match(appendCall.url, /valueInputOption=RAW/);
  assert.match(appendCall.url, /insertDataOption=INSERT_ROWS/);
  assert.equal(sheets.calls.some((call) => call.method === "PUT" || call.url.includes(":batchUpdate")), false);
});

test("a lost append is not repeated once the submission id is present", async () => {
  const logs = [];
  const sheets = mockSheets({
    appendStatuses: [500, 200],
    columnForAttempt: (_read, appends) => (appends >= 1 ? [["submission_id"], [SUBMISSION_ID]] : [["submission_id"]]),
  });
  const result = await syncEnquiry({
    payload: submission(),
    env: env(),
    fetchImpl: sheets.fetchImpl,
    sleep: async () => {},
    log: (line) => logs.push(line),
  });
  assert.equal(result.outcome, "duplicate");
  assert.equal(sheets.appendCount(), 1);
  assert.match(logs.at(-1), /duplicate/);
});

test("a successful append signs a spreadsheets-only JWT and writes the allowlisted row", async () => {
  const logs = [];
  const sheets = mockSheets({});
  const result = await syncEnquiry({
    payload: submission({}, { ll_test: "1" }),
    env: env({ context: "deploy-preview" }),
    fetchImpl: sheets.fetchImpl,
    sleep: async () => {},
    log: (line) => logs.push(line),
    now: () => 1_700_000_000,
  });
  assert.equal(result.outcome, "logged");
  assert.equal(sheets.appendCount(), 1);
  const tokenCall = sheets.calls.find((call) => call.url.includes("oauth2.googleapis.com"));
  const params = new URLSearchParams(tokenCall.body);
  assert.equal(params.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
  const jwt = params.get("assertion");
  const [header, payload, signature] = jwt.split(".");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${payload}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, signature, "base64url"), true);
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  assert.equal(claims.scope, SHEETS_SCOPE);
  assert.equal(claims.scope.includes("drive"), false);
  assert.equal(claims.iss, env().clientEmail);
  assertClean(tokenCall.body, [SHEET_ID]);

  const cells = JSON.parse(sheets.appendBodies[0]).values[0];
  assert.equal(cells[9], "y");
  assert.deepEqual(cells, [
    "W0042",
    "2026-10-12",
    "2026-10-12",
    "web-form",
    "google-maps",
    "pc-repair",
    "wickford",
    "pending",
    "n",
    "y",
    "",
    SUBMISSION_ID,
    "gbp",
    "organic_local",
    "gbp_website",
  ]);
  assert.equal(logs[0], `enquiry-log logged ${SUBMISSION_ID}`);
  assertClean(logs.join("\n") + sheets.appendBodies.join("\n"), [SHEET_ID]);
});

test("values follow the sheet's header order", async () => {
  const headers = [...REQUIRED_COLUMNS].reverse();
  const sheets = mockSheets({ headers });
  const result = await syncEnquiry({
    payload: submission(),
    env: env(),
    fetchImpl: sheets.fetchImpl,
    sleep: async () => {},
    log: () => {},
  });
  assert.equal(result.outcome, "logged");
  const cells = JSON.parse(sheets.appendBodies[0]).values[0];
  assert.equal(cells.length, headers.length);
  assert.equal(cells[headers.indexOf("enquiry_id")], "W0042");
  assert.equal(cells[headers.indexOf("submission_id")], SUBMISSION_ID);
  assert.equal(cells[headers.indexOf("how_heard")], "google-maps");
  assert.equal(cells[headers.indexOf("utm_campaign")], "gbp_website");
  assert.equal(cells[headers.indexOf("notes_nonpersonal")], "");
});

test("missing headers do not append a shifted row", async () => {
  const sheets = mockSheets({ headers: REQUIRED_COLUMNS.filter((name) => name !== "submission_id") });
  const result = await syncEnquiry({
    payload: submission(),
    env: env(),
    fetchImpl: sheets.fetchImpl,
    sleep: async () => {},
    log: () => {},
  });
  assert.equal(result.outcome, "missing-headers");
  assert.equal(sheets.appendCount(), 0);
});

test("spam and other forms do not append", async () => {
  const sheets = mockSheets({});
  const spam = await syncEnquiry({
    payload: submission({ state: "spam" }),
    env: env(),
    fetchImpl: sheets.fetchImpl,
    log: () => {},
  });
  const other = await syncEnquiry({
    payload: submission({ form_name: "newsletter" }),
    env: env(),
    fetchImpl: sheets.fetchImpl,
    log: () => {},
  });
  assert.equal(spam.outcome, "ignored");
  assert.equal(other.outcome, "ignored");
  assert.equal(sheets.appendCount(), 0);
  assert.equal(sheets.calls.length, 0);
});

test("the function logs only the id when the sheet rejects the row", async () => {
  const lines = [];
  const sheets = mockSheets({ appendStatuses: [401, 401, 401] });
  await assert.rejects(
    () => handleSubmission(new Request("https://internal.test/submission-created", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: submission() }),
    }), {
      fetchImpl: sheets.fetchImpl,
      env: env(),
      sleep: async () => {},
      log: (line) => lines.push(String(line)),
    }),
    (err) => {
      assert.match(err.message, new RegExp(`^enquiry-log sheet-sync-failed ${SUBMISSION_ID} 401$`));
      assertClean(err.message, [SHEET_ID]);
      assert.equal(err.message.includes(PRIVATE_PEM.slice(40, 80)), false);
      return true;
    },
  );
  assert.equal(lines.length, SYNC_ATTEMPTS);
  for (const line of lines) assertClean(line, [SHEET_ID]);
  assert.equal(sheets.appendCount(), SYNC_ATTEMPTS);
});

test("backfill records keep the contact form and drop anything else", () => {
  const records = recordsFromExport([
    submission(),
    { id: "abcdef1234567890", number: 3, created_at: "2026-10-01T00:00:00.000Z", form_name: "newsletter", data: { Email: PII.email } },
    { payload: submission({ id: "abcdef1234567890abcd", number: 9 }) },
  ]);
  assert.equal(records.length, 2);
  assert.equal(records[0].form_name, "contact");
  assert.equal(records[1].id, "abcdef1234567890abcd");
});

test("the contact form, campaign script and privacy page match the agreed behaviour", () => {
  const contact = readFileSync(join(ROOT, "contact/index.html"), "utf8");
  const privacy = readFileSync(join(ROOT, "privacy-policy/index.html"), "utf8");
  const nav = readFileSync(join(ROOT, "assets/js/global-nav-footer.js"), "utf8");

  assert.match(contact, /name="contact"/);
  assert.match(contact, /netlify-honeypot="bot-field"/);
  assert.match(contact, /name="bot-field"/);
  assert.match(contact, /name="First Name"/);
  assert.match(contact, /name="Email"/);
  assert.match(contact, /name="Phone"/);
  assert.match(contact, /name="Service"/);
  assert.match(contact, /name="Message"/);
  assert.match(contact, /name="how_heard"/);
  assert.match(contact, /name="town_area"/);
  assert.match(contact, /name="utm_source"/);
  assert.match(contact, /name="utm_medium"/);
  assert.match(contact, /name="utm_campaign"/);
  assert.match(contact, /name="ll_test"/);
  assert.match(contact, /value="wickford"/);
  assert.match(contact, /value="billericay"/);
  assert.match(contact, /value="basildon"/);
  assert.match(contact, /value="rayleigh"/);
  assert.match(contact, /value="brentwood"/);
  assert.match(contact, /value="chelmsford"/);
  assert.match(contact, /value="southend"/);
  assert.match(contact, /value="other"/);
  assert.match(contact, /value="google-search"/);
  assert.match(contact, /value="google-maps"/);
  assert.match(contact, /value="returning-customer"/);
  assert.match(contact, /umami\.track\('contact-form-submit'/);
  assert.match(contact, /\/contact\/\?submitted=true/);
  assert.match(contact, /07367652987/);
  assert.match(contact, /ll_test/);

  assert.match(nav, /sessionStorage/);
  assert.match(nav, /utm_campaign/);
  assert.equal(nav.includes("localStorage"), false);
  assert.equal(nav.includes("document.cookie"), false);

  assert.match(privacy, /your name, email, phone number/);
  assert.match(privacy, /utm_source, utm_medium and utm_campaign/);
  assert.match(privacy, /does not contain your name, email address, phone number or message/);
  assert.match(privacy, /spreadsheet/);
  assert.match(privacy, /how did you hear about us/);
});

test("signServiceAccountJwt is exported for the token request", () => {
  const jwt = signServiceAccountJwt({
    clientEmail: "enquiry-logger@launchlayer-test.iam.gserviceaccount.com",
    privateKey: PRIVATE_PEM,
    now: () => 1_700_000_000,
    scope: SHEETS_SCOPE,
  });
  assert.equal(jwt.split(".").length, 3);
});
