/**
 * node_create — Create new nodes in the knowledge graph.
 *
 * Content nodes use Tana Paste text. Search nodes use structured rules.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import { nanoid } from 'nanoid';
import { ensureTodayNode } from '../journal.js';
import { AI_COMMIT_ORIGIN, commitDoc, withCommitOrigin } from '../loro-doc.js';
import * as loroDoc from '../loro-doc.js';
import { useNodeStore } from '../../stores/node-store.js';
import {
  findFieldDefIdInSchema,
  findTagDefIdByName,
  formatResultText,
  parseSortBy,
  pushAiOp,
} from './shared.js';
import { parseTanaPaste } from './tana-paste-parser.js';
import { createParsedNodeNoCommit } from './tana-paste-apply.js';

const CREATED_AT_FIELD_SENTINEL = '__createdAt__';

const searchRulesSchema = Type.Object({
  searchTags: Type.Optional(Type.Array(Type.String(), { description: 'Tag display names that all results must have.' })),
  fields: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Field filters by display name, e.g. {"Status": "Done"}.' })),
  linkedTo: Type.Optional(Type.String({ description: 'Return nodes that reference this node ID.' })),
  parentId: Type.Optional(Type.String({ description: 'Restrict results to descendants of this node.' })),
  after: Type.Optional(Type.String({ description: 'Creation date lower bound (inclusive), ISO format.' })),
  before: Type.Optional(Type.String({ description: 'Creation date upper bound (inclusive), ISO format.' })),
  sortBy: Type.Optional(Type.String({ description: 'Default sort for the created search node, e.g. "created:desc".' })),
});

const createToolParameters = Type.Object({
  type: Type.Optional(Type.Literal('search', { description: 'Set to "search" to create a search node. Omit for normal content nodes.' })),
  text: Type.Optional(Type.String({ description: 'Tana Paste content. First line = node name, later lines = children or fields.' })),
  name: Type.Optional(Type.String({ description: 'Search node name. Required when type="search".' })),
  rules: Type.Optional(searchRulesSchema),
  parentId: Type.Optional(Type.String({ description: 'Parent node ID. Defaults to today\'s journal node.' })),
  afterId: Type.Optional(Type.String({ description: 'Insert after this sibling node. If parentId is also provided, it must match the sibling parent.' })),
});

type CreateToolParams = typeof createToolParameters.static;
type CreateSearchRules = NonNullable<CreateToolParams['rules']>;

interface Location {
  parentId: string;
  index?: number;
}

interface SearchRuleBuildSummary {
  unresolvedFields: string[];
}

function resolveCreateLocation(parentId: string | undefined, afterId: string | undefined): Location {
  if (!afterId) {
    return { parentId: parentId ?? ensureTodayNode() };
  }

  const siblingParentId = loroDoc.getParentId(afterId);
  if (!siblingParentId) {
    throw new Error(`Node not found or has no parent: ${afterId}. Cannot insert after it.`);
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

function createContentNode(params: CreateToolParams): AgentToolResult<unknown> {
  if (!params.text?.trim()) {
    throw new Error('text is required when creating a content node.');
  }

  const parsed = parseTanaPaste(params.text);
  const location = resolveCreateLocation(params.parentId, params.afterId);

  const result = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const created = createParsedNodeNoCommit(location.parentId, location.index, parsed, 0);
    commitDoc();
    return created;
  });

  const freshNode = result.isReference
    ? loroDoc.toNodexNode(result.targetId ?? '')
    : loroDoc.toNodexNode(result.nodeId);
  pushAiOp('node_create', result.nodeId, freshNode?.name ?? parsed.name);

  const output: Record<string, unknown> = { id: result.nodeId };
  if (!params.afterId) {
    output.parentId = result.parentId;
  }
  if (result.isReference) {
    output.isReference = true;
    output.targetId = result.targetId;
    output.name = freshNode?.name ?? parsed.name;
  }
  if (result.childrenCreated > 0) {
    output.childrenCreated = result.childrenCreated;
  }
  if (result.createdFields.length > 0) {
    output.createdFields = [...new Set(result.createdFields)];
  }
  if (result.unresolvedFields.length > 0) {
    output.unresolvedFields = [...new Set(result.unresolvedFields)];
    output.hint = 'Some fields could not be resolved because the node has no tags yet.';
  }

  return {
    content: [{ type: 'text', text: formatResultText(output) }],
    details: output,
  };
}

function createQueryConditionNode(parentId: string, data: Record<string, unknown>): string {
  const id = nanoid();
  loroDoc.createNode(id, parentId);
  loroDoc.setNodeDataBatch(id, { type: 'queryCondition', ...data });
  return id;
}

function createQueryValueNode(parentId: string, value: { text?: string; targetId?: string }): string {
  const id = nanoid();
  loroDoc.createNode(id, parentId);
  if (value.targetId) {
    loroDoc.setNodeData(id, 'targetId', value.targetId);
  } else {
    loroDoc.setNodeData(id, 'name', value.text ?? '');
  }
  return id;
}

function buildSearchRuleTreeNoCommit(searchNodeId: string, rules: CreateSearchRules): SearchRuleBuildSummary {
  const summary: SearchRuleBuildSummary = { unresolvedFields: [] };
  const rootGroupId = createQueryConditionNode(searchNodeId, { queryLogic: 'AND' });

  for (const tagName of rules.searchTags ?? []) {
    const tagDefId = findTagDefIdByName(tagName);
    if (!tagDefId) continue;
    createQueryConditionNode(rootGroupId, {
      queryOp: 'HAS_TAG',
      queryTagDefId: tagDefId,
    });
  }

  for (const [fieldName, fieldValue] of Object.entries(rules.fields ?? {})) {
    const fieldDefId = findFieldDefIdInSchema(fieldName);
    if (!fieldDefId) {
      summary.unresolvedFields.push(fieldName);
      continue;
    }
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'FIELD_IS',
      queryFieldDefId: fieldDefId,
    });
    createQueryValueNode(conditionId, { text: fieldValue });
  }

  if (rules.linkedTo) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'LINKS_TO',
    });
    createQueryValueNode(conditionId, { targetId: rules.linkedTo });
  }

  if (rules.parentId) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'PARENTS_DESCENDANTS',
    });
    createQueryValueNode(conditionId, { targetId: rules.parentId });
  }

  if (rules.after) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'GT',
      queryFieldDefId: CREATED_AT_FIELD_SENTINEL,
    });
    createQueryValueNode(conditionId, { text: rules.after });
  }

  if (rules.before) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'LT',
      queryFieldDefId: CREATED_AT_FIELD_SENTINEL,
    });
    createQueryValueNode(conditionId, { text: rules.before });
  }

  return summary;
}

function addSearchSortNoCommit(searchNodeId: string, sortBy: string | undefined): void {
  const parsedSort = parseSortBy(sortBy);
  if (!parsedSort || parsedSort.field === 'relevance') {
    return;
  }

  const store = useNodeStore.getState();
  const mappedField = parsedSort.field === 'created'
    ? 'createdAt'
    : parsedSort.field === 'modified'
      ? 'updatedAt'
      : parsedSort.field;

  let viewDefId = store.getViewDefId(searchNodeId);
  if (!viewDefId) {
    viewDefId = nanoid();
    loroDoc.createNode(viewDefId, searchNodeId);
    loroDoc.setNodeDataBatch(viewDefId, { type: 'viewDef' });
  }

  const sortRuleId = nanoid();
  loroDoc.createNode(sortRuleId, viewDefId);
  loroDoc.setNodeDataBatch(sortRuleId, {
    type: 'sortRule',
    sortField: mappedField,
    sortDirection: parsedSort.order,
  });
}

function createSearchNode(params: CreateToolParams): AgentToolResult<unknown> {
  if (params.type !== 'search') {
    throw new Error('Internal error: createSearchNode called without type="search".');
  }
  if (!params.name?.trim()) {
    throw new Error('name is required when type="search".');
  }
  if (!params.rules) {
    throw new Error('rules are required when type="search".');
  }

  const location = resolveCreateLocation(params.parentId, params.afterId);

  const result = withCommitOrigin(AI_COMMIT_ORIGIN, () => {
    const created = useNodeStore.getState().createChild(location.parentId, location.index, {
      type: 'search',
      name: params.name!.trim(),
    }, { commit: false });

    const buildSummary = buildSearchRuleTreeNoCommit(created.id, params.rules!);
    addSearchSortNoCommit(created.id, params.rules?.sortBy);
    commitDoc();
    useNodeStore.getState().refreshSearchResults(created.id);

    return {
      nodeId: created.id,
      parentId: location.parentId,
      unresolvedFields: buildSummary.unresolvedFields,
    };
  });

  pushAiOp('node_create', result.nodeId, params.name.trim());

  const output: Record<string, unknown> = {
    id: result.nodeId,
    parentId: result.parentId,
  };
  if (result.unresolvedFields.length > 0) {
    output.unresolvedFields = result.unresolvedFields;
    output.hint = 'Some search field rules could not be resolved and were skipped.';
  }

  return {
    content: [{ type: 'text', text: formatResultText(output) }],
    details: output,
  };
}

async function executeCreateTool(params: CreateToolParams): Promise<AgentToolResult<unknown>> {
  if (params.type === 'search') {
    return createSearchNode(params);
  }
  return createContentNode(params);
}

export const createTool: AgentTool<typeof createToolParameters, unknown> = {
  name: 'node_create',
  label: 'Create Node',
  description: [
    'Create nodes in the knowledge graph.',
    '',
    'Content nodes (default): pass text in a Tana Paste subset.',
    '- First line = node name',
    '- #tag adds a tag',
    '- field:: value sets a field',
    '- field:: followed by indented lines creates a multi-value field',
    '- [[Name^nodeId]] creates a reference node when it is the whole line',
    '- Indentation uses 2 spaces for child nodes',
    '',
    'Search nodes: pass type: "search" with a name and structured rules.',
    'Use rules only for persistable query conditions. node_search stays read-only.',
    '',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: createToolParameters,
  execute: async (_toolCallId, params) => executeCreateTool(params),
};
