import { Library, Inbox, CalendarDays, Search, Trash2, type AppIcon } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';
import { CONTAINER_IDS } from '../../types/index.js';
import type { ContainerId } from '../../types/index.js';

interface NavItem {
  label: string;
  containerId: ContainerId;
  icon: AppIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Library', containerId: CONTAINER_IDS.LIBRARY, icon: Library },
  { label: 'Inbox', containerId: CONTAINER_IDS.INBOX, icon: Inbox },
  { label: 'Journal', containerId: CONTAINER_IDS.JOURNAL, icon: CalendarDays },
  { label: 'Searches', containerId: CONTAINER_IDS.SEARCHES, icon: Search },
  { label: 'Trash', containerId: CONTAINER_IDS.TRASH, icon: Trash2 },
];

export function SidebarNav() {
  const navigateTo = useUIStore((s) => s.navigateTo);
  const currentNodeId = useUIStore((s) => s.panelHistory[s.panelIndex] ?? null);

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-1">
      {NAV_ITEMS.map((item) => {
        const isActive = currentNodeId === item.containerId;
        const Icon = item.icon;

        return (
          <button
            key={item.containerId}
            onClick={() => navigateTo(item.containerId)}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              isActive
                ? 'bg-primary-muted text-primary font-medium'
                : 'text-foreground-secondary font-medium hover:bg-foreground/5 hover:text-foreground'
            }`}
          >
            <Icon size={14} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
