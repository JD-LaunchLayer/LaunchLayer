#!/usr/bin/env python3
"""Rebuild service + local SEO pages to LaunchLayer glass standard.

Preserves wording, meta, and JSON-LD. Applies MOT-style floaty hero for former
sticky-sidebar pages, and a compact centered glass hero for pages that never
had a floaty banner.
"""

from __future__ import annotations

import html as html_lib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path("/workspace")
HEADER = Path("/tmp/ll-chrome-header.html").read_text()
FOOTER = Path("/tmp/ll-chrome-footer.html").read_text()

CHECK_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">'
    '<polyline points="20 6 9 17 4 12"/></svg>'
)

# Hero images chosen for relevance — see IMAGE_CHECKLIST at bottom of run.
HERO_BY_SLUG: dict[str, tuple[str, str]] = {
    "laptop-mot-wickford-essex": (
        "/assets/images/image-4307083f.png",
        "LaunchLayer Wickford workshop bench ready for a laptop MOT",
    ),
    "laptop-mot-wickford": (
        "/assets/images/image-4307083f.png",
        "LaunchLayer Wickford workshop bench ready for a laptop MOT",
    ),
    "wickford-laptop-repair": (
        "/assets/images/image-d26fc546.png",
        "Wickford in Bloom — LaunchLayer’s home town",
    ),
    "wickford-pc-repair": (
        "/assets/images/towns/wickford-town.jpg",
        "Wickford — local PC repair from our Glebe Road workshop",
    ),
    "liquid-damage-repair-wickford": (
        "/assets/images/image-5e7c1f44.jpg",
        "Water splash on wood — liquid spill damage to electronics",
    ),
    "data-recovery": (
        "/assets/images/image-ce1e457a.jpg",
        "Open hard drive platter and read head — data recovery",
    ),
    "custom-pc-builds": (
        "/assets/images/image-ddefba94.jpg",
        "Custom gaming PC with Radeon GPU and RGB liquid cooling",
    ),
    "eco-recycling": (
        "/assets/images/image-eco-donate-hero.jpg",
        "Laptop donation for children — LaunchLayer recycling partnership",
    ),
    "wickford-virus-removal": (
        "/assets/images/image-9258d33d.jpg",
        "Laptop showing malware warning — virus and scam recovery",
    ),
    "laptop-screen-repair-wickford": (
        "/assets/images/image-36da4d28.jpg",
        "Laptop screen during system update — display and software repair",
    ),
    "macbook-repair": (
        "/assets/images/image-c27f7c59.jpg",
        "Open MacBook Pro showing fan, logic board and battery",
    ),
    "macbook-repair-wickford": (
        "/assets/images/image-69f0c879.jpg",
        "Silver MacBook on desk — Wickford MacBook repair",
    ),
    "basildon-pc-repair": (
        "/assets/images/towns/basildon-town.jpg",
        "Basildon town square — local PC & laptop repair coverage",
    ),
    "billericay-pc-repair": (
        "/assets/images/towns/billericay-town.jpg",
        "Billericay High Street — local PC & laptop repair coverage",
    ),
    "brentwood-pc-repair": (
        "/assets/images/towns/brentwood-town.jpg",
        "Brentwood High Street — local PC & laptop repair coverage",
    ),
    "chelmsford-pc-repair": (
        "/assets/images/towns/chelmsford-town.jpg",
        "Chelmsford High Street — local PC & laptop repair coverage",
    ),
    "southend-pc-repair": (
        "/assets/images/towns/southend-town.jpg",
        "Southend High Street — local PC & laptop repair coverage",
    ),
    "rayleigh-laptop-service": (
        "/assets/images/towns/rayleigh-town.jpg",
        "Rayleigh High Street — local laptop service coverage",
    ),
    "macbook-repair-basildon": (
        "/assets/images/image-c27f7c59.jpg",
        "Open MacBook Pro internals — Basildon MacBook repair",
    ),
    "macbook-repair-billericay": (
        "/assets/images/image-69f0c879.jpg",
        "MacBook on desk — Billericay MacBook repair",
    ),
    "macbook-repair-brentwood": (
        "/assets/images/image-be974ff5.jpg",
        "Frustrated MacBook user — Brentwood MacBook repair",
    ),
    "macbook-repair-chelmsford": (
        "/assets/images/image-c27f7c59.jpg",
        "Open MacBook Pro logic board — Chelmsford MacBook repair",
    ),
    "macbook-repair-rayleigh": (
        "/assets/images/image-69f0c879.jpg",
        "Silver MacBook — Rayleigh MacBook repair",
    ),
    "macbook-repair-southend": (
        "/assets/images/image-be974ff5.jpg",
        "MacBook trouble — Southend MacBook repair",
    ),
    "liquid-damage-repair-basildon": (
        "/assets/images/image-5e7c1f44.jpg",
        "Water droplet splash — liquid damage repair Basildon",
    ),
    "liquid-damage-repair-billericay": (
        "/assets/images/image-a07b70ec.webp",
        "Open laptop on the bench after a spill — Billericay",
    ),
    "liquid-damage-repair-brentwood": (
        "/assets/images/image-b673a9d4.jpg",
        "Bench work on laptop battery and internals after liquid damage",
    ),
    "liquid-damage-repair-chelmsford": (
        "/assets/images/image-5e7c1f44.jpg",
        "Water splash — liquid damage laptop repair Chelmsford",
    ),
    "liquid-damage-repair-rayleigh": (
        "/assets/images/image-a07b70ec.webp",
        "Technician opening a laptop after liquid spill — Rayleigh",
    ),
    "liquid-damage-repair-southend": (
        "/assets/images/image-b673a9d4.jpg",
        "Hardware recovery after liquid damage — Southend",
    ),
    "screen-repair-brentwood": (
        "/assets/images/image-36da4d28.jpg",
        "Laptop display during use — Brentwood screen repair",
    ),
    "screen-repair-chelmsford": (
        "/assets/images/image-bdd8886f.jpg",
        "Laptop screen and keyboard close-up — Chelmsford screen repair",
    ),
    "screen-repair-rayleigh": (
        "/assets/images/image-de2f0024.jpg",
        "Open laptop on desk — Rayleigh screen repair",
    ),
    "screen-repair-southend": (
        "/assets/images/image-5043df46.jpg",
        "Active laptop display — Southend screen repair",
    ),
}

