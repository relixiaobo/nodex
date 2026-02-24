/**
 * Kbd — standard keyboard shortcut badge.
 *
 * Design rules:
 * - No border (avoids "box-inside-box" when placed inside bordered containers)
 * - Subtle background for visual distinction from surrounding text
 * - Consistent sizing: h-5, min-w-5, text-[10px]
 * - Rounded-md to harmonize with both rounded and pill-shaped containers
 *
 * Usage:
 *   <Kbd>Esc</Kbd>
 *   <Kbd>⌘K</Kbd>
 *   <Kbd>⌘⇧D</Kbd>
 *   <Kbd>↵</Kbd>
 */

interface KbdProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export function Kbd({ children, onClick, className = '' }: KbdProps) {
  return (
    <kbd
      onClick={onClick}
      className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-foreground/[0.06] px-1.5 text-[10px] font-medium text-foreground-tertiary ${onClick ? 'cursor-pointer hover:bg-foreground/10 hover:text-foreground-secondary' : ''} ${className}`}
    >
      {children}
    </kbd>
  );
}
