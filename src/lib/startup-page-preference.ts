import { SYSTEM_NODE_IDS, NDX_F } from '../types/index.js';
import * as loroDoc from './loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from './system-schema-presets.js';

export const STARTUP_PAGE = {
  CHAT: 'chat',
  TODAY: 'today',
} as const;

export type StartupPagePreference = typeof STARTUP_PAGE[keyof typeof STARTUP_PAGE];

function findFieldEntry(nodeId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      return childId;
    }
  }
  return null;
}

export function getStartupPagePreference(): StartupPagePreference {
  const fieldEntryId = findFieldEntry(SYSTEM_NODE_IDS.SETTINGS, NDX_F.SETTING_STARTUP_PAGE);
  if (!fieldEntryId) return STARTUP_PAGE.CHAT;

  const fieldEntry = loroDoc.toNodexNode(fieldEntryId);
  const valueNodeId = fieldEntry?.children?.[0];
  if (!valueNodeId) return STARTUP_PAGE.CHAT;

  const valueNode = loroDoc.toNodexNode(valueNodeId);
  const targetId = valueNode?.targetId ?? valueNode?.name?.trim();
  if (targetId === SYSTEM_SCHEMA_NODE_IDS.SETTINGS_STARTUP_PAGE_TODAY_OPTION) {
    return STARTUP_PAGE.TODAY;
  }
  return STARTUP_PAGE.CHAT;
}
