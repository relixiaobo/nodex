/**
 * ⌘K Command palette — full-screen takeover with Alfred-style shortcuts.
 *
 * Two-layer structure:
 * 1. Search header (close button + input) — replaces toolbar
 * 2. Results area (fills remaining space, scrollable)
 *
 * Alfred-style shortcuts:
 * - Items 1-9 show ⌘1-⌘9 at the far right
 * - The selected (highlighted) item shows ↵ instead
 * - Pressing ⌘N executes that item directly
 *
 * Empty input: Suggestions (recent nodes + containers) + Commands
 * Typing: single "Results" group with fuzzy-matched nodes + commands
 */
import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Library, Inbox, CalendarDays, Trash2, Search, Settings, Plus, type AppIcon } from '../../lib/icons.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { resolveDataType, getFieldTypeIcon } from '../../lib/field-utils.js';
import { isContainerNode } from '../../types/index.js';
import { getSystemContainerMeta, type ContainerIconKey } from '../../lib/system-node-registry.js';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import * as loroDoc from '../../lib/loro-doc.js';
import { fuzzyMatch, fuzzySort } from '../../lib/fuzzy-search.js';
import {
  type PaletteItem,
  type PaletteItemType,
  type CommandContext,
  getAllCommands,
} from '../../lib/palette-commands.js';
import { COMMAND_PALETTE_QUICK_CONTAINERS } from '../../lib/system-node-registry.js';
import { ensureTodayNode, isDayNode } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName, isToday } from '../../lib/date-utils.js';

import { ensureUndoFocusAfterNavigation } from '../../lib/focus-utils.js';
import { t } from '../../i18n/strings.js';
import { Kbd } from '../ui/Kbd';

/** Add "Today, " prefix for today's day node, matching NodeHeader behavior. */
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

const CONTAINER_ICONS: Record<ContainerIconKey, AppIcon> = {
  library: Library,
  inbox: Inbox,
  journal: CalendarDays,
  trash: Trash2,
  search: Search,
  schema: Library,
  clips: Library,
  stash: Library,
  settings: Settings,
};

/** Resolve visual props for a node item based on its type. */
function resolveNodeVisuals(id: string, node: { type?: string; tags?: string[] }): Pick<PaletteItem, 'icon' | 'tagDefColor' | 'bulletColors' | 'typeLabel' | 'type'> {
  // TagDef → colored #
  if (node.type === 'tagDef') {
    const c = resolveTagColor(id);
    return { tagDefColor: { text: c.text }, typeLabel: 'Tag', type: 'node' };
  }
  // FieldDef → field-type icon
  if (node.type === 'fieldDef') {
    const dt = resolveDataType(id);
    const FieldIcon = getFieldTypeIcon(dt);
    return { icon: FieldIcon, typeLabel: 'Field', type: 'node' };
  }
  // Container → container icon
  if (isContainerNode(id)) {
    const meta = getSystemContainerMeta(id as any);
    const ContIcon = meta ? CONTAINER_ICONS[meta.iconKey] : Library;
    return { icon: ContIcon, type: 'container' };
  }
  // Regular node → tag-derived bullet colors
  const tagIds = node.tags ?? [];
  const bulletColors = tagIds.length > 0
    ? tagIds.map((tid: string) => resolveTagColor(tid).text)
    : undefined;
  return { bulletColors, type: 'node' };
}

