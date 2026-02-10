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
    return (
      <button
        className="flex h-7 w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        onClick={onToggle}
        onDoubleClick={onDrillDown}
        title={isExpanded ? 'Collapse' : 'Expand'}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
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
      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
    </div>
  );
}
