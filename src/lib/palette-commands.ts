/**
 * Command palette registry — defines commands available in ⌘K.
 *
 * Commands are registered statically. Each command has:
 * - label: display name
 * - icon key: maps to lucide icon
 * - shortcut: optional keyboard shortcut display
 * - type: 'node' or 'command' (affects action bar label)
 * - action: callback executed on select
 * - when: optional visibility predicate
 */
import type { AppIcon } from './icons.js';
import {
  CalendarDays,
  CalendarCheck,
  MessageCircleDashed,
  Scissors,
} from './icons.js';
import { ensureTodayNode, getAdjacentDayNodeId } from './journal.js';
import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  type WebClipCaptureResponse,
} from './webclip-messaging.js';
import { createClipShell, fillClipShell } from './webclip-service.js';
import { openChatPanel } from './chat-panel-actions.js';
import { useNodeStore } from '../stores/node-store.js';
import { useUIStore } from '../stores/ui-store.js';
import { t } from '../i18n/strings.js';

export type PaletteItemType = 'node' | 'command' | 'create' | 'chat';

export interface PaletteItem {
  id: string;
  label: string;
  icon?: AppIcon;
  type: PaletteItemType;
  subtitle?: string;
  score?: number;
  /** Tag-derived bullet colors for node items (colored dot like outliner). */
  bulletColors?: string[];
  /** TagDef color — renders colored # hash instead of bullet. */
  tagDefColor?: { text: string };
  /** Override the default TYPE_LABELS display (e.g. "Tag", "Field"). */
  typeLabel?: string;
  action: () => void;
}

export interface PaletteCommand {
  id: string;
  label: string;
  icon: AppIcon;
  type: PaletteItemType;
  keywords?: string[];
  shortcut?: string;
  action: (ctx: CommandContext) => void;
  when?: (ctx: CommandContext) => boolean;
}

export interface CommandContext {
  navigateTo: (nodeId: string) => void;
  closeSearch: () => void;
  isSignedIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * Built-in system commands.
 */
export function getSystemCommands(): PaletteCommand[] {
  return [
    {
      id: 'cmd:today',
      label: 'Go to Today',
      icon: CalendarCheck,
      type: 'command',
      shortcut: '\u2318\u21E7D',
      keywords: ['today', 'journal', 'daily', 'day'],
      action: (ctx) => {
        const dayId = ensureTodayNode();
        ctx.navigateTo(dayId);
        ctx.closeSearch();
      },
    },
    {
      id: 'cmd:yesterday',
      label: 'Go to Yesterday',
      icon: CalendarDays,
      type: 'command',
      keywords: ['yesterday', 'journal', 'day'],
      action: (ctx) => {
        const todayId = ensureTodayNode();
        const yesterdayId = getAdjacentDayNodeId(todayId, -1);
        if (yesterdayId) ctx.navigateTo(yesterdayId);
        ctx.closeSearch();
      },
    },
    {
      id: 'cmd:clip-page',
      label: 'Clip Page to Today',
      icon: Scissors,
      type: 'command',
      keywords: ['clip', 'capture', 'save', 'page', 'web', 'today'],
      action: async (ctx) => {
        ctx.closeSearch();

        const canUseRuntime =
          typeof chrome !== 'undefined' &&
          !!chrome.runtime &&
          !!chrome.runtime.sendMessage;

        if (!canUseRuntime) return;

        // Phase 1: create empty placeholder + navigate immediately
        const store = useNodeStore.getState();
        const shellId = createClipShell(store);
        const todayId = ensureTodayNode();
        ctx.navigateTo(todayId);

        const uiStore = useUIStore.getState();
        uiStore.addLoadingNode(shellId);
        console.log('[clip] shell created, loading started:', shellId);

        // Phase 2: fetch content asynchronously and fill the shell
        try {
          const response = await chrome.runtime.sendMessage({
            type: WEBCLIP_CAPTURE_ACTIVE_TAB,
          }) as WebClipCaptureResponse;

          if (response?.ok) {
            await fillClipShell(shellId, response.payload, store);
            console.log('[clip] shell filled:', shellId);
          } else {
            console.warn('[clip] capture failed, removing empty shell');
            store.trashNode(shellId);
          }
        } catch {
          console.warn('[clip] capture error, removing empty shell');
          store.trashNode(shellId);
        } finally {
          uiStore.removeLoadingNode(shellId);
        }
      },
    },
    {
      id: 'cmd:new-chat',
      label: 'New Chat',
      icon: MessageCircleDashed,
      type: 'command',
      keywords: ['chat', 'ai', 'ask', 'conversation'],
      action: (ctx) => {
        ctx.closeSearch();
        void openChatPanel();
      },
    },
    // Sign in / Sign out: handled by ToolbarUserMenu avatar, not in command palette.
  ];
}

/**
 * Get all registered commands (containers + system).
 */
export function getAllCommands(ctx: CommandContext): PaletteCommand[] {
  return getSystemCommands().filter((cmd) => !cmd.when || cmd.when(ctx));
}

/**
 * Action bar label for a given item type (Raycast-style: "Open Node", "Run Command").
 */
export function getActionLabel(type: PaletteItemType, aiMode = false): string {
  if (aiMode) return t('search.commandPalette.actionAskAI');
  switch (type) {
    case 'node': return t('search.commandPalette.actionOpenNode');
    case 'chat': return t('search.commandPalette.actionOpenNode');
    case 'command': return t('search.commandPalette.actionRunCommand');
    case 'create': return t('search.commandPalette.actionRunCommand');
    default: return t('search.commandPalette.actionOpenNode');
  }
}
