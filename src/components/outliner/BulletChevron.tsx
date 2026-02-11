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
 *   - Reference: concentric circles (outer ring border + inner dot), always visible
 *   - Click → zoom in (pushPanel)
 *   - Hover → scale up (1.375x in Tana)
 *   - Active → scale down (0.9x)
 *
 * Chevron (left, shows on row hover):
 *   - All nodes get chevron on hover (including leaf nodes)
 *   - Collapsed/leaf: right-pointing arrow (›)
 *   - Expanded: down-pointing arrow (rotated 90°)
 *   - Normal: white bg circle, light gray outline
 *   - Hover: light gray bg circle fill
 *   - Click → toggle expand/collapse
 *   - Double-click → drill down (pushPanel)
 */
export function BulletChevron({
  hasChildren,
  isExpanded,
  onToggle,
  onDrillDown,
  onBulletClick,
  dimmed,
  isReference,
}: BulletChevronProps) {
  // Collapsed with children: show dimmed background ring (Tana: bulletColor1Dimmed)
  const showOuterRing = hasChildren && !isExpanded;

  return (
    <div className="flex shrink-0 items-center h-[21px]">
      {/* Chevron area — left of bullet, shows on row hover only.
           Tana: 15×15px circle button, position: absolute left: -21px from bullet.
           We use inline flex with opacity toggle instead. */}
      <button
        className="flex h-[21px] w-[15px] items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
        onClick={onToggle}
        onDoubleClick={onDrillDown}
        title={hasChildren && isExpanded ? 'Collapse' : 'Expand'}
      >
        {/* Circular chevron button — Tana: white bg, 1px gray outline, hover fills gray */}
        <div
          className={`flex h-[15px] w-[15px] items-center justify-center rounded-full bg-background outline outline-1 outline-border/60 hover:bg-foreground/[0.04] transition-colors ${
            hasChildren && isExpanded ? '[&>svg]:rotate-90' : ''
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
      {/* Bullet area — right of chevron, always visible, click to zoom in.
           Hit area matches chevron height (h-7) for easy clicking;
           visual ring stays 15×15px. */}
      <span
        role="button"
        className="flex h-[21px] w-[15px] items-center justify-center cursor-pointer group/bullet"
        onClick={onBulletClick}
        title="Zoom in"
      >
        {isReference ? (
          /* Reference bullet: concentric circles (bullseye ◉)
             Outer: 11px ring with 1.5px border, Inner: 5px solid dot.
             Always visible regardless of expand/collapse state. */
          <div className="flex h-[11px] w-[11px] items-center justify-center rounded-full border-[1.5px] border-foreground/30 transition-transform group-hover/bullet:scale-[1.375] group-active/bullet:scale-90">
            <div className="h-[4px] w-[4px] rounded-full bg-foreground/50" />
          </div>
        ) : (
          /* Standard bullet */
          <div
            className={`flex h-[15px] w-[15px] items-center justify-center rounded-full transition-colors group-active/bullet:scale-90 ${
              showOuterRing ? 'bg-foreground/10' : ''
            }`}
          >
            <div className={`h-[5px] w-[5px] rounded-full transition-transform group-hover/bullet:scale-[1.375] ${dimmed ? 'bg-foreground/15' : 'bg-foreground/50'}`} />
          </div>
        )}
      </span>
    </div>
  );
}
