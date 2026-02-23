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
import { FileText, Library, Inbox, CalendarDays, CalendarCheck, Trash2, type AppIcon } from '../../lib/icons.js';
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
import { t } from '../../i18n/strings.js';

const CONTAINER_ICONS: Record<string, AppIcon> = {
  library: Library,
  inbox: Inbox,
  journal: CalendarDays,
  trash: Trash2,
};

const TYPE_LABELS: Record<PaletteItemType, string> = {
  node: 'Node',
  container: 'Container',
  command: 'Command',
};

export function CommandPalette() {
  const searchOpen = useUIStore((s) => s.searchOpen);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const panelHistory = useUIStore((s) => s.panelHistory);
  const panelIndex = useUIStore((s) => s.panelIndex);
  const _version = useNodeStore((s) => s._version);
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const signOutFn = useWorkspaceStore((s) => s.signOut);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build command context
  const ctx: CommandContext = useMemo(() => ({
    navigateTo,
    closeSearch,
    isSignedIn: !!authUser,
    signInWithGoogle,
    signOut: signOutFn,
  }), [navigateTo, closeSearch, authUser, signInWithGoogle, signOutFn]);

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
      items.push({
        id,
        label: name,
        icon: FileText,
        type: 'node',
        action: () => { navigateTo(id); closeSearch(); },
      });
    }
    return items;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelHistory, panelIndex, _version, navigateTo, closeSearch]);

  // Container items for Suggestions
  const containerItems: PaletteItem[] = useMemo(() =>
    COMMAND_PALETTE_QUICK_CONTAINERS.map((c) => ({
      id: c.id,
      label: t(c.labelKey),
      icon: CONTAINER_ICONS[c.iconKey] ?? Library,
      type: 'container' as PaletteItemType,
      action: () => { navigateTo(c.id); closeSearch(); },
    })),
  [navigateTo, closeSearch]);

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

    // Search nodes
    let nodeCount = 0;
    for (const id of loroDoc.getAllNodeIds()) {
      if (nodeCount >= 20) break;
      const node = loroDoc.toNodexNode(id);
      if (!node) continue;
      const name = (node.name ?? '').replace(/<[^>]+>/g, '').trim();
      if (!name) continue;
      const match = fuzzyMatch(q, name);
      if (match) {
        results.push({
          id,
          label: name,
          icon: FileText,
          type: 'node',
          score: match.score,
          action: () => { navigateTo(id); closeSearch(); },
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
  }, [_version, searchQuery, commands, ctx, navigateTo, closeSearch]);

  // Flat list of all visible items (for keyboard navigation)
  const allItems: PaletteItem[] = useMemo(() => {
    if (searchQuery.trim()) return searchResults;
    return [...recentNodes, ...containerItems, ...commandItems];
  }, [searchQuery, searchResults, recentNodes, containerItems, commandItems]);

  // Reset selection when items change
  useEffect(() => setSelectedIndex(0), [allItems.length, searchQuery]);

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
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = allItems[selectedIndex];
        if (item) item.action();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      }
    },
    [allItems, selectedIndex, closeSearch],
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
          <kbd
            onClick={closeSearch}
            className="ml-2 inline-flex h-5 cursor-pointer items-center rounded border border-border bg-background px-1.5 text-[10px] font-medium text-foreground-tertiary hover:text-foreground-secondary"
          >
            Esc
          </kbd>
        </div>

        {/* List area */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1.5">
          {hasQuery ? (
            // Search mode: single "Results" group
            searchResults.length > 0 ? (
              <div>
                <GroupHeader label="Results" />
                {searchResults.map((item, i) => (
                  <PaletteRow
                    key={item.id}
                    item={item}
                    selected={selectedIndex === i}
                    onSelect={() => item.action()}
                    onHover={() => setSelectedIndex(i)}
                  />
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-foreground-secondary">
                No results found
              </div>
            )
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
          <div className="flex h-8 items-center justify-end border-t border-border px-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-foreground-secondary">
              <span>{actionLabel}</span>
              <kbd className="inline-flex h-5 items-center rounded border border-border bg-background px-1.5 text-[10px] font-medium">
                ↵
              </kbd>
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
    <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-foreground-tertiary">
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
      className={`mx-1 flex h-7 cursor-pointer items-center gap-2 rounded-md px-2 transition-colors ${
        selected ? 'bg-accent' : ''
      }`}
    >
      <Icon size={16} className="shrink-0 text-foreground-secondary" />
      <span className="flex-1 truncate text-xs text-foreground">{item.label}</span>
      {item.subtitle && (
        <span className="shrink-0 text-[10px] text-foreground-tertiary">{item.subtitle}</span>
      )}
      <span className="shrink-0 text-[10px] text-foreground-tertiary">
        {TYPE_LABELS[item.type]}
      </span>
    </div>
  );
}
