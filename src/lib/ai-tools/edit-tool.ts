/**
 * node_edit — Modify an existing node.
 *
 * Only provided fields are changed. Works on any node including
 * field value nodes and reference nodes.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import * as loroDoc from '../loro-doc.js';
import { AI_COMMIT_ORIGIN, commitDoc, withCommitOrigin } from '../loro-doc.js';
import { applyTagMutationsNoCommit, syncTemplateMutationsNoCommit, useNodeStore } from '../../stores/node-store.js';
import {
  ensureTagDefIdByName,
  findTagDefIdByName,
  stripReferenceMarkup,
  updateCheckedState,
  resolveAndSetFields,
  formatResultText,
} from './shared.js';

const editToolParameters = Type.Object({
  nodeId: Type.String(),
  name: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  checked: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  addTags: Type.Optional(Type.Array(Type.String())),
  removeTags: Type.Optional(Type.Array(Type.String())),
  fields: Type.Optional(Type.Record(Type.String(), Type.String())),
  parentId: Type.Optional(Type.String()),
  position: Type.Optional(Type.Integer({ minimum: 0 })),
});

type EditToolParams = typeof editToolParameters.static;

async function executeEditTool(params: EditToolParams): Promise<AgentToolResult<unknown>> {
  const node = loroDoc.toNodexNode(params.nodeId);
  if (!node) throw new Error(`Node not found: ${params.nodeId}`);

  const updated = new Set<string>();

  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();

    if (params.name !== undefined) {
      loroDoc.setNodeRichTextContent(params.nodeId, params.name, node.marks ?? [], node.inlineRefs ?? []);
      updated.add('name');
    }

    if (params.content !== undefined) {
      loroDoc.setNodeData(params.nodeId, 'description', stripReferenceMarkup(params.content) || undefined);
      updated.add('content');
    }

    if (params.checked !== undefined && updateCheckedState(params.nodeId, params.checked)) {
      updated.add('checked');
    }

    if ((params.addTags?.length ?? 0) > 0) {
      for (const tagName of params.addTags ?? []) {
        const tagDefId = ensureTagDefIdByName(tagName);
        applyTagMutationsNoCommit(params.nodeId, tagDefId);
      }
      // Sync template fields after adding tags
      syncTemplateMutationsNoCommit(params.nodeId);
      updated.add('tags');
    }

    if ((params.removeTags?.length ?? 0) > 0) {
      for (const tagName of params.removeTags ?? []) {
        const tagDefId = findTagDefIdByName(tagName);
        if (!tagDefId) continue;
        store.removeTag(params.nodeId, tagDefId, { commit: false });
        updated.add('tags');
      }
    }

    if (params.fields && Object.keys(params.fields).length > 0) {
      resolveAndSetFields(params.nodeId, params.fields);
      updated.add('fields');
    }

    if (params.parentId) {
      store.moveNodeTo(params.nodeId, params.parentId, params.position, { commit: false });
      updated.add('position');
    }

    if (updated.size > 0) {
      commitDoc();
    }
  });

  const result = {
    id: params.nodeId,
    name: loroDoc.toNodexNode(params.nodeId)?.name ?? '',
    updated: Array.from(updated),
  };

  return {
    content: [{ type: 'text', text: formatResultText(result) }],
    details: result,
  };
}

export const editTool: AgentTool<typeof editToolParameters, unknown> = {
  name: 'node_edit',
  label: 'Edit Node',
  description: [
    'Modify an existing node. Only provided fields are changed. Works on any node',
    'including field value nodes and reference nodes.',
    '',
    'Use fields parameter to set field values by name — no need to know field entry IDs.',
    'Or edit field value nodes directly: node_edit(nodeId: valueNodeId, name: "new value").',
    '',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: editToolParameters,
  execute: async (_toolCallId, params) => executeEditTool(params),
};
