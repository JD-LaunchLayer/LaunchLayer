#!/usr/bin/env python3
"""Render Markdown posts in content/blog/ to public HTML at /blog/<slug>/.

Public URLs never change: the slug in frontmatter is the folder name Google
already knows. Edit the .md file, then run:

    python3 scripts/build-blog.py

Hosting stays static — this script writes blog/<slug>/index.html so you can
keep deploying the folder as-is. Old Squarespace posts are left untouched.
"""
from __future__ import annotations

import html
import json
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    import markdown
except ImportError:
    sys.exit("Install the markdown package first: pip install markdown")

ROOT = Path(__file__).resolve().parents[1]
POSTS_DIR = ROOT / "content" / "blog"
OUT_BLOG = ROOT / "blog"
SITE = "https://www.launchlayer.uk"
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


def listing_card(meta: dict[str, str]) -> str:
    slug = html.escape(meta["slug"])
    headline = html.escape(meta["headline"])
    image = html.escape(meta["image"])
    category = html.escape(meta["category"])
    category_path = html.escape(meta["category_path"])
    author = html.escape(meta["author"])
    shown = html.escape(listing_date(meta["date"]))
    css = CATEGORY_CLASS.get(meta["category"], "useful-tips")
    return f'''    <article class="hentry category-{css} author-jordan-duggins post-type-text blog-item entry">
      <section class="blog-image-wrapper">
      <a href="/blog/{slug}" class="image-wrapper" data-animation-role="image">
<img data-src="{image}" data-image="{image}" data-image-dimensions="1152x864" data-image-focal-point="0.5,0.5" alt="{headline}" data-load="false" src="{image}" width="1152" height="864" sizes="(max-width:767px)200vw,140vw" class="image" style="display:block;position: absolute; height: 100%; width: 100%; object-fit: cover; object-position: 50% 50%;" loading="lazy" decoding="async">
</a>
      </section>
      <section class="blog-item-summary">
        <div class="blog-item-text">
          <div class="blog-meta-section">
  <span class="blog-meta-primary">
      <span class="blog-categories-list">
          <a href="/blog/category/{category_path}" class="blog-categories">{category}</a>
      </span>
      <span class="blog-author">{author}</span>
    <time class="blog-date" pubdate data-animation-role="date">{shown}</time>
  </span>
</div>
<h1 class="blog-title">
    <a href="/blog/{slug}" data-no-animation>
    {headline}
  </a>
</h1>
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
                "image": f"{SITE}{meta['og_image']}",
                "author": {
                    "@type": "Person",
                    "name": meta["author"],
                },
                "publisher": {"@id": f"{SITE}/#organization"},
                "isPartOf": {"@id": f"{SITE}/blog/#webpage"},
            },
            {
                "@type": "BreadcrumbList",
                "@id": f"{url}#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE},
                    {"@type": "ListItem", "position": 2, "name": "Blog", "item": f"{SITE}/blog"},
                    {"@type": "ListItem", "position": 3, "name": meta["headline"], "item": url},
                ],
            },
        ],
    }
    return json.dumps(payload, ensure_ascii=True, indent=2)


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

    body_html = markdown.markdown(
        body,
        extensions=["extra", "sane_lists", "smarty"],
        output_format="html",
    )
    slug = meta["slug"]
    url = f"{SITE}/blog/{slug}"
    title = html.escape(meta["title"])
    headline = html.escape(meta["headline"])
    description = html.escape(meta["description"])
    category = html.escape(meta["category"])
    category_path = html.escape(meta["category_path"])
    author = html.escape(meta["author"])
    image = html.escape(meta["image"])
    og_image = html.escape(meta["og_image"])
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
  <link rel="icon" type="image/x-icon" href="/assets/images/image-cbf4c0a5.ico?format=100w">

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

  <link rel="stylesheet" href="/assets/css/global-nav-footer.css">
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
              <a href="/blog/category/{category_path}" class="blog-item-category">{category}</a>
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
      <div class="footer-matrix-title service-coverage-accordion-header" data-accordion>Our South Essex Service Coverage</div>
      <div class="footer-matrix-grid">
        <div class="matrix-node"><a href="/wickford-pc-repair">Wickford PC Repair (SS11)</a></div>
        <div class="matrix-node"><a href="/wickford-laptop-repair">Wickford Laptop Repair (SS12)</a></div>
        <div class="matrix-node"><a href="/wickford-virus-removal">Wickford Virus Removal</a></div>
        <div class="matrix-node"><a href="/basildon-pc-repair">Basildon PC Repair (SS13-SS16)</a></div>
        <div class="matrix-node"><a href="/billericay-pc-repair">Billericay PC Repair (CM11)</a></div>
        <div class="matrix-node"><a href="/brentwood-pc-repair">Brentwood PC Repair (CM13-CM15)</a></div>
        <div class="matrix-node"><a href="/chelmsford-pc-repair">Chelmsford PC Repair (CM1)</a></div>
        <div class="matrix-node"><a href="/southend-pc-repair">Southend PC Repairs (SS0)</a></div>
        <div class="matrix-node"><a href="/rayleigh-laptop-service">Rayleigh Laptop Service (SS6)</a></div>
        <div class="matrix-node data-recovery-special-node"><a href="/data-recovery">Data Recovery Essex</a></div>
      </div>
    </div>
    <div class="footer-compliance-bar">
      <p class="copyright-text-notice">&copy; 2026 LaunchLayer Ltd. All rights reserved.</p>
      <div class="footer-right-assets">
        <div class="footer-social-strip">
          <a href="https://www.instagram.com/launchlayeruk/" target="_blank" class="social-icon-vector" title="Instagram" rel="noopener"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.051.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg></a>
          <a href="https://www.facebook.com/LaunchLayerWickford" target="_blank" class="social-icon-vector" title="Facebook" rel="noopener"><svg viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>
          <a href="https://www.linkedin.com/company/launchlayeruk" target="_blank" class="social-icon-vector" title="LinkedIn" rel="noopener"><svg viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z"/></svg></a>
          <a href="https://x.com/LaunchLayerUK" target="_blank" class="social-icon-vector" title="X" rel="noopener"><svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg></a>
        </div>
      </div>
    </div>
  </footer>
  <div class="launchlayer-floating-pill-container">
    <a href="tel:07367652987" class="launchlayer-floating-btn" aria-label="Call LaunchLayer Workshop">
      <span class="floating-phone-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
        </svg>
      </span>
      <span class="floating-btn-text">Call Workshop</span>
    </a>
  </div>
  <script src="/assets/js/global-nav-footer.js" defer></script>
</body>
</html>
"""
    out_dir = OUT_BLOG / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / "index.html"
    # Marker so we never hand-edit generated HTML.
    banner = "<!-- Generated from content/blog/%s.md by scripts/build-blog.py. Edit the Markdown, then re-run the script. -->\n" % slug
    out_file.write_text(banner + page, encoding="utf-8")
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


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Build Markdown blog posts due on or before today.")
    parser.add_argument(
        "--today",
        help="Override today's date (YYYY-MM-DD) to preview a scheduled publish.",
    )
    args = parser.parse_args()
    today = (
        datetime.strptime(args.today, "%Y-%m-%d").date()
        if args.today
        else datetime.now().date()
    )

    loaded = load_posts()
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

    all_cards = "\n    \n".join(listing_card(meta) for _p, meta, _b in live)
    patch_listing(LISTING_PAGES["all"], all_cards)
    for category, page in LISTING_PAGES.items():
        if category == "all":
            continue
        cards = "\n    \n".join(
            listing_card(meta) for _p, meta, _b in live if meta["category"] == category
        )
        patch_listing(page, cards)
    print(f"Listings updated for {len(live)} live Markdown post(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
