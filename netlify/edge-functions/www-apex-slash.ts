// www.launchlayer.uk → https://launchlayer.uk{path}/ in one 301.
// Apex Host is a no-op so Pretty URLs still own /path → /path/.
// /assets/* and file-extension paths stay path-preserving (no forced slash).

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
