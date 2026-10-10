#!/usr/bin/env python3
"""Render Markdown posts in content/blog/ to public HTML at /blog/<slug>/.

Post chrome = fonts.css + design-tokens.css + the Umami script; listing = h2.blog-title from listing_card().

Public URLs never change: the slug in frontmatter is the folder name Google
already knows. Edit the .md file, then run:

    python3 scripts/build-blog.py

Hosting stays static — this script writes blog/<slug>/index.html so you can
keep deploying the folder as-is. Old Squarespace posts are left untouched.
The builder asserts chrome and listing-card shape after write. Re-scan with
`--check` (also fails when a published post's image or og_image file is
missing, or when a post links to a blog post that is not live by its own
publish date). `--self-test` proves a broken template, a missing image, a
bad sitemap insert, or a forward blog link would fail the job. Newly
published posts are added to sitemap.xml.
"""
from __future__ import annotations

import html
import json
import re
import sys
import tempfile
from datetime import datetime
from pathlib import Path

from umami_analytics import apply_umami

ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "content" / "blog"
OUT_BLOG = ROOT / "blog"
SITE = "https://launchlayer.uk"
ORG_ID = f"{SITE}/#organization"
# Old Squarespace slugs that were pasted into blog JSON-LD but have no page.
DEAD_BLOG_SLUGS = {
    "windows-10-end-of-support-guide-essex",
    "how-to-spot-tech-support-scams",
    "laptop-thermal-throttling-fixes",
    "custom-pc-airflow-optimization-guide",
    # Merged into laptop-battery-not-charging-wickford. The HTML folder is
    # deleted and _redirects 301s the old URL.
    "laptop-charger-not-working-dc-jack",
}
FEED_START = "<!-- ll-md-feed:start -->"
FEED_END = "<!-- ll-md-feed:end -->"
LEGACY_NEXT_SLUG = "fix-pc-game-stuttering-fps-drops-essex"
LEGACY_NEXT_TITLE = (
    "Why Your Games are Stuttering (FPS Drops): Software vs. Hardware Bottlenecks"
)
CATEGORY_CLASS = {
    "Useful Tips": "useful-tips",
    "Cybersecurity": "cybersecurity",
    "Business IT": "business-it",
    "PC Gaming": "pc-gaming",
    "Wickford Community": "wickford-community",
}
LISTING_PAGES = {
    "all": ROOT / "blog" / "index.html",
    # On-disk folders stay Title-Case. Netlify already serves the lowercase
    # URL and 301s the Title-Case URL. A case-only rename fails the deploy.
    "Useful Tips": ROOT / "blog" / "category" / "Useful+Tips" / "index.html",
    "Cybersecurity": ROOT / "blog" / "category" / "Cybersecurity" / "index.html",
    "Business IT": ROOT / "blog" / "category" / "Business+IT" / "index.html",
    "PC Gaming": ROOT / "blog" / "category" / "PC+Gaming" / "index.html",
    "Wickford Community": ROOT / "blog" / "category" / "Wickford+Community" / "index.html",
}

REQUIRED = (
    "slug",
    "title",
    "headline",
    "description",
    "date",
    "category",
    "category_path",
    "author",
    "image",
    "og_image",
    "image_alt",
)
# Checked independently of the post <head> template so deleting a <link> still fails.
REQUIRED_POST_CHROME = (
    "/assets/css/fonts.css",
    "/assets/css/design-tokens.css",
    "https://cloud.umami.is/script.js",
    'data-website-id="13fbd69e-1f5b-4c12-b4b3-0b859486451a"',
    'data-domains="launchlayer.uk"',
)
_H2_BLOG_TITLE = re.compile(
    r'<h2\b[^>]*\bclass=["\'][^"\']*\bblog-title\b[^"\']*["\']',
    re.I,
)
_H1_BLOG_TITLE = re.compile(
    r'<h1\b[^>]*\bclass=["\'][^"\']*\bblog-title\b[^"\']*["\']',
    re.I,
)
_ARTICLE_OPEN = re.compile(r"<article\b", re.I)


class PublishGuardError(Exception):
    """Generated HTML failed the post-chrome or listing-card standard."""


def is_live(meta: dict[str, str], today: datetime.date) -> bool:
    """A post is public once its frontmatter date has arrived.

    draft: true is only a hold-back when the date is still in the future
    (scheduled queue). On/after that date the GitHub Action publishes it
    even if the YAML still says draft, then we stamp draft: false.
    """
    d = datetime.strptime(meta["date"], "%Y-%m-%d").date()
    return d <= today


def stamp_published(path: Path, meta: dict[str, str]) -> None:
    """Flip draft: true to false once a scheduled post has gone live."""
    if meta.get("draft", "").lower() not in {"true", "yes", "1"}:
        return
    text = path.read_text(encoding="utf-8")
    updated, n = re.subn(
        r"(?m)^draft:\s*(?:true|yes|1)\s*$",
        "draft: false",
        text,
        count=1,
    )
    if n:
        path.write_text(updated, encoding="utf-8")
        meta["draft"] = "false"


def listing_date(iso_date: str) -> str:
    dt = datetime.strptime(iso_date, "%Y-%m-%d")
    return dt.strftime("%d/%m/%Y")


def listing_card(meta: dict[str, str], index: int = 1) -> str:
    """Single emitter for Markdown listing cards (Squarespace-era markup).

    SQS alternating layout styles h2.blog-title (list-title size) plus
    primary/secondary meta, empty excerpt wrapper, and article-index-N.
    An h1.blog-title picks up heading-1 size and collapses the image box.
    """
    slug = html.escape(meta["slug"])
    headline = html.escape(meta["headline"])
    image = html.escape(meta["image"])
    category = html.escape(meta["category"])
    category_path = html.escape(meta["category_path"])
    author = html.escape(meta["author"])
    shown = html.escape(listing_date(meta["date"]))
    css = CATEGORY_CLASS.get(meta["category"], "useful-tips")
    stem = Path(image.split("?", 1)[0]).stem
    avif = f"/assets/images/thumbs/{stem}-w800.avif"
    webp = f"/assets/images/thumbs/{stem}-w800.webp"
    meta_bits = f'''  <span class="blog-categories-list">
          <a href="/blog/category/{category_path.lower()}/" class="blog-categories">{category}</a>
      </span>
<span class="blog-author">{author}</span>
    <time class="blog-date" pubdate data-animation-role="date">{shown}</time>'''
    return f'''    <article class="hentry category-{css} author-jordan-duggins post-type-text article-index-{index} blog-item entry">
      <section class="blog-image-wrapper">
      <a href="/blog/{slug}" class="image-wrapper" data-animation-role="image">
<picture>
<source type="image/avif" srcset="{avif}">
<source type="image/webp" srcset="{webp}">
<img data-src="{image}" data-image="{image}" data-image-dimensions="1152x864" data-image-focal-point="0.5,0.5" alt="{headline}" data-load="false" src="{image}" width="1152" height="864" sizes="(max-width: 767px) 92vw, 520px" class="image" style="display:block;position: absolute; height: 100%; width: 100%; object-fit: cover; object-position: 50% 50%;" loading="lazy" decoding="async" data-loader="sqs">
</picture>
</a>
</section>
      <section class="blog-item-summary">
        <div class="blog-item-text">
          <div class="blog-meta-section">
  <span class="blog-meta-primary">
    {meta_bits}
  </span>
  <span class="blog-meta-delimiter"></span>
    <span class="blog-meta-delimiter blog-category-delimiter"></span>
  <span class="blog-meta-secondary">
    {meta_bits}
  </span>
</div>
<h2 class="blog-title">
    <a href="/blog/{slug}" data-no-animation>
    {headline}
  </a>
</h2>
<div class="blog-excerpt">
  <div class="blog-excerpt-wrapper"></div>
</div>
<a class="blog-more-link" href="/blog/{slug}" data-animation-role="content">Read More</a>
</div>
      </section>
    </article>'''


