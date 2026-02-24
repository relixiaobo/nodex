/**
 * ⌘K Command palette — Raycast-style unified search & command interface.
 *
 * Three-layer structure:
 * 1. Search bar (input + Esc badge)
 * 2. List area (Suggestions/Results groups, scrollable)
 * 3. Action bar (fixed bottom, dynamic label per selection type)
 *
 * Empty input: Suggestions (recent nodes + containers) + Commands
 * Typing: single "Results" group with fuzzy-matched nodes + commands
 */
import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Library, Inbox, CalendarDays, Trash2, Search, Plus, type AppIcon } from '../../lib/icons.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { resolveDataType, getFieldTypeIcon } from '../../lib/field-utils.js';
import { isContainerNode } from '../../types/index.js';
import { getSystemContainerMeta, type ContainerIconKey } from '../../lib/system-node-registry.js';
import { useUIStore } from '../../stores/ui-store';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import * as loroDoc from '../../lib/loro-doc.js';
import { fuzzyMatch } from '../../lib/fuzzy-search.js';
import {
  type PaletteItem,
  type PaletteItemType,
  type CommandContext,
  getAllCommands,
  getActionLabel,
} from '../../lib/palette-commands.js';
import { COMMAND_PALETTE_QUICK_CONTAINERS } from '../../lib/system-node-registry.js';
import { ensureTodayNode } from '../../lib/journal.js';
import { Kbd } from '../ui/Kbd';
import { t } from '../../i18n/strings.js';

const CONTAINER_ICONS: Record<ContainerIconKey, AppIcon> = {
  library: Library,
  inbox: Inbox,
  journal: CalendarDays,
  trash: Trash2,
  search: Search,
  schema: Library,
  clips: Library,
  stash: Library,
};

const TYPE_LABELS: Record<PaletteItemType, string> = {
  node: 'Node',
  container: 'Node',
  command: 'Command',
  create: 'New',
};

