#!/usr/bin/env python3
"""QA a blog rewrite against its source and data/facts.json.

Not wired into scripts/build-blog.py or the publish workflow.

    python3 scripts/blog_rewrite_qa.py manifest content/blog/post.md
    python3 scripts/blog_rewrite_qa.py compare source.md rewrite.md
    python3 scripts/blog_rewrite_qa.py --self-test

manifest prints JSON. compare prints PASS or FAIL and exits non-zero on FAIL.
Style notes are flags. They do not by themselves fail the run.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import tempfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FACTS_PATH = ROOT / "data" / "facts.json"
POSTS_DIR = ROOT / "content" / "blog"
SITE_HOSTS = ("https://launchlayer.uk", "http://launchlayer.uk", "https://www.launchlayer.uk")

LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
PHONE_RE = re.compile(
    r"(?:\+44\s?|0)7\d{3}[\s\-]?\d{3}[\s\-]?\d{3}\b",
    re.I,
)
PRICE_RE = re.compile(r"£\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?")
NUMBER_RE = re.compile(r"\d+(?:,\d{3})*(?:\.\d+)?")
PERCENT_RE = re.compile(r"\d+(?:\.\d+)?\s*%")
HEADING_RE = re.compile(r"^(#{1,3})\s+(.+?)\s*$", re.M)



def banned_name_hits(text: str, digests: list[str]) -> bool:
    """True when a hashed never-use name appears. The plaintext is not stored."""
    wanted = set(digests or [])
    if not wanted:
        return False
    words = re.findall(r"[A-Za-z][A-Za-z'’\\-]+", text)

    def digest(value: str) -> str:
        return hashlib.sha256(value.casefold().encode()).hexdigest()

    if any(digest(word) in wanted for word in words):
        return True
    return any(digest(f"{words[i]} {words[i + 1]}") in wanted for i in range(len(words) - 1))


def load_facts() -> dict:
    return json.loads(FACTS_PATH.read_text(encoding="utf-8"))


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---"):
        raise ValueError("Post must start with YAML frontmatter (---)")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("Frontmatter is not closed with ---")
    meta: dict[str, str] = {}
    for raw in parts[1].splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        meta[key.strip()] = value.strip().strip("'\"")
    return meta, parts[2].lstrip("\n")


def primary_phrase(meta: dict[str, str]) -> str:
    explicit = meta.get("seo_primary", "").strip()
    if explicit:
        return explicit
    title = meta.get("title", "").strip()
    return title.split("|", 1)[0].strip()


def countable_text(text: str) -> str:
    """Title, description, H1 and body. The seo_primary field names the phrase; it is not a use of it."""
    meta, body = parse_frontmatter(text)
    return "\n".join(
        [
            meta.get("title", ""),
            meta.get("description", ""),
            meta.get("headline", ""),
            body,
        ]
    )


def phrase_count(text: str, phrase: str) -> int:
    if not phrase:
        return 0
    pattern = re.compile(re.escape(phrase), re.I)
    return len(pattern.findall(text))


def headings(body: str) -> list[dict[str, object]]:
    found = []
    for match in HEADING_RE.finditer(body):
        found.append({"level": len(match.group(1)), "text": match.group(2).strip()})
    return found


def normalise_target(raw: str) -> str | None:
    target = raw.strip()
    for host in SITE_HOSTS:
        if target.startswith(host):
            target = target[len(host) :] or "/"
            break
    if target.startswith("tel:") or target.startswith("mailto:"):
        return None
    if "://" in target:
        return None
    if not target.startswith("/"):
        return None
    path, _, fragment = target.partition("#")
    path = path.split("?", 1)[0]
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    if fragment:
        return f"{path}#{fragment}"
    return path


def internal_links(body: str) -> list[dict[str, str]]:
    links = []
    for match in LINK_RE.finditer(body):
        target = normalise_target(match.group(2))
        if target is None:
            continue
        links.append({"target": target, "anchor": match.group(1).strip()})
    return links


def normalise_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if digits.startswith("44"):
        digits = "0" + digits[2:]
    return digits


def phones(text: str) -> list[str]:
    return [normalise_phone(match.group(0)) for match in PHONE_RE.finditer(text)]


def price_amounts(text: str) -> list[int]:
    amounts = []
    for match in PRICE_RE.finditer(text):
        pounds = int(match.group(1).replace(",", ""))
        pence = match.group(2)
        if pence and int(pence) != 0:
            # Keep pence as pounds*100 + pence so £49.50 cannot pass as £49.
            amounts.append(pounds * 100 + int(pence))
        else:
            amounts.append(pounds)
    return amounts


def number_tokens(text: str) -> set[str]:
    return {match.group(0) for match in NUMBER_RE.finditer(text)}


def percent_tokens(text: str) -> set[str]:
    return {re.sub(r"\s+", "", match.group(0)) for match in PERCENT_RE.finditer(text)}


def plain_body(body: str) -> str:
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", body)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[#*_`>|]", " ", text)
    return text


def word_count(body: str) -> int:
    return len(re.findall(r"[A-Za-z0-9'£]+", plain_body(body)))


def sentences(body: str) -> list[str]:
    text = plain_body(body)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+", text)
    return [part.strip() for part in parts if part.strip()]


def first_word(sentence: str) -> str:
    match = re.search(r"[A-Za-z']+", sentence)
    return match.group(0).lower() if match else ""


def style_flags(body: str) -> list[str]:
    flags = []
    found = sentences(body)
    if not found:
        return flags
    lengths = [len(re.findall(r"[A-Za-z0-9'£]+", sentence)) for sentence in found]
    average = sum(lengths) / len(lengths)
    if average < 12 or average > 18:
        flags.append(f"average sentence length is {average:.1f} words (outside 12–18)")
    long_share = sum(1 for length in lengths if length > 25) / len(lengths)
    if long_share > 0.20:
        flags.append(f"{long_share:.0%} of sentences are over 25 words")
    openings = [first_word(sentence) for sentence in found]
    for start in range(len(openings)):
        window = [word for word in openings[start : start + 6] if word]
        if len(window) < 3:
            continue
        if any(count >= 3 for count in Counter(window).values()):
            flags.append("the same opening 3 or more times within 6 sentences")
            break
    if any(
        left.rstrip().endswith("?") and right.rstrip().endswith("?")
        for left, right in zip(found, found[1:])
    ):
        flags.append("stacked questions")
    run = 0
    if_run = False
    for word in openings:
        if word == "if":
            run += 1
            if run >= 2:
                if_run = True
        else:
            run = 0
    if if_run:
        flags.append("run of If openings")
    return flags


def contains_phrase(text: str, phrase: str) -> bool:
    pattern = re.compile(rf"(?<!\w){re.escape(phrase)}(?!\w)", re.I)
    return pattern.search(text) is not None


def unconfirmed_hits(text: str) -> list[str]:
    hits = []
    lowered = text.lower()
    if "same-day" in lowered or "same day" in lowered:
        hits.append("same-day")
    if "90-day" in lowered or "90 day" in lowered:
        hits.append("90-day warranty")
    if "£50" in text or "£ 50" in text:
        hits.append("£50 screen fitting")
    if re.search(r"£\s?65[^.\n]{0,40}screen|screen[^.\n]{0,40}£\s?65", text, re.I):
        hits.append("£65 screen fitting")
    return hits


def build_manifest(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    meta, body = parse_frontmatter(text)
    phrase = primary_phrase(meta)
    body_h1 = [item["text"] for item in headings(body) if item["level"] == 1]
    h1 = meta.get("headline") or (body_h1[0] if body_h1 else "")
    return {
        "slug": meta.get("slug", ""),
        "title": meta.get("title", ""),
        "description": meta.get("description", ""),
        "h1": h1,
        "headline": meta.get("headline", ""),
        "headings": [item for item in headings(body) if item["level"] in (2, 3)],
        "links": internal_links(body),
        "phones": phones(text),
        "prices": price_amounts(text),
        "word_count": word_count(body),
        "primary_phrase": phrase,
        "primary_count": phrase_count(countable_text(text), phrase),
    }


def _same_multiset(left: list, right: list) -> bool:
    return Counter(left) == Counter(right)


def compare_texts(source_text: str, rewrite_text: str, facts: dict) -> tuple[bool, list[str], list[str]]:
    source_meta, source_body = parse_frontmatter(source_text)
    rewrite_meta, rewrite_body = parse_frontmatter(rewrite_text)
    failures: list[str] = []

    for field in ("slug", "title", "description", "headline"):
        if source_meta.get(field, "") != rewrite_meta.get(field, ""):
            label = "H1" if field == "headline" else field
            failures.append(f"{label} changed")

    source_h1 = [item["text"] for item in headings(source_body) if item["level"] == 1]
    rewrite_h1 = [item["text"] for item in headings(rewrite_body) if item["level"] == 1]
    if source_h1 != rewrite_h1:
        failures.append("H1 changed")

    source_heads = [item for item in headings(source_body) if item["level"] in (2, 3)]
    rewrite_heads = [item for item in headings(rewrite_body) if item["level"] in (2, 3)]
    if source_heads != rewrite_heads:
        failures.append("locked H2/H3 phrase changed")

    source_phrase = primary_phrase(source_meta)
    rewrite_phrase = primary_phrase(rewrite_meta)
    if source_phrase != rewrite_phrase:
        failures.append("primary phrase changed")
    source_count = phrase_count(countable_text(source_text), source_phrase)
    rewrite_count = phrase_count(countable_text(rewrite_text), source_phrase)
    if 1 <= source_count <= 3:
        if rewrite_count != source_count:
            failures.append(
                f"primary phrase count {source_count} -> {rewrite_count} (must stay the same)"
            )
    elif abs(rewrite_count - source_count) > 1:
        failures.append(
            f"primary phrase count {source_count} -> {rewrite_count} (allowed ±1)"
        )

    source_targets = Counter(link["target"] for link in internal_links(source_body))
    rewrite_targets = Counter(link["target"] for link in internal_links(rewrite_body))
    for target, count in source_targets.items():
        if rewrite_targets[target] < count:
            failures.append(f"internal link target missing: {target}")

    source_phones = phones(source_text)
    rewrite_phones = phones(rewrite_text)
    if not _same_multiset(source_phones, rewrite_phones):
        failures.append("phone numbers changed")
    locked_phone = facts["business"]["phone_digits"]
    for number in rewrite_phones:
        if number != locked_phone:
            failures.append(f"phone {number} is not in facts.json")

    source_prices = price_amounts(source_text)
    rewrite_prices = price_amounts(rewrite_text)
    if not _same_multiset(source_prices, rewrite_prices):
        failures.append("prices changed")
    allowed = set(facts["allowed_price_amounts_gbp"])
    for amount in rewrite_prices:
        if amount not in allowed:
            failures.append(f"price £{amount} is not in facts.json")

    extra_numbers = sorted(number_tokens(rewrite_text) - number_tokens(source_text))
    if extra_numbers:
        failures.append("new numbers: " + ", ".join(extra_numbers))
    extra_percents = sorted(percent_tokens(rewrite_text) - percent_tokens(source_text))
    if extra_percents:
        failures.append("new percentages: " + ", ".join(extra_percents))

    source_words = word_count(source_body)
    rewrite_words = word_count(rewrite_body)
    if source_words == 0:
        if rewrite_words != 0:
            failures.append("word count changed from 0")
    else:
        ratio = rewrite_words / source_words
        if ratio < 0.90 or ratio > 1.05:
            failures.append(
                f"word count {source_words} -> {rewrite_words} ({ratio:.0%}; allowed 90–105%)"
            )

    for phrase in facts["banned_phrases"]:
        if contains_phrase(rewrite_text, phrase):
            failures.append(f"banned phrase: {phrase}")
    if banned_name_hits(rewrite_text, facts.get("business", {}).get("never_use_sha256", [])):
        failures.append("banned name")

    source_unconfirmed = set(unconfirmed_hits(source_text))
    for claim in unconfirmed_hits(rewrite_text):
        if claim not in source_unconfirmed:
            failures.append(f"new unconfirmed claim: {claim}")

    return (not failures), failures, style_flags(rewrite_body)


def format_compare(ok: bool, failures: list[str], flags: list[str]) -> str:
    lines = ["PASS" if ok else "FAIL"]
    lines.extend(f"- {item}" for item in failures)
    if flags:
        lines.append("flags:")
        lines.extend(f"- {item}" for item in flags)
    return "\n".join(lines) + "\n"


def manifest_command(path: Path) -> int:
    print(json.dumps(build_manifest(path), indent=2, ensure_ascii=False))
    return 0


def compare_command(source: Path, rewrite: Path) -> int:
    facts = load_facts()
    ok, failures, flags = compare_texts(
        source.read_text(encoding="utf-8"),
        rewrite.read_text(encoding="utf-8"),
        facts,
    )
    sys.stdout.write(format_compare(ok, failures, flags))
    return 0 if ok else 1


FIXTURE = """---
slug: sample-post
title: Laptop screen repair | Wickford
headline: Laptop screen repair
description: Fitting the panel is £50.
seo_primary: laptop screen repair
---

