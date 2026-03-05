import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Kbd } from '../ui/Kbd';
import {
 AtSign,
 ChevronRight,
 ClipboardPaste,
 Heading,
 Image,
 ListChecks,
 Mic,
 MoreHorizontal,
 Scissors,
 Search,
 SquareCheck,
 type AppIcon,
} from '../../lib/icons.js';
import {
 type SlashCommandDefinition,
 type SlashCommandId,
} from '../../lib/slash-commands.js';
import { t } from '../../i18n/strings.js';

const ICON_MAP: Record<SlashCommandId, AppIcon> = {
 paste: ClipboardPaste,
 clip_page: Scissors,
 search_node: Search,
 field: ChevronRight,
 reference: AtSign,
 image_file: Image,
 heading: Heading,
 checkbox: SquareCheck,
 checklist: ListChecks,
 start_live_transcription: Mic,
 more_commands: MoreHorizontal,
};

interface SlashCommandMenuProps {
 open: boolean;
 commands: SlashCommandDefinition[];
 selectedIndex: number;
 onSelect: (commandId: SlashCommandId) => void;
 /** Caret anchor in viewport coordinates (preferred over local anchorRef). */
 anchor?: { left: number; top: number; bottom: number };
}

export function SlashCommandMenu({ open, commands, selectedIndex, onSelect, anchor }: SlashCommandMenuProps) {
 const anchorRef = useRef<HTMLSpanElement>(null);
 const listRef = useRef<HTMLDivElement>(null);
 const [dropStyle, setDropStyle] = useState<CSSProperties>({
  position: 'fixed',
  top: -9999,
  left: -9999,
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
   const maxH = 320;
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
   className="z-[1000] w-60 max-h-80 overflow-y-auto rounded-lg bg-background shadow-paper p-1"
   style={dropStyle}
   onMouseDown={(e) => e.preventDefault()}
  >
   {commands.length === 0 && (
    <div className="px-2 py-2 text-sm text-foreground-secondary">{t('slash.menu.noResults')}</div>
   )}
   {commands.map((command, index) => {
    const Icon = ICON_MAP[command.id];
    const isActive = index === selectedIndex;

    return (
     <button
      key={command.id}
      type="button"
      className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm ${
       isActive
        ? 'bg-primary-muted text-foreground'
        : 'text-foreground-secondary hover:text-foreground hover:bg-foreground/4'
      }`}
      onMouseDown={(e) => {
       e.preventDefault();
       e.stopPropagation();
       onSelect(command.id);
      }}
     >
      <div className="flex w-4 shrink-0 items-center justify-center text-foreground-tertiary">
       <Icon size={14} strokeWidth={1.5} />
      </div>
      <span className="truncate">{command.name}</span>
      {command.shortcutHint && (
       <Kbd keys={command.shortcutHint} className="ml-auto" />
      )}
     </button>
    );
   })}
  </div>
 );

 return (
  <>
   <span ref={anchorRef} className="pointer-events-none absolute left-0 top-0 h-0 w-0" />
   {typeof document === 'undefined' ? menu : createPortal(menu, document.body)}
  </>
 );
}
