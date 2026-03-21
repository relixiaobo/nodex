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
  sanitizeDirectNodeDataPatch,
} from './shared.js';
import { parseTanaPaste } from './tana-paste-parser.js';
import { createParsedNodeNoCommit } from './tana-paste-apply.js';

const CREATED_AT_FIELD_SENTINEL = '__createdAt__';

const searchRulesSchema = Type.Object({
  query: Type.Optional(Type.String({ description: 'Persisted text filter over node name and description.' })),
  searchTags: Type.Optional(Type.Array(Type.String(), { description: 'Tag display names that all results must have.' })),
  fields: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Field filters by display name, e.g. {"Status": "Done"}.' })),
  linkedTo: Type.Optional(Type.String({ description: 'Return nodes that reference this node ID.' })),
  scopeId: Type.Optional(Type.String({ description: 'Restrict results to this node and its descendants.' })),
  parentId: Type.Optional(Type.String({ description: 'Deprecated alias for scopeId. Restrict results to this node and its descendants.' })),
  after: Type.Optional(Type.String({ description: 'Creation date lower bound (inclusive), ISO format.' })),
  before: Type.Optional(Type.String({ description: 'Creation date upper bound (inclusive), ISO format.' })),
  sortBy: Type.Optional(Type.String({ description: 'Default sort for the created search node, e.g. "created:desc".' })),
});

const createToolParameters = Type.Object({
  type: Type.Optional(Type.Literal('search', { description: 'Set to "search" to create a search node. Omit for normal content nodes.' })),
  text: Type.Optional(Type.String({ description: 'Tana Paste content. The first line creates the root node. Later top-level lines may only add root tags, checkbox state, or fields. Child nodes must use 2-space indentation.' })),
  name: Type.Optional(Type.String({ description: 'Search node name. Required when type="search".' })),
  rules: Type.Optional(searchRulesSchema),
  data: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: 'Optional non-content node properties such as description, color, codeLanguage, showCheckbox, or type for content nodes.' })),
  duplicateId: Type.Optional(Type.String({ description: 'Duplicate an existing node (deep copy). When provided, duplicate mode ignores text, type, and rules.' })),
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
  appliedRuleCount: number;
  unresolvedTags: string[];
  unresolvedFields: string[];
  rulesApplied: Record<string, unknown>;
}

function applyCreateDataNoCommit(
  nodeId: string,
  data: Record<string, unknown> | undefined,
  options: { allowType: boolean },
): void {
  const { safeData } = sanitizeDirectNodeDataPatch(data, { allowType: options.allowType });
  if (Object.keys(safeData).length > 0) {
    loroDoc.setNodeDataBatch(nodeId, safeData);
  }
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
    applyCreateDataNoCommit(created.nodeId, params.data, { allowType: !created.isReference });
    commitDoc();
    return created;
  });

  const freshNode = result.isReference
    ? loroDoc.toNodexNode(result.targetId ?? '')
    : loroDoc.toNodexNode(result.nodeId);
  pushAiOp('node_create', result.nodeId, freshNode?.name ?? parsed.name);

  const output: Record<string, unknown> = { id: result.nodeId };
  output.status = 'created';
  output.parentId = result.parentId;
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
    output.boundary = 'Field values only resolve from fields available on the node after tags are applied. Unresolved fields were skipped.';
    output.nextStep = 'Add a tag that defines the missing fields, then call node_edit to set those fields.';
    output.fallback = 'If you are unsure which tag defines the field, add the likely tag first and retry the field update.';
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
  const summary: SearchRuleBuildSummary = {
    appliedRuleCount: 0,
    unresolvedTags: [],
    unresolvedFields: [],
    rulesApplied: {},
  };
  const rootGroupId = createQueryConditionNode(searchNodeId, { queryLogic: 'AND' });

  if (rules.query?.trim()) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'STRING_MATCH',
    });
    createQueryValueNode(conditionId, { text: rules.query.trim() });
    summary.appliedRuleCount += 1;
    summary.rulesApplied.query = rules.query.trim();
  }

  for (const tagName of rules.searchTags ?? []) {
    const tagDefId = findTagDefIdByName(tagName);
    if (!tagDefId) {
      summary.unresolvedTags.push(tagName);
      continue;
    }
    createQueryConditionNode(rootGroupId, {
      queryOp: 'HAS_TAG',
      queryTagDefId: tagDefId,
    });
    summary.appliedRuleCount += 1;
    const resolvedName = loroDoc.toNodexNode(tagDefId)?.name ?? tagName;
    const tags = Array.isArray(summary.rulesApplied.searchTags) ? summary.rulesApplied.searchTags as string[] : [];
    tags.push(resolvedName);
    summary.rulesApplied.searchTags = tags;
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
    summary.appliedRuleCount += 1;
    const fields = (summary.rulesApplied.fields as Record<string, string> | undefined) ?? {};
    fields[fieldName] = fieldValue;
    summary.rulesApplied.fields = fields;
  }

  if (rules.linkedTo) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'LINKS_TO',
    });
    createQueryValueNode(conditionId, { targetId: rules.linkedTo });
    summary.appliedRuleCount += 1;
    summary.rulesApplied.linkedTo = rules.linkedTo;
  }

  const scopeId = rules.scopeId ?? rules.parentId;
  if (scopeId) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'PARENTS_DESCENDANTS',
    });
    createQueryValueNode(conditionId, { targetId: scopeId });
    summary.appliedRuleCount += 1;
    summary.rulesApplied.scopeId = scopeId;
  }

  if (rules.after) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'GT',
      queryFieldDefId: CREATED_AT_FIELD_SENTINEL,
    });
    createQueryValueNode(conditionId, { text: rules.after });
    summary.appliedRuleCount += 1;
    summary.rulesApplied.after = rules.after;
  }

  if (rules.before) {
    const conditionId = createQueryConditionNode(rootGroupId, {
      queryOp: 'LT',
      queryFieldDefId: CREATED_AT_FIELD_SENTINEL,
    });
    createQueryValueNode(conditionId, { text: rules.before });
    summary.appliedRuleCount += 1;
    summary.rulesApplied.before = rules.before;
  }

  return summary;
}

