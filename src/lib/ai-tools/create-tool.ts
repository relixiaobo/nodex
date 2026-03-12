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
  sanitizeDirectNodeDataPatch,
  resolveAndSetFields,
  formatResultText,
  pushAiOp,
} from './shared.js';

const MAX_CHILDREN_DEPTH = 3;

const createChildInputSchema: ReturnType<typeof Type.Object> = Type.Object({
  name: Type.Optional(Type.String({ description: 'Child node name/title.' })),
  tags: Type.Optional(Type.Array(Type.String(), { description: 'Tag names to apply to this child.' })),
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Raw node properties (type, description, color, etc.).' })),
  fields: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Field values by display name, e.g. {"Status": "Todo"}.' })),
  targetId: Type.Optional(Type.String({ description: 'Create a reference to this node instead of a content node.' })),
  children: Type.Optional(Type.Array(Type.Any(), { description: 'Nested children (max 3 levels deep).' })),
});

const createToolParameters = Type.Object({
  name: Type.Optional(Type.String({ description: 'Node name/title. Required for content nodes.' })),
  parentId: Type.Optional(Type.String({ description: 'Parent node ID. Defaults to today\'s journal node. Mutually exclusive with afterId.' })),
  afterId: Type.Optional(Type.String({ description: 'Create as sibling after this node (same parent). Mutually exclusive with parentId.' })),
  position: Type.Optional(Type.Integer({ minimum: 0, description: 'Zero-based insertion index in parent\'s children. Defaults to end.' })),
  tags: Type.Optional(Type.Array(Type.String(), { description: 'Tag display names to apply, e.g. ["task", "source"]. Auto-creates unknown tags.' })),
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Raw node properties: type, description, color, fieldType, cardinality, showCheckbox, etc. Cannot set name/children/tags/timestamps.' })),
  fields: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Set field values by display name, e.g. {"Status": "Todo"}. Requires tags — fields resolve from tag templates.' })),
  targetId: Type.Optional(Type.String({ description: 'Create a reference node pointing to this target ID.' })),
  duplicateId: Type.Optional(Type.String({ description: 'Duplicate an existing node (deep copy).' })),
  children: Type.Optional(Type.Array(createChildInputSchema, { description: 'Child nodes to create recursively (max 3 levels deep).' })),
});

type CreateToolParams = typeof createToolParameters.static;

interface CreateChildInput {
  name?: string;
  tags?: string[];
  data?: Record<string, unknown>;
  fields?: Record<string, string>;
  targetId?: string;
  children?: CreateChildInput[];
}

interface SetupResult {
  childrenCreated: number;
  createdFields: string[];
  unresolvedFields: string[];
}

function buildCreateNodeData(input: Pick<CreateChildInput, 'name' | 'data'>): Record<string, unknown> {
  const { safeData } = sanitizeDirectNodeDataPatch(input.data, { allowType: true });
  const result: Record<string, unknown> = { ...safeData };

  if (input.name !== undefined) {
    result.name = input.name.trim();
  }

  return result;
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
  let createdFields: string[] = [];
  let unresolvedFields: string[] = [];
  if (opts.fields && Object.keys(opts.fields).length > 0) {
    const fieldResult = resolveAndSetFields(nodeId, opts.fields);
    createdFields = fieldResult.created;
    unresolvedFields = fieldResult.unresolved;
  }
  const childrenCreated = opts.children?.length
    ? createChildrenRecursive(nodeId, opts.children, childDepth)
    : 0;
  return { childrenCreated, createdFields, unresolvedFields };
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
      const created = store.createChild(parentId, undefined, buildCreateNodeData(child), { commit: false });

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
    if (!result) throw new Error(`Node not found: ${params.duplicateId}. Cannot duplicate a node that does not exist.`);
    pushAiOp('node_create', result.id, result.name ?? '');
    const dupParentId = loroDoc.getParentId(result.id) ?? '';
    const output = {
      id: result.id,
      name: result.name ?? '',
      parentId: dupParentId,
      duplicatedFrom: params.duplicateId,
    };
    return {
      content: [{ type: 'text', text: formatResultText(output) }],
      details: output,
    };
  }

  // ── Reference mode (targetId without children) ──
  if (params.targetId && !params.children?.length) {
    const parentId = params.parentId ?? ensureTodayNode();
    const refId = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
      return useNodeStore.getState().addReference(parentId, params.targetId!, params.position);
    });
    if (!refId) throw new Error(`Node not found: ${params.targetId}. Cannot create a reference to a node that does not exist.`);
    pushAiOp('node_create', refId, `ref → ${params.targetId}`);
    const targetNode = loroDoc.toNodexNode(params.targetId);
    const output = {
      id: refId,
      name: targetNode?.name ?? '',
      parentId,
      isReference: true,
      targetId: params.targetId,
    };
    return {
      content: [{ type: 'text', text: formatResultText(output) }],
      details: output,
    };
  }

  // ── Sibling mode ──
  if (params.afterId) {
    const result = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
      const created = useNodeStore.getState().createSibling(params.afterId!, buildCreateNodeData(params));
      const setup = applyNodeSetup(created.id, params as CreateChildInput, 1);
      commitDoc();
      return { node: created, ...setup };
    });
    pushAiOp('node_create', result.node.id, params.name ?? '');
    return buildCreateResult(result.node.id, params, result.childrenCreated, result.createdFields, result.unresolvedFields);
  }

  // ── Standard create ──
  const parentId = params.parentId ?? ensureTodayNode();
  if (!params.name && !params.children?.length && !params.targetId) {
    throw new Error('Provide at least one of: name, children, or targetId. Cannot create an empty node.');
  }

  const result = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const created = useNodeStore.getState().createChild(parentId, params.position, buildCreateNodeData(params), { commit: false });
    const setup = applyNodeSetup(created.id, params as CreateChildInput, 1);
    commitDoc();
    return { node: created, ...setup };
  });
  pushAiOp('node_create', result.node.id, params.name ?? '');
  return buildCreateResult(result.node.id, params, result.childrenCreated, result.createdFields, result.unresolvedFields);
}

function buildCreateResult(nodeId: string, params: CreateToolParams, childrenCreated: number, createdFields: string[] = [], unresolvedFields: string[] = []): AgentToolResult<unknown> {
  const parentId = loroDoc.getParentId(nodeId) ?? '';
  const freshNode = loroDoc.toNodexNode(nodeId);
  const output: Record<string, unknown> = { id: nodeId };
  // parentId is useful when defaulted to today (model didn't pass it)
  if (!params.afterId) {
    output.parentId = parentId;
  }
  // Only include childrenCreated if > 0 (otherwise noise)
  if (childrenCreated > 0) {
    output.childrenCreated = childrenCreated;
  }
  if (createdFields.length > 0) {
    output.createdFields = createdFields;
  }
  if (unresolvedFields.length > 0) {
    output.unresolvedFields = unresolvedFields;
    output.hint = 'Fields not resolved — the node has no tags. Add a tag first (tags param), then set field values.';
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
    'Structured content belongs in children, not description. Each child is a node with its own name.',
    'Keep children flat — avoid unnecessary grouping nodes (e.g. "Key Points", "Summary").',
    'Use data.description only for short metadata summaries, not for main content.',
    '',
    'Use data to set raw node properties: type, description, color, fieldType, cardinality,',
    'showCheckbox, etc. data cannot set rich text internals, tree structure, tags, or timestamps.',
    '',
    'Fields are tied to tags. Include tags when using fields — if the field doesn\'t exist yet,',
    'it will be auto-created under the first tag (type inferred from name: date/url/number/options).',
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
