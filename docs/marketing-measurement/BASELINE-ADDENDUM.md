# Baseline addendum

The 9 Oct 2026 baseline (BASELINE-2026-10-09.md, BASELINE-DATA.csv) is immutable. Add corrections and additions here as dated entries. Never rewrite an earlier entry; add a new one.

Format: `YYYY-MM-DD | section/metric | type (correction / addition / clarification) | text | source | author`

- 2026-10-09 | Umami traffic tiers | addition | Tier definitions added (BOT-FILTERING.md). Tier C "likely human" for 27 Sep–8 Oct: 38 visitors / 52 visits / 87 views / 6 events; 2–8 Oct: 27 / 39 / 67 / 5. Filtered view, not verified human. | Umami share API via tools/umami_tiers.py | audit agent
- 2026-10-09 | §3.3 call-click "footer" | clarification | All 3 "footer" call-clicks came from the floating call button; label being renamed to `floating` in the tracking PR (change date to be logged). One all-time call-click came from install-day QA (Flower Mound, 27 Sep 21:50 BST). | repo + Umami sessions | audit agent
