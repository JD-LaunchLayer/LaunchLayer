#!/usr/bin/env python3
"""Make og:image and twitter:image absolute, and set og:url to the canonical.

Also applies the shared footer labels and the LocalBusiness priceRange used
across service pages. Safe to re-run.
"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://launchlayer.uk"
SKIP_PARTS = {"assets", "node_modules", ".git"}

META_TAG = re.compile(r"<meta\b[^>]*>", re.I)
LINK_TAG = re.compile(r"<link\b[^>]*>", re.I)


def attr(tag: str, name: str) -> str:
    match = re.search(rf"\b{name}=[\"']([^\"']*)[\"']", tag, re.I)
    return match.group(1) if match else ""


def absolute_url(value: str) -> str:
    value = (value or "").strip()
    if value.startswith("https://") or value.startswith("http://"):
        return value
    if value.startswith("//"):
        return "https:" + value
    if value.startswith("/"):
        return SITE + value
    return value


def canonical_href(page: str) -> str:
    for match in LINK_TAG.finditer(page):
        tag = match.group(0)
        rel = attr(tag, "rel").lower()
        if "canonical" not in rel.split():
            continue
        href = attr(tag, "href").strip()
        if href:
            return absolute_url(href)
    return ""


def rewrite_images(page: str) -> str:
    def fix_tag(match: re.Match[str]) -> str:
        tag = match.group(0)
        kind = attr(tag, "property") or attr(tag, "name")
        if kind not in {"og:image", "twitter:image"}:
            return tag
        content = attr(tag, "content")
        updated = absolute_url(content)
        if not updated or updated == content:
            return tag
        return re.sub(
            r"(\bcontent=)([\"'])([^\"']*)([\"'])",
            lambda m: f"{m.group(1)}{m.group(2)}{updated}{m.group(4)}",
            tag,
            count=1,
            flags=re.I,
        )

    return META_TAG.sub(fix_tag, page)


def ensure_og_url(page: str) -> str:
    canon = canonical_href(page)
    if not canon:
        return page

    found = False

    def fix_tag(match: re.Match[str]) -> str:
        nonlocal found
        tag = match.group(0)
        if attr(tag, "property") != "og:url":
            return tag
        found = True
        content = attr(tag, "content")
        if content == canon:
            return tag
        return re.sub(
            r"(\bcontent=)([\"'])([^\"']*)([\"'])",
            lambda m: f"{m.group(1)}{m.group(2)}{canon}{m.group(4)}",
            tag,
            count=1,
            flags=re.I,
        )

    page = META_TAG.sub(fix_tag, page)
    if found:
        return page

    insert = f'\n<meta property="og:url" content="{canon}">'
    for match in LINK_TAG.finditer(page):
        tag = match.group(0)
        if "canonical" in attr(tag, "rel").lower().split():
            return page[: match.end()] + insert + page[match.end() :]
    return page


def shared_labels(page: str) -> str:
    page = page.replace("Wickford PC Repair (SS11)", "Wickford PC Repair")
    page = page.replace("Wickford Laptop Repair (SS12)", "Wickford Laptop Repair")
    page = page.replace('"priceRange": "£49 - £250"', '"priceRange": "£0 - £250"')
    return page


def main() -> None:
    changed = 0
    for path in sorted(ROOT.rglob("*.html")):
        if SKIP_PARTS.intersection(path.parts):
            continue
        original = path.read_text(encoding="utf-8")
        updated = shared_labels(rewrite_images(ensure_og_url(original)))
        if updated != original:
            path.write_text(updated, encoding="utf-8")
            changed += 1
    print(f"Updated {changed} HTML files.")


if __name__ == "__main__":
    main()
