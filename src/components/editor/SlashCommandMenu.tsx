import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
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
  type LucideIcon,
} from 'lucide-react';
import {
  SLASH_DISABLED_HINT_DEFAULT,
  type SlashCommandDefinition,
  type SlashCommandId,
} from '../../lib/slash-commands.js';

const ICON_MAP: Record<SlashCommandId, LucideIcon> = {
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
}

export function SlashCommandMenu({ open, commands, selectedIndex, onSelect }: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [dropStyle, setDropStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: -9999,
    left: -9999,
  });

  useLayoutEffect(() => {
    if (!open || !listRef.current) return;
    const anchor = listRef.current.parentElement;
    if (!anchor) return;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
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
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={listRef}
      className="z-50 w-60 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover/100 p-1 shadow-lg"
      style={dropStyle}
      onMouseDown={(e) => e.preventDefault()}
    >
      {commands.length === 0 && (
        <div className="px-2 py-2 text-sm text-foreground-secondary">No results</div>
      )}
      {commands.map((command, index) => {
        const Icon = ICON_MAP[command.id];
        const isActive = index === selectedIndex;
        const isDisabled = !command.enabled;

        return (
          <button
            key={command.id}
            type="button"
            aria-disabled={isDisabled}
            title={isDisabled ? command.disabledHint ?? SLASH_DISABLED_HINT_DEFAULT : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm ${
              isDisabled
                ? 'cursor-not-allowed text-foreground-tertiary opacity-50'
                : isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-foreground hover:bg-foreground/5'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isDisabled) return;
              onSelect(command.id);
            }}
          >
            <Icon size={16} className="shrink-0 text-foreground-secondary" />
            <span className="truncate">{command.name}</span>
            {command.shortcutHint && (
              <span className="ml-auto shrink-0 text-xs text-foreground-tertiary">
                {command.shortcutHint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
