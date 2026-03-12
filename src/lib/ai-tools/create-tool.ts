/**
 * node_create — Create new nodes in the knowledge graph.
 *
 * Supports single nodes, trees (via children), field values,
 * references, siblings, and duplicates — everything is a node.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import { ensureTodayNode } from '../journal.js';
import { AI_COMMIT_ORIGIN, commitDoc, withCommitOrigin } from '../loro-doc.js';
import * as loroDoc from '../loro-doc.js';
import { applyTagMutationsNoCommit, useNodeStore } from '../../stores/node-store.js';
import { syncTemplateMutationsNoCommit } from '../../stores/node-store.js';
import {
  ensureTagDefIdByName,
  getTagDisplayNames,
  stripReferenceMarkup,
  resolveAndSetFields,
  formatResultText,
} from './shared.js';

const MAX_CHILDREN_DEPTH = 3;

const createChildInputSchema: ReturnType<typeof Type.Object> = Type.Object({
  name: Type.Optional(Type.String()),
  tags: Type.Optional(Type.Array(Type.String())),
  content: Type.Optional(Type.String()),
  fields: Type.Optional(Type.Record(Type.String(), Type.String())),
  targetId: Type.Optional(Type.String()),
  children: Type.Optional(Type.Array(Type.Any())),
});

const createToolParameters = Type.Object({
  name: Type.Optional(Type.String()),
  parentId: Type.Optional(Type.String()),
  afterId: Type.Optional(Type.String()),
  position: Type.Optional(Type.Integer({ minimum: 0 })),
  tags: Type.Optional(Type.Array(Type.String())),
  content: Type.Optional(Type.String()),
  fields: Type.Optional(Type.Record(Type.String(), Type.String())),
  targetId: Type.Optional(Type.String()),
  duplicateId: Type.Optional(Type.String()),
  children: Type.Optional(Type.Array(createChildInputSchema)),
});

type CreateToolParams = typeof createToolParameters.static;

interface CreateChildInput {
  name?: string;
  tags?: string[];
  content?: string;
  fields?: Record<string, string>;
  targetId?: string;
  children?: CreateChildInput[];
}

interface SetupResult {
  childrenCreated: number;
  unresolvedFields: string[];
}

/**
 * Apply tags, sync template fields, set field values, and create children on a node.
 * Must be called inside withCommitOrigin(AI_COMMIT_ORIGIN, ...) — does NOT commit.
 */
function applyNodeSetup(
  nodeId: string,
  opts: { tags?: string[]; fields?: Record<string, string>; children?: CreateChildInput[] },
  childDepth: number,
): SetupResult {
  for (const tagName of opts.tags ?? []) {
    applyTagMutationsNoCommit(nodeId, ensureTagDefIdByName(tagName));
  }
  if (opts.tags?.length) {
    syncTemplateMutationsNoCommit(nodeId);
  }
  let unresolvedFields: string[] = [];
  if (opts.fields && Object.keys(opts.fields).length > 0) {
    const fieldResult = resolveAndSetFields(nodeId, opts.fields);
    unresolvedFields = fieldResult.unresolved;
  }
  const childrenCreated = opts.children?.length
    ? createChildrenRecursive(nodeId, opts.children, childDepth)
    : 0;
  return { childrenCreated, unresolvedFields };
}

/**
 * Recursively create children under a parent node.
 * Must be called inside withCommitOrigin(AI_COMMIT_ORIGIN, ...) — does NOT commit.
 */
function createChildrenRecursive(
  parentId: string,
  children: CreateChildInput[],
  depth: number,
): number {
  if (depth > MAX_CHILDREN_DEPTH) return 0;

  const store = useNodeStore.getState();
  let count = 0;

  for (const child of children) {
    if (child.targetId) {
      store.addReference(parentId, child.targetId);
      count++;
    } else {
      const created = store.createChild(parentId, undefined, {
        name: child.name?.trim(),
        description: child.content ? stripReferenceMarkup(child.content) : undefined,
      }, { commit: false });

      count += 1 + applyNodeSetup(created.id, child, depth + 1).childrenCreated;
    }
  }

  return count;
}