def patch_listing(path: Path, cards_html: str) -> None:
    if not path.exists():
        return
    text = path.read_text(encoding="utf-8")
    block = f"{FEED_START}\n{cards_html}\n    {FEED_END}" if cards_html.strip() else f"{FEED_START}\n    {FEED_END}"
    if FEED_START in text and FEED_END in text:
        text = re.sub(
            re.escape(FEED_START) + r".*?" + re.escape(FEED_END),
            block,
            text,
            count=1,
            flags=re.S,
        )
    else:
        needle = '<div class="blog-alternating-side-by-side-wrapper">'
        if needle not in text:
            raise ValueError(f"Cannot find listing wrapper in {path}")
        text = text.replace(needle, needle + "\n    " + block, 1)
    path.write_text(text, encoding="utf-8")
    assert_listing_feed(text, path)


def _rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def assert_post_chrome(html_text: str, path: Path | None = None) -> None:
    where = _rel(path) if path else "generated post"
    head_match = re.search(r"<head\b[^>]*>(.*?)</head>", html_text, flags=re.I | re.S)
    if not head_match:
        raise PublishGuardError(
            f"{where}: missing <head>; post chrome cannot be verified."
        )
    head = head_match.group(1)
    missing = [href for href in REQUIRED_POST_CHROME if href not in head]
    if missing:
        raise PublishGuardError(
            f"{where}: <head> missing {', '.join(missing)}. "
            "Post chrome = fonts.css + design-tokens.css + the Umami script."
        )


def assert_listing_feed(html_text: str, path: Path | None = None) -> None:
    where = _rel(path) if path else "listing page"
    start = html_text.find(FEED_START)
    end = html_text.find(FEED_END)
    if start < 0 or end < 0:
        raise PublishGuardError(
            f"{where}: missing {FEED_START} / {FEED_END}; "
            "Markdown listing cards cannot be verified."
        )
    if end < start:
        raise PublishGuardError(f"{where}: {FEED_END} appears before {FEED_START}.")
    feed = html_text[start + len(FEED_START) : end]
    if _H1_BLOG_TITLE.search(feed):
        raise PublishGuardError(
            f"{where}: Markdown feed uses h1.blog-title; "
            "listing cards must use h2.blog-title from listing_card()."
        )
    articles = _ARTICLE_OPEN.findall(feed)
    titles = _H2_BLOG_TITLE.findall(feed)
    if articles and len(titles) < len(articles):
        raise PublishGuardError(
            f"{where}: {len(articles)} feed card(s) but {len(titles)} h2.blog-title; "
            'every card between ll-md-feed markers must use h2 class="blog-title" '
            "from listing_card()."
        )


def _sample_listing_meta() -> dict[str, str]:
    return {
        "slug": "guard-sample",
        "headline": "Guard sample",
        "image": "/assets/images/sample.jpg",
        "category": "Useful Tips",
        "category_path": "Useful+Tips",
        "author": "Jordan Duggins",
        "date": "2026-09-16",
    }


def assert_listing_card_emitter() -> None:
    """listing_card() is the single emitter; it must keep h2 + the #108 shape."""
    card = listing_card(_sample_listing_meta(), index=1)
    if _H1_BLOG_TITLE.search(card):
        raise PublishGuardError(
            "listing_card() emitted h1.blog-title; it must emit h2.blog-title."
        )
    if not _H2_BLOG_TITLE.search(card):
        raise PublishGuardError('listing_card() must emit h2 class="blog-title".')
    for marker in (
        "article-index-1",
        "blog-meta-primary",
        "blog-meta-secondary",
        "blog-excerpt",
        'data-loader="sqs"',
        'href="/blog/category/useful+tips/"',
    ):
        if marker not in card:
            raise PublishGuardError(
                f"listing_card() lost legacy card shape marker {marker!r}."
            )
    if SITE != "https://launchlayer.uk":
        raise PublishGuardError(
            "SITE must be the apex host https://launchlayer.uk (no www)."
        )


def generated_post_paths() -> list[Path]:
    paths = []
    for md in sorted(POSTS_DIR.glob("*.md")):
        html_path = OUT_BLOG / md.stem / "index.html"
        if html_path.is_file():
            paths.append(html_path)
    return paths


_CANONICAL_HREF = re.compile(
    r'<link rel="canonical" href="(https://launchlayer\.uk/blog/[a-z0-9-]+/)"'
)
_OG_URL = re.compile(
    r'<meta property="og:url" content="(https://launchlayer\.uk/blog/[a-z0-9-]+/)"'
)


def assert_apex_slash_canonical(html_text: str, path: Path | None = None) -> None:
    """Builder posts must self-canonicalise to the apex URL with a trailing slash."""
    where = _rel(path) if path else "generated post"
    canonical = _CANONICAL_HREF.search(html_text)
    og_url = _OG_URL.search(html_text)
    if not canonical:
        raise PublishGuardError(
            f"{where}: canonical must be https://launchlayer.uk/blog/<slug>/ "
            "(apex, trailing slash, no www)."
        )
    if not og_url or og_url.group(1) != canonical.group(1):
        raise PublishGuardError(
            f"{where}: og:url must match the apex trailing-slash canonical."
        )
    if "https://www.launchlayer.uk" in html_text:
        raise PublishGuardError(
            f"{where}: still contains a www.launchlayer.uk URL."
        )


_BLOG_LINK = re.compile(
    r"""(?:\]\(|href=["'])/blog/(?!category/)([a-z0-9-]+)/?""",
    re.I,
)


def blog_link_slugs(body: str) -> list[str]:
    """Internal /blog/<slug>/ links in a Markdown body. Category hubs are skipped."""
    return _BLOG_LINK.findall(body)


def legacy_blog_slugs(root: Path | None = None) -> set[str]:
    """Blog folders that already have public HTML and are not Markdown posts.

    A link to one of these is already live. Dead slugs and the category
    folder are not treated as live posts.
    """
    blog = (root or ROOT) / "blog"
    markdown = {path.stem for path in POSTS_DIR.glob("*.md")}
    found: set[str] = set()
    if not blog.is_dir():
        return found
    for folder in blog.iterdir():
        if not folder.is_dir():
            continue
        if folder.name in {"category", *DEAD_BLOG_SLUGS} or folder.name in markdown:
            continue
        if (folder / "index.html").is_file():
            found.add(folder.name)
    return found


