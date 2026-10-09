# Implementation plan: the smallest set of fixes

Nothing here has been changed in the repo or deployed. Each item is a proposal for Jordan to approve, then a small PR.
Umami is **cookieless**, so these fixes need **no consent banner**. If GA4 (or Meta Pixel, Clarity and the like) is ever proposed, it must sit behind Consent Mode v2 or an opt-in banner **before it fires**. The current cookie notice does not gate anything.

## A. Essential before the placement starts

1. **Verify form-success tracking (no code change).** The event already exists: `contact-form-submit` fires only after `/api/contact` returns `success:true` (a confirmed submission through the Netlify Function to Web3Forms, not Netlify Forms). Run the controlled test in EXTERNAL-DATA-REQUIRED §5. If Umami doesn't show the event, debug it before relying on it. Keep the inbox count as the truth source.
2. **Start the enquiry log** (§4 below) and record every enquiry from day 1. Without it there is no conversion baseline.
3. **UTM convention** (§3). Tag the GBP website link (owner action) and all social bio and post links from now on. Write down the start date.
4. **Tracking-gap fixes (one small PR):**
   - Add `data-umami-event="call-click"` with `location` to the 2 untracked tel: links (`/blog/fix-pc-game-stuttering-fps-drops-essex/` and `/blog/professional-business-email-setup-essex/`). The blog builder should add it automatically, because `scripts/check-contact-mobile.mjs` already asserts it on the contact page.
   - Rename the floating call button's `data-umami-event-location="footer"` to `floating`. Note the change date, because historical "footer" taps all came from the floating button.
5. **Agree the reporting rules:** GB filter as the primary Umami view, GSC final data only, `unavailable` instead of 0, and a dated changes log. Add a weekly AI-referrer check (§5).

## B. Later (useful, not blocking)
6. **mailto:** make the address on `/contact/` a link with `data-umami-event="email-click"` and `location="contact"`.
7. **Outbound clicks:** `data-umami-event="outbound-click"` with `data-umami-event-dest="facebook|instagram|bark|calendly"` on the footer social, Bark and Calendly links.
8. **Directions:** add `directions-click` to any other maps or directions links (only the home page link has it today).
9. **WhatsApp:** only if the business opens that channel. Use `wa.me/44…` with `data-umami-event="whatsapp-click"`. Not needed otherwise.
10. **404 hygiene for measurement:** report 404 pageviews separately. The two dead blog URLs seen in Umami could get 301s. That is an SEO task, so log it for Phil and don't do it here.
11. **Bot and internal-traffic handling:** use the Umami bot or IP exclusion if the account offers it, and keep agent diagnostics on `?diag=` URLs so they can be filtered out.
12. **Bing WMT** import from GSC (owner, about 5 minutes).
13. **Search Console page merging:** a small sheet formula that maps www and non-slash URLs onto the canonical apex/slash URL.

## 3. UTM convention (lowercase, hyphens, no personal data)

| Placement | utm_source | utm_medium | utm_campaign | utm_content (optional) |
|---|---|---|---|---|
| GBP website button | google | organic | gbp-listing | – |
| GBP post "Learn more" | google | organic | gbp-post | post-yyyymmdd |
| Facebook post | facebook | social | `<topic>-yyyymm` e.g. `battery-202610` | post-yyyymmdd |
| Facebook page bio / CTA | facebook | social | profile | – |
| Instagram bio / link sticker | instagram | social | profile / story-yyyymmdd | – |
| Paid boost (if ever) | facebook / instagram | paid-social | as above | ad name |
| Email signature / newsletter | email | email | signature / newsletter-yyyymm | – |
| Bark profile | bark | referral | profile | – |
| QR code (flyers, van) | print | qr | flyer-yyyymm | location |

Rules: never put personal data in UTMs, never tag internal site links, keep a shared sheet listing every tagged URL, and write down the date each placement changes.

## 4. Privacy-safe enquiry log (Google Sheet, owner-held)

**No names, phone numbers, emails, addresses or free-text notes about people.** One row per genuine enquiry. Exclude spam and tests.

| Column | Values |
|---|---|
| enquiry_id | E0001, E0002… (sequential) |
| date | YYYY-MM-DD |
| week_start | Monday date (formula) |
| channel_source | phone / web-form / email / gbp-call / gbp-message / facebook / instagram / walk-in / bark / referral-word-of-mouth / returning-customer / other |
| how_heard | google-search / google-maps / facebook / instagram / bark / friend-family / returning / passing / ai-assistant / other / not-asked |
| service_type | laptop-repair / pc-repair / macbook / screen / liquid-damage / data-recovery / virus-removal / custom-build / business-it / other |
| town | wickford / rayleigh / basildon / billericay / southend / chelmsford / brentwood / other / unknown (area only, no address) |
| became_job | Y / N / pending |
| notes_nonpersonal | optional, e.g. "price shopper", with no identifying detail |

The requested core columns are date, channel_source, service_type, how_heard and became_job. The others are optional and help reporting.

## 5. AI referrer watch (weekly, 5 minutes)
In Umami → Referrers, search for: chatgpt.com, chat.openai.com, perplexity.ai, copilot.microsoft.com, bing.com/chat, gemini.google.com, claude.ai, you.com. Log the count each week, with 0 meaning "checked, none". Baseline: none, 27 Sep – 9 Oct 2026. In the enquiry log, record `how_heard = ai-assistant` when a customer says so.

## 6. Manual AI-visibility test (observational only, monthly)
- Use the same 6 prompts each month, in a logged-out or private session, on ChatGPT, Perplexity, Gemini and Copilot. Examples: "best laptop repair in Wickford", "who can fix a MacBook near Basildon", "computer repair Rayleigh", "PC repair shop Wickford Essex", "where can I get a swollen laptop battery replaced in Essex", "data recovery near Billericay".
- Record whether LaunchLayer is mentioned (Y/N), its position in any list, whether launchlayer.uk is cited, and the date and tool.
- **Label every result as observational.** AI answers vary by session, location and model version. This is not a ranking, not a KPI and must not be used for before/after claims.
