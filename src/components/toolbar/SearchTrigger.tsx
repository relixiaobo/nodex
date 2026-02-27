/**
 * Fake search input that triggers CommandPalette on click.
 * Displays "Search..." placeholder + ⌘K shortcut text.
 */
import { Search } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';
import { Tooltip } from '../ui/Tooltip';
import { t } from '../../i18n/strings.js';

export function SearchTrigger() {
  const openSearch = useUIStore((s) => s.openSearch);

  return (
    <Tooltip label={t('toolbar.search')} shortcut="⌘K">
      <button
        onClick={openSearch}
        className="flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground-secondary"
      >
        <Search size={15} strokeWidth={1.5} />
      </button>
    </Tooltip>
  );
}
