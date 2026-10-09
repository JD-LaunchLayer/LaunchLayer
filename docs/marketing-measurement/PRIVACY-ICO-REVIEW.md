# Privacy and storage-access review (PECR / DUAA / ICO): launchlayer.uk

**This is not legal advice.** It's a practical compliance check against published sources, prepared for Jordan to review. For certainty, take advice from a qualified adviser or the ICO helpline (0303 123 1113).
Checked 9 Oct 2026: the live `/privacy-policy/` ("Last updated: 27/09/2026"), the live cookie notice (`/assets/js/cookie-consent.js`, identical to the repo), the live Umami tracker (`https://cloud.umami.is/script.js`) and the repo source.

## 1. The rules that apply now (sources)
- **PECR regulation 6, as replaced by the Data (Use and Access) Act 2025 s.112 and Sch.12.** In force **5 February 2026**, commenced by SI 2026/82. Reg 6(1): don't store information on, or access information from, a user's device unless consent is given or a Schedule A1 exception applies.
  - SI 2026/82: https://www.legislation.gov.uk/uksi/2026/82/made/data.html
  - ICO commencement statement (5 Feb 2026): https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/02/statement-on-the-commencement-of-the-data-use-and-access-act-duaa
- **PECR Schedule A1, para 5: the "statistical purposes" (analytics) exception.** No consent is needed if (a) you provide an online service, (b) the *sole* purpose is collecting statistics about how the site is used so it can be improved, (c) the data isn't shared except with someone helping make those improvements, (d) users get **clear and comprehensive information about the purpose**, and (e) users get **a simple means of objecting, free of charge**, and don't object.
  - https://www.legislation.gov.uk/uksi/2003/2426/schedule/A1/2026-02-05
- **ICO, Guidance on the use of storage and access technologies** (final, 29 Apr 2026). It covers cookies, local storage, scripts and tags, fingerprinting and similar technologies, not just cookies.
  - https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies
  - Publication note: https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/04/final-storage-and-access-technologies-guidance-published
- **ICO, "What are the exceptions?"** Key points for us:
  - analytics must produce aggregate statistics and must not be used to track or profile individuals;
  - if you use a third-party provider you must **tell users and explain what it does**, and the provider must act as a **processor**;
  - you must provide an objection method and **must not rely solely on browser settings**;
  - embedded content (e.g. maps or videos) shouldn't set storage and access technologies the moment the page loads.
  - https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/
- **UK GDPR Art. 13 transparency** applies wherever personal data is processed. That includes the contact form (name, email, phone, message) and any IP address processed by analytics or security tools.

## 2. What the site actually does

