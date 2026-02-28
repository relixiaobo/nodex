/**
 * Deterministic color palette for tag badges and tagDef bullets.
 * Each tagDefId hashes to a consistent color.
 *
 * Shared between TagBadge, BulletChevron, and NodePicker.
 */
import { SYS_A, SYS_T, SYSTEM_TAGS } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import { resolveConfigValue } from './field-utils.js';
import * as loroDoc from './loro-doc.js';

export interface TagColor {
  text: string;
}

export const TAG_COLORS: TagColor[] = [
  { text: '#A6535B' }, // 0: Vintage Red
  { text: '#BA6C43' }, // 1: Terracotta
  { text: '#9B7C38' }, // 2: Antique Gold
  { text: '#608A55' }, // 3: Moss Green
  { text: '#40857A' }, // 4: Verdigris
  { text: '#4B7C9E' }, // 5: Denim Blue
  { text: '#6064A6' }, // 6: Muted Indigo
  { text: '#8E5B8E' }, // 7: Dusty Plum
  { text: '#8A6754' }, // 8: Cocoa Brown
  { text: '#788691' }, // 9: Soft Slate
];

/** Gray color for system tags (SYS_T*) and user-selectable gray swatch. */
export const TAG_COLOR_GRAY: TagColor = {
  text: '#788691',
};

/** Inline ref default color (matches current link-like green theme token). */
export const INLINE_REF_FALLBACK_TEXT_COLOR = 'var(--color-primary)';

/**
 * Named color map: config value string → TagColor.
 * Stored in SYS_A11 config via AssociatedData.
 */
export const TAG_COLOR_MAP: Record<string, TagColor> = {
  red: TAG_COLORS[0],
  orange: TAG_COLORS[1],
  amber: TAG_COLORS[2],
  green: TAG_COLORS[3],
  teal: TAG_COLORS[4],
  blue: TAG_COLORS[5],
  indigo: TAG_COLORS[6],
  violet: TAG_COLORS[7],
  brown: TAG_COLORS[8],
  gray: TAG_COLOR_GRAY,
  // Legacy aliases (pre-v5 keys stored in DB)
  pink: TAG_COLORS[0],     // → red
  rose: TAG_COLORS[7],     // → violet
  cyan: TAG_COLORS[4],     // → teal
  emerald: TAG_COLORS[3],  // → green
};

/** Map legacy color keys to canonical names so the swatch picker highlights correctly. */
const LEGACY_KEY_MAP: Record<string, string> = {
  pink: 'red',
  rose: 'violet',
  cyan: 'teal',
  emerald: 'green',
};

/** Normalize a stored color key to its canonical name. */
export function normalizeColorKey(key: string): string {
  return LEGACY_KEY_MAP[key] ?? key;
}

const JOURNAL_TAG_IDS = new Set<string>([
  SYSTEM_TAGS.DAY,
  SYSTEM_TAGS.WEEK,
  SYSTEM_TAGS.YEAR,
]);

/**
 * 10 swatch options for the color picker UI.
 * Order matches the visual layout (warm → cool → neutral).
 */
export const SWATCH_OPTIONS: Array<{ key: string; color: TagColor; name: string }> = [
  { key: 'red', color: TAG_COLOR_MAP.red, name: 'Red' },
  { key: 'orange', color: TAG_COLOR_MAP.orange, name: 'Orange' },
  { key: 'amber', color: TAG_COLOR_MAP.amber, name: 'Amber' },
  { key: 'green', color: TAG_COLOR_MAP.green, name: 'Green' },
  { key: 'teal', color: TAG_COLOR_MAP.teal, name: 'Teal' },
  { key: 'blue', color: TAG_COLOR_MAP.blue, name: 'Blue' },
  { key: 'indigo', color: TAG_COLOR_MAP.indigo, name: 'Indigo' },
  { key: 'violet', color: TAG_COLOR_MAP.violet, name: 'Violet' },
  { key: 'brown', color: TAG_COLOR_MAP.brown, name: 'Brown' },
  { key: 'gray', color: TAG_COLOR_MAP.gray, name: 'Gray' },
];

