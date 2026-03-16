/**
 * DeskLanding — inline search + suggestions shown when all panels are closed.
 *
 * Resembles Raycast's main view: a search input that, on focus, drops down
 * with quick-nav items, commands, and (when typing) fuzzy-matched results.
 * ⌘K focuses the input; Esc blurs it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { fuzzySort, fuzzyMatch } from '../../lib/fuzzy-search.js';
import {
  getAllCommands,
  getActionLabel,
  type PaletteItem,
  type PaletteItemType,
  type CommandContext,
} from '../../lib/palette-commands.js';
import {
  QUICK_NAV_SYSTEM_NODES,
  getSystemNodePreset,
  isPaletteSearchableSystemNode,
  type SystemNodeIconKey,
} from '../../lib/system-node-presets.js';
import { isLockedNode, isWorkspaceHomeNode } from '../../lib/node-capabilities.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { resolveDataType, getFieldTypeIcon } from '../../lib/field-utils.js';
import { ensureTodayNode, isDayNode } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName, isToday } from '../../lib/date-utils.js';
import { t } from '../../i18n/strings.js';
import { Kbd } from '../ui/Kbd.js';
import {
  Library,
  Inbox,
  CalendarDays,
  Trash2,
  Search,
  Settings,
  Sparkles,
  Plus,
  type AppIcon,
} from '../../lib/icons.js';

// ── Visual helpers (shared pattern with CommandPalette) ──

const SYSTEM_NODE_ICONS: Record<SystemNodeIconKey, AppIcon> = {
  library: Library,
  inbox: Inbox,
  journal: CalendarDays,
  ai: Sparkles,
  trash: Trash2,
  search: Search,
  schema: Library,
  clips: Library,
  stash: Library,
  settings: Settings,
};

function resolveNodeVisuals(id: string, node: { type?: string; tags?: string[] }): Pick<PaletteItem, 'icon' | 'tagDefColor' | 'bulletColors' | 'typeLabel' | 'type'> {
  if (node.type === 'tagDef') {
    const c = resolveTagColor(id);
    return { tagDefColor: { text: c.text }, typeLabel: 'Tag', type: 'node' };
  }
  if (node.type === 'fieldDef') {
    const dt = resolveDataType(id);
    const FieldIcon = getFieldTypeIcon(dt);
    return { icon: FieldIcon, typeLabel: 'Field', type: 'node' };
  }
  const preset = getSystemNodePreset(id);
  if (preset) {
    return { icon: SYSTEM_NODE_ICONS[preset.iconKey] ?? Library, type: 'node' };
  }
  const tagIds = node.tags ?? [];
  const bulletColors = tagIds.length > 0
    ? tagIds.map((tid: string) => resolveTagColor(tid).text)
    : undefined;
  return { bulletColors, typeLabel: 'Node', type: 'node' };
}

function resolveDayNodeDisplayName(id: string, name: string): string {
  if (!isDayNode(id)) return name;
  const weekId = loroDoc.getParentId(id);
  if (!weekId) return name;
  const yearId = loroDoc.getParentId(weekId);
  if (!yearId) return name;
  const yearNode = loroDoc.toNodexNode(yearId);
  const year = yearNode?.name ? parseYearNodeName(yearNode.name) : null;
  if (year === null) return name;
  const date = parseDayNodeName(name, year);
  if (date && isToday(date)) return t('common.todayPrefix', { name });
  return name;
}

// ── Component ──

export function DeskLanding() {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const replacePanel = useUIStore((s) => s.replacePanel);
  const createChild = useNodeStore((s) => s.createChild);
  const _version = useNodeStore((s) => s._version);
  const paletteUsage = useUIStore((s) => s.paletteUsage);
  const trackPaletteUsage = useUIStore((s) => s.trackPaletteUsage);
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const signOutFn = useWorkspaceStore((s) => s.signOut);

  const dismiss = useCallback(() => {
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  }, []);

  const navigate = useCallback((nodeId: string) => {
    trackPaletteUsage(nodeId);
    replacePanel(nodeId);
    dismiss();
  }, [trackPaletteUsage, replacePanel, dismiss]);

  // Command context — uses replacePanel (navigateTo doesn't work with empty panels)
  const ctx: CommandContext = useMemo(() => ({
    navigateTo: navigate,
    closeSearch: dismiss,
    isSignedIn: !!authUser,
    signInWithGoogle,
    signOut: signOutFn,
  }), [navigate, dismiss, authUser, signInWithGoogle, signOutFn]);

  const commands = useMemo(() => getAllCommands(ctx), [ctx]);

  const quickNavIdSet = useMemo(
    () => new Set<string>(QUICK_NAV_SYSTEM_NODES.map((n) => n.id)),
    [],
  );

  const quickNavItems: PaletteItem[] = useMemo(() =>
    QUICK_NAV_SYSTEM_NODES.map((node) => ({
      id: node.id,
      label: node.defaultName,
      icon: SYSTEM_NODE_ICONS[node.iconKey] ?? Library,
      type: 'node' as PaletteItemType,
      typeLabel: t('search.commandPalette.typeLabelNavigate'),
      action: () => navigate(node.id),
    })),
    [navigate]);

  const commandItems: PaletteItem[] = useMemo(() =>
    commands
      .filter((cmd) => cmd.type === 'command')
      .map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        icon: cmd.icon,
        type: cmd.type,
        typeLabel: t('search.commandPalette.typeLabelCommand'),
        action: () => { trackPaletteUsage(cmd.id); cmd.action(ctx); },
      })),
    [commands, ctx, trackPaletteUsage]);

  // Usage-based suggestions
  const getUsageBoost = useCallback((itemId: string) => {
    const usage = paletteUsage[itemId];
    if (!usage) return 0;
    const freqBoost = Math.min(Math.log2(usage.count + 1) * 5, 15);
    const ageMs = Date.now() - usage.lastUsedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(10 - ageDays * (10 / 7), 0);
    return freqBoost + recencyBoost;
  }, [paletteUsage]);

  // Searchable nodes cache
  const searchableNodes = useMemo(() => {
    const items: Array<{ id: string; name: string }> = [];
    for (const id of loroDoc.getAllNodeIds()) {
      if (quickNavIdSet.has(id) || isWorkspaceHomeNode(id)) continue;
      if (isLockedNode(id) && !isPaletteSearchableSystemNode(id)) continue;
      const node = loroDoc.toNodexNode(id);
      if (!node) continue;
      const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
      if (!name) continue;
      items.push({ id, name });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_version, quickNavIdSet]);

  // Fuzzy search results
  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const results: PaletteItem[] = [];

    for (const match of fuzzySort(searchableNodes, q, (item) => item.name, 20)) {
      const node = loroDoc.toNodexNode(match.id);
      if (!node) continue;
      const visuals = resolveNodeVisuals(match.id, node);
      results.push({
        id: match.id,
        label: resolveDayNodeDisplayName(match.id, match.name),
        ...visuals,
        score: (match._fuzzyScore ?? 0) + getUsageBoost(match.id),
        action: () => navigate(match.id),
      });
    }

    for (const cmd of commands) {
      const targets = [cmd.label, ...(cmd.keywords ?? [])];
      let bestScore: number | null = null;
      for (const target of targets) {
        const m = fuzzyMatch(q, target);
        if (m && (bestScore === null || m.score > bestScore)) bestScore = m.score;
      }
      if (bestScore !== null) {
        results.push({
          id: cmd.id,
          label: cmd.label,
          icon: cmd.icon,
          type: cmd.type,
          typeLabel: cmd.type === 'command'
            ? t('search.commandPalette.typeLabelCommand')
            : t('search.commandPalette.typeLabelNavigate'),
          score: bestScore + getUsageBoost(cmd.id),
          action: () => { trackPaletteUsage(cmd.id); cmd.action(ctx); },
        });
      }
    }

    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return results;
  }, [query, searchableNodes, commands, ctx, getUsageBoost, navigate, trackPaletteUsage]);

  // "Create in Today" item
  const createItem: PaletteItem | null = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return {
      id: '__create__',
      label: q,
      icon: Plus,
      type: 'create' as PaletteItemType,
      typeLabel: 'New in Today',
      action: () => {
        const todayId = ensureTodayNode();
        createChild(todayId, undefined, { name: q });
        navigate(todayId);
      },
    };
  }, [query, createChild, navigate]);

  // Default items (no query)
  const sortedDefaultItems = useMemo(() => {
    const usageEntries = Object.keys(paletteUsage);
    const suggestionItems: PaletteItem[] = [];
    if (usageEntries.length > 0) {
      const scored = usageEntries
        .map((id) => ({ id, boost: getUsageBoost(id) }))
        .filter((e) => e.boost > 0)
        .sort((a, b) => b.boost - a.boost)
        .slice(0, 5);

      for (const { id } of scored) {
        const cmd = commands.find((c) => c.id === id);
        if (cmd) {
          suggestionItems.push({
            id: cmd.id, label: cmd.label, icon: cmd.icon, type: cmd.type,
            action: () => { trackPaletteUsage(cmd.id); cmd.action(ctx); },
          });
          continue;
        }
        const quickNavItem = quickNavItems.find((item) => item.id === id);
        if (quickNavItem) { suggestionItems.push({ ...quickNavItem }); continue; }
        if (isWorkspaceHomeNode(id) || isLockedNode(id)) continue;
        const node = loroDoc.toNodexNode(id);
        if (!node) continue;
        const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
        if (!name) continue;
        const visuals = resolveNodeVisuals(id, node);
        suggestionItems.push({
          id, label: resolveDayNodeDisplayName(id, name), ...visuals,
          action: () => navigate(id),
        });
      }
    }
    return { suggestions: suggestionItems, commands: [...quickNavItems, ...commandItems] };
  }, [paletteUsage, getUsageBoost, commands, quickNavItems, commandItems, ctx, trackPaletteUsage, navigate]);

  // Flat item list for keyboard navigation
  const allItems: PaletteItem[] = useMemo(() => {
    if (query.trim()) {
      const items: PaletteItem[] = [];
      if (createItem) items.push(createItem);
      items.push(...searchResults);
      return items;
    }
    return [...sortedDefaultItems.suggestions, ...sortedDefaultItems.commands];
  }, [query, searchResults, createItem, sortedDefaultItems]);

  // Reset selection on item change
  useEffect(() => {
    const hasResults = query.trim() && searchResults.length > 0 && createItem;
    setSelectedIndex(hasResults ? 1 : 0);
  }, [allItems.length, query, searchResults.length, createItem]);

  // ⌘K focuses input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const sel = el.querySelector('[data-selected="true"]');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < allItems.length) allItems[idx].action();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && createItem) {
        e.preventDefault();
        createItem.action();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = allItems[selectedIndex];
        if (item) item.action();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setQuery('');
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [allItems, selectedIndex, createItem],
  );

  const hasQuery = query.trim().length > 0;
  let globalIdx = 0;

  return (
    <div className="flex flex-1 items-start justify-center pt-[12vh]">
      <div className="w-full max-w-[440px] rounded-xl bg-background shadow-card overflow-hidden">
        {/* Search input */}
        <div className="flex h-10 items-center gap-2.5 px-3">
          <Search size={15} strokeWidth={1.6} className="shrink-0 text-foreground-tertiary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setOpen(true)}
            placeholder={t('search.commandPalette.placeholder')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-tertiary"
          />
          <span className="shrink-0 cursor-pointer" onClick={() => open ? dismiss() : inputRef.current?.focus()}>
            <Kbd>{open ? 'Esc' : '⌘K'}</Kbd>
          </span>
        </div>

        {/* Dropdown results */}
        {open && allItems.length > 0 && (
          <>
            <div className="border-t border-border-subtle" />
            {/* Prevent blur when clicking inside dropdown */}
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
            <div
              ref={listRef}
              onMouseDown={(e) => e.preventDefault()}
              className="max-h-[320px] overflow-y-auto py-1"
            >
              {hasQuery ? (
                <div>
                  {createItem && (() => {
                    const idx = globalIdx++;
                    return (
                      <LandingRow
                        key={createItem.id}
                        item={createItem}
                        selected={selectedIndex === idx}
                        onSelect={() => createItem.action()}
                        onHover={() => setSelectedIndex(idx)}
                      />
                    );
                  })()}
                  {searchResults.length > 0 && (
                    <>
                      <GroupHeader label={t('search.commandPalette.groupResults')} />
                      {searchResults.map((item) => {
                        const idx = globalIdx++;
                        return (
                          <LandingRow
                            key={item.id}
                            item={item}
                            selected={selectedIndex === idx}
                            onSelect={() => item.action()}
                            onHover={() => setSelectedIndex(idx)}
                          />
                        );
                      })}
                    </>
                  )}
                </div>
              ) : (
                <>
                  {sortedDefaultItems.suggestions.length > 0 && (
                    <div>
                      <GroupHeader label={t('search.commandPalette.groupSuggestions')} />
                      {sortedDefaultItems.suggestions.map((item) => {
                        const idx = globalIdx++;
                        return (
                          <LandingRow
                            key={item.id}
                            item={item}
                            selected={selectedIndex === idx}
                            onSelect={() => item.action()}
                            onHover={() => setSelectedIndex(idx)}
                          />
                        );
                      })}
                    </div>
                  )}
                  {sortedDefaultItems.commands.length > 0 && (
                    <div>
                      <GroupHeader label={t('search.commandPalette.groupCommands')} />
                      {sortedDefaultItems.commands.map((item) => {
                        const idx = globalIdx++;
                        return (
                          <LandingRow
                            key={item.id}
                            item={item}
                            selected={selectedIndex === idx}
                            onSelect={() => item.action()}
                            onHover={() => setSelectedIndex(idx)}
                          />
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Action bar */}
            {allItems.length > 0 && (() => {
              const selected = allItems[selectedIndex];
              if (!selected) return null;
              return (
                <div className="flex h-9 items-center justify-end gap-3 border-t border-border-subtle px-3">
                  {hasQuery && createItem && selected.id !== '__create__' && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-foreground-tertiary">{t('search.commandPalette.actionCreate')}</span>
                      <Kbd>⌘↵</Kbd>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-foreground-secondary">{getActionLabel(selected.type)}</span>
                    <Kbd>↵</Kbd>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-1.5 text-xs font-medium text-foreground-tertiary">
      {label}
    </div>
  );
}

function LandingRow({ item, selected, onSelect, onHover }: {
  item: PaletteItem;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const Icon = item.icon;
  return (
    <div
      data-selected={selected}
      onClick={onSelect}
      onMouseMove={onHover}
      className={`mx-1 flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 transition-colors ${selected ? 'bg-primary-muted' : ''}`}
    >
      {Icon ? (
        <Icon size={16} strokeWidth={1.5} className="shrink-0 text-foreground-secondary" />
      ) : item.tagDefColor ? (
        <span
          className="flex shrink-0 h-4 w-4 items-center justify-center text-sm font-medium"
          style={{ color: item.tagDefColor.text }}
        >#</span>
      ) : (
        <span className="flex shrink-0 h-4 w-4 items-center justify-center">
          <span
            className="block h-[5px] w-[5px] rounded-full"
            style={{ background: item.bulletColors?.[0] ?? 'var(--color-foreground-secondary)' }}
          />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{item.label}</span>
      {item.typeLabel && (
        <span className="shrink-0 text-xs text-foreground-tertiary">{item.typeLabel}</span>
      )}
    </div>
  );
}
