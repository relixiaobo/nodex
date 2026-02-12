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
  /** When true, only render the chevron (bullet rendered separately via <Bullet />) */
  chevronOnly?: boolean;
}

interface BulletProps {
  hasChildren: boolean;
  isExpanded: boolean;
  onBulletClick: () => void;
  dimmed?: boolean;
  isReference?: boolean;
}

/**
 * Standalone Bullet component — used when selection ring needs to wrap
 * bullet + text separately from chevron.
 */
export function Bullet({ hasChildren, isExpanded, onBulletClick, dimmed, isReference }: BulletProps) {
  const showOuterRing = hasChildren && !isExpanded;
  return (
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
  );
}

/**
 * Tana-faithful BulletChevron component.
 *
 * Layout (matches Tana DOM):
 *   [ChevronArea 15px] [BulletArea 15px]
 *
 * Chevron and Bullet are TWO INDEPENDENT side-by-side areas.
 *
 * When `chevronOnly` is true, only the chevron is rendered (for selection
 * ring layouts where bullet needs to be inside a separate wrapper).
 */
export function BulletChevron({
  hasChildren,
  isExpanded,
  onToggle,
  onDrillDown,
  onBulletClick,
  dimmed,
  isReference,
  chevronOnly,
}: BulletChevronProps) {
  const chevron = (
    <button
      className="flex shrink-0 h-[21px] w-[15px] items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity"
      onClick={onToggle}
      onDoubleClick={onDrillDown}
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
  );

  if (chevronOnly) {
    return chevron;
  }

  return (
    <div className="flex shrink-0 items-center h-[21px]">
      {chevron}
      <Bullet
        hasChildren={hasChildren}
        isExpanded={isExpanded}
        onBulletClick={onBulletClick}
        dimmed={dimmed}
        isReference={isReference}
      />
    </div>
  );
}
