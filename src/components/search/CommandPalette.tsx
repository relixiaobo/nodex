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
 * Two modes:
 * - Search mode (default): Suggestions + Commands + Chat history
 * - AI mode (Tab switch): Chat history + Ask AI
 */
import { useEffect, useCallback, useMemo, useState, useRef } from 'react';
import { Library, Inbox, CalendarDays, Trash2, Search, Settings, Bot, Plus, MessageCircle, MessageCircleDashed, ArrowLeft, type AppIcon } from '../../lib/icons.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { resolveDataType, getFieldTypeIcon } from '../../lib/field-utils.js';
import { isLockedNode, isWorkspaceHomeNode } from '../../lib/node-capabilities.js';
import {
  getSystemNodePreset,
  isPaletteSearchableSystemNode,
  QUICK_NAV_SYSTEM_NODES,
  type SystemNodeIconKey,
} from '../../lib/system-node-presets.js';
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
  getActionLabel,
} from '../../lib/palette-commands.js';
import { ensureTodayNode, isDayNode } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName, isToday } from '../../lib/date-utils.js';

import { ensureUndoFocusAfterNavigation } from '../../lib/focus-utils.js';
import { openChatWithPrompt, openNewChatDrawer, switchToChatSession } from '../../lib/chat-panel-actions.js';
import { listChatSessionMetas, type ChatSessionMeta } from '../../lib/ai-persistence.js';
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

const SYSTEM_NODE_ICONS: Record<SystemNodeIconKey, AppIcon> = {
  library: Library,
  inbox: Inbox,
  journal: CalendarDays,
  ai: Bot,
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
  const preset = getSystemNodePreset(id);
  if (preset) {
    return { icon: SYSTEM_NODE_ICONS[preset.iconKey] ?? Library, type: 'node' };
  }
  // Regular node → tag-derived bullet colors
  const tagIds = node.tags ?? [];
  const bulletColors = tagIds.length > 0
    ? tagIds.map((tid: string) => resolveTagColor(tid).text)
    : undefined;
  return { bulletColors, typeLabel: 'Node', type: 'node' };
}

/** Build a PaletteItem for a chat session. */
function chatSessionToItem(
  meta: ChatSessionMeta,
  closeAndClear: () => void,
): PaletteItem {
  return {
    id: `chat:${meta.id}`,
    label: meta.title || 'Untitled Chat',
    icon: MessageCircle,
    type: 'chat',
    typeLabel: t('search.commandPalette.typeLabelChat'),
    action: () => {
      switchToChatSession(meta.id);
      closeAndClear();
    },
  };
}

