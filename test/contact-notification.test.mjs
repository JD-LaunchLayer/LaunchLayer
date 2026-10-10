import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import vm from "node:vm";

import { buildEnquiryRow, pickAllowlisted } from "../lib/enquiry-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const contact = readFileSync(join(ROOT, "contact/index.html"), "utf8");
const builds = readFileSync(join(ROOT, "custom-pc-builds/index.html"), "utf8");

function formHtml() {
  const start = contact.indexOf('<form class="react-form-contents ll-contact-form"');
  const end = contact.indexOf("</form>", start);
  assert.notEqual(start, -1);
  return contact.slice(start, end);
}

function namedControls(html) {
  const controls = [];
  const re = /<(input|select|textarea)\b([^>]*)>/g;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[2];
    const name = /(?:^|\s)name="([^"]*)"/.exec(attrs);
    if (!name) continue;
    controls.push({
      tag: match[1],
      name: name[1],
      id: (/(?:^|\s)id="([^"]*)"/.exec(attrs) || [])[1] || "",
      disabled: /(?:^|\s)disabled(?:\s|=|>|$)/.test(attrs),
      type: (/(?:^|\s)type="([^"]*)"/.exec(attrs) || [])[1] || "",
    });
  }
  return controls;
}

function labelFor(html, id) {
  const re = new RegExp(`<label\\b[^>]*\\bfor="${id}"[^>]*>([^<]*)</label>`);
  const match = re.exec(html);
  assert.ok(match, `missing label for ${id}`);
  return match[1];
}

function subjectFn() {
  const code = readFileSync(join(ROOT, "assets/js/contact-form-email.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  return sandbox.window.llNotificationSubject;
}

test("the notification subject uses the service and town, with a fallback", () => {
  const subject = subjectFn();
  assert.equal(subject("Laptop Repair", "wickford", "Wickford"), "New Laptop Repair enquiry – Wickford");
  assert.equal(subject("General Enquiry", "basildon", "Basildon"), "New General Enquiry – Basildon");
  assert.equal(subject("PC Repair & Tech Support", "southend", "Southend"), "New PC Repair & Tech Support enquiry – Southend");
  assert.equal(subject("Laptop Repair", "prefer-not-to-say", "Prefer not to say"), "New Laptop Repair enquiry – LaunchLayer");
  assert.equal(subject("Laptop Repair", "other", "Other / outside area"), "New Laptop Repair enquiry – LaunchLayer");
  assert.equal(subject("  ", "", ""), "New website enquiry – LaunchLayer");
  assert.equal(subject("Laptop Repair\nWickford", "wickford", "Wickford\nextra"), "New Laptop Repair Wickford enquiry – Wickford extra");
});

test("notification fields keep the old names, in the friendlier email order", () => {
  const html = formHtml();
  const names = namedControls(html).map((control) => control.name);
  assert.deepEqual(names, [
    "form-name",
    "subject",
    "bot-field",
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Service",
    "Message",
    "how_heard",
    "town_area",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "ll_test",
  ]);

  assert.equal(labelFor(html, "ll-mail-first"), "First name");
  assert.equal(labelFor(html, "ll-mail-last"), "Last name");
  assert.equal(labelFor(html, "ll-mail-phone"), "Phone");
  assert.equal(labelFor(html, "ll-mail-email"), "Email");
  assert.equal(labelFor(html, "ll-mail-service"), "What it's about");
  assert.equal(labelFor(html, "ll-mail-message"), "Their message");
  assert.equal(labelFor(html, "ll-mail-heard"), "Heard about us via");
  assert.equal(labelFor(html, "ll-mail-area"), "Town");
  assert.equal(labelFor(html, "ll-utm-source"), "Came from link (source)");
  assert.equal(labelFor(html, "ll-utm-medium"), "Came from link (medium)");
  assert.equal(labelFor(html, "ll-utm-campaign"), "Came from link (campaign)");
  assert.equal(labelFor(html, "ll-test-flag"), "Test flag");

  const testFlag = namedControls(html).find((control) => control.name === "ll_test");
  assert.equal(testFlag.disabled, true);
  assert.equal(testFlag.type, "hidden");

  assert.match(html, /name="subject" data-remove-prefix value="New website enquiry – LaunchLayer"/);
  assert.match(html, /netlify-honeypot="bot-field"/);
  assert.match(html, /name="bot-field"/);

  for (const id of [
    "ll-contact-first",
    "ll-contact-last",
    "ll-contact-email",
    "ll-contact-phone",
    "ll-contact-service",
    "ll-contact-heard",
    "ll-contact-area",
    "ll-contact-message",
  ]) {
    const tag = new RegExp(`<(input|select|textarea)\\b[^>]*\\bid="${id}"[^>]*>`).exec(html);
    assert.ok(tag, id);
    assert.equal(/\sname=/.test(tag[0]), false, `${id} should stay unnamed`);
  }

  assert.match(html, /for="ll-contact-first">First Name</);
  assert.match(html, /for="ll-contact-last">Last Name</);
  assert.match(html, /for="ll-contact-email">Email /);
  assert.match(html, /for="ll-contact-phone">Phone</);
  assert.match(html, /for="ll-contact-service">Which service does this relate to\?/);
  assert.match(html, /for="ll-contact-heard">How did you hear about us\?/);
  assert.match(html, /for="ll-contact-area">Town or area /);
  assert.match(html, /for="ll-contact-message">How can we help\?/);
  assert.match(html, /\(optional\)/);
  assert.match(contact, /umami\.track\('contact-form-submit'/);
  assert.match(contact, /\/contact\/\?submitted=true/);
  assert.match(contact, /contact-form-email\.js\?v=email-20261010a/);
  assert.match(contact, /syncContactMailFields/);
  assert.match(contact, /field\.disabled = false/);
  assert.match(builds, /service:\s*'Custom PC Builds'/);
});

test("the same submission names still log without personal details", () => {
  const payload = {
    id: "5c3e5813f203baba9782ba13",
    number: 42,
    created_at: "2026-10-12T09:00:00.000Z",
    form_name: "contact",
    data: {
      "form-name": "contact",
      subject: "New Laptop Repair enquiry – Wickford",
      "bot-field": "",
      "First Name": "ZaraUnique",
      "Last Name": "PembrokeUnique",
      Phone: "07100999888",
      Email: "zara.pembroke.unique@example.com",
      Service: "Laptop Repair",
      Message: "UNIQUE-MESSAGE-TOKEN",
      how_heard: "returning-customer",
      town_area: "wickford",
      utm_source: "gbp",
      utm_medium: "organic_local",
      utm_campaign: "gbp_website",
      ll_test: "",
    },
  };
  const row = buildEnquiryRow(pickAllowlisted(payload), { context: "production" });
  assert.equal(row.channel_source, "web-form");
  assert.equal(row.service_type, "laptop-repair");
  assert.equal(row.how_heard, "returning");
  assert.equal(row.town_area, "wickford");
  assert.equal(row.utm_source, "gbp");
  assert.equal(row.is_test_or_spam, "n");
  const serialised = JSON.stringify(row);
  assert.equal(serialised.includes("ZaraUnique"), false);
  assert.equal(serialised.includes("zara.pembroke.unique@example.com"), false);
  assert.equal(serialised.includes("07100999888"), false);
  assert.equal(serialised.includes("UNIQUE-MESSAGE-TOKEN"), false);
  assert.equal(serialised.includes("website-form"), false);
});
