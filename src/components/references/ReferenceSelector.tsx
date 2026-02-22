/**
 * Reference selector dropdown — non-focusable list driven by editor @ trigger.
 *
 * Keyboard navigation (Enter/Arrow/Escape) is handled by the editor keymap
 * and forwarded here via imperative ref methods.
 * mouseDown.preventDefault() keeps editor focus when clicking items.
 *
 * Mirrors TagSelector.tsx pattern.
 */
import { useMemo, useEffect, useLayoutEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { AtSign, Calendar, Plus } from '../../lib/icons.js';
import { useNodeSearch, type NodeSearchResult } from '../../hooks/use-node-search';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { isWorkspaceContainer } from '../../lib/tree-utils.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { ensureDateNode } from '../../lib/journal.js';
import { formatDayName } from '../../lib/date-utils.js';
import { getTreeReferenceBlockReason, type TreeReferenceBlockReason } from '../../lib/reference-rules.js';

export interface ReferenceDropdownHandle {
  getItemCount(): number;
  getSelectedItem(): { type: 'existing'; id: string; name: string } | { type: 'create'; name: string } | null;
}

interface ReferenceSelectorProps {
  open: boolean;
  onSelect: (nodeId: string) => void;
  onCreateNew?: (name: string) => void;
  query: string;
  selectedIndex: number;
  currentNodeId: string;
  /** When provided, selector disables candidates that are invalid as tree references under this parent. */
  treeReferenceParentId?: string | null;
  /** Caret anchor in viewport coordinates (preferred over local anchorRef). */
  anchor?: { left: number; top: number; bottom: number };
}

const SKIP_RECENT_DOC_TYPES = new Set<string>(['fieldEntry', 'fieldDef', 'tagDef', 'reference']);

interface DateShortcut {
  keyword: string;
  label: string;
  getDate: () => Date;
}

const DATE_SHORTCUTS: DateShortcut[] = [
  { keyword: 'today', label: 'Today', getDate: () => new Date() },
  {
    keyword: 'tomorrow',
    label: 'Tomorrow',
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    },
  },
  {
    keyword: 'yesterday',
    label: 'Yesterday',
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return d;
    },
  },
];

export function matchDateShortcuts(query: string): Array<DateShortcut & { dateName: string }> {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();
  return DATE_SHORTCUTS
    .filter((shortcut) => shortcut.keyword.startsWith(q))
    .map((shortcut) => ({ ...shortcut, dateName: formatDayName(shortcut.getDate()) }));
}

function normalizeRecentNode(
  id: string,
  currentNodeId: string,
): NodeSearchResult | null {
  if (id === currentNodeId) return null;
  if (isWorkspaceContainer(id)) return null;
  const node = loroDoc.toNodexNode(id);
  if (!node) return null;
  if (node.type && SKIP_RECENT_DOC_TYPES.has(node.type)) return null;
  const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
  if (!name) return null;
  return { id, name, breadcrumb: '', updatedAt: node.updatedAt ?? 0 };
}

export function collectRecentReferenceNodes(params: {
  currentNodeId: string;
  panelHistory: string[];
  panelIndex: number;
  limit?: number;
}): NodeSearchResult[] {
  const { currentNodeId, panelHistory, panelIndex, limit = 5 } = params;
  const seen = new Set<string>();
  const results: NodeSearchResult[] = [];

  const pushIfValid = (id: string) => {
    if (seen.has(id)) return;
    const normalized = normalizeRecentNode(id, currentNodeId);
    if (!normalized) return;
    seen.add(id);
    results.push(normalized);
  };

  // Primary source: navigation history (most recently opened first).
  for (let i = panelIndex; i >= 0 && results.length < limit; i--) {
    const id = panelHistory[i];
    if (!id) continue;
    pushIfValid(id);
  }

  // Fallback source: most recently edited nodes globally.
  if (results.length < limit) {
    const candidates = loroDoc
      .getAllNodeIds()
      .map((id) => normalizeRecentNode(id, currentNodeId))
      .filter((item): item is NodeSearchResult => !!item && !seen.has(item.id))
      .sort((a, b) => {
        if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
        const byName = a.name.localeCompare(b.name, 'en');
        if (byName !== 0) return byName;
        return a.id.localeCompare(b.id, 'en');
      });

    for (const item of candidates) {
      if (results.length >= limit) break;
      seen.add(item.id);
      results.push(item);
    }
  }

  return results;
}

