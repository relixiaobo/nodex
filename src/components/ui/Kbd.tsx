/**
 * Kbd — standard keyboard shortcut badge.
 *
 * Design rules:
 * - No border (avoids "box-inside-box" when placed inside bordered containers)
 * - Subtle background for visual distinction from surrounding text
 * - Consistent sizing: h-5, min-w-5, text-[10px]
 * - Rounded-md to harmonize with both rounded and pill-shaped containers
 * - Composite shortcuts (⌘⇧D): each symbol rendered in a fixed-width cell
 *   so glyphs of different sizes align uniformly within one badge
 *
 * Usage:
 *   <Kbd>Esc</Kbd>        — plain text badge
 *   <Kbd>↵</Kbd>          — single symbol badge
 *   <Kbd keys="⌘K" />     — composite: [⌘ K] with uniform internal spacing
 *   <Kbd keys="⌘⇧D" />   — composite: [⌘ ⇧ D] uniform internal spacing
 *   <Kbd keys="Ctrl+K" /> — composite: [Ctrl K]
 */

interface KbdProps {
  /** Shortcut string to parse into uniformly-spaced segments. */
  keys?: string;
  /** Plain content (for words like "Esc", symbols like "↵"). */
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Modifier symbols that are split into their own cell. */
const MODIFIER_CHARS = new Set(['\u2318', '\u21E7', '\u2325', '\u2303']); // ⌘ ⇧ ⌥ ⌃

function splitShortcut(shortcut: string): string[] {
  // "Ctrl+K" → ["Ctrl", "K"]
  if (shortcut.includes('+')) {
    return shortcut.split('+').map((s) => s.trim()).filter(Boolean);
  }
  // "⌘⇧D" → ["⌘", "⇧", "D"]
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

const KBD_BASE = 'inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-foreground/[0.06] px-1 text-[10px] font-medium text-foreground-tertiary';

export function Kbd({ keys, children, onClick, className = '' }: KbdProps) {
  const interactive = onClick ? 'cursor-pointer hover:bg-foreground/10 hover:text-foreground-secondary' : '';

  // Composite mode: parse shortcut string, render each segment in a fixed-width cell
  if (keys) {
    const parts = splitShortcut(keys);
    return (
      <kbd
        onClick={onClick}
        className={`${KBD_BASE} gap-px ${interactive} ${className}`}
      >
        {parts.map((part, i) => (
          <span key={i} className="inline-flex w-[1em] items-center justify-center">
            {part}
          </span>
        ))}
      </kbd>
    );
  }

  // Simple mode: render children as-is
  return (
    <kbd
      onClick={onClick}
      className={`${KBD_BASE} px-1.5 ${interactive} ${className}`}
    >
      {children}
    </kbd>
  );
}
