# LaunchLayer marketing scorecard (student edition)

Supersedes WEEKLY-SCORECARD.md for day-to-day use. Who does what: student compiles · Phil (SEO, Monday GSC + Umami) · Sam (social) · Jordan (enquiry log, GBP, jobs).
The **baseline is fixed**: BASELINE-2026-10-09.md and BASELINE-DATA.csv. Never edit them. Corrections go in BASELINE-ADDENDUM.md.

## How to read this scorecard
- **Weekly = activity only.** Record what we *did*, not how it performed. One week is too little data to judge anything.
- **Performance = monthly and rolling 28 days.** Compare against (1) the 9 Oct 2026 baseline and (2) the previous equal period.
- **Low-volume caution.** Our numbers are small, so random wobble is big. Use this rule:
  - If the earlier number is **under 10**, don't compare. Just report the numbers.
  - Otherwise a change is **meaningful only if it's bigger than 2 × √(earlier number)**. Quick table: 10 → ±7 · 25 → ±10 · 36 → ±12 · 64 → ±16 · 100 → ±20 · 400 → ±40 · 1,000 → ±63.
  - For **percentages** (CTR, bounce rate, engagement rate), only compare when each period has at least 100 in the bottom of the fraction (impressions, visits, reach). Otherwise write "too few to compare".
  - Say "up/down, not meaningful" when a change is inside the band. **Never claim a ranking or lead increase from one month.**
- Missing data is `unavailable (reason)`, never 0. `no data` means we checked and the source returned nothing.
- Umami numbers are **filtered views**: B = UK-only, C = likely human (see BOT-FILTERING.md). Neither is verified human traffic. Always say which one.

## Definitions (one table)

| Tier | Metric | Definition | Source | Notes |
|---|---|---|---|---|
| Awareness | Search impressions | Times a launchlayer.uk page appeared in Google web results | Search Console, `sc-domain:launchlayer.uk`, final data | Excludes Maps/local pack. Data lags 2–3 days. |
| Awareness | Local search impressions | Impressions for queries containing a local town (Wickford, Rayleigh, Basildon, Billericay, Southend, Essex, Brentwood, Chelmsford, Benfleet, Hockley, Woodham, SS11/12) | Search Console, query regex | Many queries are hidden by Google |
| Awareness | GBP profile views / searches | Times the Business Profile was seen | GBP Performance export (Jordan, monthly) | |
| Awareness | Social reach | Unique accounts that saw our organic posts (FB, IG separately) | Meta Business Suite (Sam) | Platform-estimated |
| Engagement | Search clicks | Clicks from Google web results to the site | Search Console | Branded = query contains "launchlayer" / "launch layer" |
| Engagement | UK visitors (tier B) | Umami unique visitors with country = United Kingdom | Umami | Filtered view, not verified human |
| Engagement | Likely-human visitors (tier C) | Umami sessions left after rules R1–R4 | `tools/umami_tiers.py` | Filtered view, not verified human |
| Engagement | UK bounce rate | UK single-page visits ÷ UK visits | Umami | A visit that taps "Call" and leaves still counts as a bounce |
| Engagement | Social engagements / engagement rate | (reactions + comments + shares + saves + link clicks) ÷ reach | Meta Business Suite | Keep the formula fixed |
| Engagement | Social-tagged visits | Umami visits with utm_source = facebook or instagram | Umami UTM report | Needs UTM-CONVENTION.md links |
| Contact actions (taps) | Call taps | `call-click` events (total and by location) | Umami Events | **A tap is not a call** |
| Contact actions (taps) | Directions taps | `directions-click` events | Umami | One link only so far |
| Contact actions (taps) | Email taps | `email-click` events | Umami | |
| Contact actions (taps) | Form sends (tracked) | `contact-form-submit` events | Umami | Cross-check with the inbox. Blockers cause undercounting |
| Contact actions (taps) | GBP calls / directions / website clicks | Actions on the Business Profile | GBP export (monthly) | |
| Confirmed enquiries | Enquiries | Genuine enquiries from any channel, one row each, tests and spam excluded | ENQUIRY-LOG-TEMPLATE.csv (Jordan) | **Main conversion KPI** |
| Confirmed enquiries | Enquiries by channel / how heard | Count per `channel_source` and `how_heard` | Enquiry log | |
| Completed jobs | Jobs | Enquiries with `became_job = y` and `job_completed = y` | Enquiry log | Updated monthly. Some jobs finish weeks later |
| Completed jobs | Enquiry → job rate | Jobs ÷ enquiries (same month of enquiry) | Enquiry log | Only once there are ≥ 10 enquiries |

