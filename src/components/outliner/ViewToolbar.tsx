/**
 * View Toolbar — Sort / Filter / Group controls for outliner views.
 *
 * Phase 1: Sort is functional; Filter and Group are disabled placeholders.
 * Shows on hover when no config is active; always visible when sort is set.
 * Rendered between a node's title and its children (inside OutlinerItem or OutlinerView).
 *
 * Dropdown internals match Tana's patterns:
 * - Sort: field picker → config row with inline field/direction pickers + reset footer
 * - Filter / Group: placeholder panels ("Coming soon")
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowUpDown, ListFilter, Group,
  ArrowUp, ArrowDown, ChevronDown, CircleMinus, Plus, X,
} from '../../lib/icons.js';
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

  // Toolbar visibility is controlled solely by the user toggle.
  // Active sort/filter/group still applies in the background when hidden.
  if (!toolbarVisible) return null;

  const leftPad = depth * 28 + 6 + 15 + 4;

  return (
    <div
      className="flex items-center gap-0.5 h-6"
      style={{ paddingLeft: leftPad }}
    >
      <SortControl
        nodeId={nodeId}
        sortField={sortField}
        sortDirection={sortDirection}
      />
      <PlaceholderControl
        icon={ListFilter}
        label="Filter"
        title="Filter by"
      />
      <PlaceholderControl
        icon={Group}
        label="Group"
        title="Group by"
      />
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Sort Control
// ════════════════════════════════════════════════════════════════

function SortControl({
  nodeId,
  sortField,
  sortDirection,
}: {
  nodeId: string;
  sortField: string | null;
  sortDirection: SortDirection;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const onClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <SortTriggerButton
        ref={btnRef}
        nodeId={nodeId}
        sortField={sortField}
        sortDirection={sortDirection}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <SortDropdown
          nodeId={nodeId}
          sortField={sortField}
          sortDirection={sortDirection}
          anchorRef={btnRef}
          onClose={onClose}
        />
      )}
    </>
  );
}

// ── Sort trigger button (toolbar pill) ──

import { forwardRef } from 'react';

const SortTriggerButton = forwardRef<
  HTMLButtonElement,
  {
    nodeId: string;
    sortField: string | null;
    sortDirection: SortDirection;
    onClick: () => void;
  }
>(function SortTriggerButton({ sortField, sortDirection, onClick }, ref) {
  const fieldLabel = useSortFieldLabel(sortField);
  const DirIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <button
      ref={ref}
      className={`flex items-center gap-1 h-5 px-1 rounded text-[11px] transition-colors cursor-pointer ${
        sortField
          ? 'text-primary hover:bg-primary-muted'
          : 'text-foreground-tertiary hover:text-foreground-secondary hover:bg-foreground/4'
      }`}
      onClick={onClick}
      title="Sort"
    >
      <ArrowUpDown size={11} strokeWidth={1.5} />
      {sortField ? (
        <>
          <span className="max-w-[100px] truncate">{fieldLabel}</span>
          <DirIcon size={9} strokeWidth={2} />
        </>
      ) : (
        <span>Sort</span>
      )}
    </button>
  );
});

// ── Sort dropdown ──

type SortView = 'config' | 'fieldPicker';

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
  // When sort active → show config; when user picks a field → switch to config;
  // when user clicks field name in config → switch to fieldPicker to change field.
  const [view, setView] = useState<SortView>(sortField ? 'config' : 'fieldPicker');

  const tagFields = useTagFieldDefs(nodeId);
  const allFields = useMemo(() => [
    ...BUILTIN_FIELDS.map((f) => ({ ...f, section: 'System fields' })),
    ...tagFields.map((f) => ({ id: f.id, label: f.name || 'Untitled', section: 'Tag fields' })),
  ], [tagFields]);

  useDropdownDismiss(menuRef, anchorRef, onClose);
  const pos = useDropdownPosition(anchorRef);

  // Sync view state when sortField changes externally (e.g., sort removed from elsewhere)
  useEffect(() => {
    if (sortField && view === 'fieldPicker') {
      // Don't auto-switch to config — user may be actively picking a new field
    } else if (!sortField && view === 'config') {
      setView('fieldPicker');
    }
  }, [sortField, view]);

  const handleSelectField = useCallback((fieldId: string) => {
    // Read the latest direction from the store (not stale closure)
    const store = useNodeStore.getState();
    const vdId = store.getViewDefId(nodeId);
    const currentDir = vdId ? (store.getNode(vdId)?.sortDirection ?? 'asc') : 'asc';
    store.setSortConfig(nodeId, fieldId, currentDir as SortDirection);
    setView('config');
  }, [nodeId]);

  const handleToggleDirection = useCallback(() => {
    if (!sortField) return;
    const next: SortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    useNodeStore.getState().setSortConfig(nodeId, sortField, next);
  }, [nodeId, sortField, sortDirection]);

  const handleRemove = useCallback(() => {
    useNodeStore.getState().clearSort(nodeId);
    onClose();
  }, [nodeId, onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 w-[260px] rounded-lg bg-background shadow-paper text-foreground"
      style={{ top: pos.top, left: pos.left }}
    >
      {/* Title */}
      <div className="px-3 pt-2.5 pb-1.5 text-xs font-medium text-foreground-secondary">
        Sort by
      </div>

      {view === 'config' && sortField ? (
        <>
          {/* Active sort row */}
          <div className="mx-1.5 mb-1">
            <SortConfigRow
              sortField={sortField}
              sortDirection={sortDirection}
              allFields={allFields}
              onOpenFieldPicker={() => setView('fieldPicker')}
              onToggleDirection={handleToggleDirection}
              onRemove={handleRemove}
            />
          </div>
          {/* Footer */}
          <div className="mx-1.5 my-0.5 h-px bg-border-subtle" />
          <div className="px-1.5 pb-1.5 pt-0.5 flex flex-col gap-0.5">
            <button
              className="flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 text-xs text-foreground-tertiary cursor-not-allowed"
              disabled
            >
              <Plus size={12} strokeWidth={1.5} />
              Add sort
            </button>
            <button
              className="flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 text-xs text-destructive hover:bg-foreground/4 transition-colors cursor-pointer"
              onClick={handleRemove}
            >
              <X size={12} strokeWidth={1.5} />
              Reset
            </button>
          </div>
        </>
      ) : (
        <SortFieldPicker
          allFields={allFields}
          onSelect={handleSelectField}
        />
      )}
    </div>,
    document.body,
  );
}

