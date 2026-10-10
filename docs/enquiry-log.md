# Enquiry log

Verified submissions from the contact form append one row to a private Google Sheet. The sheet is the record of enquiries for marketing. Phone calls and social messages are still typed in by hand.

The function only adds rows. It does not edit, sort, or delete what is already there.

## What is stored

A website row records the service, the optional “how did you hear about us?” answer, the optional town, and the campaign tags from the link (`utm_source`, `utm_medium`, `utm_campaign`). It also stores a `W` reference, the date, and Netlify’s submission id so a replay does not add a second row.

It does not store the name, email address, phone number, or message. Those stay in Netlify Forms.

Blank optional answers are `unknown` when the field was sent empty (including “Prefer not to say”), or `not-asked` when an older submission has no such field. Campaign tags that are missing or not a short plain label are `none`. Nothing is guessed.

`became_job` starts as `pending`. `job_completed` starts as `n`. Change those in the sheet when the job moves on.

## Test rows

`is_test_or_spam` is `y` only for an explicit test flag.

- On a deploy preview or `netlify dev`, open `/contact/?ll_test=1` and submit. The row is marked `y`.
- On the live site, `?ll_test=1` does nothing. The row is still written, with `is_test_or_spam` = `n`. A visitor cannot use that link to hide an enquiry from the count.
- To mark a live test, set `ENQUIRY_TEST_TOKEN` to a long random value (at least 16 letters, numbers, `_` or `-`) and open `/contact/?ll_test=` plus that value. A short token such as `1` is ignored.
- The message text is never inspected. Spam and the honeypot do not run this function, so they do not add a row.

## Environment variables

Set these in Netlify, scoped to Functions, and mark the key and the sheet id as secret. Do not put them in GitHub. This repository is public.

| Variable | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email |
| `GOOGLE_PRIVATE_KEY` | PEM private key. A `\n` sequence is fine |
| `ENQUIRY_SHEET_ID` | The id in the sheet URL |
| `ENQUIRY_SHEET_TAB` | Tab name, for example `Enquiries` |
| `ENQUIRY_TEST_TOKEN` | Optional. Long random value for live test rows |

`CONTEXT` is set by Netlify (`production`, `deploy-preview`, `branch-deploy`, `dev`).

For a deploy preview, you can point `ENQUIRY_SHEET_ID` at a copy of the sheet so tests stay off the live tab.

## Header row

Leave the existing columns in place. Add these four at the end:

`submission_id`, `utm_source`, `utm_medium`, `utm_campaign`

The function matches columns by name. If one of those headers is missing, it does not write a row, so the columns cannot slide out of line.

## If a row is missing

The form still succeeds for the visitor when the sheet write fails. Netlify retries the function twice (after one minute, then two minutes). Each run also tries the Sheets call three times, with a short pause, and checks `submission_id` before adding a row.

To fill a gap later, either:

1. In Netlify, open Forms → contact → the verified submission, mark it as spam, then mark it as verified again. That fires the function again. If the row is already there, nothing is added.
2. Or export the submissions (Forms → contact → Download as CSV, or `GET /api/v1/forms/{form_id}/submissions`) and save the JSON on your own machine. Then run:

```bash
node scripts/backfill-enquiry-log.mjs ./submissions.json
```

with the same environment variables set in the shell. The script prints the submission id and a status only. Run it again whenever you like: existing ids are skipped. Delete the export afterwards. It contains names and messages, and it must not be committed.

## Setup in Google Cloud

1. Create a project and enable the Google Sheets API only.
2. Create a service account with no project roles. Create a JSON key and download it once.
3. Add the four headers above. Share the one spreadsheet with the service account email as Editor. Do not share anything else. Turn notifications off.
4. Put the email, the private key, the sheet id, and the tab name into Netlify environment variables. Delete the JSON key from your computer.
5. Deploy this change when you are happy with it. The function and the new form fields need to go out together, so Netlify registers the fields.
