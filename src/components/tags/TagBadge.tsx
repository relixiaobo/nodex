import { useState, useCallback, useEffect, useRef, forwardRef } from 'react';
import { X, XCircle, Hash, Settings, Trash2, AlertTriangle } from '../../lib/icons.js';
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

export function canNavigateToTagNode(hasBackingNode: boolean): boolean {
  return hasBackingNode;
}

export function TagBadge({ tagDefId, onRemove, onNavigate }: TagBadgeProps) {
  const hasBackingNode = useNodeStore((s) => {
    void s._version;
    return !!s.getNode(tagDefId);
  });
  const tagName = useNodeStore((s) => {
    void s._version;
    const node = s.getNode(tagDefId);
    if (node?.name) return node.name;
    // Defensive fallback for unknown/legacy sys:* IDs without backing nodes
    if (tagDefId.startsWith('sys:')) return tagDefId.slice(4);
    return 'Untitled';
  });
  const isTrashed = useNodeStore((s) => { void s._version; return loroDoc.getParentId(tagDefId) === CONTAINER_IDS.TRASH; });
  const color = useNodeStore((s) => { void s._version; return resolveTagColor(tagDefId); });
  const canNavigate = !!onNavigate && canNavigateToTagNode(hasBackingNode);
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
      if (!canNavigate) return;
      e.stopPropagation();
      onNavigate?.();
    },
    [canNavigate, onNavigate],
  );

  // Trashed tagDef: show warning style instead of normal badge
  if (isTrashed) {
    return (
      <span
        className="inline-flex items-center text-xs font-medium leading-5 shrink-0 rounded bg-destructive/10 text-destructive px-1.5 gap-1"
        title={`Tag "${tagName}" has been deleted`}
      >
        <span className="text-[11px] leading-none text-[#999999]">#</span>
        <span>{tagName}</span>
        <AlertTriangle size={11} className="text-warning" />
        <Trash2 size={11} />
      </span>
    );
  }

  return (
    <>
      <span
        className="group/tag inline-flex h-5 items-center font-sans text-[13px] font-medium tracking-tight shrink-0 cursor-default gap-0.5"
        style={{ color: color.text }}
        onContextMenu={handleContextMenu}
      >
        <span
          className="relative flex items-center justify-center w-3 h-full cursor-pointer hover:text-destructive transition-colors"
          onClick={onRemove ? handleRemoveClick : undefined}
          title={onRemove ? 'Remove tag from item' : undefined}
        >
          <span className="text-[#999999] opacity-40 transition-opacity group-hover/tag:opacity-0">
            #
          </span>
          {onRemove && (
            <X
              size={11}
              strokeWidth={2.5}
              className="absolute inset-0 m-auto w-3 h-3 opacity-0 transition-opacity group-hover/tag:opacity-100"
            />
          )}
        </span>
        <span
          className={`transition-all ${canNavigate
            ? 'cursor-pointer hover:underline underline-offset-[3px] decoration-current/40 hover:decoration-current/80'
            : 'cursor-default'
            }`}
          onClick={canNavigate ? handleNameClick : undefined}
        >
          {tagName}
        </span>
      </span>

      {/* Context menu */}
      {
        menu &&
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
            onConfigure={canNavigate
              ? () => {
                onNavigate?.();
                setMenu(null);
              }
              : undefined}
          />,
          document.body,
        )
      }
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
  onConfigure?: () => void;
}

const TagContextMenu = forwardRef<HTMLDivElement, TagContextMenuProps>(
  ({ x, y, tagName, onRemove, onSearch, onConfigure }, ref) => {
    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-[180px] rounded-lg bg-background shadow-paper py-1 text-sm text-foreground"
        style={{ left: x, top: y }}
      >
        {onRemove && (
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-foreground/4 transition-colors text-left"
            onClick={onRemove}
          >
            <XCircle size={14} className="text-foreground-secondary" />
            Remove tag
          </button>
        )}
        <button
          className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-foreground/4 transition-colors text-left"
          onClick={onSearch}
        >
          <Hash size={14} className="text-foreground-secondary" />
          Everything tagged #{tagName}
        </button>
        {onRemove && onConfigure && (
          <>
            <div className="my-1 h-px bg-border" />
            <button
              className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-foreground/4 transition-colors text-left"
              onClick={onConfigure}
            >
              <Settings size={14} className="text-foreground-secondary" />
              Configure tag
            </button>
          </>
        )}
      </div>
    );
  },
);
