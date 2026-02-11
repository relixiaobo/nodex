import { PanelLeft, ChevronLeft, Search } from 'lucide-react';
import { useNode } from '../../hooks/use-node';
import { useUIStore } from '../../stores/ui-store';
import { TagBar } from '../tags/TagBar';

interface NodePanelHeaderProps {
  nodeId: string;
}

export function NodePanelHeader({ nodeId }: NodePanelHeaderProps) {
  const node = useNode(nodeId);
  const panelStack = useUIStore((s) => s.panelStack);
  const popPanel = useUIStore((s) => s.popPanel);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const openSearch = useUIStore((s) => s.openSearch);
  const canGoBack = panelStack.length > 1;

  // Extract display name — strip HTML tags for header
  const rawName = node?.props.name || '';
  const displayName = rawName.replace(/<[^>]+>/g, '') || nodeId.split('_').pop() || nodeId;

  return (
    <div className="shrink-0 border-b border-border">
      <div className="flex h-10 items-center gap-1 px-2">
        <button
          onClick={toggleSidebar}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Toggle sidebar"
        >
          <PanelLeft size={16} strokeWidth={1.75} />
        </button>
        {canGoBack && (
          <button
            onClick={popPanel}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Go back"
          >
            <ChevronLeft size={16} strokeWidth={1.75} />
          </button>
        )}
        <span className="flex-1 truncate text-sm font-medium px-1">
          {displayName}
        </span>
        <button
          onClick={openSearch}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Search (Cmd+K)"
        >
          <Search size={16} strokeWidth={1.75} />
        </button>
      </div>
      <div className="group px-3 pb-1">
        <TagBar nodeId={nodeId} />
      </div>
    </div>
  );
}
