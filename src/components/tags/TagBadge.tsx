import { useState, useCallback, useEffect, useRef, forwardRef } from 'react';
import { X, XCircle, Hash, Settings, Trash2, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNodeStore } from '../../stores/node-store';

/**
 * Deterministic color palette for tag badges.
 * Each tagDefId hashes to a consistent color.
 */
const TAG_COLORS = [
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

function getTagColor(tagDefId: string) {
  let hash = 0;
  for (let i = 0; i < tagDefId.length; i++) {
    hash = ((hash << 5) - hash + tagDefId.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

interface TagBadgeProps {
  tagDefId: string;
  onRemove?: () => void;
  /** Placeholder: navigate to supertag search node */
  onNavigate?: () => void;
}

export function TagBadge({ tagDefId, onRemove, onNavigate }: TagBadgeProps) {
  const tagName = useNodeStore((s) => s.entities[tagDefId]?.props.name ?? 'Untitled');
  const isTrashed = useNodeStore((s) => s.entities[tagDefId]?.props._ownerId?.endsWith('_TRASH') ?? false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const color = getTagColor(tagDefId);

  // Close context menu on outside click or Escape
  useEffect(() => {
    if (!menu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menu]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setMenu({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const handleRemoveClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove?.();
    },
    [onRemove],
  );

  const handleNameClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onNavigate?.();
    },
    [onNavigate],
  );

  // Trashed tagDef: show warning style instead of normal badge
  if (isTrashed) {
    return (
      <span
        className="inline-flex items-center text-xs shrink-0 rounded bg-destructive/10 text-destructive/70 py-0.5 px-1.5 gap-1"
        title={`Tag "${tagName}" has been deleted`}
      >
        <span className="text-[11px] leading-none">#</span>
        <span>{tagName}</span>
        <AlertTriangle size={11} className="text-amber-500" />
        <Trash2 size={11} />
      </span>
    );
  }

  return (
    <>
      <span
        className="group/tag inline-flex items-center text-xs shrink-0 cursor-default"
        style={{ '--tag-bg': color.bg, color: color.text } as React.CSSProperties}
        onContextMenu={handleContextMenu}
      >
        {/* Close area: colored bg by default (unified pill), transparent on badge hover.
            Grid stacks # and × in same cell → no size jump. */}
        <span
          className="inline-grid place-items-center w-4 self-stretch rounded-l bg-[var(--tag-bg)] transition-colors group-hover/tag:bg-transparent group-hover/tag:rounded-none hover:text-destructive"
          onClick={onRemove ? handleRemoveClick : undefined}
          title={onRemove ? 'Remove tag from item' : undefined}
          style={{ cursor: onRemove ? 'pointer' : undefined }}
        >
          <span className="col-start-1 row-start-1 text-[11px] leading-none transition-opacity group-hover/tag:opacity-0">
            #
          </span>
          {onRemove && (
            <X
              size={11}
              strokeWidth={2.5}
              className="col-start-1 row-start-1 opacity-0 transition-opacity group-hover/tag:opacity-100"
            />
          )}
        </span>
        {/* Tag name area: colored bg always, rounded-r by default → rounded on hover */}
        <span
          className="py-0.5 px-1.5 rounded-r bg-[var(--tag-bg)] transition-all group-hover/tag:rounded hover:bg-black/[0.06] cursor-pointer"
          onClick={onNavigate ? handleNameClick : undefined}
        >
          {tagName}
        </span>
      </span>

      {/* Context menu */}
      {menu &&
        createPortal(
          <TagContextMenu
            ref={menuRef}
            x={menu.x}
            y={menu.y}
            tagName={tagName}
            onRemove={onRemove ? () => { onRemove(); setMenu(null); } : undefined}
            onSearch={() => {
              // TODO: navigate to "Everything tagged #tagName"
              setMenu(null);
            }}
            onConfigure={() => {
              onNavigate?.();
              setMenu(null);
            }}
          />,
          document.body,
        )}
    </>
  );
}

/* ── Context menu ── */

interface TagContextMenuProps {
  x: number;
  y: number;
  tagName: string;
  onRemove?: () => void;
  onSearch: () => void;
  onConfigure: () => void;
}

const TagContextMenu = forwardRef<HTMLDivElement, TagContextMenuProps>(
  ({ x, y, tagName, onRemove, onSearch, onConfigure }, ref) => {
    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-popover py-1 shadow-lg text-sm text-popover-foreground"
        style={{ left: x, top: y }}
      >
        {onRemove && (
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left"
            onClick={onRemove}
          >
            <XCircle size={14} className="text-muted-foreground" />
            Remove tag
          </button>
        )}
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left"
          onClick={onSearch}
        >
          <Hash size={14} className="text-muted-foreground" />
          Everything tagged #{tagName}
        </button>
        {onRemove && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-accent transition-colors text-left"
              onClick={onConfigure}
            >
              <Settings size={14} className="text-muted-foreground" />
              Configure tag
            </button>
          </>
        )}
      </div>
    );
  },
);
