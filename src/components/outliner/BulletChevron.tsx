interface BulletChevronProps {
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDrillDown: () => void;
  onBulletClick: () => void;
  /** Dimmed style for trailing input placeholder bullets */
  dimmed?: boolean;
  /** Reference node: show concentric circles (bullseye) bullet */
  isReference?: boolean;
  /** When true, only render bullet (no chevron overlay). Use for decorative/static bullets. */
  bulletOnly?: boolean;
}

/**
 * Tana-faithful BulletChevron component.
 *
 * Bullet and chevron share the SAME 15px zone (overlay layout):
 *   - Bullet is always visible (normal flow)
 *   - Chevron appears on row hover, overlaying the bullet (absolute positioned)
 *
 * This ensures the component fits within the 24px indent step:
 *   [BulletChevron 15px] [gap 7.5px] [text]
 *   Total pre-text: 22.5px < 24px indent step → no overlap with child chevrons.
 *
 * When `bulletOnly` is true, the chevron overlay is not rendered. Use this for
 * decorative bullets in FieldRow, AutoCollectSection, etc. that are nested inside
 * a group/row container but should not show expand/collapse controls.
 */
export function BulletChevron({
  hasChildren,
  isExpanded,
  onToggle,
  onDrillDown,
  onBulletClick,
  dimmed,
  isReference,
  bulletOnly,
}: BulletChevronProps) {
  const showOuterRing = hasChildren && !isExpanded;

  return (
    <div className="relative flex shrink-0 items-center h-[21px] w-[15px]">
      {/* Bullet: always visible */}
      <span
        role="button"
        className="flex h-[21px] w-[15px] items-center justify-center cursor-pointer group/bullet shrink-0"
        onClick={onBulletClick}
        title="Zoom in"
      >
        <div
          className={`flex h-[15px] w-[15px] items-center justify-center rounded-full transition-colors group-active/bullet:scale-90 ${
            isReference ? 'border border-dashed border-foreground/40' : ''
          } ${showOuterRing || (isReference && hasChildren && !isExpanded) ? 'bg-foreground/[0.08]' : ''}`}
        >
          <div className={`h-[5px] w-[5px] rounded-full transition-transform group-hover/bullet:scale-[1.375] ${dimmed ? 'bg-foreground/15' : 'bg-foreground/50'}`} />
        </div>
      </span>

      {/* Chevron: overlays bullet on row hover (hidden for decorative/static bullets) */}
      {!bulletOnly && (
        <button
          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/row:opacity-100 pointer-events-none group-hover/row:pointer-events-auto z-10 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          onDoubleClick={(e) => { e.stopPropagation(); onDrillDown(); }}
          title={isExpanded ? 'Collapse' : 'Expand'}
        >
          <div
            className={`flex h-[15px] w-[15px] items-center justify-center rounded-full bg-background outline outline-1 outline-border-emphasis hover:bg-foreground/[0.04] transition-colors ${
              isExpanded ? '[&>svg]:rotate-90' : ''
            }`}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 12 12"
              className="text-muted-foreground transition-transform"
            >
              <path
                d="M4.5 2.5L8 6L4.5 9.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </button>
      )}
    </div>
  );
}