| Tool | Storage/access on the device | Data processed | Our assessment |
|---|---|---|---|
| **Umami Cloud** (EU region, `cloud.umami.is/analytics/eu`) | **No cookies.** The tracker **reads** `localStorage['umami.disabled']` (an opt-out flag) and **reads** the screen size and language from the browser (live script.js). It writes nothing to storage; its cache token stays in memory. Reading device information counts as "access" under the ICO guidance. | Page URL **including query string**, title, referrer, screen, language, UTM and click IDs. The server uses the IP to derive country/region/city and a session hash with a monthly-rotating salt, and **doesn't store the IP** (https://docs.umami.is/docs/metric-definitions). Stores event-level rows per session (city, device). | Fits the **statistical purposes exception**: aggregate, site improvement, no ads. It **needs (d) clear information and (e) an objection method.** Today (d) is partial and (e) is missing. |
| **Cookie notice** (`cookie-consent.js`) | Writes `ll_cookie_notice=dismissed` to localStorage and a 1-year cookie | None beyond the dismissal | Probably fine as strictly necessary (it remembers the user's choice about the notice). It doesn't currently tell people that it stores this. |
| **Cloudflare Turnstile** (contact page only) | Challenge script. Cloudflare says its signals are strictly necessary for bot detection (https://www.cloudflare.com/turnstile-privacy-policy/) | IP, TLS fingerprint, user agent. Cloudflare is a controller for improving Turnstile | Strictly necessary (security for a form the user chose to submit). **Not disclosed** in the privacy notice. |
| **Web3Forms** (via the Netlify Function) | None on the device | Form contents (name, email, phone, message). Web3Forms' privacy page says submissions are stored encrypted on AWS and **retained up to 3 years** (https://web3forms.com/privacy, https://web3forms.com/dpa) | A processor of enquiry data. **Not disclosed**, and neither is its retention. |
| **Netlify** (hosting/functions) | none | Server logs, IP | Not disclosed. A one-line mention is enough. |
| **Google Maps embed, Featurable reviews, Trustpilot widget, Bark badge** | They may set cookies or read storage **on page load** | Their own | Disclosed by name, but they load before any choice. The ICO says embeds shouldn't set storage technologies on load (click-to-load or consent). **Highest residual risk on the site, separate from Umami.** |

## 3. Gaps against the rules
1. **No simple means of objecting to analytics** (Sch. A1 para 5(1)(e)). The notice is dismiss-only. Without an objection method the exception doesn't apply, and consent would technically be needed. → *Must fix.*
2. **"It does not collect personal data" is overstated.** Umami processes the IP transiently to derive location, and stores page query strings, which can hold free text (see the build-intake `message=` parameter). → Reword accurately.
3. **The purpose and provider aren't fully explained** (para 5(1)(d) and the ICO third-party point). State that the purpose is statistics to improve the site, that Umami acts as our processor, and that data is hosted in the EU.
4. **Contact-form processors aren't disclosed** (UK GDPR Art 13): Web3Forms (3-year retention), Cloudflare Turnstile and Netlify. No lawful basis is stated for enquiries.
5. **The cookie notice doesn't mention analytics** or link to an opt-out. It names only Maps, reviews and Bark.
6. **Embeds load before any choice** (Maps, Featurable, Trustpilot, Bark). This is outside the analytics exception. Use click-to-load, or bring them into a consent choice.
7. Small items: the notice doesn't mention its own `ll_cookie_notice` storage, and the policy's "We do not use … analytics cookies" is true but doesn't mention non-cookie storage or access.

## 4. Minimal wording fixes (drop-in; requires Jordan's approval and a small PR)

**Privacy policy §1.5, replace the Umami sentence with:**
> **Website statistics (Umami).** We use Umami Cloud (hosted in the EU) to count visits, pages viewed, how people found the site (for example a search engine or a link with a campaign tag) and taps on buttons such as "Call". We use this only as combined statistics to improve the website, never to identify you or for advertising. Umami doesn't use cookies. To work, its script reads basic information from your browser (screen size, language, the page address and the referring site), and your IP address is used briefly to estimate your town or country but isn't stored. Umami processes this for us as our service provider.
> **Turn it off:** you can object at any time, free of charge. Use the "Turn off website statistics on this device" link below, which saves a small setting in your browser so Umami stops recording your visits. Clearing your browser data removes the setting.
> [Turn off website statistics on this device] · [Turn them back on]

**Privacy policy §1.5, add:**
> **Contact form.** When you send the contact form, your name, email, phone number and message go through our website host (Netlify) and the form service Web3Forms, which emails them to us. Web3Forms keeps submissions encrypted for up to 3 years. Cloudflare Turnstile checks that the form is being sent by a person rather than a bot. It processes technical information such as your IP address and browser details and is used only for security. We use your details to reply to your enquiry (our legitimate interest, or steps towards a contract you asked for).
> **This notice.** If you click "Got it" on the site notice, we store a small setting in your browser so it doesn't appear again.

**Cookie notice text (in `cookie-consent.js`), replace with:**
> This site uses cookieless website statistics (Umami) to improve the site, and loads Google Maps, review widgets and a Bark badge, which may set their own cookies. [Privacy & opt-out] [Got it]

**Opt-out control (small script on the privacy page; no new tracking).** The links call `localStorage.setItem('umami.disabled','1')` and `localStorage.removeItem('umami.disabled')` and show a confirmation. This is the flag Umami's own tracker honours (https://docs.umami.is/docs/exclude-my-own-visits). Saving the objection is itself strictly necessary (it records the user's choice).

**Later (higher effort):** make the Google Maps and Featurable embeds click-to-load, with a line telling users the provider may set cookies if they load it (ICO "hosting embedded content").

## 5. Verdict
- **Umami can continue without a consent banner**, relying on the statistical-purposes exception in force since 5 Feb 2026, **provided** the privacy wording is clarified and a **free, simple opt-out** is added. Until the opt-out exists, the exception's conditions aren't fully met.
- The contact-form disclosures (Web3Forms, Turnstile, Netlify) are a transparency gap under UK GDPR and should be fixed in the same small PR.
- Third-party embeds that load on page load are the main remaining PECR risk, and they're unrelated to Umami.
- If GA4, Meta Pixel or similar is ever added, it falls **outside** the exception (advertising or cross-site use). It would need prior opt-in consent through a real consent banner before it fires.

Again, this is not legal advice.
