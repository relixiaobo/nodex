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
import { AtSign, Plus } from '../../lib/icons.js';
import { useNodeSearch, type NodeSearchResult } from '../../hooks/use-node-search';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import * as loroDoc from '../../lib/loro-doc.js';

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
  /** Caret anchor in viewport coordinates (preferred over local anchorRef). */
  anchor?: { left: number; top: number; bottom: number };
}

export const ReferenceSelector = forwardRef<ReferenceDropdownHandle, ReferenceSelectorProps>(
  function ReferenceSelector({ open, onSelect, onCreateNew, query, selectedIndex, currentNodeId, anchor }, ref) {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const searchResults = useNodeSearch(query, currentNodeId);
    const listRef = useRef<HTMLDivElement>(null);

    // When query is empty, show recently opened nodes from navigation history
    const panelHistory = useUIStore((s) => s.panelHistory);
    const panelIndex = useUIStore((s) => s.panelIndex);
    const _version = useNodeStore((s) => s._version);

    const recentNodes = useMemo(() => {
      if (query.trim()) return [];
      const seen = new Set<string>();
      const results: NodeSearchResult[] = [];
      // Walk history backwards from current position for most recently visited
      for (let i = panelIndex; i >= 0 && results.length < 5; i--) {
        const id = panelHistory[i];
        if (id === currentNodeId || seen.has(id)) continue;
        seen.add(id);
        const node = loroDoc.toNodexNode(id);
        if (!node) continue;
        const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
        if (!name) continue;
        results.push({ id, name, breadcrumb: '' });
      }
      return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, panelHistory, panelIndex, _version, currentNodeId]);

    const items = query.trim() ? searchResults : recentNodes;
    const hasCreateOption = !!(query.trim() && onCreateNew);
    const totalItems = items.length + (hasCreateOption ? 1 : 0);
    const boundedIndex = totalItems > 0 ? Math.min(Math.max(0, selectedIndex), totalItems - 1) : -1;

    // Scroll highlighted item into view
    useEffect(() => {
      if (!listRef.current || boundedIndex < 0) return;
      const el = listRef.current.querySelectorAll('[data-ref-item]');
      el[boundedIndex]?.scrollIntoView({ block: 'nearest' });
    }, [boundedIndex]);

    useImperativeHandle(
      ref,
      () => ({
        getItemCount() {
          return totalItems;
        },
        getSelectedItem() {
          if (totalItems === 0 || boundedIndex < 0) return null;
          if (boundedIndex < items.length) {
            return { type: 'existing', id: items[boundedIndex].id, name: items[boundedIndex].name };
          }
          if (hasCreateOption) {
            return { type: 'create', name: query.trim() };
          }
          return null;
        },
      }),
      [items, boundedIndex, totalItems, hasCreateOption, query],
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
        {/* Section header */}
        {!query.trim() && recentNodes.length > 0 && (
          <div className="px-2 py-1 text-[10px] font-medium text-foreground-secondary uppercase tracking-wider">
            Recently opened
          </div>
        )}
        {query.trim() && items.length > 0 && (
          <div className="px-2 py-1 text-[10px] font-medium text-foreground-secondary uppercase tracking-wider">
            Nodes
          </div>
        )}

        {items.length === 0 && !hasCreateOption && (
          <div className="px-2 py-2 text-sm text-foreground-secondary">No matches</div>
        )}

        {items.map((item, i) => (
          <button
            key={item.id}
            data-ref-item
            className={`flex w-full flex-col items-start rounded-md px-2 py-1 text-left transition-colors ${
              i === boundedIndex ? 'bg-accent' : 'hover:bg-foreground/5'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(item.id);
            }}
          >
            <div className="flex w-full items-center gap-1.5">
              <AtSign size={14} className="text-foreground-secondary shrink-0" />
              <span className="text-sm text-foreground truncate">{item.name}</span>
            </div>
            {item.breadcrumb && (
              <span className="text-[10px] text-foreground-secondary truncate ml-[18px]">
                {item.breadcrumb}
              </span>
            )}
          </button>
        ))}

        {hasCreateOption && (
          <>
            {items.length > 0 && <div className="my-0.5 h-px bg-border" />}
            <button
              data-ref-item
              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-foreground transition-colors text-left ${
                boundedIndex === items.length ? 'bg-accent' : 'hover:bg-foreground/5'
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
