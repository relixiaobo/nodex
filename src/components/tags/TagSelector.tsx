/**
 * Tag selector dropdown — non-focusable list driven by editor # trigger.
 *
 * Keyboard navigation (Enter/Arrow/Escape/Cmd+Enter) is handled by
 * the editor keymap and forwarded here via imperative ref methods.
 * mouseDown.preventDefault() keeps editor focus when clicking items.
 */
import { useMemo, useEffect, useLayoutEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { Hash, Plus } from '../../lib/icons.js';
import { useWorkspaceTags } from '../../hooks/use-workspace-tags';
import { t } from '../../i18n/strings.js';

export interface TagDropdownHandle {
 getItemCount(): number;
 getSelectedItem(): { type: 'existing'; id: string } | { type: 'create'; name: string } | null;
}

interface TagSelectorProps {
 open: boolean;
 onSelect: (tagDefId: string) => void;
 onCreateNew: (name: string) => void;
 existingTagIds: string[];
 /** Search query from editor (text after #) */
 query: string;
 /** Currently highlighted item index (managed by parent) */
 selectedIndex: number;
 /** Caret anchor in viewport coordinates (preferred over local anchorRef). */
 anchor?: { left: number; top: number; bottom: number };
}

export const TagSelector = forwardRef<TagDropdownHandle, TagSelectorProps>(
 function TagSelector({ open, onSelect, onCreateNew, existingTagIds, query, selectedIndex, anchor }, ref) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const allTags = useWorkspaceTags();
  const listRef = useRef<HTMLDivElement>(null);

  const filteredTags = useMemo(() => {
   const available = allTags.filter((t) => !existingTagIds.includes(t.id));
   if (!query) return available;
   const q = query.toLowerCase();
   return available.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTags, existingTagIds, query]);

  const hasCreateOption = query.trim().length > 0;
  const totalItems = filteredTags.length + (hasCreateOption ? 1 : 0);
  const boundedIndex = totalItems > 0 ? Math.min(Math.max(0, selectedIndex), totalItems - 1) : -1;

  // Scroll highlighted item into view
  useEffect(() => {
   if (!listRef.current || boundedIndex < 0) return;
   const items = listRef.current.querySelectorAll('[data-tag-item]');
   items[boundedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [boundedIndex]);

  useImperativeHandle(
   ref,
   () => ({
    getItemCount() {
     return totalItems;
    },
    getSelectedItem() {
     if (totalItems === 0 || boundedIndex < 0) return null;
     if (boundedIndex < filteredTags.length) {
      return { type: 'existing', id: filteredTags[boundedIndex].id };
     }
     if (hasCreateOption) {
      return { type: 'create', name: query.trim() };
     }
     return null;
    },
   }),
   [filteredTags, boundedIndex, totalItems, hasCreateOption, query],
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
    const maxH = 208; // max-h-52
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
    className="z-[1000] w-56 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover/100 p-1"
    style={dropStyle}
    onMouseDown={(e) => e.preventDefault()}
   >
    {filteredTags.length === 0 && !hasCreateOption && (
     <div className="px-2 py-2 text-sm text-foreground-secondary">{t('tag.selector.noTagsAvailable')}</div>
    )}
    {filteredTags.map((tag, i) => (
     <button
      key={tag.id}
      data-tag-item
      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-foreground transition-colors text-left ${
       i === boundedIndex ? 'bg-accent' : 'hover:bg-foreground/4'
      }`}
      onMouseDown={(e) => {
       e.preventDefault();
       e.stopPropagation();
       onSelect(tag.id);
      }}
     >
      <Hash size={14} className="text-foreground-secondary shrink-0" />
      {tag.name}
     </button>
    ))}
    {hasCreateOption && (
     <>
      {filteredTags.length > 0 && <div className="my-0.5 h-px bg-border" />}
      <button
       data-tag-item
       className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-foreground transition-colors text-left ${
        boundedIndex === filteredTags.length ? 'bg-accent' : 'hover:bg-foreground/4'
       }`}
       onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCreateNew(query.trim());
       }}
      >
       <Plus size={14} className="text-foreground-secondary shrink-0" />
       {t('tag.selector.create', { name: query })}
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
