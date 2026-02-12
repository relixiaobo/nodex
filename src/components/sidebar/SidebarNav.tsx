import { Library, Inbox, CalendarDays, Search, Trash2, type LucideIcon } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { WORKSPACE_CONTAINERS } from '../../types/index.js';
import type { WorkspaceContainerSuffix } from '../../types/index.js';

interface NavItem {
  label: string;
  suffix: WorkspaceContainerSuffix;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Library', suffix: WORKSPACE_CONTAINERS.LIBRARY, icon: Library },
  { label: 'Inbox', suffix: WORKSPACE_CONTAINERS.INBOX, icon: Inbox },
  { label: 'Journal', suffix: WORKSPACE_CONTAINERS.JOURNAL, icon: CalendarDays },
  { label: 'Searches', suffix: WORKSPACE_CONTAINERS.SEARCHES, icon: Search },
  { label: 'Trash', suffix: WORKSPACE_CONTAINERS.TRASH, icon: Trash2 },
];

export function SidebarNav() {
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const currentNodeId = useUIStore((s) => s.panelHistory[s.panelIndex] ?? null);

  function handleClick(suffix: WorkspaceContainerSuffix) {
    if (!wsId) return;
    const containerId = `${wsId}_${suffix}`;
    navigateTo(containerId);
  }

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-1">
      {NAV_ITEMS.map((item) => {
        const containerId = wsId ? `${wsId}_${item.suffix}` : '';
        const isActive = currentNodeId === containerId;
        const Icon = item.icon;

        return (
          <button
            key={item.suffix}
            onClick={() => handleClick(item.suffix)}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              isActive
                ? 'bg-primary-muted text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Icon size={14} strokeWidth={1.75} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
