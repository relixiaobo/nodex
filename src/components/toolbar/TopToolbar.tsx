/**
 * Top toolbar — global tools (navigation + search + user menu).
 *
 * Breadcrumb is rendered per-panel inside PanelLayout, not here.
 */
import { NavButtons } from './NavButtons';
import { SearchTrigger } from './SearchTrigger';
import { ToolbarUserMenu } from './ToolbarUserMenu';

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
