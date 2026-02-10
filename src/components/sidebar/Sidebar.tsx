import { Search } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import { SidebarNav } from './SidebarNav';

export function Sidebar() {
  const openSearch = useUIStore((s) => s.openSearch);

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="flex h-10 items-center justify-between px-3">
        <span className="text-sm font-semibold">Nodex</span>
      </div>
      {/* Quick search trigger */}
      <div className="px-2 pb-1">
        <button
          onClick={openSearch}
          className="flex w-full items-center gap-2 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
        >
          <Search size={12} />
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
