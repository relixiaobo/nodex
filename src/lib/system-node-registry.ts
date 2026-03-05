import { CONTAINER_IDS } from '../types/index.js';
import type { ContainerId } from '../types/index.js';
import type { TranslationKey } from '../i18n/strings.js';

export type ContainerIconKey = 'library' | 'inbox' | 'journal' | 'search' | 'trash' | 'schema' | 'clips' | 'stash' | 'settings' | 'about';

export interface SystemContainerMeta {
  id: ContainerId;
  defaultName: string;
  iconKey: ContainerIconKey;
  seedInWorkspace: boolean;
  sidebar?: {
    labelKey: TranslationKey;
    showTodayShortcut?: boolean;
  };
  commandPaletteQuick?: {
    labelKey: TranslationKey;
  };
}

export const SYSTEM_CONTAINER_REGISTRY: SystemContainerMeta[] = [
  {
    id: CONTAINER_IDS.LIBRARY,
    defaultName: 'Library',
    iconKey: 'library',
    seedInWorkspace: true,
    sidebar: { labelKey: 'sidebar.nav.library' },
    commandPaletteQuick: { labelKey: 'search.commandPalette.containerLibrary' },
  },
  {
    id: CONTAINER_IDS.INBOX,
    defaultName: 'Inbox',
    iconKey: 'inbox',
    seedInWorkspace: true,
    sidebar: { labelKey: 'sidebar.nav.inbox' },
    commandPaletteQuick: { labelKey: 'search.commandPalette.containerInbox' },
  },
  {
    id: CONTAINER_IDS.JOURNAL,
    defaultName: 'Daily notes',
    iconKey: 'journal',
    seedInWorkspace: true,
    sidebar: { labelKey: 'sidebar.nav.dailyNotes', showTodayShortcut: true },
    commandPaletteQuick: { labelKey: 'search.commandPalette.containerJournal' },
  },
  {
    id: CONTAINER_IDS.SEARCHES,
    defaultName: 'Searches',
    iconKey: 'search',
    seedInWorkspace: true,
    sidebar: { labelKey: 'sidebar.nav.searches' },
  },
  {
    id: CONTAINER_IDS.TRASH,
    defaultName: 'Trash',
    iconKey: 'trash',
    seedInWorkspace: true,
    sidebar: { labelKey: 'sidebar.nav.trash' },
    commandPaletteQuick: { labelKey: 'search.commandPalette.containerTrash' },
  },
  {
    id: CONTAINER_IDS.SCHEMA,
    defaultName: 'Schema',
    iconKey: 'schema',
    seedInWorkspace: true,
  },
  {
    id: CONTAINER_IDS.CLIPS,
    defaultName: 'Clips',
    iconKey: 'clips',
    seedInWorkspace: false,
  },
  {
    id: CONTAINER_IDS.STASH,
    defaultName: 'Stash',
    iconKey: 'stash',
    seedInWorkspace: false,
  },
  {
    id: CONTAINER_IDS.SETTINGS,
    defaultName: 'Settings',
    iconKey: 'settings',
    seedInWorkspace: true,
  },
  {
    id: CONTAINER_IDS.ABOUT,
    defaultName: 'About',
    iconKey: 'about',
    seedInWorkspace: true,
  },
] as const;

export const BOOTSTRAP_CONTAINER_DEFS = SYSTEM_CONTAINER_REGISTRY
  .filter((c) => c.seedInWorkspace)
  .map((c) => ({ id: c.id, name: c.defaultName }));

export const SIDEBAR_CONTAINER_ITEMS = SYSTEM_CONTAINER_REGISTRY
  .filter((c) => !!c.sidebar)
  .map((c) => ({
    id: c.id,
    iconKey: c.iconKey,
    labelKey: c.sidebar!.labelKey,
    showTodayShortcut: c.sidebar!.showTodayShortcut ?? false,
  }));

export const COMMAND_PALETTE_QUICK_CONTAINERS = SYSTEM_CONTAINER_REGISTRY
  .filter((c) => !!c.commandPaletteQuick)
  .map((c) => ({
    id: c.id,
    iconKey: c.iconKey,
    labelKey: c.commandPaletteQuick!.labelKey,
  }));

export function getSystemContainerMeta(containerId: ContainerId): SystemContainerMeta | undefined {
  return SYSTEM_CONTAINER_REGISTRY.find((c) => c.id === containerId);
}
