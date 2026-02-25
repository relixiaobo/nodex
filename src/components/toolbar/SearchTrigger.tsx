/**
 * Fake search input that triggers CommandPalette on click.
 * Displays "Search..." placeholder + ⌘K shortcut text.
 */
import { Search } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';

export function SearchTrigger() {
  const openSearch = useUIStore((s) => s.openSearch);

  return (
    <button
      onClick={openSearch}
      className="flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground-secondary"
      title="Search"
    >
      <Search size={15} strokeWidth={1.5} />
    </button>
  );
}
