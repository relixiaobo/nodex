/**
 * View Toolbar — Sort / Filter / Group controls for outliner views.
 *
 * Visibility controlled by user toggle (context menu "Show/Hide view toolbar").
 * Rendered between a node's title and its children (inside OutlinerItem or OutlinerView).
 */
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown, ListFilter, Group,
  ArrowUp, ArrowDown, ChevronDown, CircleMinus, Plus, X, Check,
} from '../../lib/icons.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useNodeTags } from '../../hooks/use-node-tags.js';
import * as loroDoc from '../../lib/loro-doc.js';
import type { SortDirection } from '../../lib/sort-utils.js';
import { DropdownPanel } from '../ui/DropdownPanel.js';
import type { LucideIcon } from 'lucide-react';

// ── Built-in field lists ──

const BUILTIN_SORT_FIELDS: Array<{ id: string; label: string }> = [
  { id: 'name', label: 'Name' },
  { id: 'createdAt', label: 'Created' },
  { id: 'updatedAt', label: 'Last edited' },
  { id: 'done', label: 'Done' },
  { id: 'doneTime', label: 'Done time' },
  { id: 'refCount', label: 'References' },
];

const BUILTIN_FILTER_FIELDS: Array<{ id: string; label: string }> = [
  { id: 'tags', label: 'Tags' },
  { id: 'done', label: 'Checked state' },
];

const BUILTIN_GROUP_FIELDS: Array<{ id: string; label: string }> = [
  { id: 'tags', label: 'Tags' },
  { id: 'done', label: 'Done' },
  { id: 'createdAt', label: 'Created time' },
  { id: 'updatedAt', label: 'Last edited time' },
];

// ════════════════════════════════════════════════════════════════
// Shared primitives
// ════════════════════════════════════════════════════════════════

// ── ToolbarPill: unified trigger button for Sort / Filter / Group ──

const ToolbarPill = forwardRef<
  HTMLButtonElement,
  {
    icon: LucideIcon;
    label: string;
    active?: boolean;
    badge?: string;
    onClick: () => void;
    title?: string;
    children?: React.ReactNode;
  }
>(function ToolbarPill({ icon: Icon, label, active, badge, onClick, title, children }, ref) {
  return (
    <button
      ref={ref}
      className={`flex items-center gap-1 h-5 px-1 rounded text-[11px] transition-colors cursor-pointer ${
        active
          ? 'text-primary hover:bg-primary-muted'
          : 'text-foreground-tertiary hover:text-foreground-secondary hover:bg-foreground/4'
      }`}
      onClick={onClick}
      title={title}
    >
      <Icon size={11} strokeWidth={1.5} />
      {children ?? <span>{label}</span>}
      {badge && <span className="text-[10px] text-primary">{badge}</span>}
    </button>
  );
});

// ── SectionedFieldList: grouped field picker (Sort / Filter / Group) ──

type SectionedField = { id: string; label: string; section: string };

