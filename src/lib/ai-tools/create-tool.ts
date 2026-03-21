/**
 * node_create — Create new nodes in the knowledge graph.
 *
 * Content nodes use structured text. Search nodes use structured rules.
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
  text: Type.Optional(Type.String({ description: 'Multi-line plain text. Line 1 = root node name. Children/fields indent 2 spaces per level. Syntax: #tag, field:: value, [[Name^id]], [X]/[ ]. NOT markdown. See tool description for format.' })),
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
    '## Content nodes (default)',
    '',
    'text is a multi-line plain text string (NOT markdown). Each line is a node, field, or field value.',
    'Use "- " prefix and 2-space indentation to express hierarchy.',
    '',
    '### Text format reference',
    '',
    'Node (plain text):',
    '- Buy groceries',
    '',
    'Node with tags (#tagName, auto-created if not found):',
    '- Buy groceries #task #personal',
    '',
    'Node with checkbox ([X] = checked, [ ] = unchecked):',
    '- [X] Buy groceries #task',
    '',
    'Single-value field (name:: value):',
    '- Status:: Done',
    '',
    'Multi-value field (name:: with no inline value, values on indented lines):',
    '- Assignees::',
    '  - Alice',
    '  - Bob',
    '',
    'Reference node (entire line is [[DisplayName^nodeId]]):',
    '- [[Weekly Report^abc123]]',
    '',
    'Inline reference (within text):',
    '- See also [[Q1 Plan^def456]] for context',
    '',
    'Field value as reference:',
    '- Author::',
    '  - [[Alice^person1]]',
    '  - [[Bob^person2]]',
    '',
    '### Complete example',
    '',
    '- Weekly review #meeting',
    '  - Date:: 2026-03-21',
    '  - Status:: [X]',
    '  - Attendees::',
    '    - Alice',
    '    - Bob',
    '    - [[Charlie^id123]]',
    '  - nihao field:: value',
    '  - Action items',
    '    - [X] Finish report #task',
    '    - [ ] Review budget #task',
    '  - Notes',
    '    - Good progress on [[Q1 Plan^id456]]',
    '',
    'This creates:',
    '  root "Weekly review" tagged #meeting',
    '    field "Date" = "2026-03-21"',
    '    field "Status" = checked',
    '    field "Attendees" = ["Alice", "Bob", ref:Charlie]',
    '    field "nihao field" = "value"',
    '    child "Action items"',
    '      child "Finish report" tagged #task, checked',
    '      child "Review budget" tagged #task, unchecked',
    '    child "Notes"',
    '      child "Good progress on Q1 Plan" with inline ref',
    '',
    '### Key rules',
    '',
    '1. Line 1 = root node. Lines at indent 0 after line 1: only root metadata (#tags, [X]/[ ], field::).',
    '2. Children and fields of a node are indented 2 spaces deeper.',
    '3. After "field::" with no inline value, ALL lines at the next indent are field values until indent returns. They are NOT children.',
    '4. Max depth: 3 levels of nesting.',
    '5. "- " prefix on each line is optional but recommended. It is stripped before parsing.',
    '6. data parameter: set non-content properties (description, color, codeLanguage, showCheckbox).',
    '',
    '## Search nodes',
    '',
    'Set type: "search". Requires name (string) and rules (object).',
    '',
    'rules fields (all optional, at least one should be provided):',
    '  query        string      Text filter on node name/description',
    '  searchTags   string[]    Tag display names, AND logic. Unknown tags skipped.',
    '  fields       object      Field value filters, e.g. {"Status": "Done"}. Unknown fields skipped.',
    '  linkedTo     string      Node ID — find nodes that reference this node',
    '  scopeId      string      Node ID — restrict to this node\'s subtree',
    '  after        string      Date lower bound (YYYY-MM-DD, inclusive)',
    '  before       string      Date upper bound (YYYY-MM-DD, inclusive)',
    '  sortBy       string      "created:desc", "modified:asc", "name", "refCount"',
    '                           (relevance is NOT supported — runtime only)',
    '',
    'Example:',
    '  node_create({',
    '    type: "search",',
    '    name: "Open tasks",',
    '    rules: { searchTags: ["task"], fields: {"Status": "Todo"} }',
    '  })',
    '',
    '## Duplicate mode',
    '',
    'Pass duplicateId to deep-copy an existing node. Ignores text/type/rules.',
    '',
    'All write operations are undoable with the undo tool.',
  ].join('\n'),
  parameters: createToolParameters,
  execute: async (_toolCallId, params) => executeCreateTool(params),
};
