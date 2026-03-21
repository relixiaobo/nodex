/**
 * node_edit — Modify an existing node.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import * as loroDoc from '../loro-doc.js';
import { AI_COMMIT_ORIGIN, commitDoc, withCommitOrigin } from '../loro-doc.js';
import { useNodeStore } from '../../stores/node-store.js';
import {
  findTagDefIdByName,
  formatResultText,
  getTagDisplayNames,
  pushAiOp,
  sanitizeDirectNodeDataPatch,
  toCheckedValue,
} from './shared.js';
import { parseTanaPaste } from './tana-paste-parser.js';
import { applyParsedNodeMutationsNoCommit, setParsedNodeNameNoCommit } from './tana-paste-apply.js';

const editToolParameters = Type.Object({
  nodeId: Type.String({ description: 'ID of the node to edit.' }),
  text: Type.Optional(Type.String({ description: [
    'Same text format as node_create (see node_create text parameter for full reference).',
    'Semantics are incremental — add/set, not replace:',
    '',
    'Line 1 with plain text = rename the node.',
    'Line 1 that is ONLY #tag, [X]/[ ], or field:: = does NOT rename.',
    '#tag = add tag.',
    'field:: value = set field value.',
    'field:: (empty, no indented values) = clear that field.',
    '[X] = check, [ ] = uncheck.',
    'Indented lines = append new children (existing children are NOT removed).',
    '',
    'Examples:',
    'Rename: "New name"',
    'Add tag + set field: "#task\\nStatus:: Done\\n[X]"',
    'Set field only (no rename): "Priority:: High"',
    'Clear field: "Priority::"',
    'Add children without rename: "#task\\n  - Subtask 1\\n  - Subtask 2"',
  ].join('\n') })),
  removeTags: Type.Optional(Type.Array(Type.String(), { description: 'Tag display names to remove from the node.' })),
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Optional non-content node properties such as description, color, codeLanguage, or showCheckbox.' })),
  parentId: Type.Optional(Type.String({ description: 'Move to this parent. If afterId is also provided, it must match the sibling parent.' })),
  afterId: Type.Optional(Type.String({ description: 'Move after this sibling node.' })),
});

type EditToolParams = typeof editToolParameters.static;

interface NodeStateSnapshot {
  name: string;
  inlineRefsJson: string;
  tagsJson: string;
  checked: boolean | null;
  parentId: string | null;
  index: number;
  fieldsJson: string;
}

function snapshotNodeState(nodeId: string): NodeStateSnapshot {
  const node = loroDoc.toNodexNode(nodeId);
  if (!node) {
    throw new Error(`Node not found: ${nodeId}. Use node_search to find the correct ID.`);
  }

  const parentId = loroDoc.getParentId(nodeId);
  const index = parentId ? loroDoc.getRawChildIndex(parentId, nodeId) : -1;
  const fieldEntries = loroDoc.getChildren(nodeId)
    .map((childId) => loroDoc.toNodexNode(childId))
    .filter((child): child is NonNullable<typeof child> => child !== null && child.type === 'fieldEntry')
    .map((fieldEntry) => ({
      fieldDefId: fieldEntry.fieldDefId ?? '',
      values: loroDoc.getChildren(fieldEntry.id).map((valueId) => {
        const value = loroDoc.toNodexNode(valueId);
        return {
          name: value?.name ?? '',
          targetId: value?.targetId ?? null,
          inlineRefs: value?.inlineRefs ?? [],
        };
      }),
    }))
    .sort((a, b) => a.fieldDefId.localeCompare(b.fieldDefId));

  return {
    name: node.name ?? '',
    inlineRefsJson: JSON.stringify(node.inlineRefs ?? []),
    tagsJson: JSON.stringify([...node.tags].sort()),
    checked: toCheckedValue(nodeId),
    parentId,
    index,
    fieldsJson: JSON.stringify(fieldEntries),
  };
}

function resolveMoveTarget(parentId: string | undefined, afterId: string | undefined): { parentId: string; index?: number } | null {
  if (!parentId && !afterId) {
    return null;
  }

  if (!afterId) {
    return { parentId: parentId! };
  }

  const siblingParentId = loroDoc.getParentId(afterId);
  if (!siblingParentId) {
    throw new Error(`Node not found or has no parent: ${afterId}. Cannot move after it.`);
  }
  if (parentId && parentId !== siblingParentId) {
    throw new Error(`afterId ${afterId} is not a child of parentId ${parentId}.`);
  }

  const rawIndex = loroDoc.getRawChildIndex(siblingParentId, afterId);
  return {
    parentId: siblingParentId,
    index: rawIndex >= 0 ? rawIndex + 1 : undefined,
  };
}

async function executeEditTool(params: EditToolParams): Promise<AgentToolResult<unknown>> {
  const node = loroDoc.toNodexNode(params.nodeId);
  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}. Use node_search to find the correct ID.`);
  }
  if (node.type === 'search' && params.text?.trim()) {
    throw new Error('Editing search node rules via node_edit is not supported yet. Recreate the search node with node_create(type: "search").');
  }

  const before = snapshotNodeState(params.nodeId);
  const { safeData } = sanitizeDirectNodeDataPatch(params.data, { allowType: false });
  const beforeDataJson = JSON.stringify(
    Object.fromEntries(Object.keys(safeData).sort().map((key) => [key, (node as unknown as Record<string, unknown>)[key] ?? null])),
  );
  let createdFields: string[] = [];
  let unresolvedFields: string[] = [];
  let shouldCommit = false;

  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();

    if (params.text?.trim()) {
      shouldCommit = true;
      const parsed = parseTanaPaste(params.text);

      setParsedNodeNameNoCommit(params.nodeId, parsed);

      const mutationSummary = applyParsedNodeMutationsNoCommit(params.nodeId, {
        ...parsed,
        name: '',
        inlineRefs: [],
        targetId: undefined,
      });
      createdFields = mutationSummary.createdFields;
      unresolvedFields = mutationSummary.unresolvedFields;
    }

    if ((params.removeTags?.length ?? 0) > 0) {
      shouldCommit = true;
      for (const tagName of params.removeTags ?? []) {
        const tagDefId = findTagDefIdByName(tagName);
        if (!tagDefId) continue;
        store.removeTag(params.nodeId, tagDefId, { commit: false });
      }
    }

    if (Object.keys(safeData).length > 0) {
      shouldCommit = true;
      loroDoc.setNodeDataBatch(params.nodeId, safeData);
    }

    const moveTarget = resolveMoveTarget(params.parentId, params.afterId);
    if (moveTarget) {
      shouldCommit = true;
      store.moveNodeTo(params.nodeId, moveTarget.parentId, moveTarget.index, { commit: false });
    }

    if (shouldCommit) {
      commitDoc();
    }
  });

  const after = snapshotNodeState(params.nodeId);
  const freshNode = loroDoc.toNodexNode(params.nodeId);
  const afterDataJson = JSON.stringify(
    Object.fromEntries(Object.keys(safeData).sort().map((key) => [key, (freshNode as unknown as Record<string, unknown> | null)?.[key] ?? null])),
  );
  const updated = new Set<string>();
  if (before.name !== after.name || before.inlineRefsJson !== after.inlineRefsJson) {
    updated.add('name');
  }
  if (before.tagsJson !== after.tagsJson) {
    updated.add('tags');
  }
  if (before.checked !== after.checked) {
    updated.add('checked');
  }
  if (before.fieldsJson !== after.fieldsJson) {
    updated.add('fields');
  }
  if (before.parentId !== after.parentId || before.index !== after.index) {
    updated.add('position');
  }
  if (beforeDataJson !== afterDataJson) {
    updated.add('data');
  }

  const freshName = freshNode?.name ?? '';
  if (updated.size > 0) {
    pushAiOp('node_edit', params.nodeId, freshName);
  }

  const result: Record<string, unknown> = {
    status: updated.size > 0 ? 'updated' : 'unchanged',
    updated: Array.from(updated),
  };

  if (updated.size === 0) {
    result.nextStep = 'Change the requested values or send only the mutations you still want to apply.';
    result.fallback = 'If you expected a change, read the node again and compare the current state before retrying.';
    result.hint = 'No changes applied — all provided values match the current state.';
  }
  if (updated.has('tags')) {
    result.tags = getTagDisplayNames(freshNode?.tags ?? []);
  }
  if (updated.has('position')) {
    result.parentId = loroDoc.getParentId(params.nodeId) ?? '';
  }
  if (createdFields.length > 0) {
    result.createdFields = [...new Set(createdFields)];
  }
  if (unresolvedFields.length > 0) {
    result.unresolvedFields = [...new Set(unresolvedFields)];
    result.boundary = 'Field patches only apply when the node already has a tag whose schema defines that field.';
    result.nextStep = 'Add a tag that defines the missing field, then call node_edit again with the field line.';
    result.fallback = 'If you are unsure which tag defines the field, add the likely tag first and retry the field patch.';
    result.hint = 'Some fields could not be resolved. Add a tag first, then set the field values.';
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
    'Modify an existing node. Only provided parameters are applied.',
    '',
    'See text parameter for edit-specific format rules and examples.',
    'Use removeTags to remove tags (text cannot express deletion).',
    'Use parentId + afterId to move the node.',
    'Use data for non-content properties (description, color, codeLanguage, showCheckbox).',
    'Search node rule editing is not supported — delete and recreate with node_create(type: "search").',
    '',
    'All write operations are undoable with the undo tool.',
  ].join('\n'),
  parameters: editToolParameters,
  execute: async (_toolCallId, params) => executeEditTool(params),
};