def assert_blog_links_live_by_publish_date(
    posts: list[tuple[Path, dict[str, str], str]],
    legacy_slugs: set[str],
) -> None:
    """Fail when a post links to a blog post that is not live on its publish date.

    A Markdown target is live for the source when the target's date is on or
    before the source date. draft: true does not hold a post back once that
    date arrives. A legacy HTML post (no Markdown file) is already live.
    """
    by_slug = {meta["slug"]: meta for _path, meta, _body in posts}
    problems: list[str] = []
    for path, meta, body in posts:
        try:
            source_date = datetime.strptime(meta["date"], "%Y-%m-%d").date()
        except (KeyError, ValueError) as exc:
            raise PublishGuardError(
                f"{path.name}: unreadable date {meta.get('date')!r}."
            ) from exc
        for slug in blog_link_slugs(body):
            target = by_slug.get(slug)
            if target is not None:
                try:
                    target_date = datetime.strptime(target["date"], "%Y-%m-%d").date()
                except (KeyError, ValueError) as exc:
                    raise PublishGuardError(
                        f"{slug}: unreadable date {target.get('date')!r}."
                    ) from exc
                if target_date <= source_date:
                    continue
                problems.append(
                    f"{meta['slug']} ({meta['date']}) links to /blog/{slug}/ "
                    f"which publishes {target['date']}."
                )
                continue
            if slug in legacy_slugs:
                continue
            problems.append(
                f"{meta['slug']} ({meta['date']}) links to /blog/{slug}/ "
                "which is not live by that date."
            )
    if problems:
        raise PublishGuardError(
            "A post links to a blog post that is not live by its publish date:\n- "
            + "\n- ".join(problems)
        )


def check_generated_output() -> None:
    assert_listing_card_emitter()
    posts = generated_post_paths()
    if not posts:
        raise PublishGuardError(
            "No generated Markdown posts found under blog/<slug>/index.html."
        )
    for path in posts:
        text = path.read_text(encoding="utf-8")
        assert_post_chrome(text, path)
        assert_apex_slash_canonical(text, path)
    for path in LISTING_PAGES.values():
        if path.is_file():
            assert_listing_feed(path.read_text(encoding="utf-8"), path)
    loaded = load_posts()
    assert_published_post_images(loaded, datetime.now().date(), ROOT)
    assert_blog_links_live_by_publish_date(loaded, legacy_blog_slugs())


def run_self_test() -> None:
    """Prove the guard fails on broken chrome/cards and passes on current templates."""
    assert_listing_card_emitter()
    good_post = """<!doctype html><html><head>
      <link rel="stylesheet" href="/assets/css/fonts.css">
      <link rel="stylesheet" href="/assets/css/design-tokens.css">
      <script defer src="https://cloud.umami.is/script.js" data-website-id="13fbd69e-1f5b-4c12-b4b3-0b859486451a" data-domains="launchlayer.uk"></script>
    </head><body></body></html>"""
    assert_post_chrome(good_post, Path("self-test-good.html"))
    empty_feed = f"{FEED_START}\n    {FEED_END}"
    assert_listing_feed(empty_feed, Path("empty-feed.html"))
    good_feed = (
        f'{FEED_START}\n<article class="blog-item">'
        f'<h2 class="blog-title">ok</h2></article>\n{FEED_END}'
    )
    assert_listing_feed(good_feed, Path("h2-card.html"))

    broken_cases: list[tuple[str, object]] = [
        (
            "missing post chrome",
            lambda: assert_post_chrome(
                "<html><head></head></html>", Path("broken-chrome.html")
            ),
        ),
        (
            "missing design-tokens.css",
            lambda: assert_post_chrome(
                '<html><head><link rel="stylesheet" href="/assets/css/fonts.css"></head></html>',
                Path("no-tokens.html"),
            ),
        ),
        (
            "h1.blog-title listing card",
            lambda: assert_listing_feed(
                f'{FEED_START}\n<article class="blog-item">'
                f'<h1 class="blog-title">x</h1></article>\n{FEED_END}',
                Path("h1-card.html"),
            ),
        ),
    ]
    for label, action in broken_cases:
        try:
            action()
        except PublishGuardError:
            pass
        else:
            raise PublishGuardError(
                f"self-test: expected {label} to fail, but it passed."
            )
    _self_test_sitemap_and_images()
    _self_test_forward_blog_links()
    print("Blog publish guard self-test passed.")


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


def format_display_date(iso_date: str) -> str:
    dt = datetime.strptime(iso_date, "%Y-%m-%d")
    return f"{dt.day} {dt.strftime('%b')}"


def iso_datetime(iso_date: str) -> str:
    return f"{iso_date}T17:00:00+01:00"


def absolute_url(path: str) -> str:
    """Turn a root-relative asset or page path into an https://launchlayer.uk URL."""
    value = (path or "").strip()
    if value.startswith("https://") or value.startswith("http://"):
        return value
    if value.startswith("//"):
        return "https:" + value
    if not value.startswith("/"):
        value = "/" + value
    return f"{SITE}{value}"


def launchlayer_org() -> dict:
    return {"@type": "Organization", "name": "LaunchLayer", "@id": ORG_ID}


def pagination_html(meta: dict[str, str]) -> str:
    blocks = []
    prev_slug = meta.get("prev_slug")
    next_slug = meta.get("next_slug")
    if prev_slug:
        title = html.escape(meta.get("prev_title") or prev_slug)
        blocks.append(
            f'''    <a href="/blog/{html.escape(prev_slug)}" class="item-pagination-link item-pagination-link--prev">
      <div class="item-pagination-icon icon icon--stroke">
        <svg class="caret-left-icon--small" viewBox="0 0 9 16">
          <polyline fill="none" stroke-miterlimit="10" points="7.3,14.7 2.5,8 7.3,1.2"/>
        </svg>
      </div>
      <span class="pagination-title-wrapper">
        <div class="visually-hidden">Previous</div>
        <h2 class="item-pagination-title">{title}</h2>
      </span>
    </a>'''
        )
    if next_slug:
        title = html.escape(meta.get("next_title") or next_slug)
        blocks.append(
            f'''    <a href="/blog/{html.escape(next_slug)}" class="item-pagination-link item-pagination-link--next">
      <div class="pagination-title-wrapper">
        <div class="visually-hidden">Next</div>
        <h2 class="item-pagination-title">{title}</h2>
      </div>
      <div class="item-pagination-icon icon icon--stroke">
        <svg class="caret-right-icon--small" viewBox="0 0 9 16">
          <polyline fill="none" stroke-miterlimit="10" points="1.6,1.2 6.5,7.9 1.6,14.7"/>
        </svg>
      </div>
    </a>'''
        )
    if not blocks:
        return ""
    inner = "\n\n".join(blocks)
    return f'''<section id="itemPagination" class="item-pagination item-pagination--prev-next" data-collection-type="blog-alternating-side-by-side">
{inner}
</section>'''


def article_schema(meta: dict[str, str], url: str) -> str:
    payload = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BlogPosting",
                "@id": f"{url}#article",
                "headline": meta["headline"],
                "name": f"{meta['title']} — LaunchLayer",
                "description": meta["description"],
                "datePublished": iso_datetime(meta["date"]),
                "dateModified": iso_datetime(meta["date"]),
                "inLanguage": "en-GB",
                "url": url,
                "mainEntityOfPage": url,
                "image": absolute_url(meta["og_image"]),
                "author": launchlayer_org(),
                "publisher": launchlayer_org(),
                "isPartOf": {"@id": f"{SITE}/blog/#webpage"},
            },
            {
                "@type": "BreadcrumbList",
                "@id": f"{url}#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE}/blog/"},
                    {"@type": "ListItem", "position": 3, "name": meta["headline"], "item": url},
                ],
            },
        ],
    }
    return json.dumps(payload, ensure_ascii=True, indent=2)


