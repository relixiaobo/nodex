/**
 * Deterministic color palette for tag badges and tagDef bullets.
 * Each tagDefId hashes to a consistent color.
 *
 * Shared between TagBadge, BulletChevron, and NodePicker.
 */

export const TAG_COLORS = [
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

export function getTagColor(tagDefId: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < tagDefId.length; i++) {
    hash = ((hash << 5) - hash + tagDefId.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
