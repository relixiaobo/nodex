/**
 * Tooltip — styled tooltip with optional keyboard shortcut display.
 *
 * Built on Radix UI Tooltip for accessible, delay-aware hover behavior.
 * Renders label text with an optional shortcut badge (reusing Kbd styling).
 *
 * The top-level <TooltipProvider> wraps the app so all tooltips share
 * delay-skip behavior (hovering quickly between tooltips skips the delay).
 *
 * Usage:
 *   <Tooltip label="Undo" shortcut="⌘Z">
 *     <button>...</button>
 *   </Tooltip>
 *
 *   <Tooltip label="Drag to move">
 *     <span>...</span>
 *   </Tooltip>
 */
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { createContext, useContext, type ReactNode } from 'react';

const TooltipCtx = createContext(false);

interface TooltipProps {
  /** Tooltip text label */
  label: string;
  /** Optional keyboard shortcut string (e.g. "⌘Z", "⌘⇧S") */
  shortcut?: string;
  children: ReactNode;
  /** Side to show tooltip on (default: "top") */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay in ms before showing (default: inherited from Provider) */
  delayDuration?: number;
}

/** Modifier symbols that get their own visual cell. */
const MODIFIER_CHARS = new Set(['\u2318', '\u21E7', '\u2325', '\u2303']); // ⌘ ⇧ ⌥ ⌃

function splitShortcut(shortcut: string): string[] {
  if (shortcut.includes('+')) {
    return shortcut.split('+').map((s) => s.trim()).filter(Boolean);
  }
  const parts: string[] = [];
  let buf = '';
  for (const ch of shortcut) {
    if (MODIFIER_CHARS.has(ch)) {
      if (buf) { parts.push(buf); buf = ''; }
      parts.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) parts.push(buf);
  return parts;
}

function ShortcutBadge({ shortcut }: { shortcut: string }) {
  const parts = splitShortcut(shortcut);
  return (
    <kbd className="ml-1.5 inline-flex items-center gap-px text-[10px] text-white/50">
      {parts.map((part, i) => (
        <span key={i} className="inline-flex w-[1em] items-center justify-center">
          {part}
        </span>
      ))}
    </kbd>
  );
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={100}>
      <TooltipCtx.Provider value={true}>
        {children}
      </TooltipCtx.Provider>
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({ label, shortcut, children, side = 'top', delayDuration }: TooltipProps) {
  const hasProvider = useContext(TooltipCtx);

  // Without TooltipProvider (e.g. in tests), render children only — no tooltip.
  if (!hasProvider) {
    return <>{children}</>;
  }

  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[100] flex items-center rounded-md bg-foreground/90 px-2 py-1 text-[11px] text-white shadow-sm animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <span>{label}</span>
          {shortcut && <ShortcutBadge shortcut={shortcut} />}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
