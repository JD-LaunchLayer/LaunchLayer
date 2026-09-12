#!/usr/bin/env python3
"""Strip Squarespace JSON-LD leftovers and normalize LaunchLayer schema."""

from __future__ import annotations

import html as html_lib
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path("/workspace")

CANONICAL_GRAPH: dict[str, Any] = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "WebSite",
            "@id": "https://launchlayer.uk/#website",
            "url": "https://launchlayer.uk/",
            "name": "LaunchLayer",
            "description": "PC, laptop and Mac repair in Wickford and South Essex with free local collection and No-Fix-No-Fee.",
            "publisher": {"@id": "https://launchlayer.uk/#organization"},
        },
        {
            "@type": "Organization",
            "@id": "https://launchlayer.uk/#organization",
            "name": "LaunchLayer Ltd",
            "legalName": "LaunchLayer Ltd",
            "url": "https://launchlayer.uk/",
            "logo": "https://launchlayer.uk/assets/meta/meta-520e4abe.png",
            "email": "hello@launchlayer.uk",
            "telephone": "+447367652987",
            "sameAs": [
                "https://www.instagram.com/launchlayeruk/",
                "https://www.facebook.com/LaunchLayerWickford/",
                "https://www.linkedin.com/company/launchlayeruk",
                "https://x.com/LaunchLayerUK",
            ],
        },
        {
            "@type": ["LocalBusiness", "ComputerStore"],
            "@id": "https://launchlayer.uk/#localbusiness",
            "name": "LaunchLayer",
            "url": "https://launchlayer.uk/",
            "telephone": "+447367652987",
            "email": "hello@launchlayer.uk",
            "image": "https://launchlayer.uk/assets/meta/meta-520e4abe.png",
            "priceRange": "£35 - £250",
            "parentOrganization": {"@id": "https://launchlayer.uk/#organization"},
            "address": {
                "@type": "PostalAddress",
                "streetAddress": "32 Glebe Road",
                "addressLocality": "Wickford",
                "addressRegion": "Essex",
                "postalCode": "SS11 8EU",
                "addressCountry": "GB",
            },
            "geo": {
                "@type": "GeoCoordinates",
                "latitude": 51.6107559,
                "longitude": 0.5330014,
            },
            "hasMap": "https://www.google.com/maps/search/?api=1&query=32+Glebe+Road+Wickford+SS11+8EU",
            "openingHoursSpecification": [
                {
                    "@type": "OpeningHoursSpecification",
                    "dayOfWeek": [
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                        "Sunday",
                    ],
                    "opens": "09:00",
                    "closes": "22:00",
                }
            ],
            "areaServed": [
                {"@type": "City", "name": "Wickford"},
                {"@type": "City", "name": "Basildon"},
                {"@type": "City", "name": "Billericay"},
                {"@type": "City", "name": "Brentwood"},
                {"@type": "City", "name": "Rayleigh"},
                {"@type": "City", "name": "Southend-on-Sea"},
                {"@type": "City", "name": "Chelmsford"},
                {"@type": "AdministrativeArea", "name": "South Essex"},
            ],
            "sameAs": [
                "https://www.instagram.com/launchlayeruk/",
                "https://www.facebook.com/LaunchLayerWickford/",
                "https://www.linkedin.com/company/launchlayeruk",
                "https://x.com/LaunchLayerUK",
            ],
            "hasOfferCatalog": {
                "@type": "OfferCatalog",
                "name": "PC, laptop and Mac services",
                "itemListElement": [
                    {
                        "@type": "Offer",
                        "itemOffered": {
                            "@type": "Service",
                            "name": "Laptop Repair & Screen Replacement",
                            "url": "https://launchlayer.uk/wickford-laptop-repair/",
                        },
                    },
                    {
                        "@type": "Offer",
                        "itemOffered": {
                            "@type": "Service",
                            "name": "Desktop PC Repair & Upgrades",
                            "url": "https://launchlayer.uk/wickford-pc-repair/",
                        },
                    },
                    {
                        "@type": "Offer",
                        "itemOffered": {
                            "@type": "Service",
                            "name": "MacBook Repair Wickford",
                            "url": "https://launchlayer.uk/macbook-repair-wickford/",
                        },
                    },
                    {
                        "@type": "Offer",
                        "itemOffered": {
                            "@type": "Service",
                            "name": "50-Point Full System MOT",
                            "url": "https://launchlayer.uk/laptop-mot-wickford-essex/",
                        },
                    },
                    {
                        "@type": "Offer",
                        "itemOffered": {
                            "@type": "Service",
                            "name": "Custom PC Builds",
                            "url": "https://launchlayer.uk/custom-pc-builds/",
                        },
                    },
                    {
                        "@type": "Offer",
                        "itemOffered": {
                            "@type": "Service",
                            "name": "Data Recovery",
                            "url": "https://launchlayer.uk/data-recovery/",
                        },
                    },
                    {
                        "@type": "Offer",
                        "itemOffered": {
                            "@type": "Service",
                            "name": "Virus & Malware Removal",
                            "url": "https://launchlayer.uk/wickford-virus-removal/",
                        },
                    },
                ],
            },
        },
    ],
}

