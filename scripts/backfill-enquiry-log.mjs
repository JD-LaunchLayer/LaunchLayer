#!/usr/bin/env node
/**
 * Replay verified contact submissions into the enquiry sheet.
 *
 * The export contains names and messages. This script never prints those.
 * It reads the original input names (Service, how_heard, town_area, utm_*,
 * ll_test), not the labels shown in the notification email.
 * Rows already stored (same submission_id) are left as they are.
 *
 * Usage:
 *   ENQUIRY_SHEET_ID=... ENQUIRY_SHEET_TAB=... \
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL=... GOOGLE_PRIVATE_KEY=... \
 *   node scripts/backfill-enquiry-log.mjs ./submissions.json
 *
 * Delete the JSON file when you are done. Do not commit it.
 */

import { readFile } from "node:fs/promises";

import { recordsFromExport } from "../lib/enquiry-log.mjs";
import { syncEnquiry } from "../lib/sync-enquiry.mjs";

function envGet(name) {
  const value = process.env[name];
  return typeof value === "string" ? value : "";
}

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/backfill-enquiry-log.mjs <submissions.json>");
  process.exit(1);
}

const parsed = JSON.parse(await readFile(file, "utf8"));
const records = recordsFromExport(parsed, "contact");
if (!records.length) {
  console.error("enquiry-log bad-payload unknown");
  process.exit(1);
}

const env = {
  sheetId: envGet("ENQUIRY_SHEET_ID").trim(),
  sheetTab: envGet("ENQUIRY_SHEET_TAB").trim(),
  clientEmail: envGet("GOOGLE_SERVICE_ACCOUNT_EMAIL").trim(),
  privateKey: envGet("GOOGLE_PRIVATE_KEY"),
  testToken: envGet("ENQUIRY_TEST_TOKEN").trim(),
  context: envGet("CONTEXT").trim() || "production",
};

let failed = 0;
for (const payload of records) {
  const result = await syncEnquiry({
    payload,
    env,
    fetchImpl: globalThis.fetch.bind(globalThis),
    log(line) {
      console.log(line);
    },
  });
  if (!result.ok) failed += 1;
}

if (failed) process.exit(1);
