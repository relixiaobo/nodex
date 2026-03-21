/**
 * node_edit — Modify an existing node using Tana Paste patch semantics.
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
  text: Type.Optional(Type.String({ description: 'Tana Paste patch. A plain first line renames the node. Tag-only, checkbox-only, and field-only first lines do not rename. Indented lines append child nodes.' })),
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
    'Modify an existing node using Tana Paste patch semantics.',
    'Text rules:',
    '- A plain first line renames the node.',
    '- A first line that is only #tag, [X] / [ ], or field:: ... does not rename; it only applies that mutation.',
    '- An exact first line of [[Name^nodeId]] renames the node to a single reference chip.',
    '- Top-level lines after the first line may only add root metadata: #tags, [X] / [ ], or field:: lines.',
    '- field:: value sets a field.',
    '- field:: with no inline value and no indented values clears that field.',
    '- Indented lines append new child nodes; they do not replace existing children.',
    '- Child indentation uses 2 spaces per level.',
    '',
    'Use data for non-content properties such as description, color, codeLanguage, or showCheckbox.',
    'Search node rule editing is not supported yet; recreate the search node if the rules need to change.',
    '',
    'removeTags handles deletions that Tana Paste cannot express.',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: editToolParameters,
  execute: async (_toolCallId, params) => executeEditTool(params),
};