FLOATY_SLUGS = {
    "laptop-mot-wickford-essex",
    "laptop-mot-wickford",
    "wickford-laptop-repair",
    "wickford-pc-repair",
    "liquid-damage-repair-wickford",
    "data-recovery",
    "custom-pc-builds",
    "eco-recycling",
    "basildon-pc-repair",
    "billericay-pc-repair",
    "brentwood-pc-repair",
    "chelmsford-pc-repair",
    "southend-pc-repair",
    "rayleigh-laptop-service",
}

COMPACT_SLUGS = {
    "macbook-repair",
    "macbook-repair-wickford",
    "macbook-repair-basildon",
    "macbook-repair-billericay",
    "macbook-repair-brentwood",
    "macbook-repair-chelmsford",
    "macbook-repair-rayleigh",
    "macbook-repair-southend",
    "laptop-screen-repair-wickford",
    "wickford-virus-removal",
    "screen-repair-brentwood",
    "screen-repair-chelmsford",
    "screen-repair-rayleigh",
    "screen-repair-southend",
    "liquid-damage-repair-basildon",
    "liquid-damage-repair-billericay",
    "liquid-damage-repair-brentwood",
    "liquid-damage-repair-chelmsford",
    "liquid-damage-repair-rayleigh",
    "liquid-damage-repair-southend",
}

ALL_SLUGS = sorted(FLOATY_SLUGS | COMPACT_SLUGS)


@dataclass
class Card:
    title: str
    body_html: str
    price: str | None = None
    icon_svg: str | None = None
    wide: bool = False


@dataclass
class Section:
    title: str
    cards: list[Card] = field(default_factory=list)
    html_blocks: list[str] = field(default_factory=list)
    intro_html: str | None = None


@dataclass
class Faq:
    question: str
    answer_html: str


@dataclass
class Related:
    href: str
    title: str
    blurb: str
    cta: str = "Learn more →"


@dataclass
class Booking:
    tag: str = "Diagnostics & Collection"
    amount: str = "FREE"
    features: list[str] = field(default_factory=list)
    primary_href: str = "/contact"
    primary_label: str = "Book free collection"
    secondary_href: str = "tel:07367652987"
    secondary_label: str = "Call 07367 652987"


@dataclass
class PageData:
    slug: str
    layout: str  # floaty | compact
    title: str
    description: str
    canonical: str
    og_title: str
    og_description: str
    og_image: str
    twitter_image: str
    robots: str
    eyebrow: str
    h1_html: str
    lead_html: str
    trust: list[str]
    sections: list[Section]
    faqs: list[Faq]
    related: list[Related]
    booking: Booking
    json_ld: list[str]
    extra_head: str = ""
    cta_title: str = ""
    cta_lead: str = ""
    story_blocks: list[str] = field(default_factory=list)
    price_inline: tuple[str, str] | None = None  # amount, note


def clean_text(s: str) -> str:
    s = re.sub(r"\s+", " ", s or "").strip()
    return s


def inner_html(el: Tag | None) -> str:
    if el is None:
        return ""
    return "".join(str(c) for c in el.contents).strip()


def rewrite_accent_spans(html: str) -> str:
    # Map any *-accent class spans to llsg-accent
    return re.sub(
        r'class="[^"]*-accent"',
        'class="llsg-accent"',
        html,
    )


def find_page_root(soup: BeautifulSoup) -> tuple[Tag | None, str | None]:
    for el in soup.find_all(True):
        classes = el.get("class") or []
        for c in classes:
            if re.fullmatch(r"ll[a-z0-9]+-page", c):
                return el, c.replace("-page", "")
    return None, None


def extract_meta(soup: BeautifulSoup, slug: str) -> dict[str, str]:
    def meta_content(attrs: dict[str, str]) -> str:
        tag = soup.find("meta", attrs=attrs)
        return (tag.get("content") or "").strip() if tag else ""

    title = ""
    if soup.title and soup.title.string:
        title = clean_text(soup.title.string)
    # Prefer the later custom title if duplicate Squarespace titles exist
    titles = soup.find_all("title")
    if titles:
        title = clean_text(titles[-1].get_text())

    descriptions = soup.find_all("meta", attrs={"name": "description"})
    description = descriptions[-1].get("content", "").strip() if descriptions else ""

    canonical = ""
    links = soup.find_all("link", rel=lambda v: v and "canonical" in v)
    if links:
        canonical = links[-1].get("href", "").strip()
    if not canonical:
        canonical = f"https://www.launchlayer.uk/{slug}"

    og_titles = soup.find_all("meta", property="og:title")
    og_descs = soup.find_all("meta", property="og:description")
    og_images = soup.find_all("meta", property="og:image")
    tw_images = soup.find_all("meta", attrs={"name": "twitter:image"})

    og_image = og_images[-1].get("content", "").strip() if og_images else "/assets/meta/meta-520e4abe.png"
    # Strip Squarespace format query noise for cleaner paths but keep if only form
    twitter_image = tw_images[-1].get("content", "").strip() if tw_images else og_image

    robots_tags = soup.find_all("meta", attrs={"name": "robots"})
    robots = robots_tags[-1].get("content", "index, follow").strip() if robots_tags else "index, follow"

    return {
        "title": title or f"LaunchLayer — {slug}",
        "description": description,
        "canonical": canonical.split("?")[0],
        "og_title": og_titles[-1].get("content", "").strip() if og_titles else title,
        "og_description": og_descs[-1].get("content", "").strip() if og_descs else description,
        "og_image": og_image,
        "twitter_image": twitter_image,
        "robots": robots,
    }


