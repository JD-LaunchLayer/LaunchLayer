# KPI framework: LaunchLayer (placement period from October 2026)

Principles: measure what the business controls and can verify. Compare like with like: same length of period, same day-of-week mix, same filters. Never present a rank or lead as guaranteed. **We make no ranking promises.** Search positions depend on Google and on competitors. Volumes are small, so judge trends over 4+ weeks, not week to week.

## Funnel tiers

### Awareness
| KPI | Definition | Source | Frequency | Baseline (see BASELINE-DATA.csv) | Limitations |
|---|---|---|---|---|---|
| GSC impressions (total, non-branded, local-town) | Times a launchlayer.uk URL appeared in Google web results | GSC, `sc-domain` property, final data | Weekly (Mon) with a 28-day rolling view | 28d to 6 Oct: 11,216 total; 1,766 local-town | Web only, so it excludes Maps and the local pack. 2–3 day lag. About 78% of clicks are on anonymised queries. |
| GBP views / searches | Profile views and discovery searches | GBP Performance (owner export) | Monthly | unavailable (needs owner export) | Google changes its definitions. Short history. |
| Social reach (FB + IG) | Unique accounts reached by organic posts | Meta Business Suite (owner/Sam export) | Weekly totals, monthly review | unavailable (needs owner export) | Platform-defined and partly modelled. |
| Followers (FB, IG) | Count at period end | Meta Business Suite | Monthly | unavailable | Vanity metric, so watch the trend only. |

### Engagement
| KPI | Definition | Source | Frequency | Baseline | Limitations |
|---|---|---|---|---|---|
| UK website visitors | Umami unique visitors with country = GB | Umami | Weekly | 25 (2–8 Oct) | Cookieless approximation. Bots outside the UK are excluded, but some UK bots and VPN users remain. |
| UK visits / pageviews | Umami visits and pageviews, GB filter | Umami | Weekly | 37 / 62 (2–8 Oct) | Same as above. |
| UK bounce rate | Bounces ÷ visits, GB filter | Umami | Weekly | 54.1% (2–8 Oct) | Single-page visits that end in a call tap still count as bounces. |
| GSC clicks (total, non-branded, local) | Clicks from Google web results | GSC | Weekly, 28d rolling | 64 total / 60 non-branded (28d to 6 Oct) | Small numbers. Anonymised queries. |
| Social engagement rate | (reactions + comments + shares + saves + link clicks) ÷ reach | Meta Business Suite | Weekly, monthly review | unavailable | The definition must stay fixed once chosen. |
| Social-referred visits | Umami visits with referrer facebook/instagram or utm_medium=social | Umami | Weekly | 11 organic-social visitors (27 Sep – 9 Oct, all traffic) | In-app browsers often drop the referrer, and UTMs fix this. |

### Conversion
| KPI | Definition | Source | Frequency | Baseline | Limitations |
|---|---|---|---|---|---|
| **Confirmed enquiries** (primary) | Real customer enquiries by any channel, logged once each | Enquiry log (no PII) | Weekly | unavailable (log not started) | Depends on consistent logging. |
| Enquiries → jobs | Logged enquiries with became_job = Y | Enquiry log | Monthly | unavailable | Short lag while quotes are accepted. |
| Web form submissions | `contact-form-submit` events, cross-checked against the inbox count | Umami + inbox | Weekly | no data (0 events since 27 Sep; unverified) | Ad-blockers undercount, so the inbox is the truth. |
| Call-link taps | `call-click` events, total and by location | Umami | Weekly | 6 (27 Sep – 9 Oct); 4 (2–8 Oct) | A tap is not a call. |
| Directions taps (site) | `directions-click` | Umami | Weekly | 1 | Only one link has tracking. |
| GBP calls / directions / website clicks | Owner export | GBP Performance | Monthly | unavailable | No UTMs on website clicks yet. |

## Social stretch target (20%)
- **Target:** +20% on organic social reach **and** engagement (FB + IG combined) by the end of the placement, against the baseline period.
- **Conditional:** the target only applies once a baseline has been validated: at least 4 complete weeks of Meta Business Suite data before the student's first scheduled post, exported the same way every time. If history is shorter, set the target after 4 weeks of data.
- Compare equal-length periods. State the post count in each period, because more posts alone inflate reach. Report engagement *rate* alongside totals.
- Paid boosts are excluded or reported separately.

## Rules
1. A metric with no data is written `unavailable (reason)`, never 0.
2. Each weekly figure shows its exact date range and the date it was pulled.
3. GSC weeks run Mon–Sun and are pulled on Monday for the week that ended 8 days earlier. Use final data only, or mark the figure provisional.
4. Umami: report GB-filtered figures as primary and all-traffic as secondary.
5. Changes to the site or tracking get a dated annotation in the scorecard so before/after comparisons stay honest.
6. AI-visibility checks are **observational**. They are not a KPI and can't be compared against a target.
