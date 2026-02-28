/**
 * HighlightAnchor — multi-selector anchor for webpage highlight positioning.
 *
 * Follows W3C Web Annotation model with three selector types for redundancy:
 * 1. RangeSelector (XPath) — fastest, fragile
 * 2. TextPositionSelector (char offsets) — fast, fragile
 * 3. TextQuoteSelector (prefix/exact/suffix) — slow, most reliable
 *
 * Plus CssSelector for container-scoped search.
 */

// ── Types ──

export interface HighlightAnchorRange {
  startXPath: string;
  startOffset: number;
  endXPath: string;
  endOffset: number;
}

export interface HighlightAnchorTextPosition {
  start: number;
  end: number;
}

export interface HighlightAnchor {
  /** Schema version for future migrations */
  version: 1;
  /** Exact highlighted text */
  exact: string;
  /** Context text before the highlight (~32 chars) */
  prefix: string;
  /** Context text after the highlight (~32 chars) */
  suffix: string;
  /** CSS selector for the nearest identifiable container */
  cssSelector?: string;
  /** XPath range for precise DOM positioning */
  range?: HighlightAnchorRange;
  /** Character offsets relative to body.textContent */
  textPosition?: HighlightAnchorTextPosition;
}

// ── Serialization ──

/**
 * Serialize a HighlightAnchor to a JSON string for storage in the Anchor field.
 */
export function serializeAnchor(anchor: HighlightAnchor): string {
  return JSON.stringify(anchor);
}

/**
 * Deserialize a JSON string back to a HighlightAnchor.
 * Returns null if the input is invalid or cannot be parsed.
 */
export function deserializeAnchor(json: string): HighlightAnchor | null {
  try {
    const parsed = JSON.parse(json);
    if (!isValidAnchor(parsed)) return null;
    return parsed as HighlightAnchor;
  } catch {
    return null;
  }
}

/**
 * Validate that a parsed object conforms to the HighlightAnchor shape.
 */
function isValidAnchor(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  const a = obj as Record<string, unknown>;
  if (a.version !== 1) return false;
  if (typeof a.exact !== 'string' || a.exact.length === 0) return false;
  if (typeof a.prefix !== 'string') return false;
  if (typeof a.suffix !== 'string') return false;

  // Optional range validation
  if (a.range !== undefined) {
    if (typeof a.range !== 'object' || a.range === null) return false;
    const r = a.range as Record<string, unknown>;
    if (typeof r.startXPath !== 'string') return false;
    if (typeof r.startOffset !== 'number') return false;
    if (typeof r.endXPath !== 'string') return false;
    if (typeof r.endOffset !== 'number') return false;
  }

  // Optional textPosition validation
  if (a.textPosition !== undefined) {
    if (typeof a.textPosition !== 'object' || a.textPosition === null) return false;
    const tp = a.textPosition as Record<string, unknown>;
    if (typeof tp.start !== 'number') return false;
    if (typeof tp.end !== 'number') return false;
  }

  // Optional cssSelector validation
  if (a.cssSelector !== undefined && typeof a.cssSelector !== 'string') return false;

  return true;
}
