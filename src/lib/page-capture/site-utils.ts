export function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./, '').replace(/^m\./, '');
}

export function isYouTubeHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return normalized === 'youtube.com' || normalized === 'youtu.be';
}

export function isXHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^www\./, '');
  return normalized === 'x.com' || normalized === 'twitter.com';
}

export function isGitHubHostname(hostname: string): boolean {
  return hostname.replace(/^www\./, '') === 'github.com';
}

export function isGoogleDocsHostname(hostname: string): boolean {
  return hostname === 'docs.google.com';
}