_TABLE_BLOCK = re.compile(r"<table\b[\s\S]*?</table>", re.I)


def wrap_blog_tables(body_html: str) -> str:
    """Give every Markdown table a scroll container the blog CSS can style."""
    return _TABLE_BLOCK.sub(
        lambda match: f'<div class="llblog-table">{match.group(0)}</div>',
        body_html,
    )


def render_post(path: Path, meta: dict[str, str], body: str) -> Path:
    missing = [key for key in REQUIRED if not meta.get(key)]
    if missing:
        raise ValueError(f"{path.name} missing frontmatter: {', '.join(missing)}")
    if path.stem != meta["slug"]:
        raise ValueError(
            f"{path.name}: filename must match slug '{meta['slug']}' "
            "(this is the public URL and must not change)."
        )
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", meta["slug"]):
        raise ValueError(f"Invalid slug '{meta['slug']}'")

    try:
        import markdown
    except ImportError:
        sys.exit("Install the markdown package first: pip install markdown")
    body_html = wrap_blog_tables(
        markdown.markdown(
            body,
            extensions=["extra", "sane_lists", "smarty"],
            output_format="html",
        )
    )
    slug = meta["slug"]
    url = f"{SITE}/blog/{slug}/"
    title = html.escape(meta["title"])
    headline = html.escape(meta["headline"])
    description = html.escape(meta["description"])
    category = html.escape(meta["category"])
    category_path = html.escape(meta["category_path"])
    author = html.escape(meta["author"])
    image = html.escape(meta["image"])
    og_image = html.escape(absolute_url(meta["og_image"]))
    image_alt = html.escape(meta["image_alt"])
    display_date = html.escape(format_display_date(meta["date"]))
    published = html.escape(iso_datetime(meta["date"]))

    page = f"""<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title} — LaunchLayer</title>
  <meta name="description" content="{description}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="{url}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/icons/favicon-16.png">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/icons/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/icons/icon-192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/icons/icon-512.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/icons/apple-touch-icon.png">

  <meta property="og:site_name" content="LaunchLayer">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="en_GB">
  <meta property="og:title" content="{title} — LaunchLayer">
  <meta property="og:description" content="{description}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{og_image}">
  <meta property="article:published_time" content="{published}">
  <meta property="article:author" content="{author}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{title} — LaunchLayer">
  <meta name="twitter:description" content="{description}">
  <meta name="twitter:image" content="{og_image}">
  <meta name="twitter:url" content="{url}">

  <link rel="preload" href="/assets/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/space-grotesk-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/css/fonts.css">
  <link rel="stylesheet" href="/assets/css/design-tokens.css">
  <script defer src="https://cloud.umami.is/script.js" data-website-id="13fbd69e-1f5b-4c12-b4b3-0b859486451a" data-domains="launchlayer.uk"></script>
  <link rel="stylesheet" href="/assets/css/global-nav-footer.css?v=footer-20260928c">
  <link rel="stylesheet" href="/assets/css/cookie-consent.css">
  <link rel="stylesheet" href="/assets/css/custom.css">
  <link rel="stylesheet" href="/assets/css/site-glass.css">
  <script type="application/ld+json">
{article_schema(meta, url)}
  </script>
</head>
<body class="llsite-body">
  <header class="ll-site-header">
    <div class="ll-header-wrap">
      <a href="/" class="ll-header-logo">
        <img src="/assets/images/image-0961fde4.png" alt="LaunchLayer" style="height: 38px; width: auto; display: block;" onError="this.onerror=null;this.src='/assets/images/image-cbf4c0a5.ico';">
      </a>
      <input type="checkbox" id="ll-burger-toggle" class="ll-burger-input" style="display:none;">
      <label for="ll-burger-toggle" class="ll-burger-btn" aria-label="Toggle Menu">
        <span></span><span></span><span></span>
      </label>
      <ul class="ll-header-nav">
        <li><a href="/">Home</a></li>
        <li><a href="/about">About</a></li>
        <li class="ll-dropdown-container">
          <span class="ll-dropdown-trigger">
            Services
            <svg class="ll-dropdown-chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1 1l4 4 4-4"/></svg>
          </span>
          <ul class="ll-dropdown-menu">
            <li><a href="/services">All Services &amp; Pricing</a></li>
            <li><a href="/custom-pc-builds">Custom PC Builds</a></li>
            <li><a href="/business">Business Solutions</a></li>
          </ul>
        </li>
        <li><a href="/contact">Contact Us</a></li>
      </ul>
    </div>
  </header>

  <main id="page">
    <div class="llblog-post-shell">
      <div class="blog-item-wrapper">
        <article class="h-entry entry" itemscope itemtype="https://schema.org/BlogPosting">
          <div class="blog-item-inner-wrapper">
            <figure class="llblog-hero-image">
              <img src="{image}" alt="{image_alt}" width="1152" height="864">
            </figure>
            <div class="blog-item-title">
              <h1 class="entry-title" itemprop="headline">{headline}</h1>
            </div>
            <div class="blog-item-meta-wrapper">
              <a href="/blog/category/{category_path.lower()}/" class="blog-item-category">{category}</a>
              <time class="dt-published" datetime="{published}" itemprop="datePublished">{display_date}</time>
              <span itemprop="author">{author}</span>
            </div>
            <div class="blog-item-content e-content llblog-md" itemprop="articleBody">
{body_html}
            </div>
            <p class="llblog-author">Written by {author}</p>
          </div>
        </article>
      </div>
    </div>
    {pagination_html(meta)}
  </main>

  <footer class="launchlayer-master-footer">
    <div class="footer-top-segment">
      <div class="footer-brand-block">
        <a href="/" title="LaunchLayer Home">
          <img src="/assets/images/image-0961fde4.png" alt="LaunchLayer" class="brand-master-logo" width="139" height="66" loading="lazy" decoding="async">
        </a>
        <p class="brand-tagline-text">Honest, jargon-free PC &amp; laptop repairs, fast speed upgrades, custom gaming builds, and simple tech support for local homes and businesses.</p>
      </div>
      <ul class="inline-nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/blog">Blog</a></li>
        <li><a href="/brands-supported">Brands Supported</a></li>
        <li><a href="/reviews">Reviews</a></li>
        <li><a href="/faqs">FAQs</a></li>
        <li><a href="/privacy-policy">Privacy</a></li>
      </ul>
    </div>
    <div class="footer-matrix-section">
      <button type="button" class="footer-matrix-title service-coverage-accordion-header" data-accordion aria-expanded="true">Our South Essex Service Coverage</button>
      <div class="footer-matrix-grid">
        <div class="matrix-node"><a href="/wickford-pc-repair/">Wickford PC Repair</a></div>
        <div class="matrix-node"><a href="/wickford-laptop-repair/">Wickford Laptop Repair</a></div>
        <div class="matrix-node"><a href="/macbook-repair-wickford/">Wickford MacBook Repair</a></div>
        <div class="matrix-node"><a href="/wickford-virus-removal/">Wickford Virus Removal</a></div>
        <div class="matrix-node"><a href="/basildon-pc-repair/">Basildon PC Repair (SS13-SS16)</a></div>
        <div class="matrix-node"><a href="/billericay-pc-repair/">Billericay PC Repair (CM11)</a></div>
        <div class="matrix-node"><a href="/brentwood-pc-repair/">Brentwood PC Repair (CM13-CM15)</a></div>
        <div class="matrix-node"><a href="/chelmsford-pc-repair/">Chelmsford PC Repair (CM1)</a></div>
        <div class="matrix-node"><a href="/southend-pc-repair/">Southend PC Repairs (SS0)</a></div>
        <div class="matrix-node"><a href="/rayleigh-laptop-service/">Rayleigh Laptop Service (SS6)</a></div>
        <div class="matrix-node data-recovery-special-node"><a href="/data-recovery/">Data Recovery Essex</a></div>
      </div>
    </div>
    <div class="footer-compliance-bar">
      <div class="footer-legal-stack">
      <p class="copyright-text-notice">&copy; 2026 LaunchLayer Ltd. All rights reserved.</p>
      <p class="footer-company-line">LaunchLayer Ltd · Company no. 16460298 · 32 Glebe Road, Wickford, Essex SS11 8EU · No-Fix-No-Fee</p>
    </div>

      <div class="footer-right-assets">
        <div class="bark-widget-wrapper">
          <a href="https://www.bark.com/en/gb/company/launchlayer/2MyKZd/" target="_blank" class="bark-widget" data-type="pro" data-id="2MyKZd" data-image="medium-navy" data-version="3.0" rel="noopener">LaunchLayer</a>
          <script src="https://www.bark.com/assets/js/frontend-v2/widgets-v2.64f07b24c109cff4b977db1f82909516.v2.js" defer></script>
        </div>
        <div class="footer-social-strip">
          <a href="https://www.instagram.com/launchlayeruk/" target="_blank" class="social-icon-vector" title="Instagram" rel="noopener" aria-label="LaunchLayer on Instagram (opens in a new tab)"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg></a>
          <a href="https://www.facebook.com/LaunchLayerWickford" target="_blank" class="social-icon-vector" title="Facebook" rel="noopener" aria-label="LaunchLayer on Facebook (opens in a new tab)"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>
          <a href="https://www.linkedin.com/company/launchlayeruk" target="_blank" class="social-icon-vector" title="LinkedIn" rel="noopener" aria-label="LaunchLayer on LinkedIn (opens in a new tab)"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg></a>
          <a href="https://x.com/LaunchLayerUK" target="_blank" class="social-icon-vector" title="X" rel="noopener" aria-label="LaunchLayer on X (opens in a new tab)"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
          <a href="https://nextdoor.co.uk/page/launchlayer-wickford-england" target="_blank" class="social-icon-vector" title="Nextdoor" rel="noopener" aria-label="LaunchLayer on Nextdoor (opens in a new tab)"><svg viewBox="0.696 -4.1 66.786 66.786" aria-hidden="true" focusable="false"><path d="M22.1789 8.27054V0.791992H12.2953V14.4821L0.696289 21.7701L5.95482 30.14L12.2953 26.154V53.8538H55.8828V26.154L62.2233 30.14L67.4819 21.7701L34.0863 0.791992L22.1789 8.27054Z"/></svg></a>
        </div>
      </div>
    </div>
  </footer>
  <div class="launchlayer-floating-pill-container">
    <a href="tel:07367652987" class="launchlayer-floating-btn" data-umami-event="call-click" data-umami-event-location="floating" aria-label="Call LaunchLayer Workshop">
      <span class="floating-phone-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
      </span>
      <span class="floating-btn-text">Call Workshop</span>
    </a>
  </div>
  <script src="/assets/js/global-nav-footer.js?v=footer-20261010a" defer></script>
  <script src="/assets/js/cookie-consent.js" defer></script>
</body>
</html>
"""
    out_dir = OUT_BLOG / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "index.html"
    # Marker so we never hand-edit generated HTML.
    banner = "<!-- Generated from content/blog/%s.md by scripts/build-blog.py. Edit the Markdown, then re-run the script. -->\n" % slug
    rendered = banner + apply_umami(page, f"blog/{slug}")
    out_file.write_text(rendered, encoding="utf-8")
    assert_post_chrome(rendered, out_file)
    return out_file


