/**
 * Append one website enquiry row. Reads the header row and writes by column
 * name, so existing columns are not reordered. Checks submission_id before
 * every append. Retries a failed Sheets call a fixed number of times.
 */

import {
  buildEnquiryRow,
  logEnquiry,
  missingColumns,
  pickAllowlisted,
  rowToCells,
  safeSubmissionId,
} from "./enquiry-log.mjs";
import { createSheetsClient, privateKeyLooksUsable, SheetsHttpError } from "./google-sheets.mjs";

export const SYNC_ATTEMPTS = 3;
export const SYNC_BACKOFF_MS = [0, 1000, 3000];

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function configReady(env) {
  return Boolean(
    env
    && env.sheetId
    && env.sheetTab
    && env.clientEmail
    && privateKeyLooksUsable(env.privateKey),
  );
}

export async function syncEnquiry({
  payload,
  env,
  fetchImpl,
  sleep = defaultSleep,
  log = () => {},
  now = () => Math.floor(Date.now() / 1000),
}) {
  const submissionId = safeSubmissionId(payload && payload.id) || "";
  const emit = (status, httpStatus) => {
    log(logEnquiry(submissionId, status, httpStatus), status);
  };

  if (!payload || typeof payload !== "object" || payload.form_name !== "contact") {
    emit("ignored");
    return { ok: true, outcome: "ignored" };
  }
  if (payload.spam === true || payload.state === "spam") {
    emit("ignored");
    return { ok: true, outcome: "ignored" };
  }
  if (!submissionId) {
    emit("bad-payload");
    return { ok: false, retryable: false, outcome: "bad-payload" };
  }

  const row = buildEnquiryRow(pickAllowlisted(payload), {
    context: env && env.context ? env.context : "",
    testToken: env && env.testToken ? env.testToken : "",
  });
  if (!row) {
    emit("bad-payload");
    return { ok: false, retryable: false, outcome: "bad-payload" };
  }

  if (!configReady(env)) {
    emit("missing-config");
    return { ok: false, retryable: true, outcome: "missing-config" };
  }

  let client;
  try {
    client = createSheetsClient({
      fetchImpl,
      clientEmail: env.clientEmail,
      privateKey: env.privateKey,
      sheetId: env.sheetId,
      now,
    });
  } catch (err) {
    const status = err instanceof SheetsHttpError ? err.status : 0;
    emit("sheet-sync-failed", status);
    return { ok: false, retryable: true, outcome: "sheet-sync-failed", httpStatus: status };
  }

  let lastStatus = 0;
  for (let attempt = 0; attempt < SYNC_ATTEMPTS; attempt += 1) {
    if (SYNC_BACKOFF_MS[attempt]) await sleep(SYNC_BACKOFF_MS[attempt]);
    try {
      const headers = await client.getHeaderRow(env.sheetTab);
      const missing = missingColumns(headers);
      if (missing.length) {
        emit("missing-headers");
        return { ok: false, retryable: true, outcome: "missing-headers" };
      }
      const columnIndex = headers.indexOf("submission_id");
      const existing = await client.listColumn(env.sheetTab, columnIndex);
      if (existing.includes(row.submission_id)) {
        emit("duplicate");
        return { ok: true, outcome: "duplicate" };
      }
      await client.appendRow(env.sheetTab, rowToCells(headers, row));
      emit("logged");
      return { ok: true, outcome: "logged" };
    } catch (err) {
      lastStatus = err instanceof SheetsHttpError ? err.status : 0;
      emit("sheet-sync-failed", lastStatus);
    }
  }

  return { ok: false, retryable: true, outcome: "sheet-sync-failed", httpStatus: lastStatus };
}
