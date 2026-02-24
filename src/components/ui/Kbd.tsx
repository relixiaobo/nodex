/**
 * Kbd — standard keyboard shortcut badge.
 *
 * Design rules:
 * - No border (avoids "box-inside-box" when placed inside bordered containers)
 * - Subtle background for visual distinction from surrounding text
 * - Consistent sizing: h-5, min-w-5, text-[10px]
 * - Rounded-md to harmonize with both rounded and pill-shaped containers
 *
 * Two components:
 *   <Kbd>Esc</Kbd>           — single key badge (word or symbol)
 *   <KbdShortcut keys="⌘⇧D" /> — splits into individual key badges: ⌘ ⇧ D
 */

interface KbdProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

const KBD_BASE = 'inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-foreground/[0.06] px-1.5 text-[10px] font-medium text-foreground-tertiary';

export function Kbd({ children, onClick, className = '' }: KbdProps) {
  return (
    <kbd
      onClick={onClick}
      className={`${KBD_BASE} ${onClick ? 'cursor-pointer hover:bg-foreground/10 hover:text-foreground-secondary' : ''} ${className}`}
    >
      {children}
    </kbd>
  );
}

/**
 * Render a shortcut string as a row of individual key badges.
 * Splits on known modifier symbols (⌘ ⇧ ⌥ ⌃) and treats the remainder as individual keys.
 *
 * Examples:
 *   "⌘K"   → [⌘] [K]
 *   "⌘⇧D"  → [⌘] [⇧] [D]
 *   "Ctrl+K" → [Ctrl] [K]
 */
interface KbdShortcutProps {
  keys: string;
  className?: string;
}

/** Modifier symbols that should each become their own badge. */
const MODIFIER_CHARS = new Set(['\u2318', '\u21E7', '\u2325', '\u2303']); // ⌘ ⇧ ⌥ ⌃

function splitShortcut(shortcut: string): string[] {
  // Handle "Ctrl+K" style shortcuts
  if (shortcut.includes('+')) {
    return shortcut.split('+').map((s) => s.trim()).filter(Boolean);
  }
  // Handle Unicode modifier sequences like "⌘⇧D"
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

export function KbdShortcut({ keys, className = '' }: KbdShortcutProps) {
  const parts = splitShortcut(keys);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      {parts.map((part, i) => (
        <kbd key={i} className={KBD_BASE}>
          {part}
        </kbd>
      ))}
    </span>
  );
}
