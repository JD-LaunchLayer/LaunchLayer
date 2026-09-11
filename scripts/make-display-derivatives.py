#!/usr/bin/env python3
"""Build display-sized AVIF+WebP derivatives. Originals are never overwritten.

Blog listing thumbs sit at ~40% of the inset column (≈500px CSS, 800px at 2x).
Contact's hero background is full-bleed against a 1408px source, so that one
is encoded at native width.
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "assets" / "images"
THUMBS = IMAGES / "thumbs"
BLOG_WIDTH = 800
CONTACT_WIDTH = 1408
CONTACT_STEM = "image-475642d0"


def find_original(stem: str) -> Path | None:
    """Prefer a real raster over a misnamed duplicate .webp."""
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        path = IMAGES / f"{stem}{ext}"
        if path.exists():
            return path
    return None


def encode(src: Path, dest_stem: str, width: int) -> tuple[Path, Path]:
    THUMBS.mkdir(parents=True, exist_ok=True)
    im = Image.open(src)
    if im.mode != "RGB":
        im = im.convert("RGB")
    w, h = im.size
    if w > width:
        h = max(1, round(h * width / w))
        w = width
        im = im.resize((w, h), Image.Resampling.LANCZOS)
    avif = THUMBS / f"{dest_stem}.avif"
    webp = THUMBS / f"{dest_stem}.webp"
    im.save(avif, format="AVIF", quality=48)
    im.save(webp, format="WEBP", quality=75, method=6)
    return avif, webp


def listing_stems() -> list[str]:
    stems: list[str] = []
    seen: set[str] = set()
    for html in [ROOT / "blog" / "index.html", *sorted((ROOT / "blog" / "category").glob("*/index.html"))]:
        text = html.read_text(encoding="utf-8")
        for raw in __import__("re").findall(
            r'blog-image-wrapper[\s\S]{0,1200}?src="(/assets/images/[^"]+)"',
            text,
        ):
            stem = Path(raw.split("?", 1)[0]).stem
            if stem not in seen:
                seen.add(stem)
                stems.append(stem)
    return stems


def main() -> None:
    rows = []
    src = find_original(CONTACT_STEM)
    if not src:
        raise SystemExit(f"missing contact original for {CONTACT_STEM}")
    avif, webp = encode(src, f"{CONTACT_STEM}-w{CONTACT_WIDTH}", CONTACT_WIDTH)
    rows.append((CONTACT_STEM, src.name, avif.stat().st_size, webp.stat().st_size, CONTACT_WIDTH))

    for stem in listing_stems():
        src = find_original(stem)
        if not src:
            print(f"skip missing original: {stem}")
            continue
        avif, webp = encode(src, f"{stem}-w{BLOG_WIDTH}", BLOG_WIDTH)
        rows.append((stem, src.name, avif.stat().st_size, webp.stat().st_size, BLOG_WIDTH))

    print(f"{'stem':<42} {'src':<28} {'avif':>8} {'webp':>8}  w")
    for stem, src_name, a, w, width in rows:
        print(f"{stem:<42} {src_name:<28} {a:8d} {w:8d}  {width}")
    print(f"{len(rows)} derivatives written under {THUMBS.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
