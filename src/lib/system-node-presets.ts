import { SYSTEM_NODE_IDS, SYSTEM_TAGS } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

export type SystemNodeIconKey =
  | 'library'
  | 'inbox'
  | 'journal'
  | 'search'
  | 'trash'
  | 'schema'
  | 'clips'
  | 'stash'
  | 'settings';

export interface SystemNodePreset {
  id: string;
  defaultName: string;
  iconKey: SystemNodeIconKey;
  bootstrap: boolean;
  locked: boolean;
  canEditStructure: boolean;
  canEditFieldValues: boolean;
  quickNav: boolean;
  paletteSearchable: boolean;
}

export const SYSTEM_NODE_PRESETS: ReadonlyArray<SystemNodePreset> = [
  { id: SYSTEM_NODE_IDS.LIBRARY, defaultName: 'Library', iconKey: 'library', bootstrap: false, locked: false, canEditStructure: true, canEditFieldValues: true, quickNav: false, paletteSearchable: true },
  { id: SYSTEM_NODE_IDS.INBOX, defaultName: 'Inbox', iconKey: 'inbox', bootstrap: false, locked: false, canEditStructure: true, canEditFieldValues: true, quickNav: false, paletteSearchable: true },
  { id: SYSTEM_NODE_IDS.JOURNAL, defaultName: 'Daily notes', iconKey: 'journal', bootstrap: true, locked: true, canEditStructure: false, canEditFieldValues: false, quickNav: true, paletteSearchable: true },
  { id: SYSTEM_NODE_IDS.SEARCHES, defaultName: 'Searches', iconKey: 'search', bootstrap: false, locked: false, canEditStructure: true, canEditFieldValues: true, quickNav: false, paletteSearchable: true },
  { id: SYSTEM_NODE_IDS.TRASH, defaultName: 'Trash', iconKey: 'trash', bootstrap: true, locked: true, canEditStructure: false, canEditFieldValues: false, quickNav: true, paletteSearchable: true },
  { id: SYSTEM_NODE_IDS.SCHEMA, defaultName: 'Schema', iconKey: 'schema', bootstrap: true, locked: true, canEditStructure: true, canEditFieldValues: false, quickNav: false, paletteSearchable: true },
  { id: SYSTEM_NODE_IDS.CLIPS, defaultName: 'Clips', iconKey: 'clips', bootstrap: false, locked: false, canEditStructure: true, canEditFieldValues: true, quickNav: false, paletteSearchable: true },
  { id: SYSTEM_NODE_IDS.STASH, defaultName: 'Stash', iconKey: 'stash', bootstrap: false, locked: false, canEditStructure: true, canEditFieldValues: true, quickNav: false, paletteSearchable: true },
  { id: SYSTEM_NODE_IDS.SETTINGS, defaultName: 'Settings', iconKey: 'settings', bootstrap: true, locked: true, canEditStructure: false, canEditFieldValues: true, quickNav: false, paletteSearchable: true },
  { id: SYSTEM_TAGS.DAY, defaultName: 'day', iconKey: 'journal', bootstrap: false, locked: true, canEditStructure: true, canEditFieldValues: true, quickNav: false, paletteSearchable: false },
  { id: SYSTEM_TAGS.WEEK, defaultName: 'week', iconKey: 'journal', bootstrap: false, locked: true, canEditStructure: true, canEditFieldValues: true, quickNav: false, paletteSearchable: false },
  { id: SYSTEM_TAGS.YEAR, defaultName: 'year', iconKey: 'journal', bootstrap: false, locked: true, canEditStructure: true, canEditFieldValues: true, quickNav: false, paletteSearchable: false },
] as const;

const presetMap = new Map(SYSTEM_NODE_PRESETS.map((preset) => [preset.id, preset]));

export const BOOTSTRAP_SYSTEM_NODES = SYSTEM_NODE_PRESETS.filter((preset) => preset.bootstrap);
export const QUICK_NAV_SYSTEM_NODES = SYSTEM_NODE_PRESETS.filter((preset) => preset.quickNav);

export function getSystemNodePreset(nodeId: string): SystemNodePreset | undefined {
  return presetMap.get(nodeId);
}

export function isPaletteSearchableSystemNode(nodeId: string): boolean {
  return getSystemNodePreset(nodeId)?.paletteSearchable === true;
}

export function getWorkspaceHomeNodeId(): string | null {
  const wsId = loroDoc.getCurrentWorkspaceId();
  if (!wsId || !loroDoc.hasNode(wsId)) return null;
  return wsId;
}

export function getWorkspaceTopLevelNodeIds(): string[] {
  const workspaceHomeId = getWorkspaceHomeNodeId();
  if (!workspaceHomeId) return [];
  return loroDoc.getChildren(workspaceHomeId);
}
