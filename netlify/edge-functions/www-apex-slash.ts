// www.launchlayer.uk → https://launchlayer.uk{path}/ in one 301.
//
// Route (path + excludedPath) is in netlify.toml. Do not also export `path`
// here: the bundler then replaces the toml declaration and drops exclusions.
//
// onError bypass: if Deno throws on a www HTML request, fall through to the
// domain-level www→apex redirect instead of the generic error page.

const WWW_HOST = "www.launchlayer.uk";
const APEX_ORIGIN = "https://launchlayer.uk";

// Retired blog URLs. A www request must land on the fan-noise canonical in
// one 301. Leaving it to apexLocation would stop on the old apex path, and
// the _redirects rule would be a second hop.
const RETIRED_TO_FAN: Record<string, string> = {
  "/blog/fix-overheating-laptop-wickford-essex":
    `${APEX_ORIGIN}/blog/laptop-fan-noise-fix-essex/`,
  "/blog/why-your-laptop-is-loud-hot-or-overheating-and-how-to-fix-it-opwe3":
    `${APEX_ORIGIN}/blog/laptop-fan-noise-fix-essex/`,
};

function retiredFanLocation(pathname: string, search: string): string | null {
  const bare = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  const dest = RETIRED_TO_FAN[bare.toLowerCase()];
  return dest ? `${dest}${search || ""}` : null;
}

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
  // Do not set path or pattern here. That replaces the toml route.
  onError: "bypass",
};

export default async (request: Request) => {
  const url = new URL(request.url);
  // /api/* is not a page. A slash redirect would turn a POST into a GET.
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
    return;
  }
  if (hostOf(request) !== WWW_HOST && url.hostname.toLowerCase() !== WWW_HOST) {
    return; // apex: pass through (Pretty URLs and _redirects)
  }
  const retired = retiredFanLocation(url.pathname, url.search);
  if (retired) {
    return Response.redirect(retired, 301);
  }
  return Response.redirect(apexLocation(url.pathname, url.search), 301);
};