def extract_json_ld(soup: BeautifulSoup, root: Tag | None) -> list[str]:
    scripts = []
    for s in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = s.string or s.get_text() or ""
        raw = raw.strip()
        if raw:
            scripts.append(raw)
    return scripts


def extract_trust(root: Tag, prefix: str) -> list[str]:
    facts = []
    for sel in [
        f".{prefix}-fact",
        ".llbrand-fact",
        f".{prefix}-facts span",
    ]:
        for el in root.select(sel):
            # skip nested svg-only
            txt = clean_text(el.get_text(" ", strip=True))
            if txt and len(txt) < 80:
                facts.append(txt)
        if facts:
            break
    # dedupe preserve order
    seen = set()
    out = []
    for f in facts:
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out[:6]


def extract_booking(root: Tag) -> Booking:
    b = Booking()
    tag = root.select_one(".llbrand-price-tag")
    amt = root.select_one(".llbrand-price-amount")
    if tag:
        b.tag = clean_text(tag.get_text())
    if amt:
        b.amount = clean_text(amt.get_text())
    for li in root.select(".llbrand-features li"):
        txt = clean_text(li.get_text(" ", strip=True))
        if txt:
            b.features.append(txt)
    primary = root.select_one(".llbrand-btn-primary")
    secondary = root.select_one(".llbrand-btn-secondary")
    if primary:
        b.primary_href = primary.get("href") or "/contact"
        b.primary_label = clean_text(primary.get_text())
    if secondary:
        b.secondary_href = secondary.get("href") or "tel:07367652987"
        b.secondary_label = clean_text(secondary.get_text())
    if not b.features:
        b.features = [
            "Free local collection & return",
            "No-Fix, No-Fee guarantee",
            "Clear fixed quotes upfront",
        ]
    return b


def extract_cards_from_container(container: Tag, prefix: str) -> list[Card]:
    cards: list[Card] = []
    card_els = container.select(
        f".{prefix}-card, .llbrand-card, .{prefix}-tier-card, .llbrand-tier-card"
    )
    for cel in card_els:
        # skip FAQ cards mistaken
        parent_cls = " ".join((cel.parent.get("class") if cel.parent else []) or [])
        own = " ".join(cel.get("class") or [])
        if "faq" in own or "faq" in parent_cls:
            # still allow if it's a service card inside faq zone that is actually related
            if "faq-card" in own or "faq-card" in parent_cls:
                continue
        h3 = cel.find(["h3", "h4"])
        # tier cards use different structure
        title = clean_text(h3.get_text(" ", strip=True)) if h3 else ""
        if not title:
            tag = cel.select_one(f".{prefix}-tier-tag, .llbrand-tier-tag, strong")
            title = clean_text(tag.get_text()) if tag else ""
        ps = cel.find_all("p")
        body = ""
        if ps:
            body = "<br>".join(inner_html(p) for p in ps)
        elif not title:
            continue
        else:
            # grab text after heading
            body = clean_text(cel.get_text(" ", strip=True).replace(title, "", 1))
            body = html_lib.escape(body)
        price_el = cel.select_one(
            f".{prefix}-card-price, .llbrand-card-price, .{prefix}-tier-price, .llbrand-tier-price"
        )
        price = clean_text(price_el.get_text()) if price_el else None
        icon = None
        if h3 and h3.find("svg"):
            icon = str(h3.find("svg"))
            # strip icon text duplication already in title
            title = clean_text(h3.get_text(" ", strip=True))
        style = cel.get("style") or ""
        wide = "grid-column" in style
        if title or body:
            cards.append(Card(title=title or "Details", body_html=body, price=price, icon_svg=icon, wide=wide))
    return cards


def extract_faqs(root: Tag, prefix: str) -> list[Faq]:
    faqs: list[Faq] = []
    # details accordion style
    for det in root.select(f"details.{prefix}-faq-item, details"):
        if "faq" not in " ".join(det.get("class") or []) and prefix not in " ".join(det.get("class") or []):
            # only take details that look like FAQs
            summ = det.find("summary")
            if not summ:
                continue
        summ = det.find("summary")
        if not summ:
            continue
        q = clean_text(summ.get_text(" ", strip=True))
        # answer
        ans_el = det.select_one(f".{prefix}-answer, .llmbw-answer") or det
        # remove summary from answer clone
        parts = []
        for child in det.children:
            if getattr(child, "name", None) == "summary":
                continue
            if isinstance(child, NavigableString):
                continue
            if getattr(child, "name", None) == "p":
                parts.append(inner_html(child) or child.get_text())
            else:
                for p in child.find_all("p"):
                    parts.append(inner_html(p) or p.get_text())
        ans = "<br>".join(parts) if parts else ""
        if not ans:
            # fallback full text minus question
            ans = html_lib.escape(clean_text(det.get_text(" ", strip=True).replace(q, "", 1)))
        if q and ans:
            faqs.append(Faq(q, ans))

    # card-style FAQs
    for zone in root.select(f".{prefix}-faq-zone, .llbrand-faq-zone, .{prefix}-faq-section"):
        label = zone.select_one("h2")
        label_txt = clean_text(label.get_text()) if label else ""
        if label_txt and not any(
            k in label_txt.lower() for k in ["faq", "question", "frequently"]
        ):
            # related block, not FAQ — skip for FAQ extraction
            continue
        for card in zone.select(f".{prefix}-faq-card, .llbrand-faq-card"):
            h = card.find(["h3", "h4"])
            p = card.find("p")
            if h and p:
                faqs.append(Faq(clean_text(h.get_text()), inner_html(p) or html_lib.escape(p.get_text())))

    # dedupe
    seen = set()
    out = []
    for f in faqs:
        key = f.question.lower()
        if key not in seen:
            seen.add(key)
            out.append(f)
    return out


