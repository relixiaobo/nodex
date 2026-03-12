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
import { formatResultText } from './shared.js';

const deleteToolParameters = Type.Object({
  nodeId: Type.String(),
  restore: Type.Optional(Type.Boolean()),
});

type DeleteToolParams = typeof deleteToolParameters.static;

async function executeDeleteTool(params: DeleteToolParams): Promise<AgentToolResult<unknown>> {
  const node = loroDoc.toNodexNode(params.nodeId);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);

  if (params.restore) {
    // Restore from trash
    withCommitOrigin(AI_COMMIT_ORIGIN, () => {
      useNodeStore.getState().restoreNode(params.nodeId);
    });

    return {
      content: [{ type: 'text', text: formatResultText({
        id: params.nodeId,
        name: node.name ?? '',
        restored: true,
      }) }],
      details: { id: params.nodeId, name: node.name ?? '', restored: true },
    };
  }

  // Move to trash
  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    useNodeStore.getState().trashNode(params.nodeId, { commit: false });
    commitDoc();
  });

  return {
    content: [{ type: 'text', text: formatResultText({
      id: params.nodeId,
      name: node.name ?? '',
      movedToTrash: true,
    }) }],
    details: { id: params.nodeId, name: node.name ?? '', movedToTrash: true },
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