def load_posts() -> list[tuple[Path, dict[str, str], str]]:
    loaded = []
    for path in sorted(POSTS_DIR.glob("*.md")):
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        missing = [key for key in REQUIRED if not meta.get(key)]
        if missing:
            raise ValueError(f"{path.name} missing frontmatter: {', '.join(missing)}")
        if path.stem != meta["slug"]:
            raise ValueError(f"{path.name}: filename must match slug '{meta['slug']}'")
        loaded.append((path, meta, body))
    return loaded


_META_TAG = re.compile(r"<meta\b[^>]*>", re.I)
_LINK_TAG = re.compile(r"<link\b[^>]*>", re.I)
_LDJSON = re.compile(
    r"<script\s+type=[\"']application/ld\+json[\"']>\s*(.*?)\s*</script>",
    re.I | re.S,
)


def _attr(tag: str, name: str) -> str:
    match = re.search(rf"\b{name}=[\"']([^\"']*)[\"']", tag, re.I)
    return html.unescape(match.group(1)).strip() if match else ""


def meta_content(page: str, *, name: str = "", prop: str = "", itemprop: str = "") -> str:
    for match in _META_TAG.finditer(page):
        tag = match.group(0)
        if name and _attr(tag, "name") != name:
            continue
        if prop and _attr(tag, "property") != prop:
            continue
        if itemprop and _attr(tag, "itemprop") != itemprop:
            continue
        if name or prop or itemprop:
            return _attr(tag, "content")
    return ""


def canonical_href(page: str) -> str:
    for match in _LINK_TAG.finditer(page):
        tag = match.group(0)
        rel = _attr(tag, "rel").lower()
        if "canonical" in rel.split():
            return _attr(tag, "href")
    return ""


def slash_url(url: str) -> str:
    if not url:
        return url
    if "#" in url:
        base, frag = url.split("#", 1)
        if not base.endswith("/"):
            base += "/"
        return f"{base}#{frag}"
    return url if url.endswith("/") else url + "/"


def post_is_indexable(page: str) -> bool:
    robots = meta_content(page, name="robots").lower()
    return "noindex" not in robots


def post_categories(page: str) -> set[str]:
    found = set()
    for match in re.finditer(r'href=["\']/blog/category/([^"\']+)["\']', page, re.I):
        slug = html.unescape(match.group(1)).strip("/").lower()
        if slug:
            found.add(slug)
    return found


