# Umami traffic quality and bot filtering

Investigated 9 Oct 2026 using the Umami share API (read-only): aggregate stats per country, the device/browser/OS/screen/city/referrer/entry breakdowns, and the per-session list (no identifiers kept). Range: 27 Sep 2026 00:00 to 9 Oct 2026 (snapshot ~19:20 BST) unless stated otherwise.
We **didn't assume** that non-UK traffic means bots. Each cluster was checked on its own signals.

## Umami's built-in bot detection
Umami's collector drops requests whose User-Agent matches the `isbot` list (`if (!DISABLE_BOT_CHECK && isbot(userAgent))` in `src/app/api/send/route.ts`). Source: https://github.com/umami-software/umami/blob/a3733b04/src/app/api/send/route.ts. This catches self-declared crawlers (Googlebot and similar) but **not** headless Chrome running a normal browser UA, which is what we see below. The share view has no extra bot filter, and Umami Cloud's IP blocking (`IGNORE_IP`) is a self-host setting (https://docs.umami.is/docs/environment-variables). It may not be available on Cloud; check the account settings.

## Clusters (visitors = Umami sessions)

| Cluster | Visitors | Signals | Assessment |
|---|---|---|---|
| **Singapore** | 148 (148 visitors / 149 visits / 149 views) | 100% bounce, **0 s total time**, 1 view each, all "laptop + Chrome", screens 1280x1200 (114) and 1366x1366 (33), 0 events, 147/148 with no referrer, entry pages spread evenly over blog/service URLs, arrivals at every hour of the day (UK night included), **59 on 8 Oct** (spike) against 2–9 a day before | **Automated** (crawler/scanner/AI fetcher running headless Chrome). |
| **US data-centre cities** (Ashburn 15, Boardman 10, Council Bluffs 8, Prineville 3, San Jose 4, Dulles/Boydton 2+2) | ~44 | AWS/GCP/Azure regions. Boardman, Prineville and San Jose: 1 view, 0 s. Linux 25 visitors with 39 s total. Screen 800x600 (headless default) on 30 US visitors | Mostly **automated**. A small Ashburn iOS group (5 sessions, 2–6 views, ~50–60 min each) looks like real browsing through a relay or proxy and is **ambiguous**. Excluded from tier C by the city rule. |
| **US Facebook referrals** | 7 (m.facebook 4, facebook 3; `fbclid` present) | 1 view, 0 s, no events, geolocated to the US | **Ambiguous.** Could be Meta link-preview/safety fetchers or real in-app taps. Cannot be classified, so excluded from tier C by R4. |
| **Flower Mound, TX** | 3 | 27 Sep 21:45–21:50 BST, **10–15 min after the Umami PR merged (21:35)**. Mac with a 390x844 (iPhone-sized) viewport, 8–18 views, 1 call-click | **Internal post-deploy QA** (mobile emulation). Excluded by R3. Its call-click is in the all-time event count. |
| **China, Vietnam, Brazil** | 11 / 5 / 4 | 100% bounce, 0 s, mostly 1280x1200/1600x1600, no referrer. VN hit the two dead (404) blog URLs | **Automated.** |
| **Germany** | 6 | Falkenstein/Nuremberg (Hetzner) single hits, plus 1 Berlin Mac (2 views, 8 min) | Mixed. Berlin kept. |
| **Cambodia** | 1 | Android, 1 view, 3 s, **1 call-click** (30 Sep) | Probably human (possibly someone travelling or using a VPN). Kept. |
| **United Kingdom** | 36 | Screens are varied real devices (1920x1080, iPhone 393x852, ultrawide 3440x1440), **none** of the headless sizes. Cities: London 5, **Basildon 4, Wickford 3**, Billericay 2, Brentwood 2, Southend/Leigh/Westcliff. 54% bounce, 31 s/visit, 5 of the 7 events | **Mostly human**, but also includes our own visits (Jordan, team, agents run from UK machines) and 19 single-hit sessions. |

Overall: 270 of 305 sessions had **0 s duration**. All 7 events came from sessions that had duration (GB 5, KH 1, Flower Mound QA 1).

## Metric tiers (always label which tier a number comes from)

| Tier | Name | Definition | 27 Sep – 9 Oct (snapshot) | 27 Sep – 8 Oct (since install, complete days) | 2 – 8 Oct (last 7 complete) |
|---|---|---|---|---|---|
| **A** | All recorded | Everything Umami stored | 305 visitors / 330 visits / 408 views / 7 events | 272 / 296 / 371 / 7 | 178 / 193 / 223 / 5 |
| **B** | UK-only view *(filtered, not verified human)* | `country = GB` (Umami filter) | 36 / 50 / 85 / 5 | 35 / 49 / 81 / 5 | 25 / 37 / 62 / 5 |
| **C** | Likely-human view *(filtered, not verified human)* | All sessions minus rules R1–R4 below | 39 / 53 / 91 / 6 | 38 / 52 / 87 / 6 | 27 / 39 / 67 / 5 |

Tier C exclusion rules. A session is excluded if **any** applies, checked in this order. Counts are for the full range.
- **R1 headless screen:** screen ∈ {1280x1200, 1366x1366, 800x600, 1600x1600, 2000x2000, 1024x1024, 1600x1200}. These sizes appear only in automated clusters and never in GB. Removes 207.
- **R2 data-centre city:** city ∈ {Ashburn, Boardman, Council Bluffs, Prineville, San Jose, Falkenstein, Nuremberg, Frankfurt am Main, Boydton, Dulles, The Dalles, Santa Clara}. Removes 29.
- **R3 install QA:** first seen 27 Sep 2026 21:35–23:59 BST and not GB. Removes 3.
- **R4 non-UK single hit:** not GB, 1 view, 0 events, 0 s duration. Removes 27.
- GB sessions are only removed by R1–R3 (none were), so a UK visitor who bounces counts.

Reproduce: `python3 tools/umami_tiers.py 2026-10-02 2026-10-08` (read-only; it prints aggregates only and never prints the share token).
Limitations: geolocation comes from IP and is approximate; VPN and iCloud Private Relay users can appear in the wrong country. Tier C rules are heuristic and will need revisiting if new bot patterns appear (review monthly). Neither B nor C removes our own UK visits. For reporting, **tier B is the primary engagement number** (simple, filterable in the UI), C is a cross-check, and A is context only.

## Filtering options
1. **Exclude our own visits (do this now, no code):** on each of Jordan's and the team's browsers/devices, open launchlayer.uk → DevTools console → `localStorage.setItem('umami.disabled', 1)`. Undo with `localStorage.removeItem('umami.disabled')`. Source: https://docs.umami.is/docs/exclude-my-own-visits. The tracker checks this flag (confirmed in the live `cloud.umami.is/script.js`). It's per browser and per site, and private windows don't keep it. **Run the contact-form test first** (CONTACT-FORM-EVENT-TEST.md). On phones, use a bookmarklet `javascript:localStorage.setItem('umami.disabled',1);alert('Umami off')` while on the site.
2. **Agent/QA visits:** keep using `?diag=…` on automated checks. The repo's Playwright scripts already block Umami. Filter `diag=` out under Query in Umami if it shows up.
3. **Umami UI filters:** apply `Country = United Kingdom` (tier B) on the dashboard and save it as a segment if the plan allows. Umami's filter bar also supports device/OS/referrer filters, but not screen or duration, which is why tier C uses the script.
4. **Umami Cloud settings (owner):** check whether the Cloud plan offers IP exclusion or bot filtering. If enabled, note the date, because tier A will drop from then on.
5. Don't block the bots at Netlify/Cloudflare just for analytics. Some may be search/AI crawlers we want, and blocking is an SEO decision for Phil.
