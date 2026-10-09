# External data required (owner actions)

This audit could not reach any of the data below. Jordan (or Sam for social) has to supply it. Wherever possible, export **aggregate figures only**. Do not share customer names, numbers, emails or message text. Google and Meta rename menus fairly often, so if a step doesn't match what you see, look for the same words nearby.

## 1. Google Business Profile Performance (needed for baseline: calls, directions, website clicks, views, searches)
1. Sign in with the account that manages the profile. Search Google for **"LaunchLayer Wickford"**, or go to **business.google.com**.
2. Open the profile, then click **Performance**.
3. Set the date range to **the last 6 months (custom: 1 Apr – 30 Sep 2026)**, then run a second range of **1 Sep – 30 Sep 2026**.
4. Write down or screenshot: **Interactions total, Calls, Directions requests, Website clicks, Bookings/Messages if shown, Profile views (Search vs Maps, mobile vs desktop), Searches** and the **"Searches breakdown" list of terms**. Search terms are aggregate, so they're safe to share.
5. For a CSV, go to business.google.com/locations, tick the profile, then **Download report → Performance**, choose the date range, then **Download**.
6. Also record the **review count and average rating** on the day of export.
7. Repeat monthly, in the first week, for the previous calendar month.

## 2. Facebook and Instagram (Meta Business Suite): needed for the social baseline and the 20% stretch target
1. Go to **business.facebook.com** and select the LaunchLayer business, then **Insights**.
2. **Overview / Results:** set the date range to **the last 90 days (to 30 Sep or the latest complete week)**. Record for **Facebook and Instagram separately**: Reach, Visits (Page/Profile), New follows/followers, Content interactions, Link clicks.
3. **Content:** filter to Posts and Reels for the same range, then click **Export data** (CSV). Keep: date, type, reach, reactions, comments, shares, saves, link clicks. Drop any commenter names.
4. Note the **number of posts** published in the period, because it's needed to judge the 20% target fairly.
5. **Messages / enquiries:** count how many genuine enquiries came by Messenger or IG DM in the period (the count only).
6. Ongoing: Sam exports the same views every Monday for the previous Mon–Sun.

## 3. Bing Webmaster Tools (missing or unknown)
1. Go to **bing.com/webmasters** and sign in. Use the Google account if you want to import.
2. If a launchlayer.uk site already exists, export **Search Performance** (last 3 months) and stop here.
3. If not: **Add a site → Import from Google Search Console**, then authorise and select `launchlayer.uk`. This verifies the site and copies the sitemap without changing any code.
4. Bing needs a few days to show data. After that, export Search Performance monthly.

## 4. Search Console access for the student
GSC → **Settings → Users and permissions → Add user** → student email → **Restricted**. Do this for the `sc-domain:launchlayer.uk` property. Remove access at the end of the placement.

## 5. Enquiry form verification (needed before the placement)
1. **Inbox count:** how many genuine website form emails ("New Contact Form Submission - LaunchLayer") arrived from 27 Sep 2026 to today? Give the count only.
2. **Web3Forms dashboard** (if you have an account): the submission count for the same dates. Optional cross-check.
3. **Controlled test:** submit the contact form once with "TEST – measurement check" in the message. Within a few minutes, check that (a) the email arrived, (b) Umami → Events shows **contact-form-submit = 1** with the chosen service, and (c) the browser landed on the thank-you state. Write down the date and time of the test so it can be excluded from KPIs.

## 6. Phone enquiries
From the workshop phone's call log, give a **weekly count of inbound calls from new numbers** since 27 Sep 2026, if that's practical. Counts only. From now on, log calls in the enquiry log instead.

## 7. GBP website link UTM (owner decision)
In GBP → **Edit profile → Contact → Website**, change the link to:
`https://launchlayer.uk/?utm_source=google&utm_medium=organic&utm_campaign=gbp-listing`
Write down the date of the change, because GBP website clicks will move from "direct" to tagged from that date. Also tag any GBP "Appointment" link with `utm_campaign=gbp-appointment`.

## 8. Umami
The share dashboard (read-only) is enough for reporting. Optional: if the owner account offers bot filtering or IP exclusion, enable it, and write down the date because figures will drop.
