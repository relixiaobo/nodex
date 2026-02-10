interface BulletChevronProps {
  hasChildren: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onDrillDown: () => void;
}

export function BulletChevron({
  hasChildren,
  isExpanded,
  onToggle,
  onDrillDown,
}: BulletChevronProps) {
  if (hasChildren) {
    // Parent node: bullet always visible, chevron on hover/expanded
    return (
      <button
        className="group/bullet relative flex h-7 w-5 shrink-0 items-center justify-center"
        onClick={onToggle}
        onDoubleClick={onDrillDown}
        title={isExpanded ? 'Collapse' : 'Expand'}
      >
        {/* Bullet — hidden when expanded or on hover */}
        <div
          className={`h-[6px] w-[6px] rounded-full bg-foreground/70 transition-opacity ${
            isExpanded ? 'opacity-0' : 'group-hover/bullet:opacity-0'
          }`}
        />
        {/* Chevron — shown when expanded or on hover */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`absolute text-muted-foreground transition-all hover:text-foreground ${
            isExpanded
              ? 'rotate-90 opacity-100'
              : 'opacity-0 group-hover/bullet:opacity-100'
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
    );
  }

  // Leaf node bullet
  return (
    <div className="flex h-7 w-5 shrink-0 items-center justify-center">
      <div className="h-[5px] w-[5px] rounded-full bg-foreground/30" />
    </div>
  );
}
