import { Search } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { SidebarNav } from './SidebarNav';

export function Sidebar() {
  const openSearch = useUIStore((s) => s.openSearch);
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const wsName = useNodeStore((s) => s.entities[wsId ?? '']?.props.name);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-10 items-center justify-between px-3">
        <span className="text-sm font-semibold">{wsName || 'Nodex'}</span>
      </div>
      {/* Quick search trigger */}
      <div className="px-2 pb-1">
        <button
          onClick={openSearch}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground-secondary hover:bg-foreground/5 transition-colors"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="rounded border border-border bg-muted px-1 text-[10px] font-medium">
            {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl+'}K
          </kbd>
        </button>
      </div>
      <SidebarNav />
    </aside>
  );
}