/** Resolve visual props for a node item based on its type. */
function resolveNodeVisuals(id: string, node: { type?: string; tags?: string[] }): Pick<PaletteItem, 'icon' | 'tagDefColor' | 'bulletColors' | 'typeLabel' | 'type'> {
  // TagDef → colored #
  if (node.type === 'tagDef') {
    const c = resolveTagColor(id);
    return { tagDefColor: { text: c.text, bg: c.bg }, typeLabel: 'Tag', type: 'node' };
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
  const panelHistory = useUIStore((s) => s.panelHistory);
  const panelIndex = useUIStore((s) => s.panelIndex);
  const _version = useNodeStore((s) => s._version);
  const createChild = useNodeStore((s) => s.createChild);
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const signOutFn = useWorkspaceStore((s) => s.signOut);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close + clear query (used when an action is executed)
  const closeAndClear = useCallback(() => {
    setSearchQuery('');
    closeSearch();
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

  // Recent nodes from panel history (deduplicated, most recent first, max 5)
  // Excludes container nodes since they already appear in the Suggestions group.
  const recentNodes = useMemo(() => {
    const seen = new Set<string>();
    const items: PaletteItem[] = [];
    // Walk backwards from current index to find recent unique nodes
    for (let i = panelIndex; i >= 0 && items.length < 5; i--) {
      const id = panelHistory[i];
      if (!id || seen.has(id) || containerIdSet.has(id)) continue;
      seen.add(id);
      const node = loroDoc.toNodexNode(id);
      if (!node) continue;
      const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
      if (!name) continue;
      const visuals = resolveNodeVisuals(id, node);
      items.push({
        id,
        label: name,
        ...visuals,
        action: () => { navigateTo(id); closeAndClear(); },
      });
    }
    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelHistory, panelIndex, _version, navigateTo, closeAndClear]);

  // Container items for Suggestions
  const containerItems: PaletteItem[] = useMemo(() =>
    COMMAND_PALETTE_QUICK_CONTAINERS.map((c) => ({
      id: c.id,
      label: t(c.labelKey),
      icon: CONTAINER_ICONS[c.iconKey] ?? Library,
      type: 'container' as PaletteItemType,
      action: () => { navigateTo(c.id); closeAndClear(); },
    })),
  [navigateTo, closeAndClear]);

  // Command items for Commands group (excludes containers, which are in Suggestions)
  const commandItems: PaletteItem[] = useMemo(() =>
    commands
      .filter((cmd) => cmd.type === 'command')
      .map((cmd) => ({
        id: cmd.id,
        label: cmd.label,
        icon: cmd.icon,
        type: cmd.type,
        subtitle: cmd.shortcut,
        action: () => cmd.action(ctx),
      })),
  [commands, ctx]);

  // Fuzzy search results (nodes + commands mixed, sorted by score)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];

    const results: PaletteItem[] = [];

    // Search nodes (skip containers — they're covered by command search)
    let nodeCount = 0;
    for (const id of loroDoc.getAllNodeIds()) {
      if (nodeCount >= 20) break;
      if (containerIdSet.has(id)) continue;
      const node = loroDoc.toNodexNode(id);
      if (!node) continue;
      const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
      if (!name) continue;
      const match = fuzzyMatch(q, name);
      if (match) {
        const visuals = resolveNodeVisuals(id, node);
        results.push({
          id,
          label: name,
          ...visuals,
          score: match.score,
          action: () => { navigateTo(id); closeAndClear(); },
        });
        nodeCount++;
      }
    }

    // Search commands
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
          subtitle: cmd.shortcut,
          score: bestScore,
          action: () => cmd.action(ctx),
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return results;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_version, searchQuery, commands, ctx, navigateTo, closeAndClear]);

  // "Create in Today" item — shown at the end of search results when there's a query
  const createItem: PaletteItem | null = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;
    return {
      id: '__create__',
      label: q,
      icon: Plus,
      type: 'create' as PaletteItemType,
      typeLabel: 'New in Today',
      subtitle: '\u2318\u21B5',
      action: () => {
        const todayId = ensureTodayNode();
        createChild(todayId, undefined, { name: q });
        navigateTo(todayId);
        closeAndClear();
      },
    };
  }, [searchQuery, createChild, navigateTo, closeAndClear]);

  // Flat list of all visible items (for keyboard navigation)
  const allItems: PaletteItem[] = useMemo(() => {
    if (searchQuery.trim()) {
      const items: PaletteItem[] = [];
      if (createItem) items.push(createItem);
      items.push(...searchResults);
      return items;
    }
    return [...recentNodes, ...containerItems, ...commandItems];
  }, [searchQuery, searchResults, createItem, recentNodes, containerItems, commandItems]);

  // Reset selection when items change
  // When searching with results, skip createItem (index 0) and select first result
  useEffect(() => {
    const hasResults = searchQuery.trim() && searchResults.length > 0 && createItem;
    setSelectedIndex(hasResults ? 1 : 0);
  }, [allItems.length, searchQuery, searchResults.length, createItem]);

  // Focus input when opened
  useEffect(() => {
    if (searchOpen) {
      // Use requestAnimationFrame to ensure DOM is rendered before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [searchOpen]);

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

  // Keyboard navigation within the palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
        closeSearch();
      }
    },
    [allItems, selectedIndex, closeSearch, createItem],
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
  const selectedItem = allItems[selectedIndex];
  const actionLabel = selectedItem ? getActionLabel(selectedItem.type) : 'Open';

  // Track global index across groups for keyboard selection
  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12%]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20" onClick={closeSearch} />

      {/* Dialog */}
      <div
        className="relative w-full max-w-md rounded-xl border border-border bg-popover shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search bar */}
        <div className="flex items-center border-b border-border px-3">
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search nodes and commands..."
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-tertiary"
          />
        </div>

        {/* List area */}
        <div ref={listRef} className="h-72 overflow-y-auto py-1.5 pr-1.5">
          {hasQuery ? (
            // Search mode: Create + Results
            <div>
              {createItem && (
                <PaletteRow
                  key={createItem.id}
                  item={createItem}
                  selected={selectedIndex === 0}
                  onSelect={() => createItem.action()}
                  onHover={() => setSelectedIndex(0)}
                />
              )}
              {searchResults.length > 0 && (
                <>
                  <GroupHeader label="Results" />
                  {searchResults.map((item, i) => {
                    const idx = createItem ? i + 1 : i;
                    return (
                      <PaletteRow
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
            // Default mode: Suggestions + Commands
            <>
              {(recentNodes.length > 0 || containerItems.length > 0) && (
                <div>
                  <GroupHeader label="Suggestions" />
                  {recentNodes.map((item) => {
                    const idx = globalIdx++;
                    return (
                      <PaletteRow
                        key={item.id}
                        item={item}
                        selected={selectedIndex === idx}
                        onSelect={() => item.action()}
                        onHover={() => setSelectedIndex(idx)}
                      />
                    );
                  })}
                  {containerItems.map((item) => {
                    const idx = globalIdx++;
                    return (
                      <PaletteRow
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
              {commandItems.length > 0 && (
                <div>
                  <GroupHeader label="Commands" />
                  {commandItems.map((item) => {
                    const idx = globalIdx++;
                    return (
                      <PaletteRow
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
        {allItems.length > 0 && (
          <div className="flex h-10 items-center justify-end border-t border-border px-3">
            <div className="flex items-center gap-1.5 text-xs text-foreground-tertiary">
              <span>{actionLabel}</span>
              <Kbd>↵</Kbd>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="px-3 py-1.5 text-xs font-medium text-foreground-tertiary">
      {label}
    </div>
  );
}

interface PaletteRowProps {
  item: PaletteItem;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}

function PaletteRow({ item, selected, onSelect, onHover }: PaletteRowProps) {
  const Icon = item.icon;

  return (
    <div
      data-selected={selected}
      onClick={onSelect}
      onMouseMove={onHover}
      className={`mx-1 flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 transition-colors ${
        selected ? 'bg-accent' : ''
      }`}
    >
      {/* Icon: command/container use explicit icon; tagDef uses colored #; nodes use colored bullet */}
      {Icon ? (
        <Icon size={16} className="shrink-0 text-foreground-secondary" />
      ) : item.tagDefColor ? (
        <span
          className="flex shrink-0 h-4 w-4 items-center justify-center rounded text-xs font-bold"
          style={{ backgroundColor: item.tagDefColor.bg, color: item.tagDefColor.text }}
        >
          #
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
      <span className="flex-1 truncate text-sm text-foreground">{item.label}</span>
      {item.subtitle && (
        <Kbd keys={item.subtitle} />
      )}
      <span className="shrink-0 text-xs text-foreground-tertiary">
        {item.typeLabel ?? TYPE_LABELS[item.type]}
      </span>
    </div>
  );
}
