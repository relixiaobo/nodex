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

export function TopToolbar() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 bg-foreground/[0.04] pl-[6px] pr-3">
      {/* Left: Undo/Redo */}
      <UndoRedoButtons />

      {/* Center: Search trigger (fills available space, like Chrome omnibox) */}
      <SearchTrigger />

      {/* Right: User avatar (sync badge integrated) */}
      <ToolbarUserMenu />
    </div>
  );
}