function SectionedFieldList({
  fields,
  onSelect,
  selectedId,
}: {
  fields: SectionedField[];
  onSelect: (fieldId: string) => void;
  selectedId?: string | null;
}) {
  const sections = useMemo(() => {
    const map = new Map<string, Array<{ id: string; label: string }>>();
    for (const f of fields) {
      const arr = map.get(f.section) ?? [];
      arr.push(f);
      map.set(f.section, arr);
    }
    return [...map.entries()];
  }, [fields]);

  return (
    <div className="px-1.5 pb-1.5">
      {sections.map(([section, items], i) => (
        <div key={section}>
          {i > 0 && <div className="mx-1 my-1 h-px bg-border-subtle" />}
          <div className="px-1.5 pt-1.5 pb-0.5 text-[10px] font-medium text-foreground-tertiary uppercase tracking-wider">
            {section}
          </div>
          {items.map((f) => (
            <button
              key={f.id}
              className="flex items-center gap-2 w-full rounded-md px-1.5 py-1.5 text-xs text-foreground-secondary hover:bg-foreground/4 hover:text-foreground transition-colors text-left cursor-pointer"
              onClick={() => onSelect(f.id)}
            >
              {selectedId !== undefined && (
                <span className={`w-3 h-3 rounded-full border shrink-0 ${
                  selectedId === f.id
                    ? 'border-primary bg-primary'
                    : 'border-foreground/20'
                }`} />
              )}
              {f.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ViewToolbar (main export)
// ════════════════════════════════════════════════════════════════

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
  const groupField = viewDef?.groupField ?? null;
  const toolbarVisible = viewDef?.toolbarVisible ?? false;

  const filterCount = useNodeStore((s) => {
    void s._version;
    return s.getFilters(nodeId).length;
  });

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
      <FilterControl nodeId={nodeId} filterCount={filterCount} />
      <GroupControl nodeId={nodeId} groupField={groupField} />
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
  const fieldLabel = useSortFieldLabel(sortField);
  const DirIcon = sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <>
      <ToolbarPill
        ref={btnRef}
        icon={ArrowUpDown}
        label="Sort"
        active={!!sortField}
        onClick={() => setOpen((v) => !v)}
        title="Sort"
      >
        {sortField ? (
          <>
            <span className="max-w-[100px] truncate">{fieldLabel}</span>
            <DirIcon size={9} strokeWidth={2} />
          </>
        ) : (
          <span>Sort</span>
        )}
      </ToolbarPill>
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
  const [view, setView] = useState<SortView>(sortField ? 'config' : 'fieldPicker');

  const tagFields = useTagFieldDefs(nodeId);
  const allFields = useMemo(() => [
    ...BUILTIN_SORT_FIELDS.map((f) => ({ ...f, section: 'System fields' })),
    ...tagFields.map((f) => ({ id: f.id, label: f.name || 'Untitled', section: 'Tag fields' })),
  ], [tagFields]);

  // Sync view state when sortField removed externally
  useEffect(() => {
    if (!sortField && view === 'config') setView('fieldPicker');
  }, [sortField, view]);

  const handleSelectField = useCallback((fieldId: string) => {
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

  return (
    <DropdownPanel anchorRef={anchorRef} onClose={onClose} title="Sort by">
      {view === 'config' && sortField ? (
        <>
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
        <SectionedFieldList fields={allFields} onSelect={handleSelectField} />
      )}
    </DropdownPanel>
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
      <button
        className="flex items-center gap-1 flex-1 min-w-0 h-7 px-2 rounded-md text-xs bg-foreground/[0.04] hover:bg-foreground/[0.07] transition-colors cursor-pointer"
        onClick={onOpenFieldPicker}
      >
        <span className="truncate flex-1 text-left">{fieldLabel}</span>
        <ChevronDown size={10} strokeWidth={2} className="text-foreground-tertiary shrink-0" />
      </button>
      <button
        className="flex items-center gap-1 h-7 px-2 rounded-md text-xs bg-foreground/[0.04] hover:bg-foreground/[0.07] transition-colors cursor-pointer whitespace-nowrap"
        onClick={onToggleDirection}
      >
        <span>{sortDirection === 'asc' ? 'Ascending' : 'Descending'}</span>
        <ChevronDown size={10} strokeWidth={2} className="text-foreground-tertiary shrink-0" />
      </button>
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

// ════════════════════════════════════════════════════════════════
// Filter Control
// ════════════════════════════════════════════════════════════════

function FilterControl({ nodeId, filterCount }: { nodeId: string; filterCount: number }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const onClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <ToolbarPill
        ref={btnRef}
        icon={ListFilter}
        label="Filter"
        active={filterCount > 0}
        badge={filterCount > 0 ? `(${filterCount})` : undefined}
        onClick={() => setOpen((v) => !v)}
        title="Filter"
      />
      {open && (
        <FilterDropdown nodeId={nodeId} anchorRef={btnRef} onClose={onClose} />
      )}
    </>
  );
}

type FilterView = 'list' | 'fieldPicker' | 'valuePicker';

function FilterDropdown({
  nodeId,
  anchorRef,
  onClose,
}: {
  nodeId: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const _version = useNodeStore((s) => s._version);
  const filters = useMemo(() => useNodeStore.getState().getFilters(nodeId), [nodeId, _version]);
  const tagFields = useTagFieldDefs(nodeId);

  const allFilterFields = useMemo(() => [
    ...BUILTIN_FILTER_FIELDS.map((f) => ({ ...f, section: 'System fields' })),
    ...tagFields.map((f) => ({ id: f.id, label: f.name || 'Untitled', section: 'Tag fields' })),
  ], [tagFields]);

  const [view, setView] = useState<FilterView>(filters.length > 0 ? 'list' : 'fieldPicker');
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null);

  const handleAddField = useCallback((fieldId: string) => {
    const op = fieldId === 'tags' ? 'all' as const : 'any' as const;
    const filterId = useNodeStore.getState().addFilter(nodeId, fieldId, op, []);
    setEditingFilterId(filterId);
    setView('valuePicker');
  }, [nodeId]);

  const handleRemoveFilter = useCallback((filterId: string) => {
    useNodeStore.getState().removeFilter(filterId);
  }, []);

  const handleResetAll = useCallback(() => {
    useNodeStore.getState().clearAllFilters(nodeId);
    onClose();
  }, [nodeId, onClose]);

  // Sync view when filters removed
  useEffect(() => {
    if (filters.length === 0 && view === 'list') setView('fieldPicker');
  }, [filters.length, view]);

  return (
    <DropdownPanel anchorRef={anchorRef} onClose={onClose} title="Filter by">
      {view === 'valuePicker' && editingFilterId ? (
        <FilterValuePicker
          filterId={editingFilterId}
          nodeId={nodeId}
          onBack={() => setView(filters.length > 0 ? 'list' : 'fieldPicker')}
        />
      ) : view === 'list' && filters.length > 0 ? (
        <>
          <div className="mx-1.5 mb-1 flex flex-col gap-1">
            {filters.map((f) => (
              <FilterConfigRow
                key={f.id}
                filter={f}
                allFields={allFilterFields}
                onEdit={() => { setEditingFilterId(f.id); setView('valuePicker'); }}
                onRemove={() => handleRemoveFilter(f.id)}
              />
            ))}
          </div>
          <div className="mx-1.5 my-0.5 h-px bg-border-subtle" />
          <div className="px-1.5 pb-1.5 pt-0.5 flex flex-col gap-0.5">
            <button
              className="flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 text-xs text-foreground-secondary hover:bg-foreground/4 transition-colors cursor-pointer"
              onClick={() => setView('fieldPicker')}
            >
              <Plus size={12} strokeWidth={1.5} />
              Add filter
            </button>
            <button
              className="flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 text-xs text-destructive hover:bg-foreground/4 transition-colors cursor-pointer"
              onClick={handleResetAll}
            >
              <X size={12} strokeWidth={1.5} />
              Reset
            </button>
          </div>
        </>
      ) : (
        <SectionedFieldList fields={allFilterFields} onSelect={handleAddField} />
      )}
    </DropdownPanel>
  );
}

function FilterConfigRow({
  filter,
  allFields,
  onEdit,
  onRemove,
}: {
  filter: { id: string; field: string; op: 'all' | 'any'; values: string[] };
  allFields: Array<{ id: string; label: string; section: string }>;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const fieldLabel = allFields.find((f) => f.id === filter.field)?.label ?? filter.field;
  const valueCount = filter.values.length;

  return (
    <div className="flex items-center gap-1">
      <button
        className="flex items-center gap-1 flex-1 min-w-0 h-7 px-2 rounded-md text-xs bg-foreground/[0.04] hover:bg-foreground/[0.07] transition-colors cursor-pointer"
        onClick={onEdit}
      >
        <span className="truncate flex-1 text-left">{fieldLabel}</span>
        <span className="text-foreground-tertiary shrink-0">
          {valueCount > 0 ? `(${valueCount})` : '(any)'}
        </span>
        <ChevronDown size={10} strokeWidth={2} className="text-foreground-tertiary shrink-0" />
      </button>
      <button
        className="flex items-center justify-center h-7 w-7 rounded-md text-foreground-tertiary hover:text-destructive hover:bg-foreground/[0.04] transition-colors cursor-pointer shrink-0"
        onClick={onRemove}
        title="Remove filter"
      >
        <CircleMinus size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}

function FilterValuePicker({
  filterId,
  nodeId,
  onBack,
}: {
  filterId: string;
  nodeId: string;
  onBack: () => void;
}) {
  const _version = useNodeStore((s) => s._version);
  const filter = useMemo(() => {
    const node = loroDoc.toNodexNode(filterId);
    return node ? {
      field: node.filterField ?? '',
      values: node.filterValues ?? [],
    } : null;
  }, [filterId, _version]);

  const availableValues = useFilterFieldValues(nodeId, filter?.field ?? '');

  const toggleValue = useCallback((value: string) => {
    if (!filter) return;
    const current = new Set(filter.values);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    useNodeStore.getState().updateFilterValues(filterId, [...current]);
  }, [filterId, filter]);

  if (!filter) return null;

  return (
    <div className="px-1.5 pb-1.5">
      <button
        className="flex items-center gap-1 w-full rounded-md px-1.5 py-1 mb-1 text-xs text-foreground-tertiary hover:text-foreground-secondary hover:bg-foreground/4 transition-colors cursor-pointer"
        onClick={onBack}
      >
        <ChevronDown size={10} strokeWidth={2} className="rotate-90" />
        Back
      </button>
      {availableValues.length === 0 ? (
        <div className="px-1.5 py-2 text-xs text-foreground-tertiary">No values found</div>
      ) : (
        availableValues.map((v) => {
          const selected = filter.values.includes(v.id);
          return (
            <button
              key={v.id}
              className="flex items-center gap-2 w-full rounded-md px-1.5 py-1.5 text-xs text-foreground-secondary hover:bg-foreground/4 hover:text-foreground transition-colors text-left cursor-pointer"
              onClick={() => toggleValue(v.id)}
            >
              <span className={`flex items-center justify-center w-4 h-4 rounded border ${
                selected ? 'bg-primary border-primary text-white' : 'border-foreground/20'
              }`}>
                {selected && <Check size={10} strokeWidth={2.5} />}
              </span>
              <span className="truncate">{v.label}</span>
            </button>
          );
        })
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Group Control
// ════════════════════════════════════════════════════════════════

function GroupControl({ nodeId, groupField }: { nodeId: string; groupField: string | null }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const onClose = useCallback(() => setOpen(false), []);
  const fieldLabel = useGroupFieldLabel(groupField);

  return (
    <>
      <ToolbarPill
        ref={btnRef}
        icon={Group}
        label="Group"
        active={!!groupField}
        onClick={() => setOpen((v) => !v)}
        title="Group"
      >
        {groupField ? (
          <span className="max-w-[100px] truncate">{fieldLabel}</span>
        ) : (
          <span>Group</span>
        )}
      </ToolbarPill>
      {open && (
        <GroupDropdown nodeId={nodeId} groupField={groupField} anchorRef={btnRef} onClose={onClose} />
      )}
    </>
  );
}

function GroupDropdown({
  nodeId,
  groupField,
  anchorRef,
  onClose,
}: {
  nodeId: string;
  groupField: string | null;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}) {
  const tagFields = useTagFieldDefs(nodeId);

  const allFields = useMemo(() => [
    ...tagFields.map((f) => ({ id: f.id, label: f.name || 'Untitled', section: 'User-defined fields' })),
    ...BUILTIN_GROUP_FIELDS.map((f) => ({ ...f, section: 'System fields' })),
  ], [tagFields]);

  const handleSelect = useCallback((fieldId: string) => {
    if (fieldId === groupField) {
      useNodeStore.getState().clearGroup(nodeId);
    } else {
      useNodeStore.getState().setGroupField(nodeId, fieldId);
    }
    onClose();
  }, [nodeId, groupField, onClose]);

  return (
    <DropdownPanel anchorRef={anchorRef} onClose={onClose} title="Group by">
      <SectionedFieldList
        fields={allFields}
        onSelect={handleSelect}
        selectedId={groupField}
      />
      {groupField && (
        <div className="px-1.5 pb-1.5">
          <div className="mx-1 mb-1 h-px bg-border-subtle" />
          <button
            className="flex items-center gap-1.5 w-full rounded-md px-1.5 py-1 text-xs text-destructive hover:bg-foreground/4 transition-colors cursor-pointer"
            onClick={() => { useNodeStore.getState().clearGroup(nodeId); onClose(); }}
          >
            <X size={12} strokeWidth={1.5} />
            Reset
          </button>
        </div>
      )}
    </DropdownPanel>
  );
}

// ════════════════════════════════════════════════════════════════
// Shared hooks
// ════════════════════════════════════════════════════════════════

/** Get the display label for a sort field. */
function useSortFieldLabel(sortField: string | null): string {
  const _version = useNodeStore((s) => s._version);

  return useMemo(() => {
    if (!sortField) return 'Sort';
    const builtin = BUILTIN_SORT_FIELDS.find((f) => f.id === sortField);
    if (builtin) return builtin.label;
    const fieldDef = loroDoc.toNodexNode(sortField);
    return fieldDef?.name || 'Field';
  }, [sortField, _version]);
}

/** Get all field definitions from the node's tags (for sort/filter/group dropdowns). */
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

/** Get the display label for a group field. */
function useGroupFieldLabel(groupField: string | null): string {
  const _version = useNodeStore((s) => s._version);

  return useMemo(() => {
    if (!groupField) return 'Group';
    const builtin = BUILTIN_GROUP_FIELDS.find((f) => f.id === groupField);
    if (builtin) return builtin.label;
    const fieldDef = loroDoc.toNodexNode(groupField);
    return fieldDef?.name || 'Field';
  }, [groupField, _version]);
}

/**
 * Get available values for a filter field by scanning the node's children.
 * For 'tags': collect all unique tags from children.
 * For 'done': return ['true', 'false'].
 * For fieldDefId: collect all unique field values from children.
 */
function useFilterFieldValues(nodeId: string, filterField: string): Array<{ id: string; label: string }> {
  const _version = useNodeStore((s) => s._version);

  return useMemo(() => {
    if (!filterField) return [];

    if (filterField === 'done') {
      return [
        { id: 'true', label: 'Done' },
        { id: 'false', label: 'Not done' },
      ];
    }

    if (filterField === 'tags') {
      const tagSet = new Map<string, string>();
      const children = loroDoc.getChildren(nodeId);
      for (const childId of children) {
        const child = loroDoc.toNodexNode(childId);
        if (!child || child.type === 'viewDef' || child.type === 'fieldEntry') continue;
        for (const tagId of child.tags) {
          if (!tagSet.has(tagId)) {
            const tagDef = loroDoc.toNodexNode(tagId);
            tagSet.set(tagId, tagDef?.name ?? tagId);
          }
        }
      }
      return [...tagSet.entries()]
        .sort(([, a], [, b]) => a.localeCompare(b))
        .map(([id, label]) => ({ id, label }));
    }

    // Field value: scan children's fieldEntry for this fieldDefId
    const valueSet = new Map<string, string>();
    const children = loroDoc.getChildren(nodeId);
    for (const childId of children) {
      const child = loroDoc.toNodexNode(childId);
      if (!child) continue;
      for (const feId of child.children) {
        const fe = loroDoc.toNodexNode(feId);
        if (fe?.type !== 'fieldEntry' || fe.fieldDefId !== filterField) continue;
        for (const valId of fe.children) {
          const valNode = loroDoc.toNodexNode(valId);
          if (!valNode) continue;
          const key = valNode.targetId ?? valId;
          if (!valueSet.has(key)) {
            const label = valNode.targetId
              ? (loroDoc.toNodexNode(valNode.targetId)?.name ?? valNode.name ?? key)
              : (valNode.name ?? key);
            valueSet.set(key, label);
          }
        }
      }
    }
    return [...valueSet.entries()]
      .sort(([, a], [, b]) => a.localeCompare(b))
      .map(([id, label]) => ({ id, label }));
  }, [nodeId, filterField, _version]);
}