MONEY_PAGES = {
    "wickford-laptop-repair",
    "wickford-pc-repair",
    "laptop-screen-repair-wickford",
    "macbook-repair-wickford",
    "macbook-repair-basildon",
    "wickford-virus-removal",
    "data-recovery",
    "custom-pc-builds",
    "liquid-damage-repair-wickford",
    "liquid-damage-repair-basildon",
    "basildon-pc-repair",
    "billericay-pc-repair",
    "brentwood-pc-repair",
    "chelmsford-pc-repair",
    "rayleigh-laptop-service",
    "southend-pc-repair",
    "laptop-mot-wickford-essex",
}

SUPPORT_PAGES = {"contact", "faqs", "reviews", "business"}

SCRIPT_RE = re.compile(
    r"<script\s+type=[\"']application/ld\+json[\"']>\s*(.*?)\s*</script>",
    re.I | re.S,
)


def strip_tags(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", text)
    return html_lib.unescape(text).strip()


def is_squarespace_block(data: Any, raw: str) -> bool:
    if "squarespace-cdn.com" in raw or "static1.squarespace.com" in raw:
        return True
    if not isinstance(data, dict):
        return False
    t = data.get("@type")
    # Organization leftover: string address + unformatted phone
    if t == "Organization" and isinstance(data.get("address"), str):
        if "32 Glebe Road" in data.get("address", "") and data.get("legalName") == "LaunchLayer":
            return True
    if t == "LocalBusiness" and isinstance(data.get("address"), str):
        if data.get("openingHours", "").startswith("Mo 09:00-22:00"):
            return True
    if t == "WebSite" and data.get("description") == "" and "squarespace" in raw:
        return True
    return False


def defines_localbusiness_entity(data: Any) -> bool:
    """True if this block redefines the sitewide #localbusiness entity."""
    if not isinstance(data, dict):
        return False
    graph = data.get("@graph")
    if not isinstance(graph, list):
        # top-level LocalBusiness without @id fragment for a page
        t = data.get("@type")
        if t in ("LocalBusiness", "ComputerRepairService", "ComputerStore"):
            aid = data.get("@id", "")
            if aid in ("", "https://launchlayer.uk/#localbusiness", "https://launchlayer.uk/#business"):
                return True
        return False

    for node in graph:
        if not isinstance(node, dict):
            continue
        aid = node.get("@id", "")
        t = node.get("@type")
        types = t if isinstance(t, list) else [t]
        if aid in (
            "https://launchlayer.uk/#localbusiness",
            "https://launchlayer.uk/#business",
        ):
            # Full entity if it carries address/geo/openingHours — not a bare ref
            if any(
                k in node
                for k in (
                    "address",
                    "geo",
                    "openingHours",
                    "openingHoursSpecification",
                    "hasOfferCatalog",
                    "priceRange",
                )
            ):
                return True
            if any(
                x in ("LocalBusiness", "ComputerRepairService", "ComputerStore")
                for x in types
            ):
                return True
        # Sitewide WebSite/Organization entity graphs that conflict with homepage
        if aid == "https://launchlayer.uk/#website" and node.get("@type") == "WebSite":
            # Only remove if this graph also defines org/localbusiness (the fat shared graph)
            ids = {n.get("@id") for n in graph if isinstance(n, dict)}
            if "https://launchlayer.uk/#organization" in ids or (
                "https://launchlayer.uk/#localbusiness" in ids
            ):
                return True
    return False


def extract_onpage_faqs(html: str) -> list[dict[str, Any]]:
    faqs: list[dict[str, Any]] = []
    for m in re.finditer(
        r"<details[^>]*class=\"[^\"]*llsg-faq-item[^\"]*\"[^>]*>\s*"
        r"<summary>(.*?)</summary>\s*<p>(.*?)</p>",
        html,
        re.S | re.I,
    ):
        q = strip_tags(m.group(1))
        a = strip_tags(m.group(2))
        if q and a:
            faqs.append(
                {
                    "@type": "Question",
                    "name": q,
                    "acceptedAnswer": {"@type": "Answer", "text": a},
                }
            )
    return faqs


def city_from_slug(slug: str) -> str | None:
    mapping = {
        "wickford": "Wickford",
        "basildon": "Basildon",
        "billericay": "Billericay",
        "brentwood": "Brentwood",
        "chelmsford": "Chelmsford",
        "rayleigh": "Rayleigh",
        "southend": "Southend-on-Sea",
    }
    for key, city in mapping.items():
        if key in slug:
            return city
    return None


def trailing_slash(url: str) -> str:
    if not url or not url.startswith("http"):
        return url
    if "#" in url:
        base, frag = url.split("#", 1)
        if not base.endswith("/"):
            base += "/"
        return f"{base}#{frag}"
    if url.endswith("/"):
        return url
    return url + "/"


def normalize_page_graph(
    data: dict[str, Any], slug: str, onpage_faqs: list[dict[str, Any]]
) -> dict[str, Any]:
    page_url = f"https://launchlayer.uk/{slug}/"
    nodes = data.get("@graph", [])
    out: list[dict[str, Any]] = []

    webpage = None
    service = None
    faq = None
    extras: list[dict[str, Any]] = []

    for node in nodes:
        if not isinstance(node, dict):
            continue
        t = node.get("@type")
        types = t if isinstance(t, list) else [t]
        aid = node.get("@id", "")

        # Drop sitewide entities if somehow still present
        if aid in (
            "https://launchlayer.uk/#website",
            "https://launchlayer.uk/#organization",
            "https://launchlayer.uk/#localbusiness",
            "https://launchlayer.uk/#business",
            "https://launchlayer.uk/#faq",
        ):
            continue

        if "WebPage" in types or "ContactPage" in types or "AboutPage" in types:
            webpage = node
        elif "FAQPage" in types:
            faq = node
        elif any(
            x in ("Service", "ComputerRepairService", "DataRecoveryService")
            for x in types
        ):
            service = node
        else:
            extras.append(node)

    # Reviews: drop fake service + AggregateRating; keep WebPage only
    if slug == "reviews":
        service = None

    if webpage is None:
        webpage = {
            "@type": "WebPage",
            "@id": f"{page_url}#webpage",
            "url": page_url,
            "name": "",
            "description": "",
        }

    webpage["@type"] = "WebPage" if webpage.get("@type") != "ContactPage" else "ContactPage"
    if slug == "contact" and webpage.get("@type") == "WebPage":
        # Keep ContactPage sibling if present in extras; else upgrade later
        pass
    webpage["@id"] = f"{page_url}#webpage"
    webpage["url"] = page_url
    webpage["isPartOf"] = {"@id": "https://launchlayer.uk/#website"}
    webpage["about"] = {"@id": "https://launchlayer.uk/#localbusiness"}
    webpage["provider"] = {"@id": "https://launchlayer.uk/#localbusiness"}
    out.append(webpage)

    if service is not None and slug in MONEY_PAGES:
        # Normalize to Service referencing #localbusiness
        service["@type"] = "Service"
        service["@id"] = f"{page_url}#service"
        service["url"] = page_url
        service["provider"] = {"@id": "https://launchlayer.uk/#localbusiness"}
        # Simplify areaServed when possible
        city = city_from_slug(slug)
        if city and (
            "areaServed" not in service
            or isinstance(service.get("areaServed"), list)
            and len(json.dumps(service.get("areaServed"))) > 200
        ):
            service["areaServed"] = {"@type": "City", "name": city}
        # Clean nested LocalBusiness providers
        if isinstance(service.get("provider"), dict) and service["provider"].get(
            "@type"
        ):
            service["provider"] = {"@id": "https://launchlayer.uk/#localbusiness"}
        out.append(service)
    elif service is not None and slug in SUPPORT_PAGES and slug != "reviews":
        service["provider"] = {"@id": "https://launchlayer.uk/#localbusiness"}
        if isinstance(service.get("@id"), str):
            service["@id"] = trailing_slash(service["@id"]) if "#" in service["@id"] else service["@id"]
        # Strip AggregateRating always
        service.pop("aggregateRating", None)
        if service.get("@type") in ("ComputerRepairService", "LocalBusiness"):
            service["@type"] = "Service"
        out.append(service)

    # FAQ: prefer on-page for money pages
    if slug in MONEY_PAGES:
        if onpage_faqs:
            out.append(
                {
                    "@type": "FAQPage",
                    "@id": f"{page_url}#faq",
                    "mainEntity": onpage_faqs,
                }
            )
        elif faq is not None:
            faq["@id"] = f"{page_url}#faq"
            faq.pop("isPartOf", None)
            out.append(faq)
    elif faq is not None:
        faq["@id"] = trailing_slash(faq.get("@id", f"{page_url}#faq"))
        out.append(faq)

    # Keep useful extras (ItemList, ContactPage, etc.) without localbusiness entities
    for node in extras:
        aid = node.get("@id", "")
        if aid in (
            "https://launchlayer.uk/#website",
            "https://launchlayer.uk/#organization",
            "https://launchlayer.uk/#localbusiness",
            "https://launchlayer.uk/#business",
        ):
            continue
        node.pop("aggregateRating", None)
        # Fix provider refs
        if isinstance(node.get("provider"), dict):
            node["provider"] = {"@id": "https://launchlayer.uk/#localbusiness"}
        out.append(node)

    return {"@context": "https://schema.org", "@graph": out}


def dump_script(data: dict[str, Any]) -> str:
    body = json.dumps(data, indent=2, ensure_ascii=False)
    return f'<script type="application/ld+json">\n{body}\n</script>'


def process_html(path: Path) -> tuple[bool, str]:
    original = path.read_text(encoding="utf-8")
    html = original
    rel = path.relative_to(ROOT).as_posix()
    slug = path.parent.name if path.name == "index.html" and path.parent != ROOT else (
        "" if path.name == "index.html" else path.stem
    )
    if path == ROOT / "index.html":
        slug = ""

    # Collect scripts
    matches = list(SCRIPT_RE.finditer(html))
    if not matches and slug != "":
        return False, "no-ld"

    keep_scripts: list[str] = []
    removed_sq = 0
    removed_entity = 0
    page_graph: dict[str, Any] | None = None

    for m in matches:
        raw = m.group(1).strip()
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            keep_scripts.append(m.group(0))
            continue

        if is_squarespace_block(data, raw):
            removed_sq += 1
            continue

        if defines_localbusiness_entity(data):
            removed_entity += 1
            # If this fat graph also had page-specific FAQ with wrong id, ignore —
            # page graph comes from the dedicated page script.
            continue

        # Strip AggregateRating from any kept graph
        if isinstance(data, dict) and "@graph" in data:
            for node in data["@graph"]:
                if isinstance(node, dict):
                    node.pop("aggregateRating", None)
            # Prefer the most page-specific graph
            ids = " ".join(
                str(n.get("@id", "")) for n in data["@graph"] if isinstance(n, dict)
            )
            if slug and f"/{slug}/" in ids:
                page_graph = data
                continue
            if slug == "" and "launchlayer.uk/#localbusiness" in ids:
                # homepage will be replaced
                continue

        if isinstance(data, dict) and data.get("@type") in (
            "LocalBusiness",
            "ComputerRepairService",
        ):
            removed_entity += 1
            continue

        keep_scripts.append(dump_script(data) if isinstance(data, dict) else m.group(0))

    # Homepage: replace with canonical
    if path == ROOT / "index.html":
        # Remove all existing ld+json then inject canonical
        html2 = SCRIPT_RE.sub("", original)
        # Clean leftover blank lines around head end
        canonical = dump_script(CANONICAL_GRAPH)
        if "</head>" in html2:
            html2 = html2.replace("</head>", f"  {canonical}\n</head>", 1)
        else:
            html2 = canonical + html2

        # Task E — MacBook link near how-we-help CTAs
        if 'href="/macbook-repair-wickford/"' not in html2 and 'href="/macbook-repair-wickford"' not in html2:
            needle = '      <a class="llhm-door-business" href="/business">'
            insert = (
                '      <p class="llhm-mac-link" style="margin:1rem 0 0;text-align:center;">'
                '<a href="/macbook-repair-wickford/">MacBook repair in Wickford</a></p>\n'
            )
            if needle in html2:
                html2 = html2.replace(needle, insert + needle, 1)
            else:
                # fallback after doors grid
                html2 = html2.replace(
                    '</div>\n      <a class="llhm-door-business"',
                    '</div>\n'
                    '      <p class="llhm-mac-link" style="margin:1rem 0 0;text-align:center;">'
                    '<a href="/macbook-repair-wickford/">MacBook repair in Wickford</a></p>\n'
                    '      <a class="llhm-door-business"',
                    1,
                )
        changed = html2 != original
        if changed:
            path.write_text(html2, encoding="utf-8")
        return changed, f"homepage canonical sq={removed_sq} entity={removed_entity}"

    # Money / support pages: rebuild page graph
    onpage_faqs = extract_onpage_faqs(original)
    if slug in MONEY_PAGES | SUPPORT_PAGES:
        if page_graph is None:
            # Try to recover from keep_scripts
            recovered = []
            new_keep = []
            for s in keep_scripts:
                mm = SCRIPT_RE.search(s)
                if not mm:
                    new_keep.append(s)
                    continue
                try:
                    d = json.loads(mm.group(1))
                except json.JSONDecodeError:
                    new_keep.append(s)
                    continue
                if isinstance(d, dict) and "@graph" in d:
                    ids = " ".join(
                        str(n.get("@id", "")) for n in d["@graph"] if isinstance(n, dict)
                    )
                    if f"/{slug}/" in ids:
                        page_graph = d
                        continue
                new_keep.append(s)
            keep_scripts = new_keep

        if page_graph is not None:
            normalized = normalize_page_graph(page_graph, slug, onpage_faqs)
            keep_scripts = [dump_script(normalized)] + [
                s
                for s in keep_scripts
                if "application/ld+json" not in s
                or f"/{slug}/" not in s
            ]
            # Avoid duplicates — just use normalized as sole ld+json for these pages
            keep_scripts = [dump_script(normalized)]

    # Rewrite file: remove all ld+json, re-inject keep_scripts before </head>
    html2 = SCRIPT_RE.sub("", original)
    if keep_scripts:
        block = "\n".join(keep_scripts) + "\n"
        if "</head>" in html2:
            html2 = html2.replace("</head>", block + "</head>", 1)
        else:
            html2 = block + html2

    # Collapse excessive blank lines in head from removals
    html2 = re.sub(r"(\n[ \t]*){3,}", "\n\n", html2)

    changed = html2 != original
    if changed:
        path.write_text(html2, encoding="utf-8")
    return changed, f"sq={removed_sq} entity={removed_entity} kept={len(keep_scripts)}"


def build_services_static_schema(catalog: dict[str, Any]) -> dict[str, Any]:
    offers = []
    for svc in catalog.get("services", []):
        offer: dict[str, Any] = {
            "@type": "Offer",
            "itemOffered": {
                "@type": "Service",
                "name": svc["title"],
                "description": svc.get("blurb", ""),
                "url": "https://launchlayer.uk" + (svc.get("href") or "/services/"),
            },
        }
        if svc.get("schemaPrice") is not None:
            offer["price"] = str(svc["schemaPrice"])
            offer["priceCurrency"] = "GBP"
        elif svc.get("schemaMinPrice") is not None:
            offer["priceSpecification"] = {
                "@type": "PriceSpecification",
                "minPrice": str(svc["schemaMinPrice"]),
                "priceCurrency": "GBP",
            }
        offers.append(offer)

    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": "https://launchlayer.uk/services/#webpage",
                "url": "https://launchlayer.uk/services/",
                "name": "PC & Laptop Repair Prices Wickford | Services & Pricing | LaunchLayer",
                "description": "Clear PC and laptop repair prices in Wickford and South Essex. Free diagnostics, fixed quotes, No-Fix-No-Fee.",
                "isPartOf": {"@id": "https://launchlayer.uk/#website"},
                "about": {"@id": "https://launchlayer.uk/#localbusiness"},
                "provider": {"@id": "https://launchlayer.uk/#localbusiness"},
            },
            {
                "@type": "OfferCatalog",
                "@id": "https://launchlayer.uk/services/#catalog",
                "name": "LaunchLayer Repair Services",
                "itemListElement": offers,
            },
        ],
    }


