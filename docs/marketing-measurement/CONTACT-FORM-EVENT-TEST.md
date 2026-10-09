# Contact form event: code verification and owner test procedure

Verified 9 Oct 2026 against repo `main` 5237b14 (`contact/index.html`, `netlify/functions/contact.ts`) and the live `https://launchlayer.uk/contact/` HTML. The live script block is byte-identical to the repo from the `submitted=true` handler onward. **No form was submitted during this check.**

## How a submission flows (from source)
1. The visitor fills in `/contact/` (First Name, Last Name, Email, Phone, Service [select], Message), plus a hidden honeypot `botcheck` and a Cloudflare Turnstile widget.
2. On submit, JS calls `preventDefault()`. If the Turnstile token is missing it shows an error and stops. **No event.**
3. `setBusy(true)` disables the submit button, then `fetch('/api/contact', POST, FormData)` runs.
4. The Netlify Function checks: method → honeypot → Turnstile siteverify → required fields → email format, then forwards to Web3Forms. It returns `200 {success:true, redirect:"/contact/?submitted=true"}` **only if Web3Forms accepted the message.** Any failure returns `success:false` (400/500/502) and an error message. **No event.**
5. Browser, on `result.data.success === true` only:
   `umami.track('contact-form-submit', { service: <selected Service option> })`, then a redirect to `/contact/?submitted=true` once the track promise settles, or after 700 ms at most (the `gone` flag stops a double redirect).
6. `/contact/?submitted=true` takes a separate code branch. It replaces the form with "Thank you — your message is on its way." **It never calls `umami.track`, and the submit handler isn't attached on that branch.**

## When it fires
Exactly once per **server-confirmed** submission, in the browser that submitted it, and only if the Umami script loaded (not blocked).

## Double-fire check
| Scenario | Result |
|---|---|
| Reload `/contact/?submitted=true` or open it from history/bookmark | No event. That branch only renders the thank-you panel. It does create a normal pageview, with `submitted=true` visible in Umami → Query parameters. |
| Double-click or Enter while sending | Blocked. The button is disabled during the request, and implicit (Enter) submission does nothing when the default button is disabled. |
| Track promise and the 700 ms timer both finish | `go()` is guarded by `gone`, so there's one redirect. The event call happens once, before either. |
| Failed or invalid submission, then a successful retry | Only the successful attempt fires (1 event). |
| Back button to `/contact/` after success | The page reloads without `submitted=true`. No event unless they submit again. |

## PII check
- Event payload = event name + `service`, a fixed dropdown value (General Enquiry, Custom PC Builds, PC Repair & Tech Support, Insurance Damage Report, Scam Support, E-Waste or Tech Donation, Startup IT Setup, Website Setup). **There is no name, email, phone or message text in the event.** Umami also attaches the page URL `/contact/` and title, as with every event.
- The redirect URL `/contact/?submitted=true` has no PII.
- **One adjacent risk (not the event):** the Custom PC build intake on `/custom-pc-builds/` sends visitors to `/contact/?service=Custom+PC+Builds&message=Use: … Budget: … Games: <free text>`. Umami stores page query strings (they appear in its Query report; we already see `fbclid` values there), so whatever someone types in the "games" box ends up in analytics. The risk is low, but it's free text. Fix: after prefilling, call `history.replaceState(null, '', '/contact/?service=Custom+PC+Builds')` before Umami's pageview, or pass the message via `sessionStorage` (see the change list). Needs approval.

## Owner test procedure (one submission)
Do this **before** turning on the `umami.disabled` exclusion on the device you test with. Otherwise Umami won't record the test.
1. Use a normal browser with ad/tracker blockers **off** for launchlayer.uk (uBlock, Brave Shields and Firefox strict mode all block `cloud.umami.is`). Write down the time (BST).
2. Go to `https://launchlayer.uk/contact/`. Fill in the form: Service = **General Enquiry**. Message starts with **"TEST – measurement check – please ignore"**. Use your own email so no third-party data is involved. Complete Turnstile and click Send.
3. Expected in the browser: the button shows "Sending…", the URL changes to `/contact/?submitted=true` and the thank-you panel appears.
4. Within 5 minutes:
   - **Inbox** (hello@ / wherever Web3Forms delivers): exactly **1** "New Contact Form Submission - LaunchLayer" email containing TEST. Check spam too.
   - **Umami** (share dashboard → set range to Today → Events): `contact-form-submit` = **1**. Open the event → property `service` = `General Enquiry`.
   - Umami → **Query parameters** (Today): `submitted=true` = 1.
5. Reload the thank-you page once. Umami: the `submitted=true` count goes to 2, and `contact-form-submit` **stays at 1**. This proves there's no double-fire on reload.
6. Write the test time in the scorecard's changes log and exclude it from enquiry KPIs. Don't add it to the enquiry log.

## If the counts differ
| Observation | Likely cause | Action |
|---|---|---|
| Email 1, event 0, `submitted=true` 1 | Umami blocked or not loaded in that browser, or the device has `umami.disabled` set | Retry from another device or a private window with blockers off. If it's still 0, check DevTools → Network for a `POST …/api/send` with `"name":"contact-form-submit"`. Report to the dev. |
| Email 1, event 0, no redirect | JS error after success | DevTools Console screenshot to the dev. |
| Email 0, event 1 | Web3Forms accepted it but delivery failed (spam, wrong destination address) | Check spam and the Web3Forms dashboard for the submission. Fix the delivery address. **Treat the inbox as the source of truth.** |
| Email 0, event 0, error shown on page | Turnstile or function failure (expected behaviour, nothing tracked) | Note the error text. Check the Netlify function logs (`contact`). |
| Event 2+ for one submission | Unexpected double-fire | Stop. Note the times and send them to the dev. Don't use the form event as a KPI until fixed. |
| Email 2 | Double submission (back + resubmit) | Check the time stamps. Repeat the test once. |

**Ongoing:** each week, compare the `contact-form-submit` count with the number of genuine form emails. The inbox (or the enquiry log) is the KPI. Umami is a cross-check, and it will undercount people who use blockers.
