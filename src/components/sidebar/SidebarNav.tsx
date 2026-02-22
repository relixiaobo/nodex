import { useCallback } from 'react';
import { Library, Inbox, CalendarDays, CalendarCheck, Search, Trash2, type AppIcon } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';
import { CONTAINER_IDS } from '../../types/index.js';
import type { ContainerId } from '../../types/index.js';
import { ensureTodayNode } from '../../lib/journal.js';
import { t } from '../../i18n/strings.js';

interface NavItem {
  labelKey:
    | 'sidebar.nav.library'
    | 'sidebar.nav.inbox'
    | 'sidebar.nav.dailyNotes'
    | 'sidebar.nav.searches'
    | 'sidebar.nav.trash';
  containerId: ContainerId;
  icon: AppIcon;
}

const NAV_ITEMS: NavItem[] = [
  { labelKey: 'sidebar.nav.library', containerId: CONTAINER_IDS.LIBRARY, icon: Library },
  { labelKey: 'sidebar.nav.inbox', containerId: CONTAINER_IDS.INBOX, icon: Inbox },
  { labelKey: 'sidebar.nav.dailyNotes', containerId: CONTAINER_IDS.JOURNAL, icon: CalendarDays },
  { labelKey: 'sidebar.nav.searches', containerId: CONTAINER_IDS.SEARCHES, icon: Search },
  { labelKey: 'sidebar.nav.trash', containerId: CONTAINER_IDS.TRASH, icon: Trash2 },
];

export function SidebarNav() {
  const navigateTo = useUIStore((s) => s.navigateTo);
  const currentNodeId = useUIStore((s) => s.panelHistory[s.panelIndex] ?? null);

  const handleTodayClick = useCallback(() => {
    const dayNodeId = ensureTodayNode();
    navigateTo(dayNodeId);
  }, [navigateTo]);

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-1">
      {NAV_ITEMS.map((item) => {
        const isActive = currentNodeId === item.containerId;
        const Icon = item.icon;

        return (
          <div key={item.containerId} className="flex items-center">
            <button
              onClick={() => navigateTo(item.containerId)}
              className={`flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                isActive
                  ? 'bg-primary-muted text-primary font-medium'
                  : 'text-foreground-secondary font-medium hover:bg-foreground/5 hover:text-foreground'
              }`}
            >
              <Icon size={14} />
              <span>{t(item.labelKey)}</span>
            </button>
            {item.containerId === CONTAINER_IDS.JOURNAL && (
              <button
                onClick={handleTodayClick}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-foreground-secondary hover:bg-foreground/5 hover:text-foreground transition-colors"
                title={t('sidebar.nav.goToTodayShortcut')}
              >
                <CalendarCheck size={14} />
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
