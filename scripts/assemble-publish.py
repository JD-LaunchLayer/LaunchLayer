#!/usr/bin/env python3
"""Assemble the Netlify publish directory without internal docs.

The site has no framework build. With no publish directory set, Netlify
serves the repository root, so a committed docs/ folder would be public
at /docs/. This copies tracked files into _publish and leaves docs/ out.
Netlify publishes _publish (see netlify.toml).
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "_publish"


def tracked_files() -> list[str]:
    raw = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    return [item.decode() for item in raw.split(b"\0") if item]


def main() -> int:
    files = tracked_files()
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    copied = 0
    skipped = 0
    for rel in files:
        if rel == "docs" or rel.startswith("docs/"):
            skipped += 1
            continue
        src = ROOT / rel
        if not src.is_file():
            print(f"ERROR: tracked file missing: {rel}", file=sys.stderr)
            return 1
        dest = OUT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        copied += 1
    if (OUT / "docs").exists():
        print("ERROR: docs/ was copied into the publish directory", file=sys.stderr)
        return 1
    for required in ("index.html", "_redirects", "netlify.toml"):
        if not (OUT / required).is_file():
            print(f"ERROR: publish directory is missing {required}", file=sys.stderr)
            return 1
    published = {path.relative_to(OUT).as_posix() for path in OUT.rglob("*") if path.is_file()}
    expected = {rel for rel in files if rel != "docs" and not rel.startswith("docs/")}
    if published != expected:
        extra = sorted(published - expected)
        missing = sorted(expected - published)
        print(
            f"ERROR: publish tree mismatch (extra {len(extra)}, missing {len(missing)})",
            file=sys.stderr,
        )
        return 1
    print(f"Publish directory _publish: {copied} files, skipped {skipped} under docs/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
