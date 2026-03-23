/**
 * Node right-click context menu.
 *
 * Portal-based, positioned at click coordinates.
 * "Move to" uses a hover-triggered flyout submenu beside the parent item.
 * "Add tag" uses mode-based sub-view (needs search input).
 *
 * Menu layout:
 *   Open in outliner
 *   ───
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
import { shouldNodeShowCheckbox, hasTagShowCheckbox } from '../../lib/checkbox-utils.js';
import { canCreateChildrenUnder, getNodeCapabilities, isNodeInTrash } from '../../lib/node-capabilities.js';
import { getSystemNodePreset, getWorkspaceHomeNodeId, getWorkspaceTopLevelNodeIds, type SystemNodeIconKey } from '../../lib/system-node-presets.js';
import { Kbd } from '../ui/Kbd.js';
import {
  Link, Copy, Scissors, CopyPlus, MoveRight, PanelRight,
  Hash, CheckSquare, Type, Trash2, ChevronLeft, ChevronRight,
  Plus, Library, CalendarDays, Search, Settings, Bot, ArrowUpDown, ListFilter, Group, RotateCcw,
} from '../../lib/icons.js';
import type { LucideIcon } from 'lucide-react';

// ── Context menu state ──

export interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  /** Node whose view config (sort/filter/group) is affected. Defaults to nodeId. */
  viewNodeId?: string;
}

// ── Sub-view modes ──

type MenuMode = 'main' | 'add-tag';

