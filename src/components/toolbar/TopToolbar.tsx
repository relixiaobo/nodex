/**
 * Top toolbar components — split into two layers:
 *
 * - PanelTab: Breadcrumb (inside the NodePanel card)
 * - GlobalTools: Navigation + search + user menu (can be inside card or on desk layer)
 */
import { NavButtons } from './NavButtons';
import { SearchTrigger } from './SearchTrigger';
import { ToolbarUserMenu } from './ToolbarUserMenu';
import { Breadcrumb } from '../panel/Breadcrumb';
import { useUIStore, selectCurrentNodeId } from '../../stores/ui-store';

/** Breadcrumb content for the NodePanel card header. */
export function PanelTab() {
  const currentNodeId = useUIStore(selectCurrentNodeId);
  const panelTitleVisible = useUIStore((s) => s.panelTitleVisible);

  return (
    <div className="flex flex-1 min-w-0 items-center">
      {currentNodeId && <Breadcrumb nodeId={currentNodeId} showCurrentName={!panelTitleVisible} compact />}
    </div>
  );
}

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