function addSearchSortNoCommit(searchNodeId: string, sortBy: string | undefined): { stored: boolean; ignoredSortBy?: string; appliedSortBy?: string } {
  const parsedSort = parseSortBy(sortBy);
  if (!parsedSort) {
    return { stored: false };
  }
  if (parsedSort.field === 'relevance') {
    return { stored: false, ignoredSortBy: sortBy };
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
  return { stored: true, appliedSortBy: `${parsedSort.field}:${parsedSort.order}` };
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
    const sortSummary = addSearchSortNoCommit(created.id, params.rules?.sortBy);
    applyCreateDataNoCommit(created.id, params.data, { allowType: false });
    commitDoc();
    useNodeStore.getState().refreshSearchResults(created.id);

    return {
      nodeId: created.id,
      parentId: location.parentId,
      appliedRuleCount: buildSummary.appliedRuleCount,
      unresolvedTags: buildSummary.unresolvedTags,
      unresolvedFields: buildSummary.unresolvedFields,
      rulesApplied: sortSummary.appliedSortBy
        ? { ...buildSummary.rulesApplied, sortBy: sortSummary.appliedSortBy }
        : buildSummary.rulesApplied,
      ignoredSortBy: sortSummary.ignoredSortBy,
    };
  });

  pushAiOp('node_create', result.nodeId, params.name.trim());

  const output: Record<string, unknown> = {
    id: result.nodeId,
    status: 'created',
    type: 'search',
    name: params.name.trim(),
    parentId: result.parentId,
    appliedRuleCount: result.appliedRuleCount,
    rulesApplied: result.rulesApplied,
  };
  if (result.unresolvedTags.length > 0) {
    output.unresolvedTags = result.unresolvedTags;
  }
  if (result.unresolvedFields.length > 0) {
    output.unresolvedFields = result.unresolvedFields;
  }
  if (result.ignoredSortBy) {
    output.ignoredSortBy = result.ignoredSortBy;
  }
  if (result.unresolvedTags.length > 0 || result.unresolvedFields.length > 0 || result.ignoredSortBy) {
    output.boundary = 'Search nodes only store persistable rules. Unknown tags and fields are skipped, and relevance sort is runtime-only.';
    output.nextStep = 'If any rule was skipped, create or locate the missing tag/field definitions, then update or recreate the search node.';
    output.fallback = 'Retry with existing tag names, existing field names, and a persisted sort such as created, modified, name, or refCount.';
    output.hint = 'Some search field rules could not be resolved and were skipped.';
  }

  return {
    content: [{ type: 'text', text: formatResultText(output) }],
    details: output,
  };
}

async function executeCreateTool(params: CreateToolParams): Promise<AgentToolResult<unknown>> {
  if (params.duplicateId) {
    const duplicated = withCommitOrigin(AI_COMMIT_ORIGIN, () => useNodeStore.getState().duplicateNode(params.duplicateId!));
    if (!duplicated) {
      throw new Error(`Node not found: ${params.duplicateId}. Cannot duplicate a node that does not exist.`);
    }
    pushAiOp('node_create', duplicated.id, duplicated.name ?? '');
    const output = {
      id: duplicated.id,
      name: duplicated.name ?? '',
      parentId: loroDoc.getParentId(duplicated.id) ?? '',
      duplicatedFrom: params.duplicateId,
    };
    return {
      content: [{ type: 'text', text: formatResultText(output) }],
      details: output,
    };
  }

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
    'Text rules:',
    '- The first line creates the root node.',
    '- A first line that is exactly [[Name^nodeId]] creates a reference node instead of a content node.',
    '- A plain first line becomes the root node text. It may also include inline #tags, inline [[Name^nodeId]] references, or a leading [X] / [ ].',
    '- Top-level lines after the first line may only add root metadata: #tags, [X] / [ ], or field:: lines.',
    '- Child nodes must use 2-space indentation. Each deeper level adds 2 more spaces. Max depth = 3.',
    '- field:: value sets a single-value field.',
    '- field:: followed by indented value lines creates a multi-value field.',
    '- Lines starting with "- " are accepted; the bullet prefix is stripped before parsing.',
    '- Use data for non-content properties such as description, color, codeLanguage, showCheckbox, or content node type.',
    '',
    'Search nodes: pass type: "search" with a name and structured rules.',
    '- query = persisted text filter over node name and description',
    '- searchTags = all tags must resolve to existing tags, or they are skipped and reported',
    '- fields = field filters by display name; unknown fields are skipped and reported',
    '- linkedTo = backlink target node ID',
    '- scopeId = descendants of this node (preferred; rules.parentId is a deprecated alias)',
    '- after / before = creation date bounds in YYYY-MM-DD form',
    '- sortBy = created|modified|name|refCount[:asc|desc]; relevance is runtime-only and is not persisted',
    'Use rules only for persistable query conditions. node_search stays read-only.',
    '',
    'Duplicate mode: pass duplicateId to deep-copy an existing node as its next sibling.',
    '',
    'All write operations use isolated undo — undoable with the undo tool.',
  ].join('\n'),
  parameters: createToolParameters,
  execute: async (_toolCallId, params) => executeCreateTool(params),
};