def fix_services_page() -> None:
    path = ROOT / "services" / "index.html"
    html = path.read_text(encoding="utf-8")

    # Extract catalog JSON
    cat_m = re.search(
        r'<script type="application/json" id="llsvc-catalog">\s*(\{.*?\})\s*</script>',
        html,
        re.S,
    )
    if not cat_m:
        raise SystemExit("services catalog not found")
    catalog = json.loads(cat_m.group(1))
    schema = build_services_static_schema(catalog)
    script = dump_script(schema)

    # Remove any existing ld+json
    html = SCRIPT_RE.sub("", html)

    # Remove JS JSON-LD injection block
    html = re.sub(
        r"\n\s*// JSON-LD from the same catalog\n.*?"
        r"document\.head\.appendChild\(ldScript\);\n",
        "\n",
        html,
        count=1,
        flags=re.S,
    )

    if "</head>" in html:
        html = html.replace("</head>", f"  {script}\n</head>", 1)
    else:
        html = script + html

    path.write_text(html, encoding="utf-8")
    print("services: static JSON-LD injected, JS injection removed")


def main() -> None:
    changed_files = []
    for path in sorted(ROOT.rglob("*.html")):
        if "/assets/" in path.as_posix():
            continue
        changed, note = process_html(path)
        if changed:
            changed_files.append((path.relative_to(ROOT).as_posix(), note))
            print(f"OK {path.relative_to(ROOT)} ({note})")

    fix_services_page()
    print(f"\nUpdated {len(changed_files)} HTML files (+ services)")


if __name__ == "__main__":
    main()
