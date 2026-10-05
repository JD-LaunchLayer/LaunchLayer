#!/usr/bin/env python3
"""Check the /services/ pinned layout against the pre-change fixtures.

No network and no git. Reads:
  scripts/fixtures/services-index-main.html
  scripts/fixtures/wickford-virus-removal-main.html
  services/index.html
  wickford-virus-removal/index.html
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_SERVICES = ROOT / "scripts" / "fixtures" / "services-index-main.html"
FIXTURE_VIRUS = ROOT / "scripts" / "fixtures" / "wickford-virus-removal-main.html"
SERVICES = ROOT / "services" / "index.html"
VIRUS = ROOT / "wickford-virus-removal" / "index.html"

# Pinned card name -> directory data-service-id -> OfferCatalog name (None if live had no offer).
CARDS = [
    ("PC & Laptop Diagnostics", "diagnostics", "PC & Laptop Diagnostics"),
    ("Laptop Screen Replacement", "screen", "Laptop Screen Replacement"),
    ("Laptop Repair", "laptop-hub", None),
    ("PC Repair", "pc-hub", None),
    ("Laptop Battery Replacement", "battery", "Laptop Battery Replacement"),
    ("MacBook & iMac Repairs", "macbook", "Apple MacBook & iMac Repairs"),
    ("50-Point Full System MOT", "mot", "50-Point Full System MOT"),
    ("Virus, Malware & Scam Removal", "virus", "Virus, Malware & Scam Removal"),
]

BANNED = ("90-day", "90 day", "Express", "24h", "24 hour", "★")


def fail(msg: str) -> None:
    print(f"FAIL  {msg}")
    raise SystemExit(1)


def ok(msg: str) -> None:
    print(f"OK    {msg}")


def note(msg: str) -> None:
    print(f"NOTE  {msg}")


def ld_blocks(html: str) -> list[str]:
    return re.findall(
        r'<script type="application/ld\+json">.*?</script>',
        html,
        flags=re.S,
    )


def head(html: str) -> str:
    return html.split("</head>", 1)[0]


def meta_name(html: str, name: str) -> str:
    match = re.search(
        rf'<meta name="{re.escape(name)}" content="([^"]*)"',
        head(html),
    )
    return match.group(1) if match else ""


def meta_prop(html: str, prop: str) -> str:
    match = re.search(
        rf'<meta property="{re.escape(prop)}" content="([^"]*)"',
        head(html),
    )
    return match.group(1) if match else ""


def title_of(html: str) -> str:
    match = re.search(r"<title>(.*?)</title>", head(html), re.S)
    return match.group(1) if match else ""


def canonical(html: str) -> str:
    match = re.search(r'<link rel="canonical" href="([^"]*)"', head(html))
    return match.group(1) if match else ""


def unescape(text: str) -> str:
    return (
        text.replace("&amp;", "&")
        .replace("&#39;", "'")
        .replace("&quot;", '"')
        .replace("\u2019", "'")
        .replace("\u00a0", " ")
        .strip()
    )


def norm_href(href: str) -> str:
    if href.startswith("tel:") or href.startswith("http"):
        return href
    path = href.split("#", 1)[0].split("?", 1)[0]
    if path != "/" and not path.endswith("/"):
        path += "/"
    return path


def price_number(text: str) -> int | None:
    if re.search(r"\bFREE\b", text, re.I) and "£" not in text:
        return 0
    match = re.search(r"£\s*(\d+)", text)
    return int(match.group(1)) if match else None


def main_html(html: str) -> str:
    match = re.search(r"<main\b.*?</main>", html, re.S)
    if not match:
        fail("no <main> on services page")
    return match.group(0)


def directory_rows(html: str) -> dict[str, tuple[str, str, str]]:
    """id -> (name, price text, normalised href) from the price list only."""
    body = main_html(html)
    found: dict[str, tuple[str, str, str]] = {}
    for match in re.finditer(
        r'<a class="row" href="([^"]+)" data-service-id="([^"]+)">'
        r'<span class="row-title">(.*?)</span>'
        r'<span class="row-price">(.*?)</span>',
        body,
    ):
        href, sid, name, price = match.groups()
        found[sid] = (unescape(name), unescape(price), norm_href(href))
    custom = re.search(
        r'<a class="acc-link" href="([^"]+)" data-service-id="([^"]+)">'
        r'\s*<h3 class="acc-h">(.*?)</h3>\s*'
        r'<span class="acc-link-price">(.*?)</span>',
        body,
        re.S,
    )
    if not custom:
        fail("custom PC row missing")
    href, sid, name, price = custom.groups()
    found[sid] = (unescape(name), unescape(price), norm_href(href))
    return found


def old_directory(html: str) -> dict[str, tuple[str, str, str]]:
    """Live list rows plus the three photo cards that were not in the list."""
    found: dict[str, tuple[str, str, str]] = {}
    for match in re.finditer(
        r'<a class="service-list-row" href="([^"]*)" data-service-id="([^"]*)">\s*'
        r'<span class="service-list-title">(.*?)</span>\s*'
        r'<span class="service-list-price">(.*?)</span>',
        html,
    ):
        href, sid, name, price = match.groups()
        found[sid] = (unescape(name), unescape(price), norm_href(href))
    # Photo cards: take the badge and the h3 inside each card anchor.
    for match in re.finditer(
        r'<a class="service-card[^"]*" href="([^"]*)" data-service-id="([^"]*)">(.*?)</a>',
        html,
        re.S,
    ):
        href, sid, inner = match.groups()
        badge = re.search(r'class="service-price-badge">(.*?)</span>', inner)
        heading = re.search(r"<h[23]>(.*?)</h[23]>", inner)
        if not badge or not heading:
            fail(f"photo card {sid} has no price or title")
        found[sid] = (unescape(heading.group(1)), unescape(badge.group(1)), norm_href(href))
    return found


def pin_cards(html: str) -> dict[str, tuple[str, str, str]]:
    body = main_html(html)
    found: dict[str, tuple[str, str, str]] = {}
    for match in re.finditer(
        r'<a class="pin[^"]*" href="([^"]+)" data-service-id="([^"]+)">(.*?)</a>',
        body,
        re.S,
    ):
        href, sid, inner = match.groups()
        heading = re.search(r'class="pin-title">(.*?)</h3>', inner)
        price = re.search(r'class="pin-price">(.*?)</p>', inner, re.S)
        if not heading or not price:
            fail(f"pin {sid} missing title or price")
        price_text = unescape(re.sub(r"<[^>]+>", " ", price.group(1)))
        price_text = re.sub(r"\s+", " ", price_text).strip()
        found[sid] = (unescape(heading.group(1)), price_text, norm_href(href))
    return found


def offers(html: str) -> dict[str, str]:
    blocks = ld_blocks(html)
    if len(blocks) != 1:
        fail(f"expected 1 JSON-LD block, found {len(blocks)}")
    raw = re.sub(r"^<script[^>]*>|</script>$", "", blocks[0]).strip()
    data = json.loads(raw)
    found: dict[str, str] = {}
    for node in data.get("@graph", []):
        if node.get("@type") != "OfferCatalog":
            continue
        for item in node.get("itemListElement", []):
            name = item["itemOffered"]["name"]
            if "price" in item:
                found[name] = str(item["price"])
            else:
                found[name] = str(item["priceSpecification"]["minPrice"])
    return found


def service_ids(html: str) -> set[str]:
    return set(re.findall(r'data-service-id="([^"]+)"', html))


def call_clicks(html: str) -> set[str]:
    return set(re.findall(r'data-umami-event="call-click"[^>]*>', html))


def main() -> None:
    for path in (FIXTURE_SERVICES, FIXTURE_VIRUS, SERVICES, VIRUS):
        if not path.is_file():
            fail(f"missing {path.relative_to(ROOT)}")

    old_services = FIXTURE_SERVICES.read_text(encoding="utf-8")
    new_services = SERVICES.read_text(encoding="utf-8")
    old_virus = FIXTURE_VIRUS.read_text(encoding="utf-8")
    new_virus = VIRUS.read_text(encoding="utf-8")

    if ld_blocks(old_services) != ld_blocks(new_services):
        fail("services JSON-LD is not byte-for-byte identical to the fixture")
    ok("services WebPage + OfferCatalog JSON-LD identical to main fixture")

    for label, getter in (
        ("title", title_of),
        ("description", lambda h: meta_name(h, "description")),
        ("robots", lambda h: meta_name(h, "robots")),
        ("canonical", canonical),
        ("og:title", lambda h: meta_prop(h, "og:title")),
        ("og:description", lambda h: meta_prop(h, "og:description")),
        ("og:url", lambda h: meta_prop(h, "og:url")),
        ("og:image", lambda h: meta_prop(h, "og:image")),
        ("twitter:card", lambda h: meta_name(h, "twitter:card")),
        ("twitter:title", lambda h: meta_name(h, "twitter:title")),
        ("twitter:description", lambda h: meta_name(h, "twitter:description")),
        ("twitter:image", lambda h: meta_name(h, "twitter:image")),
    ):
        if getter(old_services) != getter(new_services):
            fail(f"head {label} changed")
    ok("title, description, robots, canonical, OG and Twitter unchanged")

    old_rows = old_directory(old_services)
    new_rows = directory_rows(new_services)
    if set(old_rows) != set(new_rows):
        fail(f"directory ids differ: missing {sorted(set(old_rows) - set(new_rows))} extra {sorted(set(new_rows) - set(old_rows))}")
    moved = []
    for sid, old in old_rows.items():
        new = new_rows[sid]
        if old[0] != new[0] or old[1] != new[1] or old[2] != new[2]:
            # Allow only trailing-slash normalisation, already applied.
            fail(f"directory row {sid} changed: {old} -> {new}")
        if sid in {"screen", "virus", "custom-pc"}:
            moved.append(sid)
    ok(f"directory matches live names, prices and links ({len(new_rows)} services)")
    note("photo cards moved into the directory: " + ", ".join(moved))

    pins = pin_cards(new_services)
    if len(pins) != 8:
        fail(f"expected 8 pinned cards, found {len(pins)}")
    catalog = offers(new_services)
    for card_name, sid, offer_name in CARDS:
        if sid not in pins:
            fail(f"missing pin {sid}")
        pin_name, pin_price, pin_href = pins[sid]
        row_name, row_price, row_href = new_rows[sid]
        if pin_name != card_name:
            fail(f"pin {sid} name {pin_name!r} != {card_name!r}")
        if price_number(pin_price) != price_number(row_price):
            fail(f"pin {sid} price {pin_price!r} != directory {row_price!r}")
        if pin_href != row_href:
            fail(f"pin {sid} href {pin_href} != directory {row_href}")
        if offer_name is None:
            if any(sid in name.lower() for name in ()):
                pass
            note(f"{card_name}: no OfferCatalog offer on the live page; price matches directory {row_name} ({row_price})")
            continue
        offer_price = catalog.get(offer_name)
        if offer_price is None:
            fail(f"missing offer {offer_name}")
        if int(float(offer_price)) != price_number(pin_price):
            fail(f"pin {card_name} £{price_number(pin_price)} != offer {offer_name} {offer_price}")
    ok("8 card prices match their directory row and OfferCatalog offer")

    visible = main_html(new_services)
    for name, amount in catalog.items():
        if name not in visible and name not in unescape(visible):
            fail(f"offer name not visible: {name}")
        number = int(float(amount))
        if number == 0:
            if name == "Home visit":
                if "£49" not in visible or "free" not in visible.lower():
                    fail("Home visit price text missing")
            elif "FREE" not in visible and "free" not in visible.lower():
                fail(f"free price not visible for {name}")
        elif f"£{number}" not in visible:
            fail(f"£{number} not visible for {name}")
    ok("every OfferCatalog name and price has visible text")

    details = re.findall(r"<details\b([^>]*)>", visible)
    if len(details) != 4:
        fail(f"expected 4 details groups, found {len(details)}")
    if any(re.search(r"\bopen\b", attrs) for attrs in details):
        fail("a details group is open in the HTML")
    ok("4 details groups, all closed in the HTML")

    if "display:none" in visible.lower() or "display: none" in visible.lower():
        fail("display:none in services main HTML")
    if re.search(r"<script\b", visible):
        fail("script inside main")
    row_links = re.findall(r'<a class="(?:row|acc-link)" href="([^"]+)"', visible)
    if len(row_links) != 27:
        fail(f"expected 27 directory links, found {len(row_links)}")
    ok("27 directory links are <a href> in the raw HTML")

    if service_ids(old_services) != service_ids(new_services):
        fail("data-service-id set changed")
    ok(f"data-service-id set unchanged ({len(service_ids(new_services))} ids)")

    if call_clicks(old_services) != call_clicks(new_services):
        fail(f"call-click attrs changed: {call_clicks(new_services)}")
    ok("Umami call-click attributes unchanged")

    visible_page = main_html(new_services)
    for token in BANNED:
        if token in visible_page:
            fail(f"banned string in services main: {token}")
        if token in new_services and token not in old_services:
            fail(f"banned string added outside main: {token}")
        if token in new_services and token in old_services:
            note(f"{token!r} still occurs outside the new main, and it was already in the live page")
    if re.search(r"reviewCount|Google reviews", new_services):
        fail("review-count string in services/index.html")
    if "24-hour" in new_services:
        note("catalog JSON still says '24-hour stability testing'; that sentence is not shown on the page")
    ok("no new 90-day, Express, 24h, 24 hour, star, or review-count copy")

    if "llsvc-search" in new_services or "Describe what’s wrong" in new_services or "Describe what's wrong" in new_services:
        fail("search box still present")
    if 'id="llsvc-catalog"' not in new_services:
        fail("catalog JSON removed, but scripts/seo_canonical_schema_migrate.py still reads it")
    ok("search UI removed; #llsvc-catalog kept because the schema migrate script reads it")

    if ld_blocks(old_virus) != ld_blocks(new_virus):
        fail("virus page JSON-LD changed")
    old_lines = old_virus.splitlines()
    new_lines = new_virus.splitlines()
    added = [line for line in new_lines if line not in old_lines]
    removed = [line for line in old_lines if line not in new_lines]
    if removed:
        fail(f"virus page removed lines: {removed}")
    price_line = "    <p>Virus, malware &amp; scam removal: £69 fixed price. Diagnostics are free; No-Fix-No-Fee.</p>"
    if added != [price_line]:
        fail(f"virus page diff is not only the £69 line: {added}")
    ok("virus page adds only the £69 line; JSON-LD unchanged")

    print("PASS  services pinned layout check")


if __name__ == "__main__":
    main()
