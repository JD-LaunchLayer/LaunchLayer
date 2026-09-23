// www.launchlayer.uk → https://launchlayer.uk{path}/ in one 301.
//
// Declared inline so this file is the only route config. Apex requests
// never invoke it (Host filter): Pretty URLs still own /path → /path/.
// /assets/* and other static files never invoke it either. They were on
// path "/*", so every CSS/font/image request entered the Edge Functions
// runtime before the static file was served. That runtime fails closed
// (www: 500 "Error - Request ID"; apex cache miss: empty 503 with
// fwd-status=503). The domain-level www→apex redirect already preserves
// asset paths in one hop, which is all these files need.
//
// onError bypass: if Deno throws on a www HTML request, fall through to
// that same domain redirect instead of the generic error page.

const WWW_HOST = "www.launchlayer.uk";
const APEX_ORIGIN = "https://launchlayer.uk";

function hostOf(request: Request): string {
  const urlHost = new URL(request.url).hostname.toLowerCase().replace(/\.$/, "");
  const headerHost = (request.headers.get("host") || "")
    .split(":")[0]
    .toLowerCase()
    .replace(/\.$/, "");
  return headerHost || urlHost;
}

function isFileLikePath(pathname: string): boolean {
  if (pathname === "/assets" || pathname.startsWith("/assets/")) {
    return true;
  }
  const last = pathname.split("/").filter(Boolean).pop() || "";
  // .js .css .png .webp .avif .ico .xml .txt .woff2 .map .json (and similar)
  return /\.[a-zA-Z0-9]{1,16}$/.test(last);
}

function apexLocation(pathname: string, search: string): string {
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

export const config = {
  path: "/*",
  excludedPath: [
    "/assets",
    "/assets/*",
    "/api",
    "/api/*",
    "/.netlify/*",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/llms.txt",
  ],
  // Any path whose last segment has a file extension (css, woff2, webp, …).
  excludedPattern: "/.*\\.[A-Za-z0-9]{1,16}$",
  header: {
    host: "^www\\.launchlayer\\.uk(?::[0-9]+)?$",
  },
  onError: "bypass",
};

export default async (request: Request) => {
  const url = new URL(request.url);
  // Leave /api/* for serverless functions (POST must not 301 to a slashed URL).
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return;
  }
  if (hostOf(request) !== WWW_HOST && url.hostname.toLowerCase() !== WWW_HOST) {
    return; // apex: pass through (Pretty URLs)
  }
  return Response.redirect(apexLocation(url.pathname, url.search), 301);
};