def extract_related(root: Tag, prefix: str) -> list[Related]:
    related: list[Related] = []
    # cross-link FAQ-looking cards that aren't FAQs
    for zone in root.select(f".{prefix}-faq-zone, .llbrand-faq-zone"):
        label = zone.select_one("h2")
        label_txt = clean_text(label.get_text()) if label else ""
        if not label_txt:
            continue
        if any(k in label_txt.lower() for k in ["faq", "question", "frequently"]):
            continue
        for card in zone.select(f".{prefix}-faq-card, .llbrand-faq-card"):
            h = card.find(["h3", "h4"])
            p = card.find("p")
            a = card.find("a")
            if not h:
                continue
            href = a.get("href") if a else "/services"
            title = clean_text(h.get_text())
            blurb = clean_text(p.get_text()) if p else ""
            related.append(Related(href=href, title=title, blurb=blurb))

    # explicit cross-links lists
    for a in root.select(
        f".{prefix}-cross-links a, .llbrand-cross-links a, .{prefix}-related a"
    ):
        href = a.get("href") or "#"
        title = clean_text(a.get_text())
        if title and href.startswith("/"):
            related.append(Related(href=href, title=title, blurb="Related LaunchLayer service"))

    # crosslink CTA blocks become related-ish — skip
    seen = set()
    out = []
    for r in related:
        key = (r.href, r.title.lower())
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out[:8]


def render_steps_from_process(container: Tag) -> str:
    cards = container.select(
        ".llbrand-process-card, [class*='process-card'], [class*='step-card']"
    )
    if not cards:
        return ""
    parts = ['<div class="llsg-steps">']
    for i, c in enumerate(cards, 1):
        num_el = c.select_one("[class*='step-num'], .llbrand-step-num")
        h = c.find(["h3", "h4", "strong"])
        p = c.find("p")
        num = clean_text(num_el.get_text()) if num_el else f"{i:02d}"
        title = clean_text(h.get_text()) if h else f"Step {i}"
        body = clean_text(p.get_text()) if p else ""
        parts.append(
            f'''<div class="llsg-step">
  <div class="llsg-step-num">Step {html_lib.escape(num)}</div>
  <h3>{html_lib.escape(title)}</h3>
  <p>{html_lib.escape(body)}</p>
</div>'''
        )
    parts.append("</div>")
    return "\n".join(parts)


def render_steps_from_list(ol: Tag) -> str:
    items = ol.find_all("li", recursive=False)
    if not items:
        return ""
    # Numbered emergency / process steps as glass steps when few; else bullets
    if 2 <= len(items) <= 6:
        parts = ['<div class="llsg-steps">']
        for i, li in enumerate(items, 1):
            text = clean_text(li.get_text(" ", strip=True))
            # Split first sentence as title if long
            if ". " in text and len(text) > 80:
                title, rest = text.split(". ", 1)
                title = title.strip(".")
                body = rest
            else:
                title = f"Step {i:02d}"
                body = text
            parts.append(
                f'''<div class="llsg-step">
  <div class="llsg-step-num">Step {i:02d}</div>
  <h3>{html_lib.escape(title)}</h3>
  <p>{html_lib.escape(body)}</p>
</div>'''
            )
        parts.append("</div>")
        return "\n".join(parts)
    bullets = []
    for li in items:
        bullets.append(f"<li>{CHECK_SVG}{html_lib.escape(clean_text(li.get_text()))}</li>")
    return f'<ul class="llsg-bullets">{"".join(bullets)}</ul>'


def extract_loose_h3_cards(container: Tag) -> list[Card]:
    """Pull h3+p pairs from unmarked wrapper divs (e.g. custom PC builds)."""
    cards: list[Card] = []
    for h3 in container.find_all("h3", recursive=True):
        title = clean_text(h3.get_text(" ", strip=True))
        if not title:
            continue
        icon = str(h3.find("svg")) if h3.find("svg") else None
        # next p sibling or following p in parent
        p = h3.find_next_sibling("p")
        if not p and h3.parent:
            p = h3.parent.find("p")
        body = inner_html(p) if p else ""
        price = None
        # price sometimes in a span after
        price_el = None
        if h3.parent:
            price_el = h3.parent.select_one("[class*='price']")
        if price_el:
            price = clean_text(price_el.get_text())
        cards.append(Card(title=title, body_html=body or "", price=price, icon_svg=icon))
    return cards


