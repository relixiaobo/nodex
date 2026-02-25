/**
 * Top toolbar — replaces the Sidebar as the primary navigation chrome.
 *
 * Layout: [←][→]  [🔍 Search...  ⌘K]  [👤]
 *
 * - Left: Undo/Redo buttons (placeholder, disabled until #44)
 * - Center: SearchTrigger (fake input, opens CommandPalette)
 * - Right: UserMenu avatar (with sync badge)
 */
import { UndoRedoButtons } from './UndoRedoButtons';
import { SearchTrigger } from './SearchTrigger';
import { ToolbarUserMenu } from './ToolbarUserMenu';
import { Breadcrumb } from '../panel/Breadcrumb';
import { useUIStore, selectCurrentNodeId } from '../../stores/ui-store';

export function TopToolbar() {
  const currentNodeId = useUIStore(selectCurrentNodeId);

  return (
    <div className="absolute top-0 left-0 right-0 h-[48px] z-50 bg-background/85 backdrop-blur-md flex items-center justify-between px-4 pb-1">
      {/* Region A: Current Context (Breadcrumbs)
          - Left aligned */}
      <div className="flex items-center">
        {currentNodeId && <Breadcrumb nodeId={currentNodeId} compact />}
      </div>

      {/* Region B: Global Tools (Undo/Redo, Search, User)
          - Right aligned */}
      <div className="flex items-center gap-4 text-foreground-tertiary px-1">
        <UndoRedoButtons />
        <div className="flex items-center gap-1">
          <SearchTrigger />
          <ToolbarUserMenu />
        </div>
      </div>
    </div>
  );
}
