/**
 * View Toolbar — Sort / Filter / Group controls for outliner views.
 *
 * Phase 1: Sort is functional; Filter and Group are disabled placeholders.
 * Shows on hover when no config is active; always visible when sort is set.
 * Rendered between a node's title and its children (inside OutlinerItem or OutlinerView).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, ListFilter, Group, ArrowUp, ArrowDown, X } from '../../lib/icons.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useNodeTags } from '../../hooks/use-node-tags.js';
import * as loroDoc from '../../lib/loro-doc.js';
import type { SortDirection } from '../../lib/sort-utils.js';

// ── Built-in sort fields ──

const BUILTIN_FIELDS: Array<{ id: string; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'createdAt', label: 'Created' },
];

interface ViewToolbarProps {
  nodeId: string;
  /** Indentation depth (0 for root OutlinerView) */
  depth: number;
}

export function ViewToolbar({ nodeId, depth }: ViewToolbarProps) {
  const _version = useNodeStore((s) => s._version);
  const viewDefId = useNodeStore((s) => {
    void s._version;
    return s.getViewDefId(nodeId);
  });

  const viewDef = useNodeStore((s) => {
    void s._version;
    if (!viewDefId) return null;
    return s.getNode(viewDefId);
  });

  const sortField = viewDef?.sortField ?? null;
  const sortDirection = (viewDef?.sortDirection ?? 'asc') as SortDirection;
  const toolbarVisible = viewDef?.toolbarVisible ?? false;
  const hasActiveConfig = !!sortField;

  // Only render when toolbar is toggled on or has active config
  if (!toolbarVisible && !hasActiveConfig) return null;

  const leftPad = depth * 28 + 6 + 15 + 4;

  return (
    <div
      className="flex items-center gap-0.5 h-6"
      style={{ paddingLeft: leftPad }}
    >
      {sortField ? (
        <SortButton
          nodeId={nodeId}
          sortField={sortField}
          sortDirection={sortDirection}
        />
      ) : (
        <SortTriggerButton nodeId={nodeId} />
      )}
      <ToolbarIconButton
        icon={ListFilter}
        label="Filter"
        disabled
        tooltip="Coming soon"
      />
      <ToolbarIconButton
        icon={Group}
        label="Group"
        disabled
        tooltip="Coming soon"
      />
    </div>
  );
}

// ── Sort trigger button (no active sort) ──

