interface BulletChevronProps {
  hasChildren: boolean;
  isExpanded: boolean;
  onBulletClick: () => void;
  /** Dimmed style for trailing input placeholder bullets */
  dimmed?: boolean;
  /** Reference node: show concentric circles (bullseye) bullet */
  isReference?: boolean;
  /** TagDef color: renders colored circle with white # instead of plain dot */
  tagDefColor?: string;
}

/**
 * Bullet component (15px zone).
 *
 * Renders the bullet dot with optional outer ring (collapsed-with-children)
 * and reference dashed border. Used everywhere a bullet is needed.
 *
 * In OutlinerItem, a separate ChevronButton sits to the left of this bullet
 * to form the side-by-side layout: [Chevron 15px][Bullet 15px][gap 7.5px][text].
 * The selection ring wraps Bullet + text, not the chevron.
 */
export function BulletChevron({
  hasChildren,
  isExpanded,
  onBulletClick,
  dimmed,
  isReference,
  tagDefColor,
}: BulletChevronProps) {
  const showOuterRing = hasChildren && !isExpanded;

  // TagDef bullet: colored circle with white #
  if (tagDefColor) {
    return (
      <span
        role="button"
        className="flex shrink-0 h-[21px] w-[15px] items-center justify-center cursor-pointer group/bullet"
        onClick={onBulletClick}
        title="Zoom in"
      >
        <div
          className="flex h-[13px] w-[13px] items-center justify-center rounded-full transition-transform group-hover/bullet:scale-110 group-active/bullet:scale-90"
          style={{ backgroundColor: tagDefColor }}
        >
          <span className="text-[9px] font-bold leading-none text-white select-none">#</span>
        </div>
      </span>
    );
  }

  return (
    <span
      role="button"
      className="flex shrink-0 h-[21px] w-[15px] items-center justify-center cursor-pointer group/bullet"
      onClick={onBulletClick}
      title="Zoom in"
    >
      <div
        className={`flex h-[15px] w-[15px] items-center justify-center rounded-full transition-colors group-active/bullet:scale-90 ${
          isReference ? 'border border-dashed border-foreground/40' : ''
        } ${showOuterRing ? 'bg-foreground/[0.08]' : ''}`}
      >
        <div className={`h-[5px] w-[5px] rounded-full transition-transform group-hover/bullet:scale-[1.375] ${dimmed ? 'bg-foreground/15' : 'bg-foreground/50'}`} />
      </div>
    </span>
  );
}

interface ChevronButtonProps {
  isExpanded: boolean;
  onToggle: () => void;
  onDrillDown: () => void;
}

/**
 * Chevron expand/collapse button (15px zone).
 *
 * Sits to the LEFT of the Bullet in OutlinerItem, forming:
 *   [Chevron 15px][Bullet 15px][gap 7.5px][text]
 *
 * Hidden by default, appears on row hover via group-hover/row.
 * pointer-events-none when hidden to prevent invisible click interception.
 */
export function ChevronButton({
  isExpanded,
  onToggle,
  onDrillDown,
}: ChevronButtonProps) {
  return (
    <button
      className="flex shrink-0 h-[21px] w-[15px] items-center justify-center opacity-0 group-hover/row:opacity-100 pointer-events-none group-hover/row:pointer-events-auto transition-opacity"
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
          className="text-foreground-secondary transition-transform"
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
  );
}
