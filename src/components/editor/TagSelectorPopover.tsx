/**
 * TagSelectorPopover — small fuzzy search popover for selecting a tag.
 *
 * Appears when user clicks # Tag in the FloatingToolbar.
 * Lists all tagDefs, supports keyboard navigation and fuzzy filtering.
 * #highlight is pinned to the top of the list.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Hash } from '../../lib/icons.js';
import { CONTAINER_IDS, SYS_T } from '../../types/index.js';
import type { NodexNode } from '../../types/index.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { fuzzyMatch } from '../../lib/fuzzy-search.js';
import { resolveTagColor, type TagColor } from '../../lib/tag-colors.js';

export interface TagSelectorResult {
  tagDefId: string;
  tagName: string;
}

interface TagSelectorPopoverProps {
  /** Screen-space anchor position (from FloatingToolbar button). */
  anchorTop: number;
  anchorLeft: number;
  onSelect: (result: TagSelectorResult) => void;
  onClose: () => void;
}

interface TagItem {
  id: string;
  name: string;
  color: TagColor;
  isPinned: boolean;
}

function getTagDefs(): TagItem[] {
  const schemaChildren = loroDoc.getChildren(CONTAINER_IDS.SCHEMA);
  const items: TagItem[] = [];

  for (const childId of schemaChildren) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type !== 'tagDef' || !child.name) continue;

    items.push({
      id: child.id,
      name: child.name,
      color: resolveTagColor(child.id),
      isPinned: child.id === SYS_T.HIGHLIGHT,
    });
  }

  return items;
}

function filterAndSort(items: TagItem[], query: string): TagItem[] {
  if (!query.trim()) {
    // No query: show pinned first, then alphabetical
    const pinned = items.filter(i => i.isPinned);
    const rest = items.filter(i => !i.isPinned).sort((a, b) => a.name.localeCompare(b.name));
    return [...pinned, ...rest];
  }

  // Fuzzy filter
  const matches: Array<{ item: TagItem; score: number }> = [];
  for (const item of items) {
    const result = fuzzyMatch(query, item.name);
    if (result) {
      matches.push({ item, score: result.score });
    }
  }

  // Sort by score (best first), then pin #highlight to top within same score band
  matches.sort((a, b) => {
    if (a.item.isPinned && !b.item.isPinned) return -1;
    if (!a.item.isPinned && b.item.isPinned) return 1;
    return b.score - a.score;
  });

  return matches.map(m => m.item);
}

const POPOVER_WIDTH = 200;
const POPOVER_MAX_HEIGHT = 240;

export function TagSelectorPopover({ anchorTop, anchorLeft, onSelect, onClose }: TagSelectorPopoverProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allTags = useMemo(() => getTagDefs(), []);
  const filtered = useMemo(() => filterAndSort(allTags, query), [allTags, query]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-focus input on mount
  useEffect(() => {
    // Small delay to avoid the mousedown from closing the popover
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const popover = document.querySelector('[data-tag-selector]');
      if (popover && !popover.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleClickOutside, true);
    };
  }, [onClose]);

  const handleSelect = useCallback((item: TagItem) => {
    onSelect({ tagDefId: item.id, tagName: item.name });
  }, [onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex]);
      }
    }
  }, [filtered, selectedIndex, handleSelect]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const selected = list.children[selectedIndex] as HTMLElement | undefined;
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Position: below the anchor, clamped to viewport
  const style = useMemo(() => {
    const top = anchorTop + 8;
    const left = Math.max(8, anchorLeft - POPOVER_WIDTH / 2);
    return { top: `${top}px`, left: `${left}px` };
  }, [anchorTop, anchorLeft]);

  return createPortal(
    <div
      data-tag-selector
      data-testid="tag-selector-popover"
      className="fixed z-[60] flex flex-col rounded-lg bg-background shadow-paper border border-border/50 overflow-hidden"
      style={{
        ...style,
        width: `${POPOVER_WIDTH}px`,
        maxHeight: `${POPOVER_MAX_HEIGHT}px`,
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Search input */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/30">
        <Hash size={12} className="text-foreground-tertiary shrink-0" />
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-tertiary outline-none"
          placeholder="Search tags..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Tag list */}
      <div ref={listRef} className="overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-2 text-xs text-foreground-tertiary">No tags found</div>
        )}
        {filtered.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`flex w-full items-center gap-2 px-3 py-1 text-sm text-left transition-colors ${
              index === selectedIndex
                ? 'bg-foreground/6 text-foreground'
                : 'text-foreground-secondary hover:bg-foreground/4'
            }`}
            onClick={() => handleSelect(item)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <span
              className="shrink-0 text-sm font-medium leading-none"
              style={{ color: item.color.text }}
            >#</span>
            <span className="truncate">{item.name}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
