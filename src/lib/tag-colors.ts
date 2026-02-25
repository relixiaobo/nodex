/**
 * Deterministic color palette for tag badges and tagDef bullets.
 * Each tagDefId hashes to a consistent color.
 *
 * Shared between TagBadge, BulletChevron, and NodePicker.
 */
import { SYS_A, SYSTEM_TAGS } from '../types/index.js';
import type { NodexNode } from '../types/index.js';
import { resolveConfigValue } from './field-utils.js';
import * as loroDoc from './loro-doc.js';

export interface TagColor {
  text: string;
}

export const TAG_COLORS: TagColor[] = [
  { text: '#7B6B8D' }, // 0: Faded Violet
  { text: '#9B6E6E' }, // 1: Brick Rose
  { text: '#5E7A92' }, // 2: Slate Blue
  { text: '#697A4D' }, // 3: Olive
  { text: '#8A7142' }, // 4: Ochre
  { text: '#515C96' }, // 5: Deep Indigo
  { text: '#8E5E70' }, // 6: Smoke Rose
  { text: '#4D7A7A' }, // 7: Dark Teal
  { text: '#8E6242' }, // 8: Rust Orange
  { text: '#616161' }, // 9: Charcoal
];

/** Gray color for system tags (SYS_T*) and user-selectable gray swatch. */
export const TAG_COLOR_GRAY: TagColor = {
  text: '#999999',
};

/** Inline ref default color (matches current link-like green theme token). */
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
 * 3. Journal date tags (`sys:day/week/year`) default to gray
 * 4. Fallback → deterministic hash
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
    const firstTagId = node?.tags?.[0];
    if (!firstTagId) return INLINE_REF_FALLBACK_TEXT_COLOR;
    return resolveTagColor(firstTagId).text;
  } catch {
    // ProseMirror schema `toDOM` can run before LoroDoc bootstrap completes.
    return INLINE_REF_FALLBACK_TEXT_COLOR;
  }
}
