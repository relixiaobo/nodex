/**
 * Top toolbar — global tools (navigation + search + user menu).
 *
 * Breadcrumb is rendered per-panel inside PanelLayout, not here.
 */
import { NavButtons } from './NavButtons.js';
import { SearchTrigger } from './SearchTrigger.js';
import { ToolbarUserMenu } from './ToolbarUserMenu.js';

/** Global tools — back/forward, search, user menu. */
export function GlobalTools() {
  return (
    <div className="flex shrink-0 items-center gap-1 px-2 h-10 text-foreground-tertiary">
      <NavButtons />
      <SearchTrigger />
      <ToolbarUserMenu />
    </div>
  );
}