function SortTriggerButton({ nodeId }: { nodeId: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        className="flex items-center gap-1 h-5 px-1 rounded text-[11px] text-foreground-tertiary hover:text-foreground-secondary hover:bg-foreground/4 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        title="Sort"
      >
        <ArrowUpDown size={11} strokeWidth={1.5} />
        <span>Sort</span>
      </button>
      {open && (
        <SortDropdown
          nodeId={nodeId}
          sortField={null}
          sortDirection="asc"
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Sort button with active indicator ──

function SortButton({
  nodeId,
  sortField,
  sortDirection,
}: {
  nodeId: string;
  sortField: string;
  sortDirection: SortDirection;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const fieldLabel = useSortFieldLabel(nodeId, sortField);
  const DirIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <>
      <button
        ref={btnRef}
        className="flex items-center gap-1 h-5 px-1 rounded text-[11px] text-primary hover:bg-primary-muted transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        title="Sort"
      >
        <ArrowUpDown size={11} strokeWidth={1.5} />
        <span className="max-w-[100px] truncate">{fieldLabel}</span>
        <DirIcon size={9} strokeWidth={2} />
      </button>
      {open && (
        <SortDropdown
          nodeId={nodeId}
          sortField={sortField}
          sortDirection={sortDirection}
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ── Sort dropdown (portal) ──

function SortDropdown({
  nodeId,
  sortField,
  sortDirection,
  anchorRef,
  onClose,
}: {
  nodeId: string;
  sortField: string | null;
  sortDirection: SortDirection;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const tagFields = useTagFieldDefs(nodeId);

  // Close on outside click or escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)
        && anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
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
  }, [onClose, anchorRef]);

  // Position below anchor
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [anchorRef]);

  const handleSelect = useCallback((field: string) => {
    if (field === sortField) {
      // Toggle direction
      useNodeStore.getState().setSortConfig(nodeId, field, sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      useNodeStore.getState().setSortConfig(nodeId, field, 'asc');
    }
    onClose();
  }, [nodeId, sortField, sortDirection, onClose]);

  const handleRemove = useCallback(() => {
    useNodeStore.getState().clearSort(nodeId);
    onClose();
  }, [nodeId, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg bg-background shadow-paper p-1 text-foreground"
      style={{ top: pos.top, left: pos.left }}
    >
      {BUILTIN_FIELDS.map((f) => (
        <SortFieldItem
          key={f.id}
          label={f.label}
          active={sortField === f.id}
          direction={sortField === f.id ? sortDirection : undefined}
          onClick={() => handleSelect(f.id)}
        />
      ))}
      {tagFields.length > 0 && (
        <>
          <div className="mx-1 my-1 h-px bg-border-subtle" />
          {tagFields.map((f) => (
            <SortFieldItem
              key={f.id}
              label={f.name}
              active={sortField === f.id}
              direction={sortField === f.id ? sortDirection : undefined}
              onClick={() => handleSelect(f.id)}
            />
          ))}
        </>
      )}
      {sortField && (
        <>
          <div className="mx-1 my-1 h-px bg-border-subtle" />
          <button
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive transition-colors hover:bg-foreground/4"
            onClick={handleRemove}
          >
            <X size={14} strokeWidth={1.5} />
            Remove sort
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

function SortFieldItem({
  label,
  active,
  direction,
  onClick,
}: {
  label: string;
  active: boolean;
  direction?: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors text-left ${
        active
          ? 'text-primary bg-primary-muted'
          : 'text-foreground-secondary hover:bg-foreground/4 hover:text-foreground'
      }`}
      onClick={onClick}
    >
      <span className="flex-1">{label}</span>
      {active && direction && (
        direction === 'asc'
          ? <ArrowUp size={12} strokeWidth={2} className="text-primary" />
          : <ArrowDown size={12} strokeWidth={2} className="text-primary" />
      )}
    </button>
  );
}

// ── Disabled toolbar icon button ──

function ToolbarIconButton({
  icon: Icon,
  label,
  disabled,
  tooltip,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  disabled?: boolean;
  tooltip?: string;
}) {
  return (
    <button
      className={`flex items-center gap-1 h-5 px-1 rounded text-[11px] transition-colors ${
        disabled
          ? 'text-foreground-tertiary cursor-not-allowed opacity-50'
          : 'text-foreground-secondary hover:bg-foreground/4 hover:text-foreground cursor-pointer'
      }`}
      disabled={disabled}
      title={tooltip ?? label}
    >
      <Icon size={11} strokeWidth={1.5} />
      <span>{label}</span>
    </button>
  );
}

// ── Hooks ──

/** Get the display label for a sort field. */
function useSortFieldLabel(nodeId: string, sortField: string): string {
  const _version = useNodeStore((s) => s._version);

  return useMemo(() => {
    const builtin = BUILTIN_FIELDS.find((f) => f.id === sortField);
    if (builtin) return builtin.label;
    // Field def name
    const fieldDef = loroDoc.toNodexNode(sortField);
    return fieldDef?.name || 'Field';
  }, [sortField, _version]);
}

/** Get all field definitions from the node's tags (for sort dropdown). */
function useTagFieldDefs(nodeId: string): Array<{ id: string; name: string }> {
  const tagIds = useNodeTags(nodeId);
  const _version = useNodeStore((s) => s._version);

  return useMemo(() => {
    const fields: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();
    for (const tagId of tagIds) {
      const tagDef = loroDoc.toNodexNode(tagId);
      if (!tagDef) continue;
      for (const childId of tagDef.children) {
        const child = loroDoc.toNodexNode(childId);
        if (child?.type !== 'fieldDef') continue;
        if (seen.has(childId)) continue;
        seen.add(childId);
        fields.push({ id: childId, name: child.name ?? '' });
      }
    }
    return fields;
  }, [tagIds, _version]);
}
