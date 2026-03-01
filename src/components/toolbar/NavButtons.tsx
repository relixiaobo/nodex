/**
 * Back/Forward navigation buttons — wired to ui-store panel history.
 * Same diameter as search pill height (h-7 w-7).
 *
 * ← goes back in panel history, → goes forward.
 * ⌘Z/⌘⇧Z (Loro undo/redo) is handled separately by use-nav-undo-keyboard.ts.
 */
import { useCallback } from 'react';
import { ArrowLeft, ArrowRight } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store.js';
import { Tooltip } from '../ui/Tooltip';
import { t } from '../../i18n/strings.js';

const btnClass =
  'flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground-secondary disabled:pointer-events-none disabled:opacity-40';

export function NavButtons() {
  const canGoBack = useUIStore((s) => s.panelIndex > 0);
  const canGoForward = useUIStore((s) => s.panelIndex < s.panelHistory.length - 1);

  const goBack = useUIStore((s) => s.goBack);
  const goForward = useUIStore((s) => s.goForward);

  const handleBack = useCallback(() => goBack(), [goBack]);
  const handleForward = useCallback(() => goForward(), [goForward]);

  return (
    <div className="flex items-center gap-1">
      <Tooltip label={t('toolbar.back')}>
        <button
          disabled={!canGoBack}
          onClick={handleBack}
          className={btnClass}
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
      <Tooltip label={t('toolbar.forward')}>
        <button
          disabled={!canGoForward}
          onClick={handleForward}
          className={btnClass}
        >
          <ArrowRight size={16} strokeWidth={1.5} />
        </button>
      </Tooltip>
    </div>
  );
}