// ── Sort config row: [field ▾] [direction ▾] [⊖] ──

function SortConfigRow({
  sortField,
  sortDirection,
  allFields,
  onOpenFieldPicker,
  onToggleDirection,
  onRemove,
}: {
  sortField: string;
  sortDirection: SortDirection;
  allFields: Array<{ id: string; label: string; section: string }>;
  onOpenFieldPicker: () => void;
  onToggleDirection: () => void;
  onRemove: () => void;
}) {
  const fieldLabel = allFields.find((f) => f.id === sortField)?.label ?? 'Field';

  return (
    <div className="flex items-center gap-1">
      {/* Field picker trigger */}
      <button
        className="flex items-center gap-1 flex-1 min-w-0 h-7 px-2 rounded-md text-xs bg-foreground/[0.04] hover:bg-foreground/[0.07] transition-colors cursor-pointer"
        onClick={onOpenFieldPicker}
      >
        <span className="truncate flex-1 text-left">{fieldLabel}</span>
        <ChevronDown size={10} strokeWidth={2} className="text-foreground-tertiary shrink-0" />
      </button>
      {/* Direction toggle */}
      <button
        className="flex items-center gap-1 h-7 px-2 rounded-md text-xs bg-foreground/[0.04] hover:bg-foreground/[0.07] transition-colors cursor-pointer whitespace-nowrap"
        onClick={onToggleDirection}
      >
        <span>{sortDirection === 'asc' ? 'Ascending' : 'Descending'}</span>
        <ChevronDown size={10} strokeWidth={2} className="text-foreground-tertiary shrink-0" />
      </button>
      {/* Remove */}
      <button
        className="flex items-center justify-center h-7 w-7 rounded-md text-foreground-tertiary hover:text-destructive hover:bg-foreground/[0.04] transition-colors cursor-pointer shrink-0"
        onClick={onRemove}
        title="Remove sort"
      >
        <CircleMinus size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ── Sort field picker (grouped by section) ──

function SortFieldPicker({
  allFields,
  onSelect,
}: {
  allFields: Array<{ id: string; label: string; section: string }>;
  onSelect: (fieldId: string) => void;
}) {
  const sections = useMemo(() => {
    const map = new Map<string, Array<{ id: string; label: string }>>();
    for (const f of allFields) {
      const arr = map.get(f.section) ?? [];
      arr.push(f);
      map.set(f.section, arr);
    }
    return [...map.entries()];
  }, [allFields]);

  return (
    <div className="px-1.5 pb-1.5">
      {sections.map(([section, fields], i) => (
        <div key={section}>
          {i > 0 && <div className="mx-1 my-1 h-px bg-border-subtle" />}
          <div className="px-1.5 pt-1.5 pb-0.5 text-[10px] font-medium text-foreground-tertiary uppercase tracking-wider">
            {section}
          </div>
          {fields.map((f) => (
            <button
              key={f.id}
              className="flex w-full items-center rounded-md px-1.5 py-1.5 text-xs text-foreground-secondary hover:bg-foreground/4 hover:text-foreground transition-colors text-left cursor-pointer"
              onClick={() => onSelect(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Filter / Group — Placeholder dropdown controls
// ════════════════════════════════════════════════════════════════

function PlaceholderControl({
  icon: Icon,
  label,
  title,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const onClose = useCallback(() => setOpen(false), []);

  useDropdownDismiss(menuRef, btnRef, onClose, open);
  const pos = useDropdownPosition(btnRef, open);

  return (
    <>
      <button
        ref={btnRef}
        className="flex items-center gap-1 h-5 px-1 rounded text-[11px] text-foreground-tertiary hover:text-foreground-secondary hover:bg-foreground/4 transition-colors cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        title={label}
      >
        <Icon size={11} strokeWidth={1.5} />
        <span>{label}</span>
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 w-[220px] rounded-lg bg-background shadow-paper text-foreground"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="px-3 pt-2.5 pb-1.5 text-xs font-medium text-foreground-secondary">
            {title}
          </div>
          <div className="px-3 pb-3 pt-1 text-xs text-foreground-tertiary">
            Coming soon
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// Shared hooks
// ════════════════════════════════════════════════════════════════

/** Close dropdown on outside click or Escape. Only active when `enabled` is true. */
function useDropdownDismiss(
  menuRef: React.RefObject<HTMLDivElement | null>,
  anchorRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
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
  }, [menuRef, anchorRef, onClose, enabled]);
}

/** Position dropdown below anchor element. Recomputes when `active` changes to true. */
function useDropdownPosition(anchorRef: React.RefObject<HTMLElement | null>, active = true) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!active) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, [anchorRef, active]);
  return pos;
}

/** Get the display label for a sort field. */
function useSortFieldLabel(sortField: string | null): string {
  const _version = useNodeStore((s) => s._version);

  return useMemo(() => {
    if (!sortField) return 'Sort';
    const builtin = BUILTIN_FIELDS.find((f) => f.id === sortField);
    if (builtin) return builtin.label;
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
