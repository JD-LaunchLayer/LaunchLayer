#!/usr/bin/env python3
"""Reproducible Umami traffic tiers for launchlayer.uk (read-only, public share link).

Usage: python3 umami_tiers.py 2026-10-02 2026-10-08
Prints aggregate counts only. The share token is held in memory and is never printed or saved.
Tiers:
  A  all recorded            (everything Umami stored)
  B  UK-only view            (country == GB)                -- filtered view, NOT verified humans
  C  likely-human view       (rules below)                  -- filtered view, NOT verified humans
Tier C excludes a session if ANY rule matches (checked in order):
  R1 headless_screen  screen in HEADLESS (sizes seen only in automated clusters, never in GB)
  R2 datacentre_city  city in DC (cloud-region cities: AWS/GCP/Azure/Hetzner)
  R3 install_qa       first seen 27 Sep 2026 21:35-23:59 BST and country != GB (post-deploy QA)
  R4 nonGB_single_hit country != GB AND 1 view AND 0 events AND 0 s duration
GB sessions are only excluded by R1-R3, so a UK visitor who bounces is kept.
"""
import json, sys, urllib.request, urllib.parse, datetime as dt, collections as C
from zoneinfo import ZoneInfo
BASE = "https://cloud.umami.is/analytics/eu/api"
SHARE = "hNUgoQwtWrnkFheQ"
WID = "13fbd69e-1f5b-4c12-b4b3-0b859486451a"
LON = ZoneInfo("Europe/London")
HEADLESS = {"1280x1200", "1366x1366", "800x600", "1600x1600", "2000x2000", "1024x1024", "1600x1200"}
DC = {"Ashburn", "Boardman", "Council Bluffs", "Prineville", "San Jose", "Falkenstein", "Nuremberg",
      "Frankfurt am Main", "Boydton", "Dulles", "The Dalles", "Santa Clara"}
QA_START = dt.datetime(2026, 9, 27, 21, 35, tzinfo=LON); QA_END = dt.datetime(2026, 9, 27, 23, 59, 59, tzinfo=LON)

def get(url, h):
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=30) as f:
        return json.loads(f.read())

def ts(x): return dt.datetime.fromisoformat(x.replace("Z", "+00:00")).astimezone(LON)

def rule(s):
    d = (ts(s["lastAt"]) - ts(s["firstAt"])).total_seconds()
    if s["screen"] in HEADLESS: return "R1_headless_screen"
    if s["city"] in DC: return "R2_datacentre_city"
    if s["country"] != "GB" and QA_START <= ts(s["firstAt"]) <= QA_END: return "R3_install_qa"
    if s["country"] != "GB" and s["views"] <= 1 and s["events"] == 0 and d == 0: return "R4_nonGB_single_hit"
    return "keep"

def main(a, b):
    h = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    tok = get(f"{BASE}/share/{SHARE}", h)["token"]
    h.update({"x-umami-share-token": tok, "x-umami-share-context": "1"})
    start = dt.datetime.fromisoformat(a).replace(tzinfo=LON)
    end = dt.datetime.fromisoformat(b).replace(hour=23, minute=59, second=59, tzinfo=LON)
    rows, page = [], 1
    while True:
        q = urllib.parse.urlencode({"startAt": int(start.timestamp()*1000), "endAt": int(end.timestamp()*1000), "pageSize": 500, "page": page})
        d = get(f"{BASE}/websites/{WID}/sessions?{q}", h); rows += d["data"]
        if len(d["data"]) < 500: break
        page += 1
    # sessions endpoint returns sessions active in range; keep those first seen in range
    rows = [s for s in rows if start <= ts(s["firstAt"]) <= end]
    agg = lambda X: dict(visitors=len(X), visits=sum(s["visits"] for s in X), views=sum(s["views"] for s in X), events=sum(s["events"] for s in X))
    out = {"range": f"{a}..{b} Europe/London (sessions by first-seen time)",
           "A_all_recorded": agg(rows),
           "B_uk_only_filtered": agg([s for s in rows if s["country"] == "GB"]),
           "C_likely_human_filtered": agg([s for s in rows if rule(s) == "keep"]),
           "exclusions": dict(C.Counter(rule(s) for s in rows))}
    print(json.dumps(out, indent=1))

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
