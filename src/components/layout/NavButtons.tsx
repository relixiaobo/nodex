import { ChevronLeft, ChevronRight } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store.js';

const BUTTON_CLASS = 'flex h-7 w-7 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/4 hover:text-foreground disabled:cursor-default disabled:text-foreground-quaternary disabled:hover:bg-transparent';

export function NavButtons() {
  const goBackNode = useUIStore((s) => s.goBackNode);
  const goForwardNode = useUIStore((s) => s.goForwardNode);
  const canGoBack = useUIStore((s) => s.nodeHistoryIndex > 0);
  const canGoForward = useUIStore((s) => s.nodeHistoryIndex >= 0 && s.nodeHistoryIndex < s.nodeHistory.length - 1);

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={goBackNode}
        disabled={!canGoBack}
        className={BUTTON_CLASS}
        aria-label="Go back"
      >
        <ChevronLeft size={16} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        onClick={goForwardNode}
        disabled={!canGoForward}
        className={BUTTON_CLASS}
        aria-label="Go forward"
      >
        <ChevronRight size={16} strokeWidth={1.8} />
      </button>
    </div>
  );
}