def load_public_posts() -> list[dict[str, str]]:
    """Live blog posts, from the same folders the sitemap should list.

    A post counts when blog/<slug>/index.html exists and is indexable.
    Retired slugs in DEAD_BLOG_SLUGS are never included.
    """
    posts: list[dict[str, str]] = []
    for folder in sorted(p for p in OUT_BLOG.iterdir() if p.is_dir()):
        if folder.name == "category" or folder.name in DEAD_BLOG_SLUGS:
            continue
        path = folder / "index.html"
        if not path.is_file():
            continue
        page = path.read_text(encoding="utf-8")
        if not post_is_indexable(page):
            continue
        url = slash_url(canonical_href(page) or f"{SITE}/blog/{folder.name}/")
        headline = (
            meta_content(page, itemprop="headline")
            or meta_content(page, prop="og:title")
            or folder.name
        )
        headline = re.sub(r"\s+[—–-]\s+LaunchLayer\s*$", "", headline).strip()
        published = meta_content(page, itemprop="datePublished")
        modified = meta_content(page, itemprop="dateModified") or published
        image = absolute_url(
            meta_content(page, prop="og:image") or meta_content(page, itemprop="image")
        )
        description = meta_content(page, name="description")
        posts.append(
            {
                "slug": folder.name,
                "url": url,
                "headline": headline,
                "description": description,
                "datePublished": published,
                "dateModified": modified,
                "image": image,
                "categories": post_categories(page),
                "path": str(path),
                "html": page,
            }
        )
    posts.sort(key=lambda item: (item["datePublished"], item["slug"]), reverse=True)
    return posts


def blog_posting_node(post: dict) -> dict:
    url = slash_url(post["url"])
    node = {
        "@type": "BlogPosting",
        "@id": f"{url}#article",
        "headline": post["headline"],
        "description": post["description"],
        "datePublished": post["datePublished"],
        "dateModified": post["dateModified"] or post["datePublished"],
        "inLanguage": "en-GB",
        "url": url,
        "mainEntityOfPage": url,
        "author": launchlayer_org(),
        "publisher": launchlayer_org(),
    }
    if post.get("image"):
        node["image"] = post["image"]
    return node


def _dump_ld(data: dict) -> str:
    body = json.dumps(data, indent=2, ensure_ascii=False)
    return f'<script type="application/ld+json">\n{body}\n</script>'


def _graph_nodes(data: dict) -> list[dict]:
    if isinstance(data.get("@graph"), list):
        return [node for node in data["@graph"] if isinstance(node, dict)]
    if data.get("@type"):
        return [data]
    return []


def repair_post_schema(post: dict) -> bool:
    """Replace a copied blog-index CollectionPage with this post's BlogPosting.

    Existing FAQPage nodes in the same script are kept. Generated Markdown
    posts are left to article_schema() so a rebuild does not fight the template.
    """
    path = Path(post["path"])
    page = post["html"]
    if "Generated from content/blog/" in page:
        return False
    if "BlogPosting" not in page and "CollectionPage" not in page:
        return False

    def replacer(match: re.Match[str]) -> str:
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return match.group(0)
        if not isinstance(data, dict):
            return match.group(0)
        nodes = _graph_nodes(data)
        types = []
        for node in nodes:
            kind = node.get("@type")
            types.extend(kind if isinstance(kind, list) else [kind])
        if "CollectionPage" not in types and "BlogPosting" not in types:
            return match.group(0)
        kept = []
        for node in nodes:
            kind = node.get("@type")
            kind_list = kind if isinstance(kind, list) else [kind]
            if "CollectionPage" in kind_list or "BlogPosting" in kind_list:
                continue
            kept.append(node)
        graph = {"@context": "https://schema.org", "@graph": [blog_posting_node(post), *kept]}
        return _dump_ld(graph)

    updated = _LDJSON.sub(replacer, page, count=0)
    if updated == page:
        return False
    path.write_text(updated, encoding="utf-8")
    post["html"] = updated
    return True


def item_list(posts: list[dict], list_id: str) -> dict:
    items = []
    for index, post in enumerate(posts, start=1):
        items.append(
            {
                "@type": "ListItem",
                "position": index,
                "url": slash_url(post["url"]),
                "name": post["headline"],
            }
        )
    return {
        "@type": "ItemList",
        "@id": list_id,
        "name": "Technical Knowledge Base Feed",
        "numberOfItems": len(items),
        "itemListElement": items,
    }


def patch_collection_page(
    path: Path,
    posts: list[dict],
    page_url: str,
    list_id: str,
    name: str = "",
    description: str = "",
) -> bool:
    if not path.is_file():
        return False
    page = path.read_text(encoding="utf-8")
    page_url = slash_url(page_url)

    def replacer(match: re.Match[str]) -> str:
        raw = match.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            return match.group(0)
        if not isinstance(data, dict):
            return match.group(0)
        nodes = _graph_nodes(data)
        if not any(node.get("@type") == "CollectionPage" for node in nodes):
            return match.group(0)
        for node in nodes:
            if node.get("@type") != "CollectionPage":
                continue
            node["@id"] = f"{page_url}#webpage"
            node["url"] = page_url
            if name:
                node["name"] = name
            if description:
                node["description"] = description
            node["mainEntity"] = item_list(posts, list_id)
        data["@context"] = "https://schema.org"
        data["@graph"] = nodes
        return _dump_ld(data)

    updated = _LDJSON.sub(replacer, page)
    if updated == page:
        return False
    path.write_text(updated, encoding="utf-8")
    return True


def patch_blog_collections(posts: list[dict]) -> None:
    index = LISTING_PAGES["all"]
    patch_collection_page(index, posts, f"{SITE}/blog/", f"{SITE}/blog/#feedlist")
    for category, path in LISTING_PAGES.items():
        if category == "all":
            continue
        slug = category.lower().replace(" ", "+")
        # On-disk folder is Title-Case. The public canonical is lowercase.
        page_url = f"{SITE}/blog/category/{slug}/"
        selected = [post for post in posts if slug in post["categories"]]
        list_id = f"{page_url}#feedlist"
        page = path.read_text(encoding="utf-8") if path.is_file() else ""
        title = meta_content(page, prop="og:title") or category
        title = re.sub(r"\s+[—–-]\s+LaunchLayer\s*$", "", title).strip()
        description = meta_content(page, name="description")
        patch_collection_page(
            path,
            selected,
            page_url,
            list_id,
            name=title,
            description=description,
        )


def is_published(meta: dict[str, str], today: datetime.date) -> bool:
    """Published means the post is not a draft and its date has arrived.

    draft: true holds a post back even when the date is today or earlier.
    A missing draft field is treated as not a draft.
    """
    if str(meta.get("draft", "")).lower() in {"true", "yes", "1"}:
        return False
    try:
        posted = datetime.strptime(meta["date"], "%Y-%m-%d").date()
    except (KeyError, ValueError) as exc:
        raise PublishGuardError(
            f"Post '{meta.get('slug', '?')}' has an unreadable date {meta.get('date')!r}."
        ) from exc
    return posted <= today


def blog_post_url(slug: str) -> str:
    return f"{SITE}/blog/{slug}/"


def repo_asset_path(url_path: str, root: Path) -> Path:
    value = (url_path or "").split("?", 1)[0].strip()
    if value.startswith(SITE):
        value = value[len(SITE) :]
    return root / value.lstrip("/")


