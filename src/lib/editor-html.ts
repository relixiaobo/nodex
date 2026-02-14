/**
 * Shared HTML normalization helpers for TipTap paragraph content.
 */

export function stripWrappingP(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p>(.*)<\/p>$/s);
  if (match && !match[1].includes('<p>')) {
    return match[1];
  }
  return trimmed;
}

export function wrapInP(content: string): string {
  if (!content) return '<p></p>';
  const trimmed = content.trim();
  if (trimmed.startsWith('<p>')) return trimmed;
  return `<p>${trimmed}</p>`;
}
