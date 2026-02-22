/**
 * Deterministic color palette for tag badges and tagDef bullets.
 * Each tagDefId hashes to a consistent color.
 *
 * Shared between TagBadge, BulletChevron, and NodePicker.
 */
import { SYS_A } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import { resolveConfigValue } from './field-utils.js';
import * as loroDoc from './loro-doc.js';

export interface TagColor {
  bg: string;
  text: string;
}

export const TAG_COLORS: TagColor[] = [
  { bg: 'rgba(139,92,246,0.08)', text: '#8B5CF6' },    // 0: violet
  { bg: 'rgba(236,72,153,0.08)', text: '#DB2777' },    // 1: pink
  { bg: 'rgba(147,51,234,0.08)', text: '#9333EA' },    // 2: purple
  { bg: 'rgba(6,182,212,0.08)',  text: '#0891B2' },    // 3: cyan
  { bg: 'rgba(16,185,129,0.08)', text: '#059669' },    // 4: emerald
  { bg: 'rgba(245,158,11,0.08)', text: '#D97706' },    // 5: amber
  { bg: 'rgba(225,29,72,0.08)',  text: '#E11D48' },    // 6: rose
  { bg: 'rgba(59,130,246,0.08)', text: '#2563EB' },    // 7: blue
  { bg: 'rgba(20,184,166,0.08)', text: '#0D9488' },    // 8: teal
  { bg: 'rgba(249,115,22,0.08)', text: '#EA580C' },    // 9: orange
];

/** Gray color for system tags (SYS_T*) and user-selectable gray swatch. */
export const TAG_COLOR_GRAY: TagColor = {
  bg: 'rgba(115,115,115,0.08)',
  text: '#737373',
};

/** Inline ref default color (matches current link-like purple theme token). */
export const INLINE_REF_FALLBACK_TEXT_COLOR = 'var(--color-primary)';

/**
 * Named color map: config value string → TagColor.
 * Stored in SYS_A11 config via AssociatedData.
 */
export const TAG_COLOR_MAP: Record<string, TagColor> = {
  violet: TAG_COLORS[0],
  pink: TAG_COLORS[1],
  cyan: TAG_COLORS[3],
  emerald: TAG_COLORS[4],
  amber: TAG_COLORS[5],
  rose: TAG_COLORS[6],
  blue: TAG_COLORS[7],
  teal: TAG_COLORS[8],
  orange: TAG_COLORS[9],
  gray: TAG_COLOR_GRAY,
};

/**
 * 10 swatch options for the color picker UI.
 * Order matches the visual layout (warm → cool → neutral).
 */
export const SWATCH_OPTIONS: Array<{ key: string; color: TagColor; name: string }> = [
  { key: 'rose', color: TAG_COLOR_MAP.rose, name: 'Rose' },
  { key: 'pink', color: TAG_COLOR_MAP.pink, name: 'Pink' },
  { key: 'orange', color: TAG_COLOR_MAP.orange, name: 'Orange' },
  { key: 'amber', color: TAG_COLOR_MAP.amber, name: 'Amber' },
  { key: 'emerald', color: TAG_COLOR_MAP.emerald, name: 'Emerald' },
  { key: 'teal', color: TAG_COLOR_MAP.teal, name: 'Teal' },
  { key: 'cyan', color: TAG_COLOR_MAP.cyan, name: 'Cyan' },
  { key: 'blue', color: TAG_COLOR_MAP.blue, name: 'Blue' },
  { key: 'violet', color: TAG_COLOR_MAP.violet, name: 'Violet' },
  { key: 'gray', color: TAG_COLOR_MAP.gray, name: 'Gray' },
];

/**
 * Hash-based color fallback. Always returns a color from the 10-color palette.
 */
export function getTagColor(tagDefId: string): TagColor {
  let hash = 0;
  for (let i = 0; i < tagDefId.length; i++) {
    hash = ((hash << 5) - hash + tagDefId.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

/**
 * Resolve tag color with config priority:
 * 1. System tags (SYS_T*) → always gray
 * 2. SYS_A11 config value → named color from TAG_COLOR_MAP
 * 3. Fallback → deterministic hash
 */
export function resolveTagColor(
  tagDefId: string,
): TagColor {
  // System tags always gray
  if (tagDefId.startsWith('SYS_T')) return TAG_COLOR_GRAY;

  // Check configured color via loroDoc
  const tagDef = loroDoc.toNodexNode(tagDefId);
  if (tagDef) {
    const colorKey = resolveConfigValue(tagDef, SYS_A.COLOR);
    if (colorKey && TAG_COLOR_MAP[colorKey]) {
      return TAG_COLOR_MAP[colorKey];
    }
  }

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
  const node = loroDoc.toNodexNode(targetNodeId);
  const firstTagId = node?.tags?.[0];
  if (!firstTagId) return INLINE_REF_FALLBACK_TEXT_COLOR;
  return resolveTagColor(firstTagId).text;
}