function getTreeReferenceDisabledReason(reason: TreeReferenceBlockReason | null): string | null {
  switch (reason) {
    case 'self_parent':
      return 'Cannot reference a node as its own child';
    case 'would_create_display_cycle':
      return 'Would create a circular tree reference';
    case 'missing_parent':
    case 'missing_target':
      return 'This node cannot be referenced right now';
    default:
      return null;
  }
}

export function getReferenceCandidateDisabledReason(params: {
  treeReferenceParentId?: string | null;
  targetNodeId: string;
}): string | null {
  const { treeReferenceParentId, targetNodeId } = params;
  if (!treeReferenceParentId) return null;
  const reason = getTreeReferenceBlockReason(treeReferenceParentId, targetNodeId, {
    hasNode: loroDoc.hasNode,
    getNode: loroDoc.toNodexNode,
    getChildren: loroDoc.getChildren,
  });
  return getTreeReferenceDisabledReason(reason);
}

export const ReferenceSelector = forwardRef<ReferenceDropdownHandle, ReferenceSelectorProps>(
  function ReferenceSelector({
    open,
    onSelect,
    onCreateNew,
    query,
    selectedIndex,
    currentNodeId,
    treeReferenceParentId,
    anchor,
  }, ref) {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const searchResults = useNodeSearch(query, currentNodeId);
    const listRef = useRef<HTMLDivElement>(null);

    // When query is empty, show recently used nodes:
    // navigation history first, then recently edited fallback.
    const panelHistory = useUIStore((s) => s.panelHistory);
    const panelIndex = useUIStore((s) => s.panelIndex);
    const _version = useNodeStore((s) => s._version);

    const recentNodes = useMemo(() => {
      if (query.trim()) return [];
      return collectRecentReferenceNodes({ currentNodeId, panelHistory, panelIndex, limit: 5 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, panelHistory, panelIndex, _version, currentNodeId]);

    const dateMatches = useMemo(() => matchDateShortcuts(query), [query]);
    const items = query.trim() ? searchResults : recentNodes;
    const itemDisabledReasons = useMemo(
      () => new Map(items.map((item) => [item.id, getReferenceCandidateDisabledReason({
        treeReferenceParentId,
        targetNodeId: item.id,
      })] as const)),
      [items, treeReferenceParentId],
    );
    const hasCreateOption = !!(query.trim() && onCreateNew);
    const totalItems = dateMatches.length + items.length + (hasCreateOption ? 1 : 0);
    const boundedIndex = totalItems > 0 ? Math.min(Math.max(0, selectedIndex), totalItems - 1) : -1;

    // Scroll highlighted item into view
    useEffect(() => {
      if (!listRef.current || boundedIndex < 0) return;
      const el = listRef.current.querySelectorAll('[data-ref-item]');
      el[boundedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [boundedIndex]);

    const selectDateShortcut = (shortcut: DateShortcut) => {
      const dayId = ensureDateNode(shortcut.getDate());
      onSelect(dayId);
    };

    useImperativeHandle(
      ref,
      () => ({
        getItemCount() {
          return totalItems;
        },
        getSelectedItem() {
          if (totalItems === 0 || boundedIndex < 0) return null;
          if (boundedIndex < dateMatches.length) {
            const shortcut = dateMatches[boundedIndex];
            const dayId = ensureDateNode(shortcut.getDate());
            return { type: 'existing', id: dayId, name: shortcut.dateName };
          }
          const itemIndex = boundedIndex - dateMatches.length;
          if (itemIndex < items.length) {
            const item = items[itemIndex];
            if (itemDisabledReasons.get(item.id)) return null;
            return { type: 'existing', id: item.id, name: item.name };
          }
          if (hasCreateOption) {
            return { type: 'create', name: query.trim() };
          }
          return null;
        },
      }),
      [items, itemDisabledReasons, dateMatches, boundedIndex, totalItems, hasCreateOption, query],
    );

    // Fixed positioning to escape overflow containers + auto-flip.
    // Start offscreen so the dropdown doesn't inflate the anchor rect on first render.
    const [dropStyle, setDropStyle] = useState<React.CSSProperties>({
      position: 'fixed', top: -9999, left: -9999,
    });
    useLayoutEffect(() => {
      if (!open) return;
      if (!anchor && !anchorRef.current) return;

      const update = () => {
        const rect = anchor
          ? { left: anchor.left, top: anchor.top, bottom: anchor.bottom }
          : anchorRef.current?.getBoundingClientRect();
        if (!rect) return;
        const viewH = window.innerHeight;
        const maxH = 240; // max-h-60
        const gap = 4;
        const spaceBelow = viewH - rect.bottom - gap;
        const spaceAbove = rect.top - gap;

        if (spaceBelow >= maxH || spaceBelow >= spaceAbove) {
          setDropStyle({ position: 'fixed', top: rect.bottom + gap, left: rect.left });
        } else {
          setDropStyle({ position: 'fixed', bottom: viewH - rect.top + gap, left: rect.left });
        }
      };

      update();
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
      return () => {
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
      };
    }, [open, anchor?.left, anchor?.top, anchor?.bottom]);

    if (!open) return null;

    const menu = (
      <div
        ref={listRef}
        className="z-[1000] w-64 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover/100 shadow-lg p-1"
        style={dropStyle}
        onMouseDown={(e) => e.preventDefault()}
      >
        {dateMatches.length > 0 && (
          <>
            <div className="px-2 py-1 text-[10px] font-medium text-foreground-secondary uppercase tracking-wider">
              Dates
            </div>
            {dateMatches.map((dm, i) => (
              <button
                key={dm.keyword}
                data-ref-item
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors ${
                  i === boundedIndex ? 'bg-accent' : 'hover:bg-foreground/5'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectDateShortcut(dm);
                }}
              >
                <Calendar size={14} className="text-foreground-secondary shrink-0" />
                <span className="text-sm text-foreground">{dm.label}</span>
                <span className="ml-auto text-[10px] text-foreground-tertiary">{dm.dateName}</span>
              </button>
            ))}
            {items.length > 0 && <div className="my-0.5 h-px bg-border" />}
          </>
        )}

        {/* Section header */}
        {!query.trim() && recentNodes.length > 0 && (
          <div className="px-2 py-1 text-[10px] font-medium text-foreground-secondary uppercase tracking-wider">
            Recently used
          </div>
        )}
        {query.trim() && items.length > 0 && (
          <div className="px-2 py-1 text-[10px] font-medium text-foreground-secondary uppercase tracking-wider">
            Nodes
          </div>
        )}

        {items.length === 0 && dateMatches.length === 0 && !hasCreateOption && (
          <div className="px-2 py-2 text-sm text-foreground-secondary">No matches</div>
        )}

        {items.map((item, i) => (
          <button
            key={item.id}
            data-ref-item
            aria-disabled={!!itemDisabledReasons.get(item.id)}
            title={itemDisabledReasons.get(item.id) ?? undefined}
            className={`flex w-full flex-col items-start rounded-md px-2 py-1 text-left transition-colors ${
              dateMatches.length + i === boundedIndex ? 'bg-accent' : 'hover:bg-foreground/5'
            } ${
              itemDisabledReasons.get(item.id) ? 'opacity-50 cursor-not-allowed' : ''
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (itemDisabledReasons.get(item.id)) return;
              onSelect(item.id);
            }}
          >
            <div className="flex w-full items-center gap-1.5">
              <AtSign size={14} className="text-foreground-secondary shrink-0" />
              <span className="text-sm text-foreground truncate">{item.name}</span>
              {itemDisabledReasons.get(item.id) && (
                <span className="ml-auto text-[10px] text-foreground-tertiary shrink-0">
                  Blocked
                </span>
              )}
            </div>
            {item.breadcrumb && (
              <span className="text-[10px] text-foreground-secondary truncate ml-[18px]">
                {item.breadcrumb}
              </span>
            )}
            {itemDisabledReasons.get(item.id) && dateMatches.length + i === boundedIndex && (
              <span className="text-[10px] text-amber-600 truncate ml-[18px]">
                {itemDisabledReasons.get(item.id)}
              </span>
            )}
          </button>
        ))}

        {hasCreateOption && (
          <>
            {(items.length > 0 || dateMatches.length > 0) && <div className="my-0.5 h-px bg-border" />}
            <button
              data-ref-item
              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-foreground transition-colors text-left ${
                boundedIndex === dateMatches.length + items.length ? 'bg-accent' : 'hover:bg-foreground/5'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCreateNew?.(query.trim());
              }}
            >
              <Plus size={14} className="text-foreground-secondary shrink-0" />
              Create &ldquo;{query}&rdquo;
              <span className="ml-auto text-[10px] text-foreground-tertiary shrink-0">⌘↵</span>
            </button>
          </>
        )}
      </div>
    );

    return (
      <>
        <span ref={anchorRef} className="pointer-events-none absolute left-0 top-0 h-0 w-0" />
        {typeof document === 'undefined' ? menu : createPortal(menu, document.body)}
      </>
    );
  },
);
