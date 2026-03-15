/**
 * Top toolbar — global tools (navigation + search + user menu).
 *
 * Breadcrumb is rendered per-panel inside PanelLayout, not here.
 */
import { Sparkles } from '../../lib/icons.js';
import { focusOrOpenChat } from '../../lib/chat-panel-actions.js';
import { NavButtons } from './NavButtons.js';
import { SearchTrigger } from './SearchTrigger.js';
import { ToolbarUserMenu } from './ToolbarUserMenu.js';

/** Global tools — back/forward, search, user menu. */
export function GlobalTools() {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 h-10 text-foreground-tertiary">
      <NavButtons />
      <SearchTrigger />
      <button
        type="button"
        onClick={() => void focusOrOpenChat()}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-foreground/4"
        aria-label="Open chat"
      >
        <Sparkles
          size={15}
          strokeWidth={1.6}
          className="text-foreground-tertiary"
        />
      </button>
      <ToolbarUserMenu />
    </div>
  );
}
