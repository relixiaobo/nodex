/**
 * Cmd+K command palette for quick node search & navigation.
 *
 * Uses cmdk (https://cmdk.paco.me) for the combobox behavior.
 * Searches across all cached nodes in the store.
 */
import { useEffect, useCallback, useMemo } from 'react';
import { Command } from 'cmdk';
import { Search, FileText, Library, Inbox, CalendarDays, Trash2, type AppIcon } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { COMMAND_PALETTE_QUICK_CONTAINERS } from '../../lib/system-node-registry.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { t } from '../../i18n/strings.js';

const CONTAINER_ICONS: Record<string, AppIcon> = {
  library: Library,
  inbox: Inbox,
  journal: CalendarDays,
  trash: Trash2,
};

export function CommandPalette() {
  const searchOpen = useUIStore((s) => s.searchOpen);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const _version = useNodeStore((s) => s._version);


  // Global Cmd+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (searchOpen) {
          closeSearch();
        } else {
          useUIStore.getState().openSearch();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, closeSearch]);

  const handleSelect = useCallback(
    (nodeId: string) => {
      navigateTo(nodeId);
      closeSearch();
    },
    [navigateTo, closeSearch],
  );

  // Filter nodes matching the search query
  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const matches: Array<{ id: string; name: string }> = [];

    for (const id of loroDoc.getAllNodeIds()) {
      const node = loroDoc.toNodexNode(id);
      if (!node) continue;
      // Skip system/container nodes unless explicitly searching
      const name = node.name ?? '';
      const plainText = name.replace(/<[^>]+>/g, '').toLowerCase();

      if (plainText.includes(query)) {
        matches.push({ id, name: plainText || t('search.commandPalette.untitled') });
        if (matches.length >= 20) break;
      }
    }

    return matches;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_version, searchQuery]);

  // Container quick-access items
  const containers = useMemo(() => (
    COMMAND_PALETTE_QUICK_CONTAINERS.map((c) => ({
      id: c.id,
      icon: CONTAINER_ICONS[c.iconKey],
      label: t(c.labelKey),
    }))
  ), []);

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15%]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20"
        onClick={closeSearch}
      />
      {/* Dialog */}
      <Command
        className="relative w-full max-w-md rounded-lg border border-border bg-popover shadow-lg"
        shouldFilter={false}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search size={16} className="text-foreground-secondary shrink-0" />
          <Command.Input
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder={t('search.commandPalette.placeholder')}
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-tertiary"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center rounded border border-border bg-background px-1.5 text-[10px] font-medium text-foreground-tertiary">
            Esc
          </kbd>
        </div>
        <Command.List className="max-h-72 overflow-y-auto p-1">
          <Command.Empty className="py-6 text-center text-sm text-foreground-secondary">
            {t('search.commandPalette.noResults')}
          </Command.Empty>

          {/* Quick navigation */}
          {!searchQuery.trim() && (
            <Command.Group heading={t('search.commandPalette.groupNavigate')} className="px-1 py-1.5 text-xs font-medium text-foreground-secondary">
              {containers.map((c) => {
                const Icon = c.icon;
                return (
                  <Command.Item
                    key={c.id}
                    value={c.id}
                    onSelect={() => handleSelect(c.id)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground aria-selected:bg-accent"
                  >
                    <Icon size={14} className="text-foreground-secondary" />
                    {c.label}
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {/* Search results */}
          {searchQuery.trim() && results.length > 0 && (
            <Command.Group heading={t('search.commandPalette.groupNodes')} className="px-1 py-1.5 text-xs font-medium text-foreground-secondary">
              {results.map((r) => (
                <Command.Item
                  key={r.id}
                  value={r.id}
                  onSelect={() => handleSelect(r.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground aria-selected:bg-accent"
                >
                  <FileText size={14} className="text-foreground-secondary shrink-0" />
                  <span className="truncate">{r.name}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