def assert_published_post_images(
    posts: list[tuple[Path, dict[str, str], str]],
    today: datetime.date,
    root: Path,
) -> None:
    """Fail when a published post's hero or OG file is not in the repo."""
    missing: list[str] = []
    for path, meta, _body in posts:
        if not is_published(meta, today):
            continue
        where = path.name
        for key in ("image", "og_image"):
            rel = (meta.get(key) or "").strip()
            if not rel:
                missing.append(f"{where}: published post is missing front matter {key}.")
                continue
            file_path = repo_asset_path(rel, root)
            if not file_path.is_file():
                missing.append(
                    f"{where}: published post {key} file does not exist: {rel}"
                )
    if missing:
        raise PublishGuardError(
            "Published post image files are missing:\n- " + "\n- ".join(missing)
        )


def published_post_urls(
    posts: list[tuple[Path, dict[str, str], str]],
    today: datetime.date,
) -> list[str]:
    return [
        blog_post_url(meta["slug"])
        for _path, meta, _body in posts
        if is_published(meta, today)
    ]


def sitemap_urls_to_add(
    markdown_posts: list[tuple[Path, dict[str, str], str]],
    today: datetime.date,
    public_posts: list[dict] | None = None,
    include_categories: bool = True,
) -> list[str]:
    """URLs the publish pipeline may insert.

    Markdown posts are added only when draft is off and date <= today.
    A draft or future-dated Markdown post is never added, even if an HTML
    copy already exists. Legacy HTML-only posts (no Markdown file) and
    category hubs stay eligible so existing sitemap behaviour is unchanged.
    """
    markdown_slugs = {meta["slug"] for _path, meta, _body in markdown_posts}
    blocked = {
        blog_post_url(meta["slug"])
        for _path, meta, _body in markdown_posts
        if not is_published(meta, today)
    }
    urls: list[str] = []
    seen: set[str] = set()

    def push(url: str) -> None:
        if url in blocked or url in seen:
            return
        urls.append(url)
        seen.add(url)

    for url in published_post_urls(markdown_posts, today):
        push(url)
    for post in public_posts or []:
        url = slash_url(post["url"])
        slug = url.rstrip("/").rsplit("/", 1)[-1]
        if slug in markdown_slugs:
            continue
        push(url)
    if include_categories:
        for category in LISTING_PAGES:
            if category == "all":
                continue
            slug = category.lower().replace(" ", "+")
            push(f"{SITE}/blog/category/{slug}/")
    return urls


def insert_sitemap_urls(xml: str, urls: list[str]) -> tuple[str, list[str]]:
    """Insert missing <loc> entries in alphabetical order.

    Existing entries stay put: nothing is removed or reordered. A URL that
    is already present is skipped. New entries match the file's shape,
    <url><loc>...</loc></url>, with no <lastmod>.
    """
    added: list[str] = []
    for url in urls:
        needle = f"<loc>{url}</loc>"
        if needle in xml:
            continue
        block = f"  <url>\n    <loc>{url}</loc>\n  </url>\n"
        inserted = False
        for match in re.finditer(r"<loc>(.*?)</loc>", xml):
            if match.group(1) > url:
                start = xml.rfind("<url>", 0, match.start())
                if start >= 0:
                    # Insert before the whole line so the next entry's indent stays put.
                    line_start = xml.rfind("\n", 0, start)
                    line_start = 0 if line_start < 0 else line_start + 1
                    xml = xml[:line_start] + block + xml[line_start:]
                    inserted = True
                    break
        if not inserted:
            if "</urlset>" not in xml:
                raise PublishGuardError("sitemap.xml is missing </urlset>.")
            xml = xml.replace("</urlset>", block + "</urlset>", 1)
        added.append(url)
    return xml, added


def sync_sitemap(posts: list[dict]) -> None:
    """Add published blog URLs the sitemap does not already list.

    A Markdown post is published when draft is false (or omitted) and its
    date is on or before today. Drafts and future-dated posts are skipped.
    Category hubs stay included because each one is index,follow with its
    own canonical.
    """
    today = datetime.now().date()
    urls = sitemap_urls_to_add(load_posts(), today, posts, include_categories=True)
    sitemap = ROOT / "sitemap.xml"
    xml = sitemap.read_text(encoding="utf-8")
    updated, added = insert_sitemap_urls(xml, urls)
    if updated != xml:
        sitemap.write_text(updated, encoding="utf-8")
    for url in added:
        print(f"Sitemap + {url}")


def _self_test_sitemap_and_images() -> None:
    """Sitemap inserts are idempotent; drafts, future posts, and missing images fail closed."""
    today = datetime.strptime("2026-10-07", "%Y-%m-%d").date()

    def meta(slug: str, iso: str, draft: str) -> dict[str, str]:
        return {
            "slug": slug,
            "date": iso,
            "draft": draft,
            "image": "/assets/images/x.jpg",
            "og_image": "/assets/meta/x.jpg",
        }

    posts = [
        (Path("already.md"), meta("already", "2026-10-01", "false"), ""),
        (Path("new-post.md"), meta("new-post", "2026-10-07", "false"), ""),
        (Path("held.md"), meta("held", "2026-10-01", "true"), ""),
        (Path("later.md"), meta("later", "2026-10-14", "false"), ""),
        (Path("later-draft.md"), meta("later-draft", "2026-12-02", "true"), ""),
    ]
    public = [
        {"url": blog_post_url("held")},
        {"url": blog_post_url("later")},
        {"url": blog_post_url("legacy-only")},
    ]
    urls = sitemap_urls_to_add(posts, today, public, include_categories=False)
    for slug in ("already", "new-post", "legacy-only"):
        if blog_post_url(slug) not in urls:
            raise PublishGuardError(
                f"self-test: expected {slug} to be eligible for the sitemap."
            )
    for slug in ("held", "later", "later-draft"):
        if blog_post_url(slug) in urls:
            raise PublishGuardError(
                f"self-test: {slug} must not be added to the sitemap."
            )

    xml = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://launchlayer.uk/blog/already/</loc>
  </url>
  <url>
    <loc>https://launchlayer.uk/blog/zzz/</loc>
  </url>