export function CommandPalette() {
  const searchOpen = useUIStore((s) => s.searchOpen);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const _version = useNodeStore((s) => s._version);
  const createChild = useNodeStore((s) => s.createChild);
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const signOutFn = useWorkspaceStore((s) => s.signOut);

  const paletteUsage = useUIStore((s) => s.paletteUsage);
  const trackPaletteUsage = useUIStore((s) => s.trackPaletteUsage);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close + clear query (used when an action is executed)
  const closeAndClear = useCallback(() => {
    setSearchQuery('');
    closeSearch();
    ensureUndoFocusAfterNavigation();
  }, [setSearchQuery, closeSearch]);

  // Build command context
  const ctx: CommandContext = useMemo(() => ({
    navigateTo,
    closeSearch: closeAndClear,
    isSignedIn: !!authUser,
    signInWithGoogle,
    signOut: signOutFn,
  }), [navigateTo, closeAndClear, authUser, signInWithGoogle, signOutFn]);

  // All registered commands
  const commands = useMemo(() => getAllCommands(ctx), [ctx]);

  // Container IDs to exclude from recent nodes (they appear in the containers section)
  const containerIdSet = useMemo(
    () => new Set<string>(COMMAND_PALETTE_QUICK_CONTAINERS.map((c) => c.id)),
    [],
  );

  // Container items for Commands group
  const containerItems: PaletteItem[] = useMemo(() =>
    COMMAND_PALETTE_QUICK_CONTAINERS.map((c) => ({
      id: c.id,
      label: t(c.labelKey),
      icon: CONTAINER_ICONS[c.iconKey] ?? Library,
      type: 'container' as PaletteItemType,
      action: () => { trackPaletteUsage(c.id); navigateTo(c.id); closeAndClear(); },
    })),
    [navigateTo, closeAndClear, trackPaletteUsage]);

  // System command items (containers are added separately in sortedDefaultItems)
  const commandItems: PaletteItem[] = useMemo(() =>
    commands
      .filter((cmd) => cmd.type === 'command')
      .map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        icon: cmd.icon,
        type: cmd.type,
        action: () => { trackPaletteUsage(cmd.id); cmd.action(ctx); },
      })),
    [commands, ctx, trackPaletteUsage]);

  // Cache searchable nodes (rebuild only when node data changes, not per keystroke)
  const searchableNodes = useMemo(() => {
    const items: Array<{ id: string; name: string }> = [];
    for (const id of loroDoc.getAllNodeIds()) {
      if (containerIdSet.has(id)) continue;
      const node = loroDoc.toNodexNode(id);
      if (!node) continue;
      const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
      if (!name) continue;
      items.push({ id, name });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_version, containerIdSet]);

  // Usage boost: frequent + recent items get a score bonus.
  // Max boost = 15 (count) + 10 (recency) = 25 points.
  const getUsageBoost = useCallback((itemId: string) => {
    const usage = paletteUsage[itemId];
    if (!usage) return 0;
    // Frequency: log scale, capped at 15 points (≈ 7+ uses)
    const freqBoost = Math.min(Math.log2(usage.count + 1) * 5, 15);
    // Recency: decays over 7 days, max 10 points
    const ageMs = Date.now() - usage.lastUsedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const recencyBoost = Math.max(10 - ageDays * (10 / 7), 0);
    return freqBoost + recencyBoost;
  }, [paletteUsage]);

  // Fuzzy search results (nodes + commands mixed, sorted by score + usage boost)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];

    const results: PaletteItem[] = [];

    // Batch search nodes via uFuzzy (all nodes scored & sorted, top 20)
    const nodeMatches = fuzzySort(searchableNodes, q, (item) => item.name, 20);
    for (const match of nodeMatches) {
      const node = loroDoc.toNodexNode(match.id);
      if (!node) continue;
      const visuals = resolveNodeVisuals(match.id, node);
      results.push({
        id: match.id,
        label: resolveDayNodeDisplayName(match.id, match.name),
        ...visuals,
        score: (match._fuzzyScore ?? 0) + getUsageBoost(match.id),
        action: () => { trackPaletteUsage(match.id); navigateTo(match.id); closeAndClear(); },
      });
    }

    // Search commands (small set, per-item is fine)
    for (const cmd of commands) {
      const targets = [cmd.label, ...(cmd.keywords ?? [])];
      let bestScore: number | null = null;
      for (const target of targets) {
        const match = fuzzyMatch(q, target);
        if (match && (bestScore === null || match.score > bestScore)) {
          bestScore = match.score;
        }
      }
      if (bestScore !== null) {
        results.push({
          id: cmd.id,
          label: cmd.label,
          icon: cmd.icon,
          type: cmd.type,
          score: bestScore + getUsageBoost(cmd.id),
          action: () => { trackPaletteUsage(cmd.id); cmd.action(ctx); },
        });
      }
    }

    // Sort by score descending (merges node + command results, boosted by usage)
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return results;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchableNodes, commands, ctx, navigateTo, closeAndClear, getUsageBoost, trackPaletteUsage]);

  // "Create in Today" item — shown at the start of search results when there's a query
  const createItem: PaletteItem | null = useMemo(() => {
    const q = searchQuery.trim();
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
        navigateTo(todayId);
        closeAndClear();
      },
    };
  }, [searchQuery, createChild, navigateTo, closeAndClear]);

  // Default mode: Suggestions (behavior-driven) + Commands (fixed list)
  const sortedDefaultItems = useMemo(() => {
    // Suggestions: purely behavior-driven — items from paletteUsage sorted by boost, max 5
    const usageEntries = Object.keys(paletteUsage);
    const suggestionItems: PaletteItem[] = [];
    if (usageEntries.length > 0) {
      const scored = usageEntries
        .map((id) => ({ id, boost: getUsageBoost(id) }))
        .filter((e) => e.boost > 0)
        .sort((a, b) => b.boost - a.boost)
        .slice(0, 5);

      for (const { id } of scored) {
        // Command or container?
        const cmd = commands.find((c) => c.id === id);
        if (cmd) {
          suggestionItems.push({
            id: cmd.id,
            label: cmd.label,
            icon: cmd.icon,
            type: cmd.type,
            action: () => { trackPaletteUsage(cmd.id); cmd.action(ctx); },
          });
          continue;
        }
        // Container?
        const container = containerItems.find((c) => c.id === id);
        if (container) {
          suggestionItems.push({ ...container });
          continue;
        }
        // Node?
        const node = loroDoc.toNodexNode(id);
        if (!node) continue;
        const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
        if (!name) continue;
        const visuals = resolveNodeVisuals(id, node);
        suggestionItems.push({
          id,
          label: resolveDayNodeDisplayName(id, name),
          ...visuals,
          action: () => { trackPaletteUsage(id); navigateTo(id); closeAndClear(); },
        });
      }
    }

    // Commands: fixed list = containers + system commands
    const cmdItems = [...containerItems, ...commandItems];
    return { suggestions: suggestionItems, commands: cmdItems };
  }, [paletteUsage, getUsageBoost, commands, containerItems, commandItems, ctx, trackPaletteUsage, navigateTo, closeAndClear]);

  // Flat list of all visible items (for keyboard navigation)
  const allItems: PaletteItem[] = useMemo(() => {
    if (searchQuery.trim()) {
      const items: PaletteItem[] = [];
      if (createItem) items.push(createItem);
      items.push(...searchResults);
      return items;
    }
    return [...sortedDefaultItems.suggestions, ...sortedDefaultItems.commands];
  }, [searchQuery, searchResults, createItem, sortedDefaultItems]);

  // Reset selection when items change
  // When searching with results, skip createItem (index 0) and select first result
  useEffect(() => {
    const hasResults = searchQuery.trim() && searchResults.length > 0 && createItem;
    setSelectedIndex(hasResults ? 1 : 0);
  }, [allItems.length, searchQuery, searchResults.length, createItem]);

  // Focus input when opened
  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchOpen]);

  // Global Cmd+K toggle + Esc close (works even when input loses focus)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (searchOpen) {
          closeAndClear();
        } else {
          useUIStore.getState().openSearch();
        }
      } else if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        closeAndClear();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, closeAndClear]);

  // Keyboard navigation within the palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // ⌘1-⌘9 — execute item at that position (Alfred-style)
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const itemIndex = parseInt(e.key) - 1;
        if (itemIndex < allItems.length) {
          allItems[itemIndex].action();
        }
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && createItem) {
        // ⌘↵ — Create new node in Today
        e.preventDefault();
        createItem.action();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = allItems[selectedIndex];
        if (item) item.action();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAndClear();
      }
    },
    [allItems, selectedIndex, closeAndClear, createItem],
  );

  // Scroll selected item into view
  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const selected = listEl.querySelector('[data-selected="true"]');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!searchOpen) return null;

  const hasQuery = searchQuery.trim().length > 0;

  // Track global index across groups for keyboard selection
  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-foreground/[0.08] p-2 sm:p-4 pt-[8vh] sm:pt-[12vh]"
      onPointerDown={closeAndClear}
    >
      <div
        className="animate-palette-expand flex flex-col w-full max-w-[600px] h-fit max-h-[80vh] rounded-xl bg-background shadow-paper border border-border-subtle overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Search header — 48px to match TopToolbar */}
        <div className="flex h-12 shrink-0 items-center px-4 border-b border-border-subtle bg-background">
          <div className="flex flex-1 items-center gap-2.5">
            <Search size={16} className="text-foreground-tertiary shrink-0" />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-tertiary"
            />
            <span className="shrink-0 cursor-pointer" onClick={closeAndClear}>
              <Kbd>Esc</Kbd>
            </span>
          </div>
        </div>

        {/* Results area — fills remaining space */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
          {hasQuery ? (
            // Search mode: Create + Results
            <div>
              {createItem && (() => {
                const idx = globalIdx++;
                return (
                  <PaletteRow
                    key={createItem.id}
                    item={createItem}
                    selected={selectedIndex === idx}
                    positionIndex={idx}
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
                      <PaletteRow
                        key={item.id}
                        item={item}
                        selected={selectedIndex === idx}
                        positionIndex={idx}
                        onSelect={() => item.action()}
                        onHover={() => setSelectedIndex(idx)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          ) : (
            // Default mode: Suggestions + Commands (sorted by usage)
            <>
              {sortedDefaultItems.suggestions.length > 0 && (
                <div>
                  <GroupHeader label={t('search.commandPalette.groupSuggestions')} />
                  {sortedDefaultItems.suggestions.map((item) => {
                    const idx = globalIdx++;
                    return (
                      <PaletteRow
                        key={item.id}
                        item={item}
                        selected={selectedIndex === idx}
                        positionIndex={idx}
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
                      <PaletteRow
                        key={item.id}
                        item={item}
                        selected={selectedIndex === idx}
                        positionIndex={idx}
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="px-4 py-1.5 text-xs font-medium text-foreground-tertiary">
      {label}
    </div>
  );
}

interface PaletteRowProps {
  item: PaletteItem;
  selected: boolean;
  /** 0-based flat index — used for Alfred-style ⌘1-⌘9 shortcuts. */
  positionIndex: number;
  onSelect: () => void;
  onHover: () => void;
}

function PaletteRow({ item, selected, positionIndex, onSelect, onHover }: PaletteRowProps) {
  const Icon = item.icon;

  return (
    <div
      data-selected={selected}
      onClick={onSelect}
      onMouseMove={onHover}
      className={`mx-2 flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 transition-colors ${selected ? 'bg-primary-muted' : ''
        }`}
    >
      {/* Icon: command/container use explicit icon; tagDef uses colored #; nodes use colored bullet */}
      {Icon ? (
        <Icon size={16} strokeWidth={1.5} className="shrink-0 text-foreground-secondary" />
      ) : item.tagDefColor ? (
        <span
          className="flex shrink-0 h-4 w-4 items-center justify-center rounded text-xs font-bold"
          style={{ color: item.tagDefColor.text }}
        >
          <span className="text-[#999999]">#</span>
        </span>
      ) : (
        <span className="flex shrink-0 h-4 w-4 items-center justify-center">
          <span
            className="block h-[5px] w-[5px] rounded-full"
            style={{
              background: item.bulletColors?.[0] ?? 'var(--color-foreground-secondary)',
            }}
          />
        </span>
      )}
      <span className="flex-1 truncate text-[13px] text-foreground">{item.label}</span>
      {item.typeLabel && (
        <span className="shrink-0 text-xs text-foreground-tertiary">{item.typeLabel}</span>
      )}
      {/* Alfred-style shortcut: selected → ↵, others → ⌘N (up to 9) */}
      {selected ? (
        <Kbd>↵</Kbd>
      ) : positionIndex < 9 ? (
        <Kbd>{`⌘${positionIndex + 1}`}</Kbd>
      ) : null}
    </div>
  );
}
