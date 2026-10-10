/**
 * Minimal Google Sheets client: a service-account JWT signed with Node crypto,
 * then the Sheets REST API. Scope is spreadsheets only (not Drive).
 * Errors carry an HTTP status and nothing else, so a sheet id or row cannot
 * leak into a log line.
 */

import { createSign } from "node:crypto";

import { SHEETS_SCOPE } from "./enquiry-log.mjs";

export class SheetsHttpError extends Error {
  constructor(status) {
    super(`sheets-http ${Number.isInteger(status) ? status : 0}`);
    this.name = "SheetsHttpError";
    this.status = Number.isInteger(status) ? status : 0;
  }
}

export function normalisePrivateKey(raw) {
  if (typeof raw !== "string") return "";
  let key = raw.trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n").trim();
}

export function privateKeyLooksUsable(raw) {
  const key = normalisePrivateKey(raw);
  return key.includes("BEGIN PRIVATE KEY") || key.includes("BEGIN RSA PRIVATE KEY");
}

function base64url(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer.toString("base64url");
}

export function signServiceAccountJwt({ clientEmail, privateKey, now, scope = SHEETS_SCOPE }) {
  const iat = now();
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp: iat + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(normalisePrivateKey(privateKey)).toString("base64url");
  return `${unsigned}.${signature}`;
}

export function assertSheetId(sheetId) {
  if (typeof sheetId !== "string" || !/^[a-zA-Z0-9_-]{20,128}$/.test(sheetId)) {
    throw new SheetsHttpError(0);
  }
}

export function quoteTab(tab) {
  if (typeof tab !== "string" || !/^[\w .()-]{1,80}$/.test(tab)) {
    throw new SheetsHttpError(0);
  }
  return `'${tab.replace(/'/g, "''")}'`;
}

export function columnLetter(index) {
  if (!Number.isInteger(index) || index < 0 || index > 701) throw new SheetsHttpError(0);
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

async function request(fetchImpl, url, options) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch {
    throw new SheetsHttpError(0);
  }
  if (!response || !response.ok) throw new SheetsHttpError(response ? response.status : 0);
  return response;
}

export async function fetchAccessToken({ fetchImpl, clientEmail, privateKey, now }) {
  const assertion = signServiceAccountJwt({ clientEmail, privateKey, now });
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await request(fetchImpl, "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  let json;
  try {
    json = await response.json();
  } catch {
    throw new SheetsHttpError(response.status || 0);
  }
  if (!json || typeof json.access_token !== "string" || !json.access_token) {
    throw new SheetsHttpError(response.status || 0);
  }
  return json.access_token;
}

async function sheetsGet(fetchImpl, token, sheetId, range) {
  assertSheetId(sheetId);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`;
  const response = await request(fetchImpl, url, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
  try {
    return await response.json();
  } catch {
    throw new SheetsHttpError(response.status || 0);
  }
}

export function createSheetsClient({ fetchImpl, clientEmail, privateKey, sheetId, now }) {
  assertSheetId(sheetId);
  let tokenPromise = null;
  const token = () => {
    if (!tokenPromise) {
      tokenPromise = fetchAccessToken({ fetchImpl, clientEmail, privateKey, now }).catch((err) => {
        tokenPromise = null;
        throw err;
      });
    }
    return tokenPromise;
  };

  return {
    async getHeaderRow(tab) {
      const body = await sheetsGet(fetchImpl, await token(), sheetId, `${quoteTab(tab)}!1:1`);
      const row = body && Array.isArray(body.values) && Array.isArray(body.values[0]) ? body.values[0] : [];
      return row.map((cell) => String(cell ?? "").trim());
    },

    async listColumn(tab, columnIndex) {
      const letter = columnLetter(columnIndex);
      const body = await sheetsGet(
        fetchImpl,
        await token(),
        sheetId,
        `${quoteTab(tab)}!${letter}:${letter}`,
      );
      const values = body && Array.isArray(body.values) ? body.values : [];
      const cells = [];
      for (const row of values) {
        const cell = row && row[0] != null ? String(row[0]).trim() : "";
        if (!cell || cell === "submission_id") continue;
        cells.push(cell);
      }
      return cells;
    },

    async appendRow(tab, cells) {
      assertSheetId(sheetId);
      const range = `${quoteTab(tab)}!A1`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
      await request(fetchImpl, url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await token()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ values: [cells.map((cell) => String(cell ?? ""))] }),
      });
    },
  };
}
