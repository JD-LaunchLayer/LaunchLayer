# Enquiry log: how to use it (no personal data)

File: ENQUIRY-LOG-TEMPLATE.csv. Keep it as a Google Sheet owned by Jordan. **Never record names, phone numbers, emails, addresses, device serials or message text.** One row per genuine enquiry.

| Column | Allowed values |
|---|---|
| enquiry_id | E0001, E0002… sequential |
| date | YYYY-MM-DD (day the enquiry arrived) |
| week_start | Monday of that week (formula `=A2-WEEKDAY(A2,3)`) |
| channel_source | phone · web-form · email · gbp-call · gbp-message · facebook · instagram · walk-in · bark · referral · returning-customer · other |
| how_heard | google-search · google-maps · facebook · instagram · bark · friend-family · returning · passing · ai-assistant · other · not-asked |
| service_type | laptop-repair · pc-repair · macbook · screen · liquid-damage · data-recovery · virus-removal · custom-build · business-it · other |
| town_area | wickford · rayleigh · basildon · billericay · southend · chelmsford · brentwood · other · unknown (area only) |
| became_job | y · n · pending |
| job_completed | y · n |
| is_test_or_spam | y · n (y rows are excluded from KPIs) |
| notes_nonpersonal | optional, e.g. "price check only". Nothing that identifies the person |

Rules: ask "how did you hear about us?" on every enquiry and use `not-asked` if you forgot. Log on the same day, and update became_job/job_completed when you know.