async function executeCreateTool(params: CreateToolParams): Promise<AgentToolResult<unknown>> {
  // ── Duplicate mode ──
  if (params.duplicateId) {
    const result = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
      return useNodeStore.getState().duplicateNode(params.duplicateId!);
    });
    if (!result) throw new Error(`Failed to duplicate node: ${params.duplicateId}`);
    return {
      content: [{ type: 'text', text: formatResultText({
        id: result.id,
        name: result.name ?? '',
        duplicatedFrom: params.duplicateId,
      }) }],
      details: { id: result.id, name: result.name ?? '' },
    };
  }

  // ── Reference mode (targetId without children) ──
  if (params.targetId && !params.children?.length) {
    const parentId = params.parentId ?? ensureTodayNode();
    const refId = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
      return useNodeStore.getState().addReference(parentId, params.targetId!, params.position);
    });
    if (!refId) throw new Error(`Failed to create reference to: ${params.targetId}`);
    const targetNode = loroDoc.toNodexNode(params.targetId);
    return {
      content: [{ type: 'text', text: formatResultText({
        id: refId,
        name: targetNode?.name ?? '',
        parentId,
        isReference: true,
        targetId: params.targetId,
      }) }],
      details: { id: refId, parentId, targetId: params.targetId },
    };
  }

  // ── Sibling mode ──
  if (params.afterId) {
    const result = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
      const created = useNodeStore.getState().createSibling(params.afterId!, {
        name: params.name?.trim(),
        description: params.content ? stripReferenceMarkup(params.content) : undefined,
      });
      const setup = applyNodeSetup(created.id, params as CreateChildInput, 1);
      commitDoc();
      return { node: created, ...setup };
    });
    return buildCreateResult(result.node.id, params, result.childrenCreated, result.unresolvedFields);
  }

  // ── Standard create ──
  const parentId = params.parentId ?? ensureTodayNode();
  if (!params.name && !params.children?.length && !params.targetId) {
    throw new Error('name or children is required for node_create');
  }

  const result = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const created = useNodeStore.getState().createChild(parentId, params.position, {
      name: params.name?.trim(),
      description: params.content ? stripReferenceMarkup(params.content) : undefined,
    }, { commit: false });
    const setup = applyNodeSetup(created.id, params as CreateChildInput, 1);
    commitDoc();
    return { node: created, ...setup };
  });
  return buildCreateResult(result.node.id, params, result.childrenCreated, result.unresolvedFields);
}

function buildCreateResult(nodeId: string, params: CreateToolParams, childrenCreated: number, unresolvedFields: string[] = []): AgentToolResult<unknown> {
  const parentId = loroDoc.getParentId(nodeId) ?? '';
  const parentNode = parentId ? loroDoc.toNodexNode(parentId) : null;
  const freshNode = loroDoc.toNodexNode(nodeId);
  const output: Record<string, unknown> = {
    id: nodeId,
    name: freshNode?.name ?? params.name ?? '',
    parentId,
    parentName: parentNode?.name ?? parentId,
    tags: getTagDisplayNames(freshNode?.tags ?? []),
    childrenCreated,
  };
  if (unresolvedFields.length > 0) {
    output.unresolvedFields = unresolvedFields;
    output.hint = 'Some fields could not be resolved. Fields must be defined by the node\'s tags. Ensure the correct tags are applied first.';
  }
  return {
    content: [{ type: 'text', text: formatResultText(output) }],
    details: output,
  };
}

export const createTool: AgentTool<typeof createToolParameters, unknown> = {
  name: 'node_create',
  label: 'Create Node',
  description: [
    'Create new nodes. Supports single nodes, trees (via children), field values,',
    'references, siblings, and duplicates — everything is a node.',
    '',
    'IMPORTANT: fields are defined by tags. Always include tags when using fields.',
    'Example: tags: ["task"], fields: {"Status": "Todo"} — the #task tag defines the Status field.',
    '',
    'Quick patterns:',
    '- Content node: node_create(name: "...", parentId: "...")',
    '- With tags + fields: node_create(name: "...", tags: ["task"], fields: {"Status": "Todo"})',
    '- Tree: node_create(parentId: "...", children: [{name: "...", children: [...]}])',
    '- Reference: node_create(parentId: "...", targetId: "nodeId")',
    '- Sibling: node_create(afterId: "...", name: "...")',
    '- Duplicate: node_create(duplicateId: "nodeId")',
    '- Field value (direct): node_create(parentId: "fieldEntryId", name: "value")',
    '',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: createToolParameters,
  execute: async (_toolCallId, params) => executeCreateTool(params),
};