const SYSTEM_NODE_ICONS: Record<SystemNodeIconKey, LucideIcon> = {
  library: Library,
  inbox: Library,
  journal: CalendarDays,
  ai: Bot,
  trash: Trash2,
  search: Search,
  schema: Library,
  clips: Library,
  stash: Library,
  settings: Settings,
};

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
      viewNodeId={menu.viewNodeId ?? menu.nodeId}
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
  disabled,
}: {
  icon?: LucideIcon;
  label: string;
  kbd?: string;
  onClick: () => void;
  destructive?: boolean;
  trailing?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors text-left ${
        disabled
          ? 'cursor-default text-foreground-tertiary/60'
          : destructive
          ? 'text-destructive hover:bg-foreground/4'
          : 'text-foreground-secondary hover:text-foreground'
      }`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
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
  /** Node whose view config is affected (sort/filter/group/toolbar). */
  viewNodeId: string;
  onClose: () => void;
}

const NodeContextMenuContent = forwardRef<HTMLDivElement, NodeContextMenuContentProps>(
  function NodeContextMenuContent({ x, y, nodeId, viewNodeId, onClose }, ref) {
    const node = useNodeStore((s) => { void s._version; return loroDoc.toNodexNode(nodeId); });
    const parentId = useNodeStore((s) => { void s._version; return loroDoc.getParentId(nodeId); });
    // getNodeCapabilities returns a new object each call — extract primitives to avoid infinite re-render
    const capabilities = useMemo(() => getNodeCapabilities(nodeId), [nodeId, node]);
    const isInTrash = useMemo(() => isNodeInTrash(nodeId), [nodeId, node]);
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
    const canDuplicate = !!parentId && capabilities.canMove && canCreateChildrenUnder(parentId);
    const canAddTag = capabilities.canEditStructure;
    const canToggleCheckbox = capabilities.canEditFieldValues;
    const canEditDescription = capabilities.canEditNode;

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

    const currentTopLevelId = useMemo(() => {
      const workspaceHomeId = getWorkspaceHomeNodeId();
      let cursor: string | null = nodeId;
      while (cursor) {
        const parentId = loroDoc.getParentId(cursor);
        if (!parentId) return cursor;
        if (workspaceHomeId && parentId === workspaceHomeId) return cursor;
        cursor = parentId;
      }
      return null;
    }, [nodeId]);

    // ── Handlers ──

    const handleOpenInOutliner = useCallback(() => {
      useUIStore.getState().navigateToNode(nodeId);
      onClose();
    }, [nodeId, onClose]);

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
      if (!canDuplicate) return;
      useNodeStore.getState().duplicateNode(nodeId);
      onClose();
    }, [canDuplicate, nodeId, onClose]);

    const handleCheckbox = useCallback(() => {
      if (!canToggleCheckbox) return;
      useNodeStore.getState().cycleNodeCheckbox(nodeId);
      onClose();
    }, [canToggleCheckbox, nodeId, onClose]);

    const handleAddDescription = useCallback(() => {
      if (!canEditDescription) return;
      if (!hasDescription) {
        useNodeStore.getState().updateNodeDescription(nodeId, '');
      }
      useUIStore.getState().setEditingDescription(nodeId);
      onClose();
    }, [canEditDescription, nodeId, hasDescription, onClose]);

    const handleDelete = useCallback(() => {
      if (!capabilities.canDelete) return;
      useNodeStore.getState().trashNode(nodeId);
      onClose();
    }, [capabilities.canDelete, nodeId, onClose]);

    const handleRestore = useCallback(() => {
      useNodeStore.getState().restoreNode(nodeId);
      onClose();
    }, [nodeId, onClose]);

    const handlePermanentlyDelete = useCallback(() => {
      useNodeStore.getState().hardDeleteNode(nodeId);
      onClose();
    }, [nodeId, onClose]);

    const handleMoveTo = useCallback((targetId: string) => {
      if (!capabilities.canMove) return;
      useNodeStore.getState().moveNodeTo(nodeId, targetId);
      onClose();
    }, [capabilities.canMove, nodeId, onClose]);

    const handleApplyTag = useCallback((tagDefId: string) => {
      if (!canAddTag) return;
      useNodeStore.getState().applyTag(nodeId, tagDefId);
      onClose();
    }, [canAddTag, nodeId, onClose]);

    const handleCreateAndApplyTag = useCallback((name: string) => {
      if (!canAddTag) return;
      const newTag = useNodeStore.getState().createTagDef(name);
      useNodeStore.getState().applyTag(nodeId, newTag.id);
      onClose();
    }, [canAddTag, nodeId, onClose]);

    // View toolbar toggle — applies to viewNodeId (controls its children's view)
    const toolbarVisible = useMemo(() => {
      const viewDefId = useNodeStore.getState().getViewDefId(viewNodeId);
      if (!viewDefId) return false;
      const viewDef = useNodeStore.getState().getNode(viewDefId);
      return viewDef?.toolbarVisible ?? false;
    }, [viewNodeId]);

    const handleToggleToolbar = useCallback(() => {
      useNodeStore.getState().toggleToolbar(viewNodeId);
      onClose();
    }, [viewNodeId, onClose]);

    const handleOpenSort = useCallback(() => {
      // Ensure toolbar is visible, then auto-open Sort dropdown
      if (!toolbarVisible) useNodeStore.getState().toggleToolbar(viewNodeId);
      useUIStore.getState().setAutoOpenToolbarDropdown({ nodeId: viewNodeId, section: 'sort' });
      onClose();
    }, [viewNodeId, toolbarVisible, onClose]);

    const handleOpenFilter = useCallback(() => {
      if (!toolbarVisible) useNodeStore.getState().toggleToolbar(viewNodeId);
      useUIStore.getState().setAutoOpenToolbarDropdown({ nodeId: viewNodeId, section: 'filter' });
      onClose();
    }, [viewNodeId, toolbarVisible, onClose]);

    const handleOpenGroup = useCallback(() => {
      if (!toolbarVisible) useNodeStore.getState().toggleToolbar(viewNodeId);
      useUIStore.getState().setAutoOpenToolbarDropdown({ nodeId: viewNodeId, section: 'group' });
      onClose();
    }, [viewNodeId, toolbarVisible, onClose]);

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
            onOpenInNewPanel={handleOpenInOutliner}
            onCopyLink={handleCopyLink}
            onCopy={handleCopy}
            onCut={handleCut}
            onDuplicate={handleDuplicate}
            canCut={capabilities.canDelete}
            canDuplicate={canDuplicate}
            canMove={capabilities.canMove}
            currentTopLevelId={currentTopLevelId}
            onMoveTo={handleMoveTo}
            onAddTag={() => setMode('add-tag')}
            canAddTag={canAddTag}
            onCheckbox={handleCheckbox}
            canToggleCheckbox={canToggleCheckbox}
            checkboxLabel={checkboxLabel}
            onAddDescription={handleAddDescription}
            canEditDescription={canEditDescription}
            onDelete={handleDelete}
            canDelete={capabilities.canDelete}
            hasDescription={hasDescription}
            changed={changed}
            created={created}
            toolbarVisible={toolbarVisible}
            onToggleToolbar={handleToggleToolbar}
            onOpenSort={handleOpenSort}
            onOpenFilter={handleOpenFilter}
            onOpenGroup={handleOpenGroup}
            isInTrash={isInTrash}
            onRestore={handleRestore}
            onPermanentlyDelete={handlePermanentlyDelete}
          />
        )}
        {mode === 'add-tag' && (
          <AddTagView
            nodeId={nodeId}
            onSelect={handleApplyTag}
            onCreateNew={handleCreateAndApplyTag}
            canAddTag={canAddTag}
            onBack={() => setMode('main')}
          />
        )}
      </div>
    );
  },
);

// ── Main menu view ──

function MainMenu({
  onOpenInNewPanel,
  onCopyLink,
  onCopy,
  onCut,
  canCut,
  onDuplicate,
  canDuplicate,
  canMove,
  currentTopLevelId,
  onMoveTo,
  onAddTag,
  canAddTag,
  onCheckbox,
  canToggleCheckbox,
  checkboxLabel,
  onAddDescription,
  canEditDescription,
  onDelete,
  canDelete,
  hasDescription,
  changed,
  created,
  toolbarVisible,
  onToggleToolbar,
  onOpenSort,
  onOpenFilter,
  onOpenGroup,
  isInTrash,
  onRestore,
  onPermanentlyDelete,
}: {
  onOpenInNewPanel: () => void;
  onCopyLink: () => void;
  onCopy: () => void;
  onCut: () => void;
  canCut: boolean;
  onDuplicate: () => void;
  canDuplicate: boolean;
  canMove: boolean;
  currentTopLevelId: string | null;
  onMoveTo: (targetId: string) => void;
  onAddTag: () => void;
  canAddTag: boolean;
  onCheckbox: () => void;
  canToggleCheckbox: boolean;
  checkboxLabel: string;
  onAddDescription: () => void;
  canEditDescription: boolean;
  onDelete: () => void;
  canDelete: boolean;
  hasDescription: boolean;
  changed: string;
  created: string;
  toolbarVisible: boolean;
  onToggleToolbar: () => void;
  onOpenSort: () => void;
  onOpenFilter: () => void;
  onOpenGroup: () => void;
  isInTrash: boolean;
  onRestore: () => void;
  onPermanentlyDelete: () => void;
}) {
  return (
    <>
      <MenuItem icon={PanelRight} label="Open in outliner" onClick={onOpenInNewPanel} />

      <MenuSeparator />

      {/* View section */}
      <MenuItem
        icon={ArrowUpDown}
        label={toolbarVisible ? 'Hide view toolbar' : 'Show view toolbar'}
        onClick={onToggleToolbar}
      />
      <MenuItem icon={ArrowUpDown} label="Sort by" onClick={onOpenSort} />
      <MenuItem icon={ListFilter} label="Filter by" onClick={onOpenFilter} />
      <MenuItem icon={Group} label="Group by" onClick={onOpenGroup} />

      <MenuSeparator />

      {/* Link */}
      <MenuItem icon={Link} label="Copy node link" onClick={onCopyLink} />

      <MenuSeparator />

      {/* Clipboard + structure group */}
      <MenuItem icon={Copy} label="Copy" kbd="⌘C" onClick={onCopy} />
      <MenuItem icon={Scissors} label="Cut" kbd="⌘X" onClick={onCut} disabled={!canCut} />
      <MenuItem icon={CopyPlus} label="Duplicate" kbd="⇧⌘D" onClick={onDuplicate} disabled={!canDuplicate} />
      <MoveToSubmenu currentTopLevelId={currentTopLevelId} onSelect={onMoveTo} disabled={!canMove} />

      <MenuSeparator />

      {/* Node attributes group */}
      <MenuItem icon={Hash} label="Add tag" onClick={onAddTag} disabled={!canAddTag} />
      <MenuItem icon={CheckSquare} label={checkboxLabel} kbd="⌘↵" onClick={onCheckbox} disabled={!canToggleCheckbox} />
      <MenuItem
        icon={Type}
        label={hasDescription ? 'Edit description' : 'Add description'}
        onClick={onAddDescription}
        disabled={!canEditDescription}
      />

      <MenuSeparator />

      {/* Danger zone */}
      {isInTrash ? (
        <>
          <MenuItem icon={RotateCcw} label="Restore" onClick={onRestore} />
          <MenuItem icon={Trash2} label="Delete permanently" onClick={onPermanentlyDelete} destructive />
        </>
      ) : (
        <MenuItem icon={Trash2} label="Delete" onClick={onDelete} destructive disabled={!canDelete} />
      )}

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

function MoveToSubmenu({
  currentTopLevelId,
  onSelect,
  disabled = false,
}: {
  currentTopLevelId: string | null;
  onSelect: (targetId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const topLevelIds = useNodeStore((s) => {
    void s._version;
    return getWorkspaceTopLevelNodeIds();
  });

  const showSub = () => {
    if (disabled) return;
    clearTimeout(timerRef.current);
    setOpen(true);
  };
  const hideSub = () => {
    timerRef.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Compute flyout position: prefer right, then left, then clamp to left edge
  const flyoutStyle = useMemo((): React.CSSProperties => {
    if (!rowRef.current) return { top: 0, left: '100%' };
    const rect = rowRef.current.getBoundingClientRect();
    const subWidth = 180;
    const margin = 4;
    const vw = window.innerWidth;
    // Right side fits
    if (rect.right + subWidth + margin <= vw) {
      return { top: 0, left: '100%' };
    }
    // Left side fits
    if (rect.left - subWidth - margin >= 0) {
      return { top: 0, right: '100%' };
    }
    // Neither fits — pin to left edge of viewport, aligned with row top
    return { top: rect.top, left: margin, position: 'fixed' };
  }, [open]); // recalc when open changes

  const targets = useMemo(() => topLevelIds
    .filter((id) => id !== currentTopLevelId)
    .filter((id) => getNodeCapabilities(id).canMove)
    .map((id) => {
      const preset = getSystemNodePreset(id);
      const node = loroDoc.toNodexNode(id);
      return {
        id,
        label: node?.name?.trim() || id,
        icon: preset ? SYSTEM_NODE_ICONS[preset.iconKey] : Library,
      };
    }), [topLevelIds, currentTopLevelId]);

  if (targets.length === 0 && !disabled) return null;

  return (
    <div
      ref={rowRef}
      className="relative"
      onMouseEnter={showSub}
      onMouseLeave={hideSub}
    >
      <button
        className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-left ${disabled ? 'cursor-default text-foreground-tertiary/60' : 'text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground'}`}
        onClick={disabled ? undefined : () => setOpen((v) => !v)}
        disabled={disabled}
      >
        <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
          <MoveRight size={14} strokeWidth={1.5} />
        </div>
        <span className="flex-1">Move to</span>
        <ChevronRight size={14} strokeWidth={1.5} className="text-foreground-tertiary" />
      </button>

      {!disabled && open && (
        <div
          className="absolute z-50 min-w-[160px] rounded-lg bg-background shadow-paper p-1"
          style={flyoutStyle}
          onMouseEnter={showSub}
          onMouseLeave={hideSub}
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
  canAddTag,
  onBack,
}: {
  nodeId: string;
  onSelect: (tagDefId: string) => void;
  onCreateNew: (name: string) => void;
  canAddTag: boolean;
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
              if (canAddTag) onCreateNew(query.trim());
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
