/**
 * URL utilities — dependency-free helpers safe for use in Background SW.
 */

/**
 * Extract a YouTube video ID from various URL formats.
 * Supports: /embed/ID, /watch?v=ID, youtu.be/ID, /shorts/ID, /live/ID
 * Returns null if the URL is not a recognized YouTube URL.
 */
export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');

    if (hostname === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id || null;
    }

    if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
      // /watch?v=ID
      const v = parsed.searchParams.get('v');
      if (v) return v;

      // /embed/ID, /shorts/ID, /live/ID
      const match = parsed.pathname.match(/^\/(embed|shorts|live)\/([A-Za-z0-9_-]+)/);
      if (match?.[2]) return match[2];
    }

    return null;
  } catch {
    return null;
  }
}

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
