#!/usr/bin/env python3
"""Umami Cloud snippet and lead-click attributes for LaunchLayer pages.

The script tag belongs in <head>. data-domains limits collection to
launchlayer.uk so Netlify previews and local builds do not record visits.
Lead clicks use data-umami-event so Umami records them without extra JS.
The contact form is the exception: that event is sent from the page script
only after the function returns success.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

WEBSITE_ID = "13fbd69e-1f5b-4c12-b4b3-0b859486451a"
SCRIPT_SRC = "https://cloud.umami.is/script.js"
SNIPPET = (
    '<script defer src="https://cloud.umami.is/script.js" '
    f'data-website-id="{WEBSITE_ID}" '
    'data-domains="launchlayer.uk"></script>'
)

# Substrings the blog publish guard requires inside <head>.
HEAD_MARKERS = (
    SCRIPT_SRC,
    f'data-website-id="{WEBSITE_ID}"',
    'data-domains="launchlayer.uk"',
)

_SKIP_BLOCKS = re.compile(
    r"<!--.*?-->|<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>|<noscript\b[^>]*>.*?</noscript>",
    re.I | re.S,
)
_TAG = re.compile(r"</?(header|footer|main|section|div|a)\b[^>]*>", re.I | re.S)
_HREF = re.compile(r"""href\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.I)
_CLASS = re.compile(r"""class\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.I)
_HEAD_CLOSE = re.compile(r"</head>", re.I)


def page_location(path: Path, root: Path = ROOT) -> str:
    rel = path.relative_to(root)
    if rel.name.lower() == "index.html":
        parent = rel.parent.as_posix()
        return "home" if parent == "." else parent
    return rel.with_suffix("").as_posix()


def _attr(tag: str, pattern: re.Pattern[str]) -> str:
    match = pattern.search(tag)
    if not match:
        return ""
    return match.group(1) if match.group(1) is not None else (match.group(2) or "")


def _kind(tag_name: str, classes: str) -> str | None:
    low = classes.lower()
    if "floating-pill" in low or "launchlayer-master-footer" in low or tag_name == "footer":
        return "footer"
    if "hero" in low:
        return "hero"
    if tag_name == "header":
        return "header"
    return None


def _event_for(href: str) -> str | None:
    low = href.strip().lower()
    if low.startswith("tel:"):
        return "call-click"
    if low.startswith("mailto:"):
        address = low[7:].split("?", 1)[0].strip()
        if address == "hello@launchlayer.uk":
            return "email-click"
        return None
    if any(
        token in low
        for token in ("wa.me/", "api.whatsapp.com", "web.whatsapp.com", "whatsapp://")
    ):
        return "whatsapp-click"
    if "output=embed" in low:
        return None
    if any(
        token in low
        for token in (
            "google.com/maps/dir",
            "maps.google.",
            "google.com/maps?",
            "google.com/maps/search",
            "maps.app.goo.gl",
        )
    ):
        return "directions-click"
    return None


def _location_for(tag: str, stack: list[tuple[str, str | None]], page: str) -> str:
    classes = _attr(tag, _CLASS).lower()
    if "launchlayer-floating-btn" in classes or "floating-pill" in classes:
        return "footer"
    for _name, kind in reversed(stack):
        if kind in ("hero", "footer", "header"):
            return kind
    return page


def _skipped(pos: int, spans: list[tuple[int, int]]) -> bool:
    for start, end in spans:
        if start <= pos < end:
            return True
        if start > pos:
            return False
    return False


def annotate_lead_links(html: str, page: str) -> str:
    """Add data-umami-event attributes to lead links. Idempotent."""
    spans = [(m.start(), m.end()) for m in _SKIP_BLOCKS.finditer(html)]
    stack: list[tuple[str, str | None]] = []
    replacements: list[tuple[int, int, str]] = []

    for match in _TAG.finditer(html):
        if _skipped(match.start(), spans):
            continue
        tag = match.group(0)
        name = match.group(1).lower()
        closing = tag.startswith("</")
        if name == "a":
            if closing:
                continue
            bare = re.sub(r'\s+data-umami-event="[^"]*"', "", tag)
            bare = re.sub(r'\s+data-umami-event-location="[^"]*"', "", bare)
            href = _attr(bare, _HREF)
            event = _event_for(href)
            if not event:
                continue
            location = _location_for(bare, stack, page)
            attrs = (
                f' data-umami-event="{event}"'
                f' data-umami-event-location="{location}"'
            )
            new_tag = bare[:-1] + attrs + ">"
            if new_tag != tag:
                replacements.append((match.start(), match.end(), new_tag))
            continue
        if closing:
            while stack:
                opened, _kind_name = stack.pop()
                if opened == name:
                    break
            continue
        stack.append((name, _kind(name, _attr(tag, _CLASS))))

    if not replacements:
        return html
    parts: list[str] = []
    cursor = 0
    for start, end, new_tag in replacements:
        parts.append(html[cursor:start])
        parts.append(new_tag)
        cursor = end
    parts.append(html[cursor:])
    return "".join(parts)


def ensure_snippet(html: str) -> str:
    """Insert the Umami script once, immediately before </head>."""
    if SCRIPT_SRC in html:
        if html.count(SCRIPT_SRC) != 1:
            raise ValueError("Umami script appears more than once")
        if 'data-domains="launchlayer.uk"' not in html:
            raise ValueError("Umami script is missing data-domains")
        return html
    match = _HEAD_CLOSE.search(html)
    if not match:
        raise ValueError("page has no </head>")
    return html[: match.start()] + "  " + SNIPPET + "\n" + html[match.start() :]


def apply_umami(html: str, page: str) -> str:
    return annotate_lead_links(ensure_snippet(html), page)


def html_pages(root: Path = ROOT) -> list[Path]:
    pages = []
    for path in root.rglob("*.html"):
        if ".git" in path.parts or "assets" in path.parts:
            continue
        pages.append(path)
    return sorted(pages)


def check_pages(root: Path = ROOT) -> tuple[int, dict[str, int]]:
    """Return (page count, event counts). Raise if a page is wrong."""
    pages = html_pages(root)
    events = {"call-click": 0, "whatsapp-click": 0, "email-click": 0, "directions-click": 0, "contact-form-submit": 0}
    for path in pages:
        html = path.read_text(encoding="utf-8")
        if html.count(SCRIPT_SRC) != 1:
            raise ValueError(f"{path}: expected the Umami script exactly once")
        head = re.search(r"<head\b[^>]*>(.*?)</head>", html, flags=re.I | re.S)
        if not head:
            raise ValueError(f"{path}: missing <head>")
        for marker in HEAD_MARKERS:
            if marker not in head.group(1):
                raise ValueError(f"{path}: <head> missing {marker}")
        for event in ("call-click", "whatsapp-click", "email-click", "directions-click"):
            events[event] += html.count(f'data-umami-event="{event}"')
        # Every tel: link on the page should carry call-click.
        for match in re.finditer(r"<a\b[^>]*>", html, flags=re.I | re.S):
            tag = match.group(0)
            href = _attr(tag, _HREF)
            expected = _event_for(href)
            if not expected:
                continue
            if f'data-umami-event="{expected}"' not in tag:
                raise ValueError(f"{path}: untagged {expected} link {href[:80]}")
    contact = (root / "contact" / "index.html").read_text(encoding="utf-8")
    if "umami.track('contact-form-submit'" not in contact:
        raise ValueError("contact form does not track contact-form-submit")
    events["contact-form-submit"] = contact.count("umami.track('contact-form-submit'")
    return len(pages), events


def _self_test() -> None:
    sample = """<!doctype html><html><head>
</head><body>
<header class="ll-site-header"><a href="tel:1">header</a></header>
<main>
<header class="llhm-hero"><a href="/contact">Book</a><a href="tel:2">hero</a></header>
<section><a href="tel:3">body</a>
<a href="mailto:hello@launchlayer.uk">email</a>
<a href="mailto:smithplumbing_essex_88@gmail.com">example</a>
<a href="https://www.google.com/maps/dir/?api=1&amp;destination=x">dir</a>
<a href="https://wa.me/447367652987">wa</a>
</section>
</main>
<footer class="launchlayer-master-footer"></footer>
<div class="launchlayer-floating-pill-container">
<a href="tel:4" class="launchlayer-floating-btn">pill</a>
</div>
<script>var example = '<a href="tel:9">ignore</a>';</script>
</body></html>"""
    out = apply_umami(sample, "services")
    again = apply_umami(out, "services")
    if again != out:
        raise SystemExit("self-test: apply is not idempotent")
    if out.count(SCRIPT_SRC) != 1 or "data-domains=\"launchlayer.uk\"" not in out.split("</head>", 1)[0]:
        raise SystemExit("self-test: snippet not exactly once in head")
    expected = [
        'href="tel:1"',
        'data-umami-event="call-click"',
        'data-umami-event-location="header"',
        'href="tel:2"',
        'data-umami-event-location="hero"',
        'href="tel:3"',
        'data-umami-event-location="services"',
        'data-umami-event="email-click"',
        'data-umami-event="directions-click"',
        'data-umami-event="whatsapp-click"',
        'class="launchlayer-floating-btn"',
        'data-umami-event-location="footer"',
    ]
    # Pair locations with the right links by extracting tags.
    tags = re.findall(r"<a\b[^>]*>", out, flags=re.I | re.S)
    visible = [t for t in tags if "tel:9" not in t]
    by_href = {_attr(t, _HREF): t for t in visible}
    checks = {
        "tel:1": ("call-click", "header"),
        "tel:2": ("call-click", "hero"),
        "tel:3": ("call-click", "services"),
        "mailto:hello@launchlayer.uk": ("email-click", "services"),
        "https://www.google.com/maps/dir/?api=1&amp;destination=x": ("directions-click", "services"),
        "https://wa.me/447367652987": ("whatsapp-click", "services"),
        "tel:4": ("call-click", "footer"),
    }
    for href, (event, location) in checks.items():
        tag = by_href.get(href)
        if not tag or f'data-umami-event="{event}"' not in tag or f'data-umami-event-location="{location}"' not in tag:
            raise SystemExit(f"self-test: bad tag for {href}: {tag}")
    example = by_href.get("mailto:smithplumbing_essex_88@gmail.com", "")
    if "data-umami-event" in example:
        raise SystemExit("self-test: example email was tagged")
    if any("tel:9" in t and "data-umami-event" in t for t in tags):
        raise SystemExit("self-test: script example link was tagged")
    if any(marker not in sample and False for marker in expected):
        pass
    print("umami self-test passed")


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--self-test":
        _self_test()
        return 0
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        count, events = check_pages()
        print(f"pages {count}")
        for name, total in events.items():
            print(f"{name} {total}")
        return 0
    if len(sys.argv) > 1 and sys.argv[1] == "--apply":
        changed = 0
        for path in html_pages():
            original = path.read_text(encoding="utf-8")
            updated = apply_umami(original, page_location(path))
            if updated != original:
                path.write_text(updated, encoding="utf-8")
                changed += 1
        count, events = check_pages()
        print(f"updated {changed}; pages {count}")
        for name, total in events.items():
            print(f"{name} {total}")
        return 0
    print("usage: python3 scripts/umami_analytics.py --apply|--check|--self-test", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
