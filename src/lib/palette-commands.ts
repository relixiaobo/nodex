/**
 * Command palette registry — defines commands available in ⌘K.
 *
 * Commands are registered statically. Each command has:
 * - label: display name
 * - icon key: maps to lucide icon
 * - shortcut: optional keyboard shortcut display
 * - type: 'container' or 'command' (affects action bar label)
 * - action: callback executed on select
 * - when: optional visibility predicate
 */
import type { AppIcon } from './icons.js';
import {
  Library,
  Inbox,
  CalendarDays,
  CalendarCheck,
  Trash2,
  Scissors,
} from './icons.js';
import { CONTAINER_IDS } from '../types/index.js';
import { COMMAND_PALETTE_QUICK_CONTAINERS } from './system-node-registry.js';
import { ensureTodayNode, getAdjacentDayNodeId } from './journal.js';
import {
  WEBCLIP_CAPTURE_ACTIVE_TAB,
  type WebClipCaptureResponse,
} from './webclip-messaging.js';
import { saveWebClip } from './webclip-service.js';
import { useNodeStore } from '../stores/node-store.js';
import { t } from '../i18n/strings.js';

export type PaletteItemType = 'node' | 'container' | 'command' | 'create';

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

const CONTAINER_ICONS: Record<string, AppIcon> = {
  library: Library,
  inbox: Inbox,
  journal: CalendarDays,
  trash: Trash2,
};

/**
 * Build container navigation commands from the registry.
 */
export function getContainerCommands(): PaletteCommand[] {
  return COMMAND_PALETTE_QUICK_CONTAINERS.map((c) => ({
    id: `nav:${c.id}`,
    label: t(c.labelKey),
    icon: CONTAINER_ICONS[c.iconKey] ?? Library,
    type: 'container' as const,
    keywords: [c.iconKey, 'go', 'navigate'],
    action: (ctx: CommandContext) => {
      ctx.navigateTo(c.id);
      ctx.closeSearch();
    },
  }));
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

        try {
          const response = await chrome.runtime.sendMessage({
            type: WEBCLIP_CAPTURE_ACTIVE_TAB,
          }) as WebClipCaptureResponse;

          if (!response?.ok) return;

          const store = useNodeStore.getState();
          await saveWebClip(response.payload, store);

          const todayId = ensureTodayNode();
          ctx.navigateTo(todayId);
        } catch {
          // Silently fail — chrome.runtime may not be available
        }
      },
    },
    // Sign in / Sign out: handled by ToolbarUserMenu avatar, not in command palette.
  ];
}

/**
 * Get all registered commands (containers + system).
 */
export function getAllCommands(ctx: CommandContext): PaletteCommand[] {
  const all = [...getContainerCommands(), ...getSystemCommands()];
  return all.filter((cmd) => !cmd.when || cmd.when(ctx));
}

/**
 * Action bar label for a given item type.
 */
export function getActionLabel(type: PaletteItemType): string {
  switch (type) {
    case 'node': return 'Open';
    case 'container': return 'Open';
    case 'command': return 'Run';
    case 'create': return 'Create';
    default: return 'Open';
  }
}
