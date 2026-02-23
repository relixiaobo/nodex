/**
 * Fake search input that triggers CommandPalette on click.
 * Displays "Search..." placeholder + ⌘K shortcut text.
 */
import { useUIStore } from '../../stores/ui-store';

export function SearchTrigger() {
  const openSearch = useUIStore((s) => s.openSearch);
  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');

  return (
    <button
      onClick={openSearch}
      className="flex flex-1 items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1 text-xs text-foreground-tertiary transition-colors hover:bg-foreground/5 hover:text-foreground-secondary"
    >
      <span className="flex-1 text-left">Search...</span>
      <span className="text-[10px] font-medium text-foreground-tertiary">
        {isMac ? '\u2318' : 'Ctrl+'}K
      </span>
    </button>
  );
}
