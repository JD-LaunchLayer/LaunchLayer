// One-hop www → apex + trailing slash.
//
// PR #88/#89 put 68 FORCE host rules in _redirects. Live production still
// 2-hops because Netlify's domain-level www→apex redirect runs BEFORE
// _redirects, so Google sees Location: https://launchlayer.uk/{path}
// (no slash) and consolidates on that.
//
// Edge Functions run first. Returning a 301 ends the request chain
// (Netlify docs: "redirects for that path do not occur").
// Apex Host is a no-op so Pretty URLs still 301 /path → /path/ in one hop.
//
// Deploy previews are *.netlify.app — this only fires on Host
// www.launchlayer.uk. Jordan QA on production after merge.

const WWW_HOST = "www.launchlayer.uk";
const APEX_ORIGIN = "https://launchlayer.uk";

// Last path segment looks like a file: fonts.css, sitemap.xml, site.webmanifest.
const FILE_EXTENSION_RE = /\.[a-zA-Z0-9]{1,16}$/;

function normalizeHost(value) {
  return String(value || "")
    .split(":")[0]
    .toLowerCase()
    .replace(/\.$/, "");
}

function isWwwHost(request) {
  const urlHost = normalizeHost(new URL(request.url).hostname);
  const headerHost = normalizeHost(request.headers.get("host"));
  return urlHost === WWW_HOST || headerHost === WWW_HOST;
}

function isFileLikePath(pathname) {
  if (pathname === "/assets" || pathname.startsWith("/assets/")) {
    return true;
  }
  const last = pathname.split("/").filter(Boolean).pop() || "";
  return FILE_EXTENSION_RE.test(last);
}

function canonicalApexUrl(pathname, search) {
  const query = search || "";
  if (!pathname || pathname === "/") {
    return `${APEX_ORIGIN}/${query}`;
  }
  if (isFileLikePath(pathname)) {
    return `${APEX_ORIGIN}${pathname}${query}`;
  }
  const slashed = pathname.endsWith("/") ? pathname : `${pathname}/`;
  return `${APEX_ORIGIN}${slashed}${query}`;
}

export default async (request) => {
  if (!isWwwHost(request)) {
    return;
  }
  const url = new URL(request.url);
  return Response.redirect(canonicalApexUrl(url.pathname, url.search), 301);
};

export const config = {
  path: ["/", "/*"],
  // Redirect helper only — if it errors, keep serving the site (legacy 2-hop)
  // rather than a generic Edge error page.
  onError: "bypass",
};

export {
  WWW_HOST,
  APEX_ORIGIN,
  FILE_EXTENSION_RE,
  normalizeHost,
  isWwwHost,
  isFileLikePath,
  canonicalApexUrl,
};