Laptop screen repair starts with a look at the lid.

## What we check

We check the hinges and quote the work.

### How long it takes

Call 07367 652987 or see [Wickford screen repair](/laptop-screen-repair-wickford/#cost).

The labour is £50.

FILLER
"""

FILLER = "We check the lid carefully today. "


def _with_filler(copies: int, body_extra: str = "") -> str:
    filler = "\n\n".join([FILLER.strip()] * copies)
    return FIXTURE.replace("FILLER", filler + (("\n\n" + body_extra) if body_extra else ""))


def _assert(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def self_test() -> int:
    failures: list[str] = []
    facts = load_facts()
    confirmed = [item["phrase"] for item in facts["confirmed_claims"]]
    _assert("No-Fix, No-Fee" in confirmed, "No-Fix, No-Fee missing from confirmed claims", failures)
    _assert(
        "No-Fix, No-Fee" not in facts["unconfirmed_claims"],
        "No-Fix, No-Fee still listed as unconfirmed",
        failures,
    )
    for claim in ("same-day", "90-day warranty", "£65 screen fitting"):
        _assert(claim in facts["unconfirmed_claims"], f"unconfirmed list missing {claim}", failures)
    _assert(
        "labour" in facts["confirmed_claims"][0]["meaning"].lower(),
        "No-Fix meaning does not say labour",
        failures,
    )
    port = next(item for item in facts["prices"] if item["service"] == "dc_jack_charging_port")
    _assert(port["amount_gbp"] == 65, "DC jack price is not £65", failures)
    _assert(
        "removable" in port.get("applies_to", "").lower()
        and "small board" in port.get("applies_to", "").lower(),
        "DC jack scope does not limit £65 to removable or small-board ports",
        failures,
    )
    _assert(
        "soldered" in port.get("quoted_after_diagnosis", "").lower()
        and "main board" in port.get("quoted_after_diagnosis", "").lower(),
        "soldered main-board ports are not recorded as quoted after diagnosis",
        failures,
    )

    source = _with_filler(12)
    _meta, body = parse_frontmatter(source)
    manifest = build_manifest_text(source)
    _assert(manifest["slug"] == "sample-post", "manifest slug", failures)
    _assert(manifest["title"].startswith("Laptop screen repair"), "manifest title", failures)
    _assert(manifest["h1"] == "Laptop screen repair", "manifest h1", failures)
    _assert(manifest["primary_phrase"] == "laptop screen repair", "seo_primary ignored", failures)
    _assert(
        manifest["primary_count"] == phrase_count(countable_text(source), "laptop screen repair"),
        "count mismatch",
        failures,
    )
    _assert(manifest["primary_count"] == 3, f"expected primary count 3, got {manifest['primary_count']}", failures)
    _assert(manifest["headings"] == [
        {"level": 2, "text": "What we check"},
        {"level": 3, "text": "How long it takes"},
    ], "headings", failures)
    _assert(
        manifest["links"] == [{"target": "/laptop-screen-repair-wickford#cost", "anchor": "Wickford screen repair"}],
        f"links {manifest['links']}",
        failures,
    )
    _assert(manifest["phones"] == ["07367652987"], f"phones {manifest['phones']}", failures)
    _assert(manifest["prices"] == [50, 50], f"prices {manifest['prices']}", failures)
    _assert(manifest["word_count"] == word_count(body), "word count", failures)

    no_primary = source.replace("seo_primary: laptop screen repair\n", "")
    derived = build_manifest_text(no_primary)
    _assert(derived["primary_phrase"] == "Laptop screen repair", derived["primary_phrase"], failures)

    ok, problems, _flags = compare_texts(source, source, facts)
    _assert(ok, "identical compare failed: " + "; ".join(problems), failures)

    def check_fail(rewritten: str, needle: str) -> None:
        passed, problems, _flags = compare_texts(source, rewritten, facts)
        _assert(not passed, f"expected FAIL containing {needle!r}, got PASS", failures)
        _assert(
            any(needle in item for item in problems),
            f"expected {needle!r} in {problems}",
            failures,
        )

    check_fail(source.replace("slug: sample-post", "slug: other-post"), "slug changed")
    check_fail(source.replace("title: Laptop screen repair | Wickford", "title: Other title | Wickford"), "title changed")
    check_fail(source.replace("description: Fitting the panel is £50.", "description: A different description."), "description changed")
    check_fail(source.replace("headline: Laptop screen repair", "headline: A different headline"), "H1 changed")
    check_fail(source.replace("## What we check", "## What we look at"), "locked H2/H3")
    check_fail(source.replace("Laptop screen repair starts", "The job starts"), "primary phrase count")

    def panel_post(count: int) -> str:
        # Same word count at 5, 6 and 8 uses, so the ±1 check is not tripped by length.
        phrases = " ".join(["panel quote."] * count)
        pad = " ".join(["note"] * (20 - (2 * count)))
        block = f"{phrases} {pad}".strip()
        return source.replace("seo_primary: laptop screen repair", "seo_primary: panel quote").replace(
            FILLER.strip(),
            block,
            1,
        )

    five = panel_post(5)
    six = panel_post(6)
    eight = panel_post(8)
    passed, problems, _flags = compare_texts(five, six, facts)
    _assert(passed, "±1 primary count should pass: " + "; ".join(problems), failures)
    passed, problems, _flags = compare_texts(five, eight, facts)
    _assert(not passed and any("±1" in item for item in problems), f"±1 should fail: {problems}", failures)

    check_fail(
        source.replace("(/laptop-screen-repair-wickford/#cost)", "(/contact/)"),
        "internal link target missing",
    )
    check_fail(source.replace("07367 652987", "07111 111111"), "phone")
    check_fail(source.replace("The labour is £50.", "The labour is £85."), "price")
    check_fail(source.replace("The labour is £50.", "The labour is £99 and about 12%."), "new percentages")
    check_fail(source.replace("The labour is £50.", "The labour is £99 in 4 visits."), "new numbers")
    check_fail(source + "\n\nThis is a seamless repair.\n", "banned phrase")
    check_fail(source + "\n\nWe can often do this same-day.\n", "unconfirmed")

    short = _with_filler(2)
    passed, problems, _flags = compare_texts(source, short, facts)
    _assert(not passed and any("word count" in item for item in problems), f"short word count should fail: {problems}", failures)
    long = _with_filler(40)
    passed, problems, _flags = compare_texts(source, long, facts)
    _assert(not passed and any("word count" in item for item in problems), f"long word count should fail: {problems}", failures)

    # Swap three 6-word fillers for a 20-word block so length stays inside 90–105%.
    near = source.replace(
        (FILLER.strip() + "\n\n") * 3,
        "If the lid moves we stop. If the hinge moves we stop. Is the glass cracked? Is the bezel bent?\n\n",
        1,
    )
    passed, problems, flags = compare_texts(source, near, facts)
    _assert(passed, "style-only rewrite should PASS: " + "; ".join(problems), failures)
    _assert(any("If openings" in item for item in flags), f"missing If flag in {flags}", failures)
    _assert(any("stacked questions" in item for item in flags), f"missing question flag in {flags}", failures)

    short_flags = style_flags("Go now. Stop now. Wait now.")
    _assert(any("average sentence" in item for item in short_flags), f"missing length flag in {short_flags}", failures)
    long_sentence = " ".join(["word"] * 30) + "."
    short_sentence = "This stays fairly short today."
    mixed_flags = style_flags(" ".join([long_sentence, short_sentence, short_sentence, short_sentence]))
    _assert(any("over 25" in item for item in mixed_flags), f"missing long-sentence flag in {mixed_flags}", failures)
    repeat_flags = style_flags("However one. However two. However three. Then stop. Then wait. Then look.")
    _assert(any("same opening" in item for item in repeat_flags), f"missing repeated-opening flag in {repeat_flags}", failures)

    posts = sorted(POSTS_DIR.glob("*.md"))
    _assert(len(posts) >= 1, "no blog posts to smoke-test", failures)
    for post in posts:
        data = build_manifest(post)
        for key in (
            "slug",
            "title",
            "description",
            "h1",
            "headings",
            "links",
            "phones",
            "prices",
            "word_count",
            "primary_phrase",
            "primary_count",
        ):
            _assert(key in data, f"{post.name} manifest missing {key}", failures)
        passed, problems, _flags = compare_texts(
            post.read_text(encoding="utf-8"),
            post.read_text(encoding="utf-8"),
            facts,
        )
        _assert(passed, f"self-compare failed for {post.name}: {problems}", failures)

    if failures:
        sys.stdout.write("self-test FAILED\n")
        sys.stdout.write("\n".join(f"- {item}" for item in failures) + "\n")
        return 1
    sys.stdout.write(f"self-test passed ({len(posts)} posts manifested and self-compared)\n")
    return 0


def build_manifest_text(text: str) -> dict:
    with tempfile.NamedTemporaryFile("w", suffix=".md", encoding="utf-8", delete=False) as handle:
        handle.write(text)
        path = Path(handle.name)
    try:
        return build_manifest(path)
    finally:
        path.unlink(missing_ok=True)


def main(argv: list[str]) -> int:
    if "--self-test" in argv:
        return self_test()
    if len(argv) >= 2 and argv[0] == "manifest":
        return manifest_command(Path(argv[1]))
    if len(argv) >= 3 and argv[0] == "compare":
        return compare_command(Path(argv[1]), Path(argv[2]))
    sys.stderr.write(
        "usage: blog_rewrite_qa.py manifest <post.md> | compare <source.md> <rewrite.md> | --self-test\n"
    )
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