def consume_section_siblings(start: Tag, prefix: str) -> tuple[list[Card], list[str]]:
    cards: list[Card] = []
    blocks: list[str] = []
    sib = start.find_next_sibling()
    hops = 0
    while sib and isinstance(sib, Tag) and hops < 10:
        hops += 1
        sib_cls = " ".join(sib.get("class") or [])
        if sib.name == "script":
            break
        if "section-label" in sib_cls or sib.name == "h2":
            break
        if any(
            x in sib_cls
            for x in [
                "faq-zone",
                "faq-section",
                "faq-item",
                "cross-links",
                "crosslink",
                "sidebar",
                "cta-wrap",
                "cta",
                "partner",
                "story",
                "process-zone",
                "app-banner",
            ]
        ):
            break
        if sib.name == "details":
            break

        if "process-grid" in sib_cls or (
            "process" in sib_cls and ("grid" in sib_cls or "card" in sib_cls)
        ):
            steps = render_steps_from_process(sib)
            if steps:
                blocks.append(steps)
        elif "steps" in sib_cls and sib.name in {"ol", "ul", "div"}:
            if sib.name in {"ol", "ul"}:
                blocks.append(render_steps_from_list(sib))
            else:
                steps = render_steps_from_process(sib)
                blocks.append(steps or str(sib))
        elif sib.name in {"ol", "ul"}:
            blocks.append(render_steps_from_list(sib))
        elif "grid" in sib_cls or "tier" in sib_cls or "recovery" in sib_cls:
            extracted = extract_cards_from_container(sib, prefix)
            if extracted:
                cards.extend(extracted)
            else:
                cards.extend(extract_loose_h3_cards(sib))
        elif "body-text" in sib_cls or (
            sib.name == "p" and ("body" in sib_cls or "lead" not in sib_cls)
        ):
            blocks.append(f'<p class="llsg-section-intro">{inner_html(sib)}</p>')
        elif sib.name == "p":
            blocks.append(f"<p>{inner_html(sib)}</p>")
        elif sib.name == "div":
            # Unmarked content wrappers — try cards / steps / text
            if sib.select("[class*='process-card'], [class*='step-num']"):
                steps = render_steps_from_process(sib)
                if steps:
                    blocks.append(steps)
            elif sib.find("h3"):
                loose = extract_loose_h3_cards(sib)
                if loose:
                    cards.extend(loose)
            elif sib.find("p"):
                for p in sib.find_all("p", recursive=False):
                    blocks.append(f"<p>{inner_html(p)}</p>")
        sib = sib.find_next_sibling()
    return cards, blocks


def extract_sections(root: Tag, prefix: str) -> tuple[list[Section], list[str]]:
    """Walk main content and group by section labels / h2 in document order."""
    sections: list[Section] = []
    stories: list[str] = []

    # Prefer main column if present
    main = root.select_one(f".{prefix}-main, .llbrand-main") or root

    # Collect story / partner / app banners
    for story in main.select(
        f".{prefix}-story, .llbrand-story, .{prefix}-partner-banner, .llbrand-partner-banner, "
        f".{prefix}-crosslink, .llbrand-crosslink, .{prefix}-app-banner, .llbrand-app-banner"
    ):
        stories.append(str(story))

    seen_titles: set[str] = set()
    skip_title_bits = (
        "faq",
        "frequently",
        "get your",
        "diagnosed",
        "ready to",
        "spilled something",
        "call us",
        "need something more specific",
        "isolate the threat",
        "secure your system",
    )

    def should_skip_title(title: str) -> bool:
        low = title.lower()
        if any(k in low for k in skip_title_bits):
            return True
        # Word-boundary checks for short tokens that appear inside service names
        if re.search(r"\bbook\b", low):
            return True
        return False

    # Document-order: walk labels / headings in appearance order via find_all
    candidates: list[tuple[int, str, Tag]] = []
    order_nodes = main.find_all(
        lambda t: isinstance(t, Tag)
        and (
            any(
                c.endswith("-section-label") or c == "llbrand-section-label"
                for c in (t.get("class") or [])
            )
            or any(
                c.endswith("-process-zone") or c == "llbrand-process-zone"
                for c in (t.get("class") or [])
            )
            or (
                t.name == "h2"
                and not any(
                    c.endswith("-section-label")
                    or c.endswith("-process-zone")
                    or c == "llbrand-section-label"
                    for c in ((t.parent.get("class") if t.parent else []) or [])
                )
            )
        )
    )

    for idx, node in enumerate(order_nodes):
        cls = " ".join(node.get("class") or [])
        if "process-zone" in cls:
            h2 = node.find("h2")
            title = clean_text(h2.get_text()) if h2 else "How it works"
            grid = node.select_one(
                f".{prefix}-process-grid, .llbrand-process-grid, [class*='process-grid']"
            ) or node
            candidates.append((idx, title, grid))
        elif "section-label" in cls:
            h2 = node.find("h2")
            if not h2:
                continue
            title = clean_text(h2.get_text())
            candidates.append((idx, title, node))
        elif node.name == "h2":
            title = clean_text(node.get_text())
            candidates.append((idx, title, node))

    for _, title, node in candidates:
        low = title.lower()
        if low in seen_titles:
            continue
        if should_skip_title(title):
            continue

        node_cls = " ".join(node.get("class") or [])
        if "process-grid" in node_cls or (
            node.name == "div" and node.select("[class*='process-card']")
        ):
            steps = render_steps_from_process(node)
            if steps:
                sections.append(Section(title=title, cards=[], html_blocks=[steps]))
                seen_titles.add(low)
            continue

        cards, blocks = consume_section_siblings(node, prefix)
        if cards or blocks:
            sections.append(Section(title=title, cards=cards, html_blocks=blocks))
            seen_titles.add(low)

    return sections, stories


def extract_cta(root: Tag, prefix: str, fallback_title: str, fallback_lead: str) -> tuple[str, str]:
    cta = root.select_one(f".{prefix}-cta, .llmbw-cta, .llbrand-crosslink")
    if cta:
        h = cta.find(["h2", "h3", "h4"])
        p = cta.find("p")
        title = clean_text(h.get_text()) if h else fallback_title
        lead = clean_text(p.get_text()) if p else fallback_lead
        return title, lead
    return fallback_title, fallback_lead