</urlset>
"""
    once, added = insert_sitemap_urls(xml, urls)
    twice, added_again = insert_sitemap_urls(once, urls)
    if twice != once or added_again:
        raise PublishGuardError("self-test: sitemap add was not idempotent.")
    if "<lastmod>" in once:
        raise PublishGuardError("self-test: sitemap insert added <lastmod>.")
    new_loc = f"<loc>{blog_post_url('new-post')}</loc>"
    if once.count(new_loc) != 1:
        raise PublishGuardError("self-test: new sitemap URL was not added once.")
    if once.count(f"<loc>{blog_post_url('already')}</loc>") != 1:
        raise PublishGuardError("self-test: sitemap insert duplicated an existing URL.")
    for slug in ("held", "later", "later-draft"):
        if f"<loc>{blog_post_url(slug)}</loc>" in once:
            raise PublishGuardError(
                f"self-test: sitemap insert included {slug}."
            )
    already_at = once.find(blog_post_url("already"))
    legacy_at = once.find(blog_post_url("legacy-only"))
    new_at = once.find(blog_post_url("new-post"))
    zzz_at = once.find(f"{SITE}/blog/zzz/")
    if not (0 <= already_at < legacy_at < new_at < zzz_at):
        raise PublishGuardError(
            "self-test: sitemap insert did not keep alphabetical order."
        )
    if once.find(blog_post_url("already")) > once.find(f"{SITE}/blog/zzz/"):
        raise PublishGuardError(
            "self-test: sitemap insert reordered an existing entry."
        )
    for slug in ("already", "zzz"):
        kept = (
            f"  <url>\n    <loc>{SITE}/blog/{slug}/</loc>\n  </url>"
        )
        if kept not in once:
            raise PublishGuardError(
                f"self-test: sitemap insert altered the existing {slug} entry."
            )
    if set(added) != {blog_post_url("new-post"), blog_post_url("legacy-only")}:
        raise PublishGuardError(
            f"self-test: unexpected sitemap adds: {added}"
        )


    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        image = root / "assets" / "images" / "ok.jpg"
        og = root / "assets" / "meta" / "ok.jpg"
        image.parent.mkdir(parents=True)
        og.parent.mkdir(parents=True)
        image.write_bytes(b"jpeg")
        og.write_bytes(b"jpeg")
        present = {
            "slug": "ok",
            "date": "2026-10-07",
            "draft": "false",
            "image": "/assets/images/ok.jpg",
            "og_image": "/assets/meta/ok.jpg",
        }
        assert_published_post_images([(Path("ok.md"), present, "")], today, root)
        absent = {
            "slug": "needs-photo",
            "date": "2026-10-07",
            "draft": "false",
            "image": "/assets/images/__guard_missing__.jpg",
            "og_image": "/assets/meta/__guard_missing__.jpg",
        }
        try:
            assert_published_post_images(
                [(Path("needs-photo.md"), absent, "")], today, root
            )
        except PublishGuardError as exc:
            if "does not exist" not in str(exc):
                raise PublishGuardError(
                    "self-test: missing-image guard fired without a clear message."
                ) from exc
        else:
            raise PublishGuardError("self-test: missing-image guard did not fire.")
        held = {
            "slug": "held",
            "date": "2026-10-01",
            "draft": "true",
            "image": "/assets/images/__guard_missing__.jpg",
            "og_image": "/assets/meta/__guard_missing__.jpg",
        }
        future = {
            "slug": "later",
            "date": "2026-10-14",
            "draft": "false",
            "image": "/assets/images/__guard_missing__.jpg",
            "og_image": "/assets/meta/__guard_missing__.jpg",
        }
        assert_published_post_images(
            [
                (Path("held.md"), held, ""),
                (Path("later.md"), future, ""),
            ],
            today,
            root,
        )


def _self_test_forward_blog_links() -> None:
    """A link to a later post fails. A link to an earlier post or a legacy page passes."""
    early = {"slug": "early", "date": "2026-10-28"}
    older = {"slug": "older", "date": "2026-09-01"}
    later = {"slug": "later", "date": "2026-12-09"}
    forward = [
        (Path("early.md"), early, "See the [later note](/blog/later/) and [older](/blog/older/)."),
        (Path("older.md"), older, ""),
        (Path("later.md"), later, "Back to [older](/blog/older/)."),
    ]
    try:
        assert_blog_links_live_by_publish_date(forward, set())
    except PublishGuardError as exc:
        message = str(exc)
        if "/blog/later/" not in message or "2026-12-09" not in message:
            raise PublishGuardError(
                "self-test: forward-link guard fired without naming the later post."
            ) from exc
    else:
        raise PublishGuardError("self-test: forward blog link did not fail.")

    same_day = [
        (Path("early.md"), early, "See [older](/blog/older/) and [legacy](/blog/legacy-post/)."),
        (Path("older.md"), older, "A [category hub](/blog/category/useful-tips/) is not a post."),
    ]
    assert_blog_links_live_by_publish_date(same_day, {"legacy-post"})

    missing = [
        (Path("early.md"), early, "See [nowhere](/blog/not-a-real-post/)."),
    ]
    try:
        assert_blog_links_live_by_publish_date(missing, set())
    except PublishGuardError as exc:
        if "not-a-real-post" not in str(exc):
            raise PublishGuardError(
                "self-test: missing blog link did not fail clearly."
            ) from exc
    else:
        raise PublishGuardError("self-test: link to a missing blog post did not fail.")


def refresh_blog_schema() -> None:
    posts = load_public_posts()
    repaired = 0
    for post in posts:
        if repair_post_schema(post):
            repaired += 1
    # Re-read after repairs so headlines/categories reflect the saved HTML.
    posts = load_public_posts()
    patch_blog_collections(posts)
    sync_sitemap(posts)
    print(f"Blog schema: {repaired} post(s) set to BlogPosting; index lists {len(posts)} live URL(s).")


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Build Markdown blog posts due on or before today.")
    parser.add_argument(
        "--today",
        help="Override today's date (YYYY-MM-DD) to preview a scheduled publish.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate generated post chrome, listing cards, published image files, and blog links that must already be live.",
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="Prove chrome, listing, sitemap, missing-image, and forward-link guards fail closed.",
    )
    args = parser.parse_args()
    try:
        if args.self_test:
            run_self_test()
            return 0
        if args.check:
            check_generated_output()
            print("Blog publish guard: ok.")
            return 0

        today = (
            datetime.strptime(args.today, "%Y-%m-%d").date()
            if args.today
            else datetime.now().date()
        )
        assert_listing_card_emitter()

        loaded = load_posts()
        assert_blog_links_live_by_publish_date(loaded, legacy_blog_slugs())
        scheduled = [(p, m, b) for p, m, b in loaded if not is_live(m, today)]
        live = [(p, m, b) for p, m, b in loaded if is_live(m, today)]
        live.sort(key=lambda item: (item[1]["date"], item[1]["slug"]), reverse=True)

        for i, (path, meta, _body) in enumerate(live):
            newer = live[i - 1][1] if i > 0 else None
            older = live[i + 1][1] if i + 1 < len(live) else None
            if newer:
                meta["prev_slug"] = newer["slug"]
                meta["prev_title"] = newer["headline"]
            else:
                meta.pop("prev_slug", None)
                meta.pop("prev_title", None)
            if older:
                meta["next_slug"] = older["slug"]
                meta["next_title"] = older["headline"]
            else:
                meta["next_slug"] = LEGACY_NEXT_SLUG
                meta["next_title"] = LEGACY_NEXT_TITLE
            if not args.today:
                stamp_published(path, meta)
            out = render_post(path, meta, _body)
            print(f"Published {out.relative_to(ROOT)}  ({meta['date']})")

        for path, meta, _body in scheduled:
            print(f"Draft until {meta['date']}: {path.relative_to(ROOT)}")

        all_cards = "\n    \n".join(
            listing_card(meta, index=i) for i, (_p, meta, _b) in enumerate(live, start=1)
        )
        patch_listing(LISTING_PAGES["all"], all_cards)
        for category, page in LISTING_PAGES.items():
            if category == "all":
                continue
            cat_posts = [(p, m, b) for p, m, b in live if m["category"] == category]
            cards = "\n    \n".join(
                listing_card(meta, index=i)
                for i, (_p, meta, _b) in enumerate(cat_posts, start=1)
            )
            patch_listing(page, cards)
        print(f"Listings updated for {len(live)} live Markdown post(s).")
        refresh_blog_schema()
        check_generated_output()
        return 0
    except PublishGuardError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
