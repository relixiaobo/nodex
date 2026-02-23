/**
 * Fake search input that triggers CommandPalette on click.
 * Displays "Search..." placeholder + ⌘K badge.
 */
import { useUIStore } from '../../stores/ui-store';

export function SearchTrigger() {
  const openSearch = useUIStore((s) => s.openSearch);
  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');

  return (
    <button
      onClick={openSearch}
      className="flex flex-1 max-w-[240px] items-center gap-2 rounded-md border border-border bg-background/50 px-2.5 py-1 text-xs text-foreground-tertiary transition-colors hover:bg-background hover:text-foreground-secondary"
    >
      <span className="flex-1 text-left">Search...</span>
      <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 text-[10px] font-medium">
        {isMac ? '\u2318' : 'Ctrl+'}K
      </kbd>
    </button>
  );
}