def parse_page(slug: str) -> PageData:
    path = ROOT / slug / "index.html"
    raw = path.read_text(errors="ignore")
    soup = BeautifulSoup(raw, "lxml")
    meta = extract_meta(soup, slug)
    root, prefix = find_page_root(soup)
    if root is None or prefix is None:
        raise RuntimeError(f"No page root for {slug}")

    layout = "floaty" if slug in FLOATY_SLUGS else "compact"

    eyebrow_el = root.select_one(f".{prefix}-eyebrow, .llbrand-eyebrow")
    eyebrow = clean_text(eyebrow_el.get_text()) if eyebrow_el else slug.replace("-", " ").title()

    h1 = root.find("h1")
    h1_html = rewrite_accent_spans(inner_html(h1)) if h1 else slug
    # ensure accent class normalized
    h1_html = rewrite_accent_spans(h1_html)

    lead_el = root.select_one(f".{prefix}-lead, .llbrand-lead")
    lead_html = inner_html(lead_el) if lead_el else ""

    trust = extract_trust(root, prefix)
    sections, stories = extract_sections(root, prefix)
    faqs = extract_faqs(root, prefix)
    related = extract_related(root, prefix)
    booking = extract_booking(root)
    json_ld = extract_json_ld(soup, root)

    # Convert story HTML lightly — keep wording, strip old classes later in render
    story_blocks = []
    for s in stories:
        ssoup = BeautifulSoup(s, "lxml")
        # partner banners / crosslinks
        title_el = ssoup.find(["h3", "h4"])
        ps = ssoup.find_all("p")
        links = ssoup.find_all("a")
        title = clean_text(title_el.get_text()) if title_el else ""
        body = " ".join(clean_text(p.get_text()) for p in ps)
        # Keep meaningful partner QR image if present
        imgs = ssoup.find_all("img")
        img_html = ""
        for im in imgs:
            src = im.get("src") or ""
            if "0961fde4" in src or "cbf4c0a5" in src:
                continue
            alt = im.get("alt") or ""
            img_html += f'<p style="margin-top:12px"><img src="{html_lib.escape(src)}" alt="{html_lib.escape(alt)}" style="max-width:160px;height:auto;border-radius:12px"></p>'
        link_html = ""
        for a in links[:2]:
            href = a.get("href") or "#"
            label = clean_text(a.get_text()) or "Learn more"
            link_html += f'<p style="margin-top:12px"><a href="{html_lib.escape(href)}">{html_lib.escape(label)}</a></p>'
        if title or body:
            story_blocks.append(
                f'<div class="llsg-story"><h3>{html_lib.escape(title)}</h3><p>{html_lib.escape(body)}</p>{img_html}{link_html}</div>'
            )

    # Price inline for MOT-like fixed fees — detect £ in booking amount
    price_inline = None
    if booking.amount and booking.amount not in {"FREE", "Free", "£0"}:
        if "£" in booking.amount or booking.amount.replace(".", "").isdigit():
            amt = booking.amount if "£" in booking.amount else f"£{booking.amount}"
            price_inline = (amt, booking.tag)

    # Special: MOT pages already glass on branch — still parse from main if needed
    if slug.startswith("laptop-mot"):
        # Prefer known MOT pricing
        price_inline = ("£75", "Fixed fee · clean, tune-up & malware sweep")

    h1_text = clean_text(BeautifulSoup(h1_html, "lxml").get_text())
    cta_title, cta_lead = extract_cta(
        root,
        prefix,
        fallback_title=f"Ready to book {h1_text}?",
        fallback_lead="Free diagnostics. Clear fixed quotes. Local Wickford workshop.",
    )

    # If no related links found, add sensible defaults
    if not related:
        related = [
            Related("/services", "All services & pricing", "Full Wickford & Essex price list in one place.", "Browse services →"),
            Related("/contact", "Not sure what you need?", "Tell us what’s happening — free diagnostics, fixed quotes.", "Get in touch →"),
        ]

    return PageData(
        slug=slug,
        layout=layout,
        title=meta["title"],
        description=meta["description"],
        canonical=meta["canonical"],
        og_title=meta["og_title"],
        og_description=meta["og_description"],
        og_image=meta["og_image"],
        twitter_image=meta["twitter_image"],
        robots=meta["robots"],
        eyebrow=eyebrow,
        h1_html=h1_html,
        lead_html=lead_html,
        trust=trust,
        sections=sections,
        faqs=faqs,
        related=related,
        booking=booking,
        json_ld=json_ld,
        cta_title=cta_title,
        cta_lead=cta_lead,
        story_blocks=story_blocks,
        price_inline=price_inline,
    )


def render_card(card: Card) -> str:
    wide = " llsg-card-wide" if card.wide else ""
    icon = card.icon_svg or ""
    title = html_lib.escape(card.title)
    # body_html may contain anchors already
    price = f'<span class="llsg-card-price">{html_lib.escape(card.price)}</span>' if card.price else ""
    return f'''<div class="llsg-card{wide}">
  <h3>{icon}{title}</h3>
  <p>{card.body_html}</p>
  {price}
</div>'''


def render_section(sec: Section) -> str:
    cards_html = ""
    if sec.cards:
        cols = " llsg-card-grid-3" if len(sec.cards) >= 3 and all(not c.wide for c in sec.cards[:3]) and len(sec.cards) % 3 == 0 else ""
        cards_html = f'<div class="llsg-card-grid{cols}">' + "\n".join(render_card(c) for c in sec.cards) + "</div>"
    blocks = "\n".join(sec.html_blocks)
    intro = f"<p>{sec.intro_html}</p>" if sec.intro_html else ""
    return f'''<section class="llsg-section llsg-glass">
  <div class="llsg-section-head">
    <h2>{html_lib.escape(sec.title)}</h2>
    {intro}
  </div>
  {cards_html}
  {blocks}
</section>'''


def render_pricing(booking: Booking) -> str:
    feats = "\n".join(
        f"<li>{CHECK_SVG}{html_lib.escape(f)}</li>" for f in booking.features
    )
    return f'''<section class="llsg-pricing llsg-glass">
  <div>
    <h2>Clear pricing. No workshop surprises.</h2>
    <p class="llsg-pricing-lead">We’ll diagnose the fault first and only proceed once you’ve approved a fixed quote.</p>
    <ul class="llsg-pricing-perks">
      {feats}
    </ul>
  </div>
  <div class="llsg-pricing-box">
    <div class="llsg-pricing-box-label">{html_lib.escape(booking.tag)}</div>
    <div class="llsg-pricing-box-amount">{html_lib.escape(booking.amount)}</div>
    <p class="llsg-pricing-box-note">Local Wickford workshop · South Essex coverage</p>
    <a href="{html_lib.escape(booking.primary_href)}" class="llsg-btn-primary">{html_lib.escape(booking.primary_label)}</a>
    <a href="{html_lib.escape(booking.secondary_href)}" class="llsg-btn-secondary">{html_lib.escape(booking.secondary_label)}</a>
  </div>
</section>'''


