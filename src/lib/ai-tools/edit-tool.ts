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
  getTagDisplayNames,
  sanitizeDirectNodeDataPatch,
  updateCheckedState,
  resolveAndSetFields,
  formatResultText,
  pushAiOp,
} from './shared.js';

const editToolParameters = Type.Object({
  nodeId: Type.String({ description: 'ID of the node to edit.' }),
  name: Type.Optional(Type.String({ description: 'New name/title for the node.' })),
  checked: Type.Optional(Type.Union([Type.Boolean(), Type.Null()], { description: 'true = done, false = not done, null = remove checkbox entirely.' })),
  addTags: Type.Optional(Type.Array(Type.String(), { description: 'Tag display names to add, e.g. ["task"]. Template fields are synced after tagging.' })),
  removeTags: Type.Optional(Type.Array(Type.String(), { description: 'Tag display names to remove.' })),
  fields: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Set field values by display name, e.g. {"Status": "Done"}. Node must have tags.' })),
  parentId: Type.Optional(Type.String({ description: 'Move node to this new parent.' })),
  position: Type.Optional(Type.Integer({ minimum: 0, description: 'Zero-based position in new parent\'s children after move.' })),
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Raw node properties: description, color, fieldType, cardinality, showCheckbox, etc. Cannot change type/name/children/tags/timestamps.' })),
});

type EditToolParams = typeof editToolParameters.static;

async function executeEditTool(params: EditToolParams): Promise<AgentToolResult<unknown>> {
  const node = loroDoc.toNodexNode(params.nodeId);
  if (!node) throw new Error(`Node not found: ${params.nodeId}. Use node_search to find the correct ID.`);

  const updated = new Set<string>();
  let createdFields: string[] = [];
  let unresolvedFields: string[] = [];

  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();

    if (params.name !== undefined) {
      loroDoc.setNodeRichTextContent(params.nodeId, params.name, node.marks ?? [], node.inlineRefs ?? []);
      updated.add('name');
    }

    const { safeData } = sanitizeDirectNodeDataPatch(params.data, { allowType: false });
    if (Object.keys(safeData).length > 0) {
      loroDoc.setNodeDataBatch(params.nodeId, safeData);
      updated.add('data');
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
      const fieldResult = resolveAndSetFields(params.nodeId, params.fields);
      if (fieldResult.resolved.length > 0) updated.add('fields');
      if (fieldResult.created.length > 0) createdFields = fieldResult.created;
      if (fieldResult.unresolved.length > 0) unresolvedFields = fieldResult.unresolved;
    }

    if (params.parentId) {
      store.moveNodeTo(params.nodeId, params.parentId, params.position, { commit: false });
      updated.add('position');
    }

    if (updated.size > 0) {
      commitDoc();
    }
  });

  const freshNode = loroDoc.toNodexNode(params.nodeId);
  const freshName = freshNode?.name ?? '';
  if (updated.size > 0) {
    pushAiOp('node_edit', params.nodeId, freshName);
  }

  const result: Record<string, unknown> = {
    updated: Array.from(updated),
  };

  if (updated.size === 0) {
    result.hint = 'No changes applied — all provided values match the current state.';
  }

  // Include new state only for fields where the model needs confirmation
  if (updated.has('tags')) {
    result.tags = getTagDisplayNames(freshNode?.tags ?? []);
  }
  if (updated.has('position')) {
    result.parentId = loroDoc.getParentId(params.nodeId) ?? '';
  }

  if (createdFields.length > 0) {
    result.createdFields = createdFields;
  }
  if (unresolvedFields.length > 0) {
    result.unresolvedFields = unresolvedFields;
    result.hint = 'Some fields could not be resolved. The node has no tags — add a tag first (addTags), then set the field values.';
  }

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
    'Use data to set raw node properties like description, color, fieldType,',
    'cardinality, showCheckbox, or viewMode. data cannot change type, name,',
    'rich text internals, tree structure, tags, or timestamps.',
    '',
    'Use fields parameter to set field values by name — no need to know field entry IDs.',
    'Fields are tied to tags. The node must have at least one tag. If the field doesn\'t exist,',
    'it will be auto-created under the first tag (type inferred from name: date/url/number/options).',
    'Example: addTags: ["task"], fields: {"Status": "Todo"}.',
    'Or edit field value nodes directly: node_edit(nodeId: valueNodeId, name: "new value").',
    '',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: editToolParameters,
  execute: async (_toolCallId, params) => executeEditTool(params),
};