export function CommandPalette() {
  const searchOpen = useUIStore((s) => s.searchOpen);
  const closeSearch = useUIStore((s) => s.closeSearch);
  const searchQuery = useUIStore((s) => s.searchQuery);
  const setSearchQuery = useUIStore((s) => s.setSearchQuery);
  const navigateTo = useUIStore((s) => s.navigateTo);
  const createChild = useNodeStore((s) => s.createChild);
  const authUser = useWorkspaceStore((s) => s.authUser);
  const signInWithGoogle = useWorkspaceStore((s) => s.signInWithGoogle);
  const signOutFn = useWorkspaceStore((s) => s.signOut);

  const paletteUsage = useUIStore((s) => s.paletteUsage);
  const trackPaletteUsage = useUIStore((s) => s.trackPaletteUsage);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiMode, setAiMode] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSessionMeta[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load chat sessions once on mount
  useEffect(() => {
    if (searchOpen) {
      void listChatSessionMetas().then(setChatSessions).catch(() => {});
    }
  }, [searchOpen]);

  // Reset AI mode when palette closes
  useEffect(() => {
    if (!searchOpen) setAiMode(false);
  }, [searchOpen]);

  // Close without clearing query (dismiss via Esc / backdrop / ⌘K)
  const closePalette = useCallback(() => {
    closeSearch();
    ensureUndoFocusAfterNavigation();
  }, [closeSearch]);

  // Close + clear query (used when an action is executed)
  const closeAndClear = useCallback(() => {
    setSearchQuery('');
    closePalette();
  }, [setSearchQuery, closePalette]);

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
  const quickNavIdSet = useMemo(
    () => new Set<string>(QUICK_NAV_SYSTEM_NODES.map((node) => node.id)),
    [],
  );

  const quickNavItems: PaletteItem[] = useMemo(() =>
    QUICK_NAV_SYSTEM_NODES.map((node) => ({
      id: node.id,
      label: node.defaultName,
      icon: SYSTEM_NODE_ICONS[node.iconKey] ?? Library,
      type: 'node',
      typeLabel: t('search.commandPalette.typeLabelNavigate'),
      action: () => { trackPaletteUsage(node.id); navigateTo(node.id); closeAndClear(); },
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
        typeLabel: t('search.commandPalette.typeLabelCommand'),
        action: () => { trackPaletteUsage(cmd.id); cmd.action(ctx); },
      })),
    [commands, ctx, trackPaletteUsage]);

  // Build searchable nodes snapshot once when palette opens (not on every keystroke)
  const [searchableNodes, setSearchableNodes] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!searchOpen) return;
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
    setSearchableNodes(items);
  }, [searchOpen, quickNavIdSet]);

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

  // Chat session items for search results (fuzzy match on title)
  const chatSearchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q || chatSessions.length === 0) return [];
    const items: PaletteItem[] = [];
    for (const meta of chatSessions) {
      if (!meta.title) continue;
      const match = fuzzyMatch(q, meta.title);
      if (match) {
        items.push({
          ...chatSessionToItem(meta, closeAndClear),
          score: match.score,
        });
      }
    }
    items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return items.slice(0, 5);
  }, [searchQuery, chatSessions, closeAndClear]);

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
          typeLabel: cmd.type === 'command'
            ? t('search.commandPalette.typeLabelCommand')
            : t('search.commandPalette.typeLabelNavigate'),
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
      type: 'create',
      typeLabel: 'New in Today',
      action: () => {
        const todayId = ensureTodayNode();
        createChild(todayId, undefined, { name: q });
        navigateTo(todayId);
        closeAndClear();
      },
    };
  }, [searchQuery, createChild, navigateTo, closeAndClear]);

  // "New Chat" item for AI mode empty state
  const newChatItem: PaletteItem = useMemo(() => ({
    id: '__new_chat__',
    label: 'New Chat',
    icon: MessageCircleDashed,
    type: 'command',
    typeLabel: t('search.commandPalette.typeLabelCommand'),
    action: () => {
      void openNewChatDrawer();
      closeAndClear();
    },
  }), [closeAndClear]);

  // "Ask AI" item — always shown when there's a query (in both modes)
  const askAiItem: PaletteItem | null = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return null;

    return {
      id: '__ask_ai__',
      label: `Ask AI: ${q}`,
      icon: MessageCircleDashed,
      type: 'command',
      typeLabel: t('search.commandPalette.typeLabelAskAI'),
      action: () => {
        void openChatWithPrompt(q);
        closeAndClear();
      },
    };
  }, [searchQuery, closeAndClear]);

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
        // Command or quick-nav item?
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
        const quickNavItem = quickNavItems.find((item) => item.id === id);
        if (quickNavItem) {
          suggestionItems.push({ ...quickNavItem });
          continue;
        }
        // Node?
        if (isWorkspaceHomeNode(id) || isLockedNode(id)) continue;
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

    // Add recent chat sessions to suggestions (max 2)
    const recentChats = chatSessions.slice(0, 2).map((meta) => chatSessionToItem(meta, closeAndClear));

    const cmdItems = [...quickNavItems, ...commandItems];
    return { suggestions: [...suggestionItems, ...recentChats], commands: cmdItems };
  }, [paletteUsage, getUsageBoost, commands, quickNavItems, commandItems, ctx, trackPaletteUsage, navigateTo, closeAndClear, chatSessions]);

  // AI mode items — only populated for empty state (recent chats).
  // With input, AI mode shows only askAiItem (user entered this mode to ask, not browse).
  const aiModeItems = useMemo(() => {
    if (searchQuery.trim()) return [];
    return chatSessions.slice(0, 10).map((meta) => chatSessionToItem(meta, closeAndClear));
  }, [searchQuery, chatSessions, closeAndClear]);

  // Flat list of all visible items (for keyboard navigation)
  const allItems: PaletteItem[] = useMemo(() => {
    if (aiMode) {
      const items = [...aiModeItems];
      if (!searchQuery.trim()) items.push(newChatItem);
      if (askAiItem) items.push(askAiItem);
      return items;
    }
    if (searchQuery.trim()) {
      const items: PaletteItem[] = [];
      if (searchResults.length > 0) items.push(...searchResults);
      if (chatSearchResults.length > 0) items.push(...chatSearchResults);
      const hasResults = items.length > 0;
      if (hasResults) {
        // Results exist: Create then Ask AI at bottom
        if (createItem) items.push(createItem);
        if (askAiItem) items.push(askAiItem);
      } else {
        // No results: Ask AI first — user likely wants to ask, not create an empty node
        if (askAiItem) items.push(askAiItem);
        if (createItem) items.push(createItem);
      }
      return items;
    }
    return [...sortedDefaultItems.suggestions, ...sortedDefaultItems.commands];
  }, [aiMode, searchQuery, askAiItem, searchResults, chatSearchResults, createItem, sortedDefaultItems, aiModeItems, newChatItem]);

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [allItems.length, searchQuery, aiMode]);

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
          closePalette();
        } else {
          useUIStore.getState().openSearch();
        }
      } else if (e.key === 'Escape' && searchOpen) {
        e.preventDefault();
        if (aiMode) {
          setAiMode(false);
        } else {
          closePalette();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen, closePalette, aiMode]);

  // Keyboard navigation within the palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Tab / Shift+Tab — toggle AI mode
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (aiMode) setAiMode(false);
        } else if (searchQuery.trim()) {
          // Tab with input: directly Ask AI (Raycast-style)
          void openChatWithPrompt(searchQuery.trim());
          closeAndClear();
        } else {
          setAiMode((prev) => !prev);
        }
        return;
      }

      // Backspace on empty input in AI mode: back to search (Raycast-style)
      if (e.key === 'Backspace' && aiMode && !searchQuery) {
        setAiMode(false);
        return;
      }

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
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && createItem && !aiMode) {
        // ⌘↵ — Create new node in Today
        e.preventDefault();
        createItem.action();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = allItems[selectedIndex];
        if (item) item.action();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.nativeEvent.stopImmediatePropagation(); // prevent document handler from double-firing
        if (aiMode) {
          setAiMode(false);
        } else {
          closePalette();
        }
      }
    },
    [allItems, selectedIndex, closePalette, closeAndClear, createItem, aiMode, searchQuery],
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

  // Grouped rendering: searchResults = nodes + commands, chatSearchResults = chat sessions
  const nodeResults = searchResults;
  const chatResults = chatSearchResults;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-foreground/30 p-2 sm:p-4 pt-[8vh] sm:pt-[12vh]"
      onPointerDown={closePalette}
    >
      <div
        className="animate-palette-expand flex flex-col w-full max-w-[600px] h-[min(480px,80vh)] rounded-xl bg-background shadow-paper overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="flex h-10 shrink-0 items-center gap-2.5 border-b border-border-subtle bg-background px-4">
          {aiMode && (
            <button
              onClick={() => setAiMode(false)}
              className="-ml-1 shrink-0 flex items-center justify-center h-6 w-6 rounded-md bg-foreground/8 text-foreground-secondary hover:bg-foreground/12 transition-colors"
            >
              <ArrowLeft size={14} strokeWidth={1.5} />
            </button>
          )}
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={aiMode ? t('search.commandPalette.aiModePlaceholder') : t('search.commandPalette.placeholder')}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground-tertiary"
          />
          {!aiMode && (
            <button
              onClick={() => setAiMode(true)}
              className="shrink-0 flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-foreground-tertiary hover:text-foreground-secondary hover:bg-foreground/4 transition-colors"
            >
              <span className="text-xs">Ask AI</span>
              <Kbd>Tab</Kbd>
            </button>
          )}
        </div>

        {/* Results area — fills remaining space */}
        <div ref={listRef} className="flex-1 overflow-y-auto py-1.5">
          {aiMode ? (
            // AI mode — empty state: browse recent chats; with input: pure Ask AI
            <div>
              {aiModeItems.length > 0 && (
                <>
                  <GroupHeader label={t('search.commandPalette.groupRecentChats')} />
                  {aiModeItems.map((item) => {
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
                </>
              )}
              {!hasQuery && (() => {
                const idx = globalIdx++;
                return (
                  <PaletteRow
                    key={newChatItem.id}
                    item={newChatItem}
                    selected={selectedIndex === idx}
                    onSelect={() => newChatItem.action()}
                    onHover={() => setSelectedIndex(idx)}
                  />
                );
              })()}
              {askAiItem && (() => {
                const idx = globalIdx++;
                return (
                  <PaletteRow
                    key={askAiItem.id}
                    item={askAiItem}
                    selected={selectedIndex === idx}
                    onSelect={() => askAiItem.action()}
                    onHover={() => setSelectedIndex(idx)}
                  />
                );
              })()}
            </div>
          ) : hasQuery ? (
            // Search mode with query
            (() => {
              const hasResults = nodeResults.length > 0 || chatResults.length > 0;
              // No results: Ask AI first (likely intent); with results: Create then Ask AI
              const bottomItems = (hasResults
                ? [createItem, askAiItem]
                : [askAiItem, createItem]
              ).filter(Boolean) as PaletteItem[];
              return (
                <div>
                  {nodeResults.length > 0 && (
                    <>
                      <GroupHeader label={t('search.commandPalette.groupNodes')} />
                      {nodeResults.map((item) => {
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
                    </>
                  )}
                  {chatResults.length > 0 && (
                    <>
                      <GroupHeader label={t('search.commandPalette.groupChats')} />
                      {chatResults.map((item) => {
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
                    </>
                  )}
                  {bottomItems.length > 0 && hasResults && (
                    <div className="mx-3 my-1 h-px bg-border-subtle" />
                  )}
                  {bottomItems.map((item) => {
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
              );
            })()
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

        {/* Action bar — Raycast-style bottom bar, right-aligned */}
        {allItems.length > 0 && (() => {
          const selected = allItems[selectedIndex];
          if (!selected) return null;
          return (
            <div className="flex h-10 shrink-0 items-center justify-end gap-3 border-t border-border-subtle bg-background px-4">
              {!aiMode && hasQuery && createItem && selected.id !== '__create__' && (
                <button
                  onClick={() => createItem.action()}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-foreground/4 transition-colors cursor-pointer"
                >
                  <span className="text-xs text-foreground-tertiary">{t('search.commandPalette.actionCreate')}</span>
                  <Kbd>⌘↵</Kbd>
                </button>
              )}
              <button
                onClick={() => selected.action()}
                className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-foreground/4 transition-colors cursor-pointer"
              >
                <span className="text-xs text-foreground-secondary">
                  {selected.id === '__ask_ai__' ? t('search.commandPalette.actionAskAI') : getActionLabel(selected.type)}
                </span>
                <Kbd>↵</Kbd>
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GroupHeader({ label }: { label: string }) {
  return (
    <div className="mx-2 px-2 py-1.5 text-xs font-medium text-foreground-tertiary">
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
      className={`mx-2 flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 transition-colors ${selected ? 'bg-primary-muted' : 'hover:bg-foreground/4'
        }`}
    >
      {/* Icon: command/container use explicit icon; tagDef uses colored #; nodes use colored bullet */}
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
            style={{
              background: item.bulletColors?.[0] ?? 'var(--color-foreground-secondary)',
            }}
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