def render_faqs(faqs: list[Faq]) -> str:
    if not faqs:
        return ""
    items = []
    for i, f in enumerate(faqs):
        open_attr = " open" if i == 0 else ""
        items.append(
            f'''<details class="llsg-faq-item"{open_attr}>
  <summary>{html_lib.escape(f.question)}</summary>
  <p>{f.answer_html}</p>
</details>'''
        )
    return f'''<section class="llsg-section llsg-glass">
  <div class="llsg-section-head">
    <h2>Frequently asked questions</h2>
    <p>Straight answers before you book.</p>
  </div>
  <div class="llsg-faq-list">
    {''.join(items)}
  </div>
</section>'''


def render_related(related: list[Related]) -> str:
    if not related:
        return ""
    links = []
    for r in related:
        links.append(
            f'''<a href="{html_lib.escape(r.href)}">
  <strong>{html_lib.escape(r.title)}</strong>
  <span>{html_lib.escape(r.blurb)}</span>
  <em>{html_lib.escape(r.cta)}</em>
</a>'''
        )
    return f'''<section class="llsg-section llsg-glass">
  <div class="llsg-section-head">
    <h2>Related services</h2>
    <p>Useful next steps if you need something more specific.</p>
  </div>
  <div class="llsg-related">
    {''.join(links)}
  </div>
</section>'''


def render_hero_floaty(page: PageData) -> str:
    src, alt = HERO_BY_SLUG.get(
        page.slug,
        ("/assets/images/image-4307083f.png", "LaunchLayer Wickford workshop"),
    )
    trust = "".join(f"<span>{html_lib.escape(t)}</span>" for t in page.trust[:4])
    price = ""
    if page.price_inline:
        price = f'''<div class="llsg-price-inline" aria-label="Price {html_lib.escape(page.price_inline[0])}">
  <strong>{html_lib.escape(page.price_inline[0])}</strong>
  <span>{html_lib.escape(page.price_inline[1])}</span>
</div>'''
    elif page.booking.amount.upper() == "FREE":
        price = f'''<div class="llsg-price-inline" aria-label="Free diagnostics">
  <strong>FREE</strong>
  <span>{html_lib.escape(page.booking.tag)}</span>
</div>'''

    return f'''<header class="llsg-hero llsg-glass">
  <div class="llsg-hero-copy">
    <span class="llsg-eyebrow">
      <span class="llsg-eyebrow-dot" aria-hidden="true"></span>
      {html_lib.escape(page.eyebrow)}
    </span>
    <p class="llsg-brand">Launch<span>Layer</span></p>
    <h1>{page.h1_html}</h1>
    <p class="llsg-lead">{page.lead_html}</p>
    {price}
    <div class="llsg-trust">{trust}</div>
    <div class="llsg-actions">
      <a href="{html_lib.escape(page.booking.primary_href)}" class="llsg-btn-primary">{html_lib.escape(page.booking.primary_label)}</a>
      <a href="{html_lib.escape(page.booking.secondary_href)}" class="llsg-btn-secondary">{html_lib.escape(page.booking.secondary_label)}</a>
    </div>
  </div>
  <div class="llsg-hero-visual">
    <img src="{html_lib.escape(src)}" alt="{html_lib.escape(alt)}" width="900" height="700" loading="eager" decoding="async" fetchpriority="high">
    <div class="llsg-hero-scrim"></div>
  </div>
</header>'''


def render_hero_compact(page: PageData) -> str:
    src, alt = HERO_BY_SLUG.get(page.slug, (None, None))  # type: ignore
    trust = "".join(f"<span>{html_lib.escape(t)}</span>" for t in page.trust[:4])
    price = ""
    if page.price_inline:
        price = f'''<div class="llsg-price-inline" aria-label="Price {html_lib.escape(page.price_inline[0])}">
  <strong>{html_lib.escape(page.price_inline[0])}</strong>
  <span>{html_lib.escape(page.price_inline[1])}</span>
</div>'''
    band = ""
    if src:
        band = f'''<div class="llsg-hero-band" aria-hidden="true">
  <img src="{html_lib.escape(src)}" alt="" width="1200" height="400" loading="eager" decoding="async">
  <div class="llsg-hero-scrim"></div>
</div>'''
        # decorative band uses empty alt; meaningful alt on a visually hidden purpose — put descriptive title on band via aria
        band = f'''<div class="llsg-hero-band" role="img" aria-label="{html_lib.escape(alt or '')}">
  <img src="{html_lib.escape(src)}" alt="{html_lib.escape(alt or '')}" width="1200" height="400" loading="eager" decoding="async">
  <div class="llsg-hero-scrim"></div>
</div>'''

    return f'''<header class="llsg-hero llsg-hero-compact llsg-glass">
  <div class="llsg-hero-copy">
    <span class="llsg-eyebrow">
      <span class="llsg-eyebrow-dot" aria-hidden="true"></span>
      {html_lib.escape(page.eyebrow)}
    </span>
    <p class="llsg-brand">Launch<span>Layer</span></p>
    <h1>{page.h1_html}</h1>
    <p class="llsg-lead">{page.lead_html}</p>
    {price}
    <div class="llsg-trust">{trust}</div>
    <div class="llsg-actions">
      <a href="{html_lib.escape(page.booking.primary_href)}" class="llsg-btn-primary">{html_lib.escape(page.booking.primary_label)}</a>
      <a href="{html_lib.escape(page.booking.secondary_href)}" class="llsg-btn-secondary">{html_lib.escape(page.booking.secondary_label)}</a>
    </div>
  </div>
  {band}
</header>'''


