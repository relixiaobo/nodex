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
} from './shared.js';
import { parseTanaPaste } from './tana-paste-parser.js';
import { applyParsedNodeMutationsNoCommit, setParsedNodeNameNoCommit } from './tana-paste-apply.js';

const editToolParameters = Type.Object({
  nodeId: Type.String({ description: 'ID of the node to edit.' }),
  text: Type.Optional(Type.String({ description: 'Tana Paste patch. First line renames; later lines add tags, fields, checkbox, and child nodes.' })),
  removeTags: Type.Optional(Type.Array(Type.String(), { description: 'Tag display names to remove from the node.' })),
  parentId: Type.Optional(Type.String({ description: 'Move to this parent. If afterId is also provided, it must match the sibling parent.' })),
  afterId: Type.Optional(Type.String({ description: 'Move after this sibling node.' })),
});

type EditToolParams = typeof editToolParameters.static;

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

  const updated = new Set<string>();
  let createdFields: string[] = [];
  let unresolvedFields: string[] = [];

  withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const store = useNodeStore.getState();

    if (params.text?.trim()) {
      const parsed = parseTanaPaste(params.text);

      if (setParsedNodeNameNoCommit(params.nodeId, parsed)) {
        updated.add('name');
      }

      const mutationSummary = applyParsedNodeMutationsNoCommit(params.nodeId, {
        ...parsed,
        name: '',
        inlineRefs: [],
        targetId: undefined,
      });
      if (parsed.tags.length > 0) updated.add('tags');
      if (parsed.fields.length > 0 && mutationSummary.createdFields.length + mutationSummary.unresolvedFields.length + parsed.fields.length > 0) {
        updated.add('fields');
      }
      if (parsed.checked !== null) updated.add('checked');
      createdFields = mutationSummary.createdFields;
      unresolvedFields = mutationSummary.unresolvedFields;
    }

    if ((params.removeTags?.length ?? 0) > 0) {
      for (const tagName of params.removeTags ?? []) {
        const tagDefId = findTagDefIdByName(tagName);
        if (!tagDefId) continue;
        store.removeTag(params.nodeId, tagDefId, { commit: false });
        updated.add('tags');
      }
    }

    const moveTarget = resolveMoveTarget(params.parentId, params.afterId);
    if (moveTarget) {
      store.moveNodeTo(params.nodeId, moveTarget.parentId, moveTarget.index, { commit: false });
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
    '- First line renames the node',
    '- #tag adds a tag',
    '- field:: value sets a field',
    '- field:: clears a field when no values follow',
    '- [X] or [ ] sets checkbox state',
    '- Indented lines create new child nodes',
    '',
    'removeTags handles deletions that Tana Paste cannot express.',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: editToolParameters,
  execute: async (_toolCallId, params) => executeEditTool(params),
};
