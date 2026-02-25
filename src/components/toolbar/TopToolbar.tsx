/**
 * Top toolbar — replaces the Sidebar as the primary navigation chrome.
 *
 * Layout: [↶][↷]  [🔍 Search...  ⌘K]  [👤]
 *
 * - Left: Undo/Redo buttons (wired to Loro UndoManager)
 * - Center: SearchTrigger (fake input, opens CommandPalette)
 * - Right: UserMenu avatar (with sync badge)
 */
import { UndoRedoButtons } from './UndoRedoButtons';
import { SearchTrigger } from './SearchTrigger';
import { ToolbarUserMenu } from './ToolbarUserMenu';

export function TopToolbar() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 bg-foreground/[0.08] px-1.5">
      {/* Left: Undo/Redo */}
      <UndoRedoButtons />

      {/* Center: Search trigger (fills available space, like Chrome omnibox) */}
      <SearchTrigger />

      {/* Right: User avatar (sync badge integrated) */}
      <ToolbarUserMenu />
    </div>
  );
}
