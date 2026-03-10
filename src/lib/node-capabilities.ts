import * as loroDoc from './loro-doc.js';
import { getSystemNodePreset } from './system-node-presets.js';

export type SystemNodeRole = 'workspaceHome' | 'system';
export type NodeRole = SystemNodeRole | 'general';

export interface NodeCapabilities {
  role: NodeRole;
  canEditNode: boolean;
  canEditStructure: boolean;
  canEditFieldValues: boolean;
  canMove: boolean;
  canDelete: boolean;
}

export function isWorkspaceHomeNode(nodeId: string): boolean {
  const workspaceId = loroDoc.getCurrentWorkspaceId();
  return !!workspaceId && nodeId === workspaceId;
}

export function isLockedNode(nodeId: string): boolean {
  const preset = getSystemNodePreset(nodeId);
  if (preset?.locked) return true;
  return loroDoc.toNodexNode(nodeId)?.locked === true;
}

function resolveFieldValueOwnerId(nodeId: string): string | null {
  let cursor: string | null = nodeId;
  while (cursor) {
    const node = loroDoc.toNodexNode(cursor);
    if (!node) return null;
    if (node?.type !== 'fieldEntry') return cursor;
    cursor = loroDoc.getParentId(cursor);
  }
  return null;
}

export function getNodeCapabilities(nodeId: string): NodeCapabilities {
  if (isWorkspaceHomeNode(nodeId)) {
    return {
      role: 'workspaceHome',
      canEditNode: true,
      canEditStructure: true,
      canEditFieldValues: true,
      canMove: false,
      canDelete: false,
    };
  }

  const node = loroDoc.toNodexNode(nodeId);

  // queryCondition nodes are internal structure — not user-editable/movable/deletable
  if (node?.type === 'queryCondition') {
    return {
      role: 'general',
      canEditNode: false,
      canEditStructure: false,
      canEditFieldValues: false,
      canMove: false,
      canDelete: false,
    };
  }

  const preset = getSystemNodePreset(nodeId);
  if (preset?.locked || node?.locked === true) {
    return {
      role: 'system',
      canEditNode: false,
      canEditStructure: preset?.canEditStructure ?? false,
      canEditFieldValues: preset?.canEditFieldValues ?? false,
      canMove: false,
      canDelete: false,
    };
  }

  return {
    role: 'general',
    canEditNode: true,
    canEditStructure: true,
    canEditFieldValues: true,
    canMove: true,
    canDelete: true,
  };
}

export function canCreateChildrenUnder(parentId: string): boolean {
  const ownerId = resolveFieldValueOwnerId(parentId);
  if (!ownerId) return false;
  if (ownerId !== parentId) {
    return getNodeCapabilities(ownerId).canEditFieldValues;
  }
  return getNodeCapabilities(ownerId).canEditStructure;
}

export function canEditFieldEntryValue(fieldEntryId: string): boolean {
  const ownerId = resolveFieldValueOwnerId(fieldEntryId);
  if (!ownerId) return false;
  return getNodeCapabilities(ownerId).canEditFieldValues;
}