## Weekly activity log (fill in every Monday; no performance numbers)

| Week (Mon–Sun) | FB posts | IG posts / stories | GBP posts | Blog posts published | Site or tracking changes (dated) | UTM links placed | Reviews requested | Other activity | Data issues noticed |
|---|---|---|---|---|---|---|---|---|---|
| 12–18 Oct 2026 | | | | | | | | | |

## Monthly performance (first week of each month, for the previous calendar month)

Month: ______ (pulled __/__/____)

| Tier | Metric | This month | Previous month | Baseline (fixed, 9 Oct 2026) | Change vs previous | Meaningful? |
|---|---|---|---|---|---|---|
| Awareness | Search impressions | | | 11,216 (28d, 9 Sep–6 Oct) | | |
| Awareness | Local search impressions | | | 1,766 (28d) | | |
| Awareness | GBP views | | | unavailable (owner export pending) | | |
| Awareness | FB reach / IG reach | | | unavailable (Meta export pending) | | |
| Engagement | Search clicks (total / non-branded) | | | 64 / 60 (28d) | | |
| Engagement | UK visitors (B) | | | 35 (27 Sep–8 Oct, 12 days) | | |
| Engagement | Likely-human visitors (C) | | | 38 (27 Sep–8 Oct, 12 days) | | |
| Engagement | UK bounce rate | | | 55.1% (12 days; < 100 visits, so treat with caution) | | |
| Engagement | Social engagement rate | | | unavailable | | |
| Contact actions | Call taps | | | 6 (27 Sep–9 Oct) | | |
| Contact actions | Form sends (Umami / inbox) | | | no data / owner to confirm | | |
| Contact actions | GBP calls / directions / website clicks | | | unavailable | | |
| Confirmed enquiries | Enquiries (total; top 3 channels) | | | unavailable (log starts Oct 2026) | | |
| Completed jobs | Jobs completed | | | unavailable | | |

## Rolling 28 days (Phil's Monday report; GSC ends 3 days before the report date)

| Metric | Last 28 days (dates: __ to __) | Previous 28 days | Baseline 28 days (9 Sep–6 Oct 2026) | Meaningful? |
|---|---|---|---|---|
| Search clicks | | | 64 | |
| Search impressions | | | 11,216 | |
| CTR / avg position | | | 0.57% / 10.6 | |
| Local search clicks / impressions | | | 3 / 1,766 | |
| UK visitors (B) | | | unavailable until the first full 28 days of Umami (28 Sep–25 Oct 2026) | |
| Call taps | | | unavailable for 28d (only 12 days of data at baseline) | |
| Confirmed enquiries | | | unavailable | |

Umami started on 27 Sep 2026, so its "baseline" is 12 days long. Compare it to the first full 28-day period (28 Sep–25 Oct) once that exists, and record it in BASELINE-ADDENDUM.md as an addition. The original baseline figures stay unchanged.

## Social stretch target
+20% organic reach **and** engagement (FB + IG) by the end of the placement. This only applies once ≥ 4 weeks of Meta data exist from before the student's first post. Compare equal periods and report the number of posts alongside, because more posts alone raise reach.
