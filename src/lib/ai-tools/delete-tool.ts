/**
 * node_delete — Move a node to Trash, or restore from Trash.
 *
 * Works on any node: content, field values, references.
 * Deleting a field value node clears that field.
 * Deleting a reference removes the link.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import * as loroDoc from '../loro-doc.js';
import { AI_COMMIT_ORIGIN, commitDoc, withCommitOrigin } from '../loro-doc.js';
import { useNodeStore } from '../../stores/node-store.js';
import { formatResultText, pushAiOp } from './shared.js';

const deleteToolParameters = Type.Object({
  nodeId: Type.String({ description: 'ID of the node to delete or restore.' }),
  restore: Type.Optional(Type.Boolean({ description: 'true = restore from Trash back to original parent. Omit or false = move to Trash.' })),
});

type DeleteToolParams = typeof deleteToolParameters.static;

async function executeDeleteTool(params: DeleteToolParams): Promise<AgentToolResult<unknown>> {
  const node = loroDoc.toNodexNode(params.nodeId);
  if (!node) throw new Error(`Node not found: ${params.nodeId}. Use node_search to find the correct ID.`);

  if (params.restore) {
    // Restore from trash
    withCommitOrigin(AI_COMMIT_ORIGIN, () => {
      useNodeStore.getState().restoreNode(params.nodeId);
    });
    pushAiOp('node_delete', params.nodeId, `restore "${node.name ?? ''}"`);
    const restoredParentId = loroDoc.getParentId(params.nodeId) ?? '';

    const output = {
      action: 'restored' as const,
      parentId: restoredParentId,
    };
    return {
      content: [{ type: 'text', text: formatResultText(output) }],
      details: output,
    };
  }

  // Move to trash
  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    useNodeStore.getState().trashNode(params.nodeId, { commit: false });
    commitDoc();
  });
  pushAiOp('node_delete', params.nodeId, `trash "${node.name ?? ''}"`);

  const output = {
    action: 'trashed' as const,
    name: node.name ?? '',
  };
  return {
    content: [{ type: 'text', text: formatResultText(output) }],
    details: output,
  };
}

export const deleteTool: AgentTool<typeof deleteToolParameters, unknown> = {
  name: 'node_delete',
  label: 'Delete Node',
  description: [
    'Move a node to Trash, or restore from Trash.',
    'Works on any node: content, field values, references.',
    'Deleting a field value node clears that field.',
    'Deleting a reference removes the link.',
    '',
    'Use restore: true to recover a trashed node.',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: deleteToolParameters,
  execute: async (_toolCallId, params) => executeDeleteTool(params),
};
