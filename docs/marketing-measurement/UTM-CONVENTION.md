# UTM convention: Facebook, Instagram, Google Business Profile

Status: proposal (9 Oct 2026). It replaces the UTM table in IMPLEMENTATION-PLAN.md §3. The values below were chosen to suit **how Umami classifies traffic**.

## Rules
1. Everything is **lowercase**. Use **underscores** inside values, and no spaces, capitals or personal data.
2. Only use 3 required parameters: `utm_source`, `utm_medium`, `utm_campaign`. `utm_content` is optional (post date and topic). Never use `utm_term`.
3. **Never tag internal links** on launchlayer.uk. Only tag links placed off-site.
4. Every tagged URL goes into the "UTM register" tab of the scorecard sheet with the date it was placed.
5. The landing page must be a real canonical URL with the trailing slash (e.g. `https://launchlayer.uk/wickford-laptop-repair/`). This avoids a 301 hop.

## Why these values (Umami-specific)
We read Umami's open-source channel logic (`src/queries/sql/getChannelMetrics.ts` and `src/lib/constants.ts`, umami-software/umami master, read 9 Oct 2026). Umami Cloud may run a slightly different version, so confirm it with the first tagged clicks.
- `utm_source=google` appears in Umami's **PAID_AD_PARAMS** list, so a GBP link tagged `utm_source=google` would be **reported as "Paid ads"** in the Channels view. → For GBP we use **`utm_source=gbp`**.
- Any `utm_medium` **starting with "p"** (e.g. `post`, `profile`) gets the "paid" prefix. A medium containing `app`, `link` or `referral` is classed as **Referral** (so `bio_link` and `whatsapp` are out). `organic` → Search, `mail` → Email, `sms`, `shop`, `video` and `affiliate` are also special. → Mediums avoid all of these.
- **GBP:** `utm_medium=organic_local` contains "organic", so Umami's Channels view puts it under **Organic search**, which is right because GBP is part of Google Search/Maps. The `gbp` source keeps it separate from ordinary Google organic results in the Sources/UTM reports. This follows the commonly used `google / organic` GBP convention but avoids the paid-ads misclassification.
- **Facebook and Instagram:** `utm_medium=social`. Umami's Channels view classes social **by referrer domain only**. If an in-app browser drops the referrer, the Channels view can show the visit as unlabelled. **So report social from the UTM Source report (`facebook`, `instagram`), not from Channels.**

## Values

| Placement | utm_source | utm_medium | utm_campaign | utm_content (optional) |
|---|---|---|---|---|
| GBP "Website" button | gbp | organic_local | gbp_website | – |
| GBP "Appointment" / booking link (only if set in the profile) | gbp | organic_local | gbp_appointment | – |
| GBP post button ("Learn more" / "Call" has no URL) | gbp | organic_local | gbp_post | yyyymmdd_topic |
| GBP product/service links (if used) | gbp | organic_local | gbp_service | service_slug |
| Facebook page "Website" field / CTA button | facebook | social | fb_profile | – |
| Facebook post link | facebook | social | fb_post | yyyymmdd_topic |
| Facebook group or community share | facebook | social | fb_group | group_short_name |
| Instagram bio link | instagram | social | ig_bio | – |
| Instagram story link sticker | instagram | social | ig_story | yyyymmdd_topic |
| Instagram post/reel caption | not clickable, so send people to the bio link | – | – | – |
| Paid boost (if ever) | facebook / instagram | paid_social | `<campaign>` | ad name |

## Ready-to-paste URLs
- GBP website button:
  `https://launchlayer.uk/?utm_source=gbp&utm_medium=organic_local&utm_campaign=gbp_website`
- GBP appointment link (only if the profile has one; it currently has no UTM, owner to confirm):
  `https://launchlayer.uk/contact/?utm_source=gbp&utm_medium=organic_local&utm_campaign=gbp_appointment`
- GBP post (example, 12 Oct battery post):
  `https://launchlayer.uk/blog/laptop-battery-replacement-wickford/?utm_source=gbp&utm_medium=organic_local&utm_campaign=gbp_post&utm_content=20261012_battery`
- Facebook page website field:
  `https://launchlayer.uk/?utm_source=facebook&utm_medium=social&utm_campaign=fb_profile`
- Facebook post (example):
  `https://launchlayer.uk/wickford-laptop-repair/?utm_source=facebook&utm_medium=social&utm_campaign=fb_post&utm_content=20261012_screen_repair`
- Instagram bio:
  `https://launchlayer.uk/?utm_source=instagram&utm_medium=social&utm_campaign=ig_bio`
- Instagram story sticker (example):
  `https://launchlayer.uk/contact/?utm_source=instagram&utm_medium=social&utm_campaign=ig_story&utm_content=20261012_quote`

The `/contact/` page script only reads `service`, `message` and `submitted` from the URL, so UTM parameters don't interfere with the form. Facebook adds `fbclid` itself, which is harmless (it isn't in Umami's paid list).

## Duplicate-content check
- **All 97 indexable HTML pages carry exactly one `<link rel="canonical">`** pointing to the absolute apex/trailing-slash URL with no query string (checked across the repo; `template.html`, `404.html` and fixtures excluded).
- Live check: fetching `/`, `/contact/`, `/wickford-laptop-repair/` and `/blog/` **with** `?utm_source=facebook&utm_medium=social&utm_campaign=test` returns the same clean canonical (e.g. `https://launchlayer.uk/contact/`). Google consolidates parameter variants onto the canonical, so UTM links won't create indexable duplicates. We don't link UTM URLs internally, and they aren't in the sitemap.
- (Those `curl` checks don't run JavaScript, so they added nothing to Umami.)

## Does Umami read UTMs? Yes, verified
- Umami extracts `utm_source/medium/campaign/content/term` server-side from the page URL query.
- Real evidence: Umami's share API returned `utmSource = trustpilot`, `utmMedium = company_profile`, `utmCampaign = domain_click` for 1 visit (27 Sep – 9 Oct 2026). In the dashboard: **UTM** report / Sources → UTM.
- **Don't enable `data-exclude-search="true"`** on the Umami tag. It strips the query string and would break UTM capture.
- Before/after note: GBP website clicks currently show up as direct or google.com referrals. From the date the UTM goes live they'll move to `gbp`, so log that date.
