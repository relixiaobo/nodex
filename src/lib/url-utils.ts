/**
 * URL utilities — dependency-free helpers safe for use in Background SW.
 */

/**
 * Normalize a URL for comparison.
 * Strips fragment, trailing slash, www prefix, and upgrades http to https.
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // http -> https
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
    }

    // Remove fragment
    parsed.hash = '';

    // Remove trailing slash (but keep root /)
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith('/')) {
      pathname = pathname.slice(0, -1);
    }

    // Remove www. prefix
    let hostname = parsed.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }

    return `${parsed.protocol}//${hostname}${pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
