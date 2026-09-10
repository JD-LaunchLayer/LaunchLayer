# Phase 8 — tracking and legal-identity audit

Checked every HTML page in this repo (96 files), including leftover Squarespace-export pages. Visible company details were **not** silently rewritten. Google Analytics snippets on leftover pages **were** removed because they loaded without a working UK cookie banner.

Canonical visible identity (from `/privacy-policy` after Phase 7, and Companies House for the company number and address):

| Field | Canonical value |
| --- | --- |
| Company number | `16460298` |
| VAT | `GB495057756` (HMRC-confirmed in Phase 7) |
| ICO | `ZB990726` |
| Registered office | `32 Glebe Road, Wickford, Essex SS11 8EU` |

## 1. Analytics, ads, and tracking

### Removed (this change)

Google Analytics property `G-MDHCVB3M0E` was loading on **54 leftover Squarespace-export pages** via `googletagmanager.com/gtag/js`. The leftover Squarespace consent code defaulted `analytics_storage` to denied, but the Google script still loaded, `gtag('config', …)` still ran, and there is **no working PECR cookie banner** on the static site (the old Squarespace banner cookies are not present).

Those gtag snippets have been stripped from:

- `/privacy-policy`, `/contact`, `/faqs`, `/reviews`, `/404`
- `/blog` (index, all leftover posts, and category indexes)
- `/business`, `/business/pricing`, `/services/startup-it-setup`, `/service-dropdown`

Rebuilt pages (home, About, Services hub, town/service landing pages, and the Markdown-built blog post) did **not** include Google Analytics.

### Flagged — still loading; need removal **or** a UK GDPR/PECR cookie banner before they can stay

These are not classic ad pixels, but they are third-party scripts that can set cookies or send visitor data. They were **left in place** because removing them would change visible widgets or leftover-page behaviour.

| What | Where it loads | Why it matters |
| --- | --- | --- |
| Bark.com footer widget (`widgets-v2….js`) | Most rebuilt and leftover pages (site-wide footer badge). Homepage now includes it from Phase 7. | Third-party JS from bark.com. |
| Featurable reviews widget (`api.featurable.com` via `/assets/animate/bundle.js`) | Homepage and `/reviews` | Live Google-review embed; third-party API. |
| Trustpilot widget bootstrap (`widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js`) | Leftover Squarespace pages only | Third-party widget loader. |
| Google Maps embed | Homepage map (lazy-loaded when scrolled into view) | Google cookies/requests once the iframe `src` is set. |
| Squarespace CDN polyfillers (`assets.squarespace.com/@sqs/polyfiller/…`) | Leftover export pages | Remote Squarespace JS still requested by the static export. |
| Leftover `facebookAppId` in `SQUARESPACE_CONTEXT` | `/business`, `/business/pricing`, `/service-dropdown`, `/services/startup-it-setup` | Config leftover; not a Facebook Pixel by itself, but should not stay if those pages are rebuilt. |

### Not found

- No Google Ads / AdSense / DoubleClick tags
- No Facebook Pixel (`fbq` / `connect.facebook.net`)
- No Hotjar, Microsoft Clarity, Mixpanel, Plausible, or Matomo
- No Cookiebot / OneTrust banner (and none is required **if** the remaining third-party widgets above are removed rather than kept)

Google Fonts (`fonts.googleapis.com`) still load on rebuilt pages. That is a third-party request (IP address to Google), not an analytics tag. Self-hosting the fonts would close that off if wanted later.

## 2. Legal identity consistency

### Company number — consistent where it appears

Visible footer line on live pages:

`LaunchLayer Ltd · Company no. 16460298 · 32 Glebe Road, Wickford, Essex SS11 8EU · No-Fix-No-Fee`

Matches `/privacy-policy` and Companies House company **16460298**. Redirect-only files (`/cart`, `/home`, `/laptop-mot-wickford`, `/macbook-repair`) have no footer, which is expected.

### VAT — mismatch (not changed)

| Location | Value |
| --- | --- |
| `/privacy-policy` visible text and its JSON-LD `vatID` | `GB495057756` |
| JSON-LD `vatID` on **85 other pages** (leftover exports **and** rebuilt service/town pages) | `GB 462 8841 02` |
| Footer | VAT is **not** shown |

`GB 462 8841 02` and `GB495057756` are different numbers. Phase 7 recorded `GB495057756` as the HMRC-confirmed VAT. The leftover schema value was left as-is for you to confirm before any bulk JSON-LD edit.

### ICO — consistent where it appears

`ZB990726` appears only on `/privacy-policy`. The footer does not include an ICO number, so there is no footer mismatch.

### Registered address — consistent, with one leftover leftover

Footer, privacy policy, JSON-LD `PostalAddress`, and Companies House all use **32 Glebe Road, Wickford, SS11 8EU**.

**Minor leftover mismatch:** 15 leftover blog posts still have Open Graph `og:street-address` as `Glebe Road` (house number missing). JSON-LD and the visible footer on those same posts use `32 Glebe Road`.

## 3. What was not changed (on purpose)

- No prices, phone numbers, or URLs
- No pages deleted
- VAT / ICO / address text left as found except the Google Analytics removal above
- Bark, Featurable, Trustpilot, Maps, and Squarespace polyfillers left in place pending your decision

## Browser checks

1. Open `/` — page source should not mention `googletagmanager` or `G-MDHCVB3M0E`. Footer should still show company no. `16460298` and `32 Glebe Road`. Network tab should not request `googletagmanager.com`. Bark and Featurable/Google Fonts/Maps may still appear until you decide.
2. Open `/privacy-policy` — identity badge should still show Company No `16460298`, VAT `GB495057756`, ICO `ZB990726`. Network tab should not request `googletagmanager.com`.
3. Open a leftover post such as `/blog` or `/contact` — same: no Google Analytics request; page layout unchanged.
4. Open a rebuilt town page such as `/wickford-pc-repair` — footer company line unchanged; JSON-LD in view-source still shows the **old** `vatID` `GB 462 8841 02` until you ask for that to be aligned.
