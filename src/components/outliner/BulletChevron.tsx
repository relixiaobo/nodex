interface BulletChevronProps {
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDrillDown: () => void;
  onBulletClick: () => void;
  onChevronMouseDown?: () => void;
}

/**
 * Tana-faithful BulletChevron component.
 *
 * Layout (matches Tana DOM):
 *   [ChevronArea 15px] [BulletArea 15px]
 *
 * Chevron and Bullet are TWO INDEPENDENT side-by-side areas.
 *
 * Bullet (right, always visible):
 *   - All states: 5px inner dot (::after in Tana)
 *   - Collapsed with children: 15px outer circle with dimmed bg (bulletColor1Dimmed)
 *   - Leaf / expanded: transparent outer circle (only inner dot visible)
 *   - Click → zoom in (pushPanel)
 *   - Hover → scale up (1.375x in Tana)
 *   - Active → scale down (0.9x)
 *
 * Chevron (left, shows on row hover):
 *   - All nodes get chevron on hover (including leaf nodes)
 *   - Collapsed/leaf: right-pointing arrow (›)
 *   - Expanded: down-pointing arrow (rotated 90°)
 *   - Click → toggle expand/collapse
 *   - Double-click → drill down (pushPanel)
 */
export function BulletChevron({
  hasChildren,
  isExpanded,
  onToggle,
  onDrillDown,
  onBulletClick,
  onChevronMouseDown,
}: BulletChevronProps) {
  // Collapsed with children: show dimmed background ring (Tana: bulletColor1Dimmed)
  const showOuterRing = hasChildren && !isExpanded;

  return (
    <div className="flex shrink-0 items-center">
      {/* Chevron area — left of bullet, shows on row hover only */}
      <button
        className="flex h-7 w-[15px] items-center justify-center"
        onClick={onToggle}
        onDoubleClick={onDrillDown}
        onMouseDown={onChevronMouseDown}
        title={hasChildren && isExpanded ? 'Collapse' : 'Expand'}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:text-foreground ${
            hasChildren && isExpanded ? 'rotate-90' : ''
          }`}
        >
          <path
            d="M4 2L8 6L4 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {/* Bullet area — right of chevron, always visible, click to zoom in.
           Hit area matches chevron height (h-7) for easy clicking;
           visual ring stays 15×15px. */}
      <span
        role="button"
        className="flex h-7 w-[15px] items-center justify-center cursor-pointer group/bullet"
        onClick={onBulletClick}
        title="Zoom in"
      >
        <div
          className={`flex h-[15px] w-[15px] items-center justify-center rounded-full transition-colors group-active/bullet:scale-90 ${
            showOuterRing ? 'bg-foreground/10' : ''
          }`}
        >
          <div className="h-[5px] w-[5px] rounded-full bg-foreground/50 transition-transform group-hover/bullet:scale-[1.375]" />
        </div>
      </span>
    </div>
  );
}
