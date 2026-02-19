import { useState, useCallback, useEffect, useRef, forwardRef } from 'react';
import { X, XCircle, Hash, Settings, Trash2, AlertTriangle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useNodeStore } from '../../stores/node-store';
import { resolveTagColor } from '../../lib/tag-colors.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { CONTAINER_IDS } from '../../types/index.js';

interface TagBadgeProps {
  tagDefId: string;
  onRemove?: () => void;
  /** Placeholder: navigate to supertag search node */
  onNavigate?: () => void;
}

export function TagBadge({ tagDefId, onRemove, onNavigate }: TagBadgeProps) {
  const tagName = useNodeStore((s) => { void s._version; return s.getNode(tagDefId)?.name ?? 'Untitled'; });
  const isTrashed = useNodeStore((s) => { void s._version; return loroDoc.getParentId(tagDefId) === CONTAINER_IDS.TRASH; });
  const color = useNodeStore((s) => { void s._version; return resolveTagColor({}, tagDefId); });
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
        className="inline-flex items-center text-xs font-medium leading-5 shrink-0 rounded bg-destructive/10 text-destructive px-1.5 gap-1"
        title={`Tag "${tagName}" has been deleted`}
      >
        <span className="text-[11px] leading-none">#</span>
        <span>{tagName}</span>
        <AlertTriangle size={11} className="text-warning" />
        <Trash2 size={11} />
      </span>
    );
  }

  return (
    <>
      <span
        className="group/tag inline-flex items-center text-xs font-medium leading-5 shrink-0 cursor-default"
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
          className="px-1.5 rounded-r bg-[var(--tag-bg)] transition-all group-hover/tag:rounded hover:bg-black/[0.06] cursor-pointer"
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
