import { isContainerNode } from '../types/index.js';
import * as loroDoc from './loro-doc.js';

export type SystemNodeRole = 'workspaceHome' | 'container';
export type NodeRole = SystemNodeRole | 'general';

export interface NodeCapabilities {
  role: NodeRole;
  canEditNode: boolean;
  canMove: boolean;
  canDelete: boolean;
}

export function isWorkspaceHomeNode(nodeId: string): boolean {
  const workspaceId = loroDoc.getCurrentWorkspaceId();
  return !!workspaceId && nodeId === workspaceId;
}

export function getNodeCapabilities(nodeId: string): NodeCapabilities {
  if (isWorkspaceHomeNode(nodeId)) {
    return {
      role: 'workspaceHome',
      canEditNode: false,
      canMove: false,
      canDelete: false,
    };
  }

  if (isContainerNode(nodeId)) {
    return {
      role: 'container',
      canEditNode: false,
      canMove: false,
      canDelete: false,
    };
  }

  // queryCondition nodes are internal structure — not user-editable/movable/deletable
  const node = loroDoc.toNodexNode(nodeId);
  if (node?.type === 'queryCondition') {
    return {
      role: 'general',
      canEditNode: false,
      canMove: false,
      canDelete: false,
    };
  }

  return {
    role: 'general',
    canEditNode: true,
    canMove: true,
    canDelete: true,
  };
}
