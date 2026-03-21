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
  nodeId: Type.Union([
    Type.String(),
    Type.Array(Type.String()),
  ], { description: 'Node ID or array of node IDs to delete or restore. Use an array for batch operations.' }),
  restore: Type.Optional(Type.Boolean({ description: 'true = restore from Trash back to original parent. Omit or false = move to Trash.' })),
});

type DeleteToolParams = typeof deleteToolParameters.static;

function resolveNodeIds(input: string | string[]): string[] {
  return Array.isArray(input) ? input : [input];
}

async function executeDeleteTool(params: DeleteToolParams): Promise<AgentToolResult<unknown>> {
  const nodeIds = resolveNodeIds(params.nodeId);
  if (nodeIds.length === 0) {
    throw new Error('nodeId is required — provide at least one node ID.');
  }

  // Validate all nodes exist upfront
  const nodes = nodeIds.map((id) => {
    const node = loroDoc.toNodexNode(id);
    if (!node) throw new Error(`Node not found: ${id}. Use node_search to find the correct ID.`);
    return { id, name: node.name ?? '' };
  });

  if (params.restore) {
    withCommitOrigin(AI_COMMIT_ORIGIN, () => {
      const store = useNodeStore.getState();
      for (const { id } of nodes) {
        store.restoreNode(id);
      }
    });
    const results = nodes.map(({ id, name }) => {
      pushAiOp('node_delete', id, `restore "${name}"`);
      return { id, parentId: loroDoc.getParentId(id) ?? '' };
    });

    const output = {
      action: 'restored' as const,
      count: results.length,
      ...(results.length === 1 ? { parentId: results[0].parentId } : { items: results }),
    };
    return {
      content: [{ type: 'text', text: formatResultText(output) }],
      details: output,
    };
  }

  // Move to trash
  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();
    for (const { id } of nodes) {
      store.trashNode(id, { commit: false });
    }
    commitDoc();
  });
  for (const { id, name } of nodes) {
    pushAiOp('node_delete', id, `trash "${name}"`);
  }

  const output = {
    action: 'trashed' as const,
    count: nodes.length,
    ...(nodes.length === 1 ? { name: nodes[0].name } : { names: nodes.map((n) => n.name) }),
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
    'Move nodes to Trash, or restore from Trash. Supports single ID or array for batch.',
    'Works on any node: content, field values, references.',
    'Deleting a field value node clears that field.',
    'Deleting a reference removes the link.',
    '',
    'Use restore: true to recover trashed nodes.',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: deleteToolParameters,
  execute: async (_toolCallId, params) => executeDeleteTool(params),
};
