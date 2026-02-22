import * as loroDoc from './loro-doc.js';

export const WORKSPACE_HOME_NAME = 'Workspace';

/**
 * Ensure the current workspace has a dedicated root/home node.
 *
 * Existing workspaces created before workspace-root support may only have
 * container roots (LIBRARY/INBOX/...). This helper backfills a workspace node
 * so breadcrumb avatar/root navigation always has a concrete target.
 */
export function ensureWorkspaceHomeNode(workspaceId: string | null): string | null {
  if (!workspaceId) return null;
  if (loroDoc.hasNode(workspaceId)) return workspaceId;

  loroDoc.createNode(workspaceId, null);
  loroDoc.setNodeRichTextContent(workspaceId, WORKSPACE_HOME_NAME, [], []);
  loroDoc.commitDoc('system:workspace-root-bootstrap');
  return workspaceId;
}
