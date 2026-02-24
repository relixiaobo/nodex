/**
 * Fake search input that triggers CommandPalette on click.
 * Displays "Search..." placeholder + ⌘K shortcut text.
 */
import { useUIStore } from '../../stores/ui-store';
import { KbdShortcut } from '../ui/Kbd';

export function SearchTrigger() {
  const openSearch = useUIStore((s) => s.openSearch);
  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');

  return (
    <button
      onClick={openSearch}
      className="flex flex-1 items-center gap-2 rounded-full bg-background px-3 py-1.5 text-xs text-foreground-tertiary transition-colors hover:bg-background/80 hover:text-foreground-secondary"
    >
      <span className="flex-1 text-left">Search...</span>
      <KbdShortcut keys={isMac ? '\u2318K' : 'Ctrl+K'} />
    </button>
  );
}