def render_page(page: PageData) -> str:
    hero = render_hero_floaty(page) if page.layout == "floaty" else render_hero_compact(page)
    sections = "\n".join(render_section(s) for s in page.sections)
    stories = "\n".join(
        f'<section class="llsg-section llsg-glass">{s}</section>' for s in page.story_blocks
    )
    pricing = render_pricing(page.booking) if page.layout == "floaty" else ""
    faqs = render_faqs(page.faqs)
    related = render_related(page.related)
    ld = "\n".join(
        f'<script type="application/ld+json">\n{block}\n</script>' for block in page.json_ld
    )

    return f'''<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html_lib.escape(page.title)}</title>
  <meta name="description" content="{html_lib.escape(page.description)}">
  <meta name="robots" content="{html_lib.escape(page.robots)}">
  <link rel="canonical" href="{html_lib.escape(page.canonical)}">
  <link rel="icon" type="image/x-icon" href="/assets/images/image-cbf4c0a5.ico?format=100w">

  <meta property="og:site_name" content="LaunchLayer">
  <meta property="og:title" content="{html_lib.escape(page.og_title)}">
  <meta property="og:description" content="{html_lib.escape(page.og_description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="{html_lib.escape(page.canonical)}">
  <meta property="og:image" content="{html_lib.escape(page.og_image)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{html_lib.escape(page.og_title)}">
  <meta name="twitter:description" content="{html_lib.escape(page.og_description)}">
  <meta name="twitter:image" content="{html_lib.escape(page.twitter_image)}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/global-nav-footer.css">
  <link rel="stylesheet" href="/assets/css/custom.css">
  <link rel="stylesheet" href="/assets/css/service-glass.css">
  {ld}
</head>
<body class="llsg-body">

{HEADER}

  <main class="llsg-page">
    {hero}
    {sections}
    {stories}
    {pricing}
    {faqs}
    {related}
    <section class="llsg-cta llsg-glass">
      <h2>{html_lib.escape(page.cta_title)}</h2>
      <p>{html_lib.escape(page.cta_lead)}</p>
      <div class="llsg-cta-actions">
        <a href="{html_lib.escape(page.booking.primary_href)}" class="llsg-btn-primary">{html_lib.escape(page.booking.primary_label)}</a>
        <a href="{html_lib.escape(page.booking.secondary_href)}" class="llsg-btn-secondary">{html_lib.escape(page.booking.secondary_label)}</a>
      </div>
    </section>
  </main>

{FOOTER}

  <script src="/assets/js/global-nav-footer.js" defer></script>
</body>
</html>
'''


def special_case_mot(slug: str) -> None:
    """Use the curated MOT glass page as-is, adapted to shared CSS."""
    src = Path("/tmp/mot-glass-ref.html").read_text()
    # Point duplicate slug canonical appropriately
    if slug == "laptop-mot-wickford":
        src = src.replace(
            "https://www.launchlayer.uk/laptop-mot-wickford-essex",
            "https://www.launchlayer.uk/laptop-mot-wickford",
        )
        # keep essex as preferred? Original duplicate on main used wickford path in collection.
        # Leave canonical as /laptop-mot-wickford for this folder.
    # Convert inline styles to shared CSS
    src = re.sub(r"<style>.*?</style>", '<link rel="stylesheet" href="/assets/css/service-glass.css">', src, count=1, flags=re.S)
    src = src.replace("llmot-", "llsg-")
    src = src.replace('class="llsg-page"', 'class="llsg-page"')
    src = src.replace("<body>", '<body class="llsg-body">')
    # ensure custom.css still linked
    if 'href="/assets/css/custom.css"' not in src:
        src = src.replace(
            'href="/assets/css/global-nav-footer.css">',
            'href="/assets/css/global-nav-footer.css">\n  <link rel="stylesheet" href="/assets/css/custom.css">',
        )
    (ROOT / slug / "index.html").write_text(src)


def main() -> None:
    checklist = []
    errors = []
    for slug in ALL_SLUGS:
        try:
            if slug.startswith("laptop-mot"):
                special_case_mot(slug)
                hero = HERO_BY_SLUG[slug]
                checklist.append(
                    {
                        "slug": slug,
                        "layout": "floaty (MOT reference)",
                        "hero": hero[0],
                        "alt": hero[1],
                        "notes": "Curated MOT glass page; wording from MOT overhaul",
                    }
                )
                print(f"OK MOT {slug}")
                continue
            page = parse_page(slug)
            html = render_page(page)
            out = ROOT / slug / "index.html"
            out.write_text(html)
            hero = HERO_BY_SLUG.get(slug, ("(none)", ""))
            checklist.append(
                {
                    "slug": slug,
                    "layout": page.layout,
                    "hero": hero[0],
                    "alt": hero[1] if isinstance(hero, tuple) else "",
                    "sections": len(page.sections),
                    "faqs": len(page.faqs),
                    "related": len(page.related),
                    "title": page.title,
                }
            )
            print(
                f"OK {slug}: layout={page.layout} sections={len(page.sections)} faqs={len(page.faqs)} cards={sum(len(s.cards) for s in page.sections)}"
            )
        except Exception as e:
            errors.append((slug, str(e)))
            print(f"FAIL {slug}: {e}")

    Path("/tmp/service-glass-checklist.json").write_text(json.dumps(checklist, indent=2))
    if errors:
        print("\nERRORS:")
        for s, e in errors:
            print(s, e)
        raise SystemExit(1)
    print(f"\nRebuilt {len(checklist)} pages")


if __name__ == "__main__":
    main()