/**
 * Colors eligible for automatic hash-based assignment (excludes Soft Slate).
 * Soft Slate (#788691) is only available via explicit user selection in the color picker.
 */
const AUTO_ASSIGN_COLORS = TAG_COLORS.slice(0, 9);

/** Color keys in round-robin order (excludes gray). */
const AUTO_ASSIGN_KEYS = SWATCH_OPTIONS.slice(0, 9).map((s) => s.key);

/**
 * Pick a color key by round-robin index (e.g. existing tagDef count).
 * Guarantees all 9 colors appear before repeating.
 */
export function nextAutoColorKey(index: number): string {
  return AUTO_ASSIGN_KEYS[index % AUTO_ASSIGN_KEYS.length];
}

/**
 * Hash-based color fallback. Returns a color from the first 9 palette entries
 * (Soft Slate excluded — only assignable manually).
 *
 * Uses MurmurHash3 finalizer for better avalanche → more uniform distribution
 * across 9 buckets (the old Java hashCode % 9 had visible clustering).
 */
export function getTagColor(tagDefId: string): TagColor {
  let h = 0;
  for (let i = 0; i < tagDefId.length; i++) {
    h = Math.imul(h ^ tagDefId.charCodeAt(i), 0x5bd1e995);
  }
  // MurmurHash3 32-bit finalizer
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return AUTO_ASSIGN_COLORS[(h >>> 0) % AUTO_ASSIGN_COLORS.length];
}

/**
 * Resolve tag color with config priority:
 * 1. System tags (SYS_T*) → always gray
 * 2. SYS_A11 config value → named color from TAG_COLOR_MAP
 * 3. Journal date tags (`sys:day/week/year`) default to gray
 * 4. Fallback → deterministic hash
 */
export function resolveTagColor(
  tagDefId: string,
): TagColor {
  // System tags always gray — except highlight/comment which have user-visible colors
  if (tagDefId.startsWith('SYS_T') && tagDefId !== SYS_T.HIGHLIGHT && tagDefId !== SYS_T.COMMENT) {
    return TAG_COLOR_GRAY;
  }

  // Check configured color via loroDoc
  const tagDef = loroDoc.toNodexNode(tagDefId);
  if (tagDef) {
    const colorKey = resolveConfigValue(tagDef, SYS_A.COLOR);
    if (colorKey && TAG_COLOR_MAP[colorKey]) {
      return TAG_COLOR_MAP[colorKey];
    }
  }

  // Date system tagDefs default to gray unless the user explicitly configured a color.
  if (JOURNAL_TAG_IDS.has(tagDefId)) return TAG_COLOR_GRAY;

  // Fallback to hash
  return getTagColor(tagDefId);
}

/**
 * Resolve bullet colors for a node based on its supertag memberships.
 * - [] → neutral grey dot (0 tags)
 * - [c] → solid color (1 tag)
 * - [c1, c2, ...] → conic-gradient pie segments (2+ tags)
 */
export function resolveNodeBulletColors(nodeId: string): string[] {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node || !node.tags.length) return [];
  return node.tags.map((tagId) => resolveTagColor(tagId).text);
}

/**
 * Inline reference text color:
 * - If referenced node has at least one supertag, use the first supertag color.
 * - Otherwise fall back to the current inline-ref theme color (purple token).
 */
export function resolveInlineReferenceTextColor(targetNodeId: string): string {
  if (!targetNodeId) return INLINE_REF_FALLBACK_TEXT_COLOR;
  try {
    const node = loroDoc.toNodexNode(targetNodeId);
    if (!node) return INLINE_REF_FALLBACK_TEXT_COLOR;

    const firstTagId = node.tags?.[0];
    if (!firstTagId) return INLINE_REF_FALLBACK_TEXT_COLOR;
    return resolveTagColor(firstTagId).text;
  } catch {
    // ProseMirror schema `toDOM` can run before LoroDoc bootstrap completes.
    return INLINE_REF_FALLBACK_TEXT_COLOR;
  }
}
