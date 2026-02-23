/**
 * Top toolbar — replaces the Sidebar as the primary navigation chrome.
 *
 * Layout: [←][→]  [🔍 Search...  ⌘K]  [●🧑‍]
 *
 * - Left: Undo/Redo buttons (placeholder, disabled until #44)
 * - Center: SearchTrigger (fake input, opens CommandPalette)
 * - Right: SyncDot + UserMenu avatar
 */
import { UndoRedoButtons } from './UndoRedoButtons';
import { SearchTrigger } from './SearchTrigger';
import { SyncDot } from './SyncDot';
import { ToolbarUserMenu } from './ToolbarUserMenu';

export function TopToolbar() {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      {/* Left: Undo/Redo */}
      <UndoRedoButtons />

      {/* Center: Search trigger */}
      <div className="flex flex-1 justify-center">
        <SearchTrigger />
      </div>

      {/* Right: Sync dot + User avatar */}
      <div className="flex items-center gap-2">
        <SyncDot />
        <ToolbarUserMenu />
      </div>
    </div>
  );
}
