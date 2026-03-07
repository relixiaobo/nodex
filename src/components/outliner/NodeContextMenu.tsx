/**
 * Node right-click context menu.
 *
 * Portal-based, positioned at click coordinates.
 * "Move to" uses a hover-triggered flyout submenu beside the parent item.
 * "Add tag" uses mode-based sub-view (needs search input).
 *
 * Menu layout:
 *   Copy node link
 *   ───
 *   Copy               ⌘C
 *   Cut                ⌘X
 *   Duplicate          ⇧⌘D
 *   Move to             →
 *   ───
 *   Add tag
 *   Add/Remove checkbox ⌘↵
 *   Add description
 *   ───
 *   Delete
 *   ───
 *   Changed ...
 *   Created ...
 */
import { useEffect, useLayoutEffect, useRef, forwardRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { copyNodesToClipboard, cutNodesToClipboard, writeNodeLinkToClipboard } from '../../lib/node-clipboard.js';
import { formatSmartTimestamp } from '../../lib/format-timestamp.js';
import { useWorkspaceTags } from '../../hooks/use-workspace-tags.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { isWorkspaceContainer } from '../../lib/tree-utils.js';
import { shouldNodeShowCheckbox, hasTagShowCheckbox } from '../../lib/checkbox-utils.js';
import { CONTAINER_IDS } from '../../types/index.js';
import { Kbd } from '../ui/Kbd.js';
import {
  Link, Copy, Scissors, CopyPlus, MoveRight,
  Hash, CheckSquare, Type, Trash2, ChevronLeft, ChevronRight,
  Plus, Inbox, Library, CalendarDays, ArrowUpDown,
} from '../../lib/icons.js';
import type { LucideIcon } from 'lucide-react';

// ── Context menu state ──

export interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

// ── Sub-view modes ──

type MenuMode = 'main' | 'add-tag';

// ── Menu portal ──

interface NodeContextMenuPortalProps {
  menu: ContextMenuState;
  onClose: () => void;
}

export function NodeContextMenuPortal({ menu, onClose }: NodeContextMenuPortalProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return createPortal(
    <NodeContextMenuContent
      ref={menuRef}
      x={menu.x}
      y={menu.y}
      nodeId={menu.nodeId}
      onClose={onClose}
    />,
    document.body,
  );
}

// ── Shared menu item button ──

function MenuItem({
  icon: Icon,
  label,
  kbd,
  onClick,
  destructive,
  trailing,
}: {
  icon?: LucideIcon;
  label: string;
  kbd?: string;
  onClick: () => void;
  destructive?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors text-left hover:bg-foreground/4 ${
        destructive
          ? 'text-destructive'
          : 'text-foreground-secondary hover:text-foreground'
      }`}
      onClick={onClick}
    >
      {Icon && (
        <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
          <Icon size={14} strokeWidth={1.5} />
        </div>
      )}
      <span className="flex-1">{label}</span>
      {trailing}
      {kbd && <Kbd keys={kbd} />}
    </button>
  );
}

function MenuSeparator() {
  return <div className="mx-1 my-1 h-px bg-border-subtle" />;
}

// ── Menu content ──

interface NodeContextMenuContentProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
}

const NodeContextMenuContent = forwardRef<HTMLDivElement, NodeContextMenuContentProps>(
  function NodeContextMenuContent({ x, y, nodeId, onClose }, ref) {
    const node = useNodeStore((s) => { void s._version; return loroDoc.toNodexNode(nodeId); });
    const [mode, setMode] = useState<MenuMode>('main');

    // Measure actual menu size and clamp to viewport (before paint)
    const innerRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: x, top: y });

    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const pad = 4;
      let newLeft = x;
      let newTop = y;
      if (newLeft + rect.width > vw - pad) newLeft = Math.max(pad, vw - rect.width - pad);
      if (newTop + rect.height > vh - pad) newTop = Math.max(pad, vh - rect.height - pad);
      if (newLeft !== pos.left || newTop !== pos.top) setPos({ left: newLeft, top: newTop });
    }, [x, y, mode]); // re-measure when mode changes (add-tag has different height)

    const created = node?.createdAt ? formatSmartTimestamp(node.createdAt) : '';
    const changed = node?.updatedAt ? formatSmartTimestamp(node.updatedAt) : '';
    const hasDescription = (node?.description ?? '').length > 0;

    // Checkbox state → dynamic label
    const checkboxLabel = useMemo(() => {
      if (!node) return 'Add checkbox';
      const { showCheckbox, isDone } = shouldNodeShowCheckbox(node);
      if (!showCheckbox) return 'Add checkbox';
      // Tag-driven checkbox can't be removed via ⌘↵, only toggled
      if (hasTagShowCheckbox(node)) {
        return isDone ? 'Mark as undone' : 'Mark as done';
      }
      // Manual 3-state: Undone → Done → Remove
      if (isDone) return 'Remove checkbox';
      return 'Mark as done';
    }, [node]);

    // Detect which container the node is in (walk up to find root container)
    const currentContainerId = useMemo(() => {
      let cursor: string | null = nodeId;
      while (cursor) {
        if (isWorkspaceContainer(cursor)) return cursor;
        cursor = loroDoc.getParentId(cursor);
      }
      return null;
    }, [nodeId]);

    // ── Handlers ──

    const handleCopyLink = useCallback(() => {
      writeNodeLinkToClipboard(nodeId);
      onClose();
    }, [nodeId, onClose]);

    const handleCopy = useCallback(() => {
      copyNodesToClipboard([nodeId]);
      onClose();
    }, [nodeId, onClose]);

    const handleCut = useCallback(() => {
      cutNodesToClipboard([nodeId]);
      onClose();
    }, [nodeId, onClose]);

    const handleDuplicate = useCallback(() => {
      useNodeStore.getState().duplicateNode(nodeId);
      onClose();
    }, [nodeId, onClose]);

    const handleCheckbox = useCallback(() => {
      useNodeStore.getState().cycleNodeCheckbox(nodeId);
      onClose();
    }, [nodeId, onClose]);

    const handleAddDescription = useCallback(() => {
      if (!hasDescription) {
        useNodeStore.getState().updateNodeDescription(nodeId, '');
      }
      useUIStore.getState().setEditingDescription(nodeId);
      onClose();
    }, [nodeId, hasDescription, onClose]);

    const handleDelete = useCallback(() => {
      useNodeStore.getState().trashNode(nodeId);
      onClose();
    }, [nodeId, onClose]);

    const handleMoveTo = useCallback((containerId: string) => {
      useNodeStore.getState().moveNodeTo(nodeId, containerId);
      onClose();
    }, [nodeId, onClose]);

    const handleApplyTag = useCallback((tagDefId: string) => {
      useNodeStore.getState().applyTag(nodeId, tagDefId);
      onClose();
    }, [nodeId, onClose]);

    const handleCreateAndApplyTag = useCallback((name: string) => {
      const newTag = useNodeStore.getState().createTagDef(name);
      useNodeStore.getState().applyTag(nodeId, newTag.id);
      onClose();
    }, [nodeId, onClose]);

    // View toolbar toggle — applies to the right-clicked node itself (controls its children's view)
    const toolbarVisible = useMemo(() => {
      const viewDefId = useNodeStore.getState().getViewDefId(nodeId);
      if (!viewDefId) return false;
      const viewDef = useNodeStore.getState().getNode(viewDefId);
      return viewDef?.toolbarVisible ?? false;
    }, [nodeId]);

    const handleToggleToolbar = useCallback(() => {
      useNodeStore.getState().toggleToolbar(nodeId);
      onClose();
    }, [nodeId, onClose]);

    // Merge forwarded ref + innerRef for measurement
    const setRefs = useCallback((el: HTMLDivElement | null) => {
      (innerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }, [ref]);

    return (
      <div
        ref={setRefs}
        className="fixed z-50 min-w-[240px] rounded-lg bg-background shadow-paper p-1 text-foreground"
        style={{ left: pos.left, top: pos.top }}
      >
        {mode === 'main' && (
          <MainMenu
            onCopyLink={handleCopyLink}
            onCopy={handleCopy}
            onCut={handleCut}
            onDuplicate={handleDuplicate}
            currentContainerId={currentContainerId}
            onMoveTo={handleMoveTo}
            onAddTag={() => setMode('add-tag')}
            onCheckbox={handleCheckbox}
            checkboxLabel={checkboxLabel}
            onAddDescription={handleAddDescription}
            onDelete={handleDelete}
            hasDescription={hasDescription}
            changed={changed}
            created={created}
            toolbarVisible={toolbarVisible}
            onToggleToolbar={handleToggleToolbar}
          />
        )}
        {mode === 'add-tag' && (
          <AddTagView
            nodeId={nodeId}
            onSelect={handleApplyTag}
            onCreateNew={handleCreateAndApplyTag}
            onBack={() => setMode('main')}
          />
        )}
      </div>
    );
  },
);

// ── Main menu view ──

function MainMenu({
  onCopyLink,
  onCopy,
  onCut,
  onDuplicate,
  currentContainerId,
  onMoveTo,
  onAddTag,
  onCheckbox,
  checkboxLabel,
  onAddDescription,
  onDelete,
  hasDescription,
  changed,
  created,
  toolbarVisible,
  onToggleToolbar,
}: {
  onCopyLink: () => void;
  onCopy: () => void;
  onCut: () => void;
  onDuplicate: () => void;
  currentContainerId: string | null;
  onMoveTo: (containerId: string) => void;
  onAddTag: () => void;
  onCheckbox: () => void;
  checkboxLabel: string;
  onAddDescription: () => void;
  onDelete: () => void;
  hasDescription: boolean;
  changed: string;
  created: string;
  toolbarVisible: boolean;
  onToggleToolbar: () => void;
}) {
  return (
    <>
      {/* Link */}
      <MenuItem icon={Link} label="Copy node link" onClick={onCopyLink} />

      <MenuSeparator />

      {/* Clipboard + structure group */}
      <MenuItem icon={Copy} label="Copy" kbd="⌘C" onClick={onCopy} />
      <MenuItem icon={Scissors} label="Cut" kbd="⌘X" onClick={onCut} />
      <MenuItem icon={CopyPlus} label="Duplicate" kbd="⇧⌘D" onClick={onDuplicate} />
      <MoveToSubmenu currentContainerId={currentContainerId} onSelect={onMoveTo} />

      <MenuSeparator />

      {/* Node attributes group */}
      <MenuItem icon={Hash} label="Add tag" onClick={onAddTag} />
      <MenuItem icon={CheckSquare} label={checkboxLabel} kbd="⌘↵" onClick={onCheckbox} />
      <MenuItem
        icon={Type}
        label={hasDescription ? 'Edit description' : 'Add description'}
        onClick={onAddDescription}
      />

      {/* View toolbar toggle */}
      <MenuItem
        icon={ArrowUpDown}
        label={toolbarVisible ? 'Hide view toolbar' : 'Show view toolbar'}
        onClick={onToggleToolbar}
      />

      <MenuSeparator />

      {/* Danger zone */}
      <MenuItem icon={Trash2} label="Delete" onClick={onDelete} destructive />

      {/* Timestamps */}
      {(changed || created) && (
        <>
          <MenuSeparator />
          <div className="px-2 py-1 text-xs text-foreground-tertiary select-none space-y-0.5">
            {changed && <div>Changed {changed}</div>}
            {created && <div>Created {created}</div>}
          </div>
        </>
      )}
    </>
  );
}

// ── Move to hover submenu ──

const MOVE_TARGETS: Array<{ id: string; label: string; icon: LucideIcon }> = [
  { id: CONTAINER_IDS.INBOX, label: 'Inbox', icon: Inbox },
  { id: CONTAINER_IDS.LIBRARY, label: 'Library', icon: Library },
  { id: CONTAINER_IDS.JOURNAL, label: 'Daily notes', icon: CalendarDays },
];

type FlyoutSide = 'right' | 'left' | 'below';

function MoveToSubmenu({
  currentContainerId,
  onSelect,
}: {
  currentContainerId: string | null;
  onSelect: (containerId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showSub = () => {
    clearTimeout(timerRef.current);
    setOpen(true);
  };
  const hideSub = () => {
    timerRef.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Compute flyout position: prefer right → left → below (for narrow side panels)
  const flyoutPlacement = useMemo((): { side: FlyoutSide; style: React.CSSProperties } => {
    if (!rowRef.current) return { side: 'right', style: { top: 0, left: '100%' } };
    const rect = rowRef.current.getBoundingClientRect();
    const subWidth = 180;
    if (rect.right + subWidth <= window.innerWidth) {
      return { side: 'right', style: { top: 0, left: '100%' } };
    }
    if (rect.left - subWidth >= 0) {
      return { side: 'left', style: { top: 0, right: '100%' } };
    }
    // Neither side fits (narrow panel) — show inline below the trigger
    return { side: 'below', style: {} };
  }, [open]); // recalc when open changes

  const targets = MOVE_TARGETS.filter((t) => t.id !== currentContainerId);

  // Inline below mode: render targets directly under the trigger, no floating panel
  if (open && flyoutPlacement.side === 'below') {
    return (
      <div ref={rowRef} onMouseEnter={showSub} onMouseLeave={hideSub}>
        <button
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors text-left hover:bg-foreground/4 hover:text-foreground"
          onClick={() => setOpen(false)}
        >
          <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
            <ChevronLeft size={14} strokeWidth={1.5} />
          </div>
          <span className="flex-1 font-medium">Move to</span>
        </button>
        <div className="pl-4">
          {targets.map((target) => (
            <MenuItem
              key={target.id}
              icon={target.icon}
              label={target.label}
              onClick={() => onSelect(target.id)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={showSub}
      onMouseLeave={hideSub}
    >
      {/* Trigger row — same style as MenuItem */}
      <button
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors text-left hover:bg-foreground/4 hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
          <MoveRight size={14} strokeWidth={1.5} />
        </div>
        <span className="flex-1">Move to</span>
        <ChevronRight size={14} strokeWidth={1.5} className="text-foreground-tertiary" />
      </button>

      {/* Flyout submenu (side positioning) */}
      {open && (
        <div
          className="absolute z-50 min-w-[160px] rounded-lg bg-background shadow-paper p-1"
          style={flyoutPlacement.style}
        >
          {targets.map((target) => (
            <MenuItem
              key={target.id}
              icon={target.icon}
              label={target.label}
              onClick={() => onSelect(target.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Add tag sub-view ──

function AddTagView({
  nodeId,
  onSelect,
  onCreateNew,
  onBack,
}: {
  nodeId: string;
  onSelect: (tagDefId: string) => void;
  onCreateNew: (name: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allTags = useWorkspaceTags();
  const existingTagIds = useNodeStore((s) => {
    void s._version;
    return loroDoc.toNodexNode(nodeId)?.tags ?? [];
  });

  const filteredTags = useMemo(() => {
    const available = allTags.filter((t) => !existingTagIds.includes(t.id));
    if (!query) return available;
    const q = query.toLowerCase();
    return available.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTags, existingTagIds, query]);

  const hasCreateOption = query.trim().length > 0;
  const totalItems = filteredTags.length + (hasCreateOption ? 1 : 0);
  const boundedIndex = totalItems > 0 ? Math.min(Math.max(0, selectedIndex), totalItems - 1) : -1;

  // Auto-focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current || boundedIndex < 0) return;
    const items = listRef.current.querySelectorAll('[data-tag-item]');
    items[boundedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [boundedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onBack();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, totalItems - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) {
        if (query.trim()) onCreateNew(query.trim());
        return;
      }
      if (boundedIndex < 0) return;
      if (boundedIndex < filteredTags.length) {
        onSelect(filteredTags[boundedIndex].id);
      } else if (hasCreateOption) {
        onCreateNew(query.trim());
      }
    }
  }, [totalItems, boundedIndex, filteredTags, hasCreateOption, query, onSelect, onCreateNew, onBack]);

  return (
    <>
      <button
        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors text-left hover:bg-foreground/4 hover:text-foreground"
        onClick={onBack}
      >
        <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
          <ChevronLeft size={14} strokeWidth={1.5} />
        </div>
        <span className="font-medium">Add tag</span>
      </button>
      <MenuSeparator />
      <div className="px-2 pb-1">
        <input
          ref={inputRef}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-tertiary"
          placeholder="Search tags..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div ref={listRef} className="max-h-44 overflow-y-auto">
        {filteredTags.length === 0 && !hasCreateOption && (
          <div className="px-2 py-2 text-sm text-foreground-tertiary">No tags available</div>
        )}
        {filteredTags.map((tag, i) => (
          <button
            key={tag.id}
            data-tag-item
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors text-left ${
              i === boundedIndex ? 'bg-primary-muted' : 'hover:bg-foreground/4 hover:text-foreground'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(tag.id);
            }}
          >
            <span
              className="shrink-0 text-sm font-medium leading-none"
              style={{ color: resolveTagColor(tag.id).text }}
            >#</span>
            {tag.name}
          </button>
        ))}
        {hasCreateOption && (
          <>
            {filteredTags.length > 0 && <div className="mx-1 my-0.5 h-px bg-border-subtle" />}
            <button
              data-tag-item
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground-secondary transition-colors text-left ${
                boundedIndex === filteredTags.length ? 'bg-primary-muted' : 'hover:bg-foreground/4 hover:text-foreground'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCreateNew(query.trim());
              }}
            >
              <Plus size={14} className="text-foreground-tertiary shrink-0" />
              Create &ldquo;{query}&rdquo;
              <span className="ml-auto text-[10px] text-foreground-tertiary shrink-0">⌘↵</span>
            </button>
          </>
        )}
      </div>
    </>
  );
}
