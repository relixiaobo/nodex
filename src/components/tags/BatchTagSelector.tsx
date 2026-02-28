/**
 * BatchTagSelector — modal tag picker for multi-selected nodes.
 *
 * Opens as a centered popup when the user presses # in selection mode.
 * Handles its own keyboard navigation (Arrow, Enter, Escape).
 * On select, applies the tag to all selected nodes via batchApplyTag.
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from '../../lib/icons.js';
import { useWorkspaceTags } from '../../hooks/use-workspace-tags';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useNodeStore } from '../../stores/node-store.js';
import { t } from '../../i18n/strings.js';

export function BatchTagSelector() {
  const isOpen = useUIStore((s) => s.batchTagSelectorOpen);
  const closeBatchTagSelector = useUIStore((s) => s.closeBatchTagSelector);
  const selectedNodeIds = useUIStore((s) => s.selectedNodeIds);
  const clearSelection = useUIStore((s) => s.clearSelection);
  const batchApplyTag = useNodeStore((s) => s.batchApplyTag);
  const createTagDef = useNodeStore((s) => s.createTagDef);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allTags = useWorkspaceTags();

  const filteredTags = useMemo(() => {
    if (!query) return allTags;
    const q = query.toLowerCase();
    return allTags.filter((tag) => tag.name.toLowerCase().includes(q));
  }, [allTags, query]);

  const hasCreateOption = query.trim().length > 0;
  const totalItems = filteredTags.length + (hasCreateOption ? 1 : 0);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Focus the input after render
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current || selectedIndex < 0) return;
    const items = listRef.current.querySelectorAll('[data-tag-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleSelect = useCallback((tagDefId: string) => {
    const nodeIds = [...selectedNodeIds];
    if (nodeIds.length === 0) return;
    batchApplyTag(nodeIds, tagDefId);
    closeBatchTagSelector();
    clearSelection();
  }, [selectedNodeIds, batchApplyTag, closeBatchTagSelector, clearSelection]);

  const handleCreateNew = useCallback((name: string) => {
    const newTag = createTagDef(name);
    const nodeIds = [...selectedNodeIds];
    if (nodeIds.length === 0) return;
    batchApplyTag(nodeIds, newTag.id);
    closeBatchTagSelector();
    clearSelection();
  }, [selectedNodeIds, createTagDef, batchApplyTag, closeBatchTagSelector, clearSelection]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeBatchTagSelector();
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
        // Cmd+Enter: create new tag
        if (query.trim()) handleCreateNew(query.trim());
        return;
      }
      const boundedIndex = Math.min(Math.max(0, selectedIndex), totalItems - 1);
      if (boundedIndex < filteredTags.length) {
        handleSelect(filteredTags[boundedIndex].id);
      } else if (hasCreateOption) {
        handleCreateNew(query.trim());
      }
    }
  }, [totalItems, selectedIndex, filteredTags, hasCreateOption, query, handleSelect, handleCreateNew, closeBatchTagSelector]);

  if (!isOpen) return null;

  const nodeCount = selectedNodeIds.size;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center pt-[20%]"
      onMouseDown={(e) => {
        // Close when clicking backdrop
        if (e.target === e.currentTarget) {
          e.preventDefault();
          closeBatchTagSelector();
        }
      }}
    >
      <div className="w-64 rounded-lg bg-background shadow-paper border border-border overflow-hidden">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs text-foreground-secondary mb-1">
            {t('tag.batch.title', { count: String(nodeCount) })}
          </div>
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-tertiary"
            placeholder={t('tag.batch.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div ref={listRef} className="max-h-52 overflow-y-auto p-1">
          {filteredTags.length === 0 && !hasCreateOption && (
            <div className="px-2 py-2 text-sm text-foreground-secondary">
              {t('tag.selector.noTagsAvailable')}
            </div>
          )}
          {filteredTags.map((tag, i) => (
            <button
              key={tag.id}
              data-tag-item
              className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-foreground transition-colors text-left ${
                i === selectedIndex ? 'bg-primary-muted' : 'hover:bg-foreground/4'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect(tag.id);
              }}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: resolveTagColor(tag.id).text }}
              />
              {tag.name}
            </button>
          ))}
          {hasCreateOption && (
            <>
              {filteredTags.length > 0 && <div className="my-0.5 h-px bg-border" />}
              <button
                data-tag-item
                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-foreground transition-colors text-left ${
                  selectedIndex === filteredTags.length ? 'bg-primary-muted' : 'hover:bg-foreground/4'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCreateNew(query.trim());
                }}
              >
                <Plus size={14} className="text-foreground-secondary shrink-0" />
                {t('tag.selector.create', { name: query })}
                <span className="ml-auto text-[10px] text-foreground-tertiary shrink-0">⌘↵</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
