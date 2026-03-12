/**
 * node_search — Search the knowledge graph.
 *
 * Reuses existing infrastructure:
 * - fuzzy-search.ts for text search (CJK-aware)
 * - filter-utils.ts for field value extraction
 * - backlinks.ts for reverse reference lookup
 * - sort-utils.ts for multi-field sorting
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import * as loroDoc from '../loro-doc.js';
import { SYSTEM_NODE_IDS } from '../../types/index.js';
import { fuzzySort } from '../fuzzy-search.js';
import { getFieldValue } from '../filter-utils.js';
import { computeBacklinks, buildBacklinkCountMap } from '../backlinks.js';
import { compareNodes, type SortConfig } from '../sort-utils.js';
import { getNavigableParentId } from '../tree-utils.js';
import { computeNodeFields } from '../../hooks/use-node-fields.js';
import { useNodeStore } from '../../stores/node-store.js';
import type { NodexNode } from '../../types/node.js';
import {
  MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  findTagDefIdByName,
  getTagDisplayNames,
  isSearchCandidate,
  formatResultText,
} from './shared.js';

const searchToolParameters = Type.Object({
  query: Type.Optional(Type.String()),
  searchTags: Type.Optional(Type.Array(Type.String())),
  fields: Type.Optional(Type.Record(Type.String(), Type.String())),
  linkedTo: Type.Optional(Type.String()),
  parentId: Type.Optional(Type.String()),
  dateRange: Type.Optional(Type.Object({
    from: Type.Optional(Type.String()),
    to: Type.Optional(Type.String()),
  })),
  sort: Type.Optional(Type.Object({
    field: Type.Union([
      Type.Literal('relevance'),
      Type.Literal('created'),
      Type.Literal('modified'),
      Type.Literal('name'),
      Type.Literal('refCount'),
    ]),
    order: Type.Optional(Type.Union([Type.Literal('asc'), Type.Literal('desc')])),
  })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  count: Type.Optional(Type.Boolean()),
});

type SearchToolParams = typeof searchToolParameters.static;

// ─── Helpers ───

function toTimestamp(dateText: string | undefined, endOfDay: boolean): number | null {
  if (!dateText) return null;
  const suffix = endOfDay ? 'T23:59:59.999' : 'T00:00:00';
  const value = new Date(`${dateText}${suffix}`).getTime();
  return Number.isFinite(value) ? value : null;
}

/**
 * Resolve field display name → fieldDefId by scanning tagDef children under SCHEMA.
 * FieldDefs are grandchildren of SCHEMA (SCHEMA → tagDef → fieldDef).
 */
function resolveFieldDefId(fieldName: string): string | null {
  const normalized = fieldName.trim().toLowerCase();
  for (const tagDefId of loroDoc.getChildren(SYSTEM_NODE_IDS.SCHEMA)) {
    const tagDef = loroDoc.toNodexNode(tagDefId);
    if (tagDef?.type !== 'tagDef') continue;
    for (const childId of loroDoc.getChildren(tagDefId)) {
      const child = loroDoc.toNodexNode(childId);
      if (child?.type === 'fieldDef' && (child.name ?? '').trim().toLowerCase() === normalized) {
        return child.id;
      }
    }
  }
  return null;
}

/**
 * Get display-name values of a field on a node.
 * Wraps filter-utils.getFieldValue — resolves options targetIds to display names.
 */
function getFieldDisplayValues(node: NodexNode, fieldDefId: string): string[] {
  const getNode = loroDoc.toNodexNode;
  const rawValues = getFieldValue(node, fieldDefId, getNode);
  return rawValues.map((v) => {
    // Options fields return targetId — resolve to name
    const target = getNode(v);
    return target?.name ?? v;
  });
}

/**
 * Get a subtree of node IDs under parentId (inclusive).
 */
function getSubtreeIds(parentId: string): Set<string> {
  const result = new Set<string>();
  const queue = [parentId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    for (const cid of loroDoc.getChildren(id)) queue.push(cid);
  }
  return result;
}

/**
 * Format a node into a search result item.
 */
function formatSearchItem(node: NodexNode): {
  id: string; name: string; tags: string[]; snippet: string;
  createdAt: string; parentName: string; fields: Record<string, string>;
} {
  const parentId = getNavigableParentId(node.id);
  const parentName = parentId ? (loroDoc.toNodexNode(parentId)?.name ?? parentId) : '';
  const snippetSource = [node.name ?? '', node.description ?? ''].filter(Boolean).join(' — ');

  // Build fields map
  const store = useNodeStore.getState();
  const nodeFields = computeNodeFields(store.getNode, store.getChildren, node.id);
  const fieldsMap: Record<string, string> = {};
  for (const f of nodeFields) {
    if (!f.isSystemConfig && f.valueName) {
      fieldsMap[f.attrDefName] = f.valueName;
    }
  }

  return {
    id: node.id,
    name: node.name ?? '',
    tags: getTagDisplayNames(node.tags),
    snippet: snippetSource.length > 180 ? `${snippetSource.slice(0, 177)}...` : snippetSource,
    createdAt: new Date(node.createdAt).toISOString(),
    parentName,
    fields: fieldsMap,
  };
}

// ─── Backlinks search path ───

function searchByBacklinks(
  targetId: string,
  requiredTagIds: string[],
  params: SearchToolParams,
): AgentToolResult<unknown> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = params.offset ?? 0;
  const backlinks = computeBacklinks(targetId);

  // Collect all referencing node IDs (mentions + field value refs)
  const refIds = new Set(backlinks.mentionedIn.map((m) => m.referencingNodeId));
  for (const refs of Object.values(backlinks.fieldValueRefs)) {
    for (const ref of refs) refIds.add(ref.ownerNodeId);
  }

  let filtered = [...refIds]
    .map((id) => loroDoc.toNodexNode(id))
    .filter((n): n is NodexNode => n !== null)
    .filter((n) => requiredTagIds.every((tid) => n.tags.includes(tid)));

  if (params.count) {
    const result = { total: filtered.length };
    return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
  }

  const items = filtered.slice(offset, offset + limit).map(formatSearchItem);
  const result = { total: filtered.length, offset, limit, items };
  return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
}

// ─── Main search path ───

function searchByFilters(params: SearchToolParams, requiredTagIds: string[]): AgentToolResult<unknown> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = params.offset ?? 0;
  const query = params.query?.trim() ?? '';

  // Date range
  const fromTs = toTimestamp(params.dateRange?.from, false);
  const toTs = toTimestamp(params.dateRange?.to, true);

  // Field filters: resolve names → fieldDefIds
  const fieldFilters: Array<{ fieldDefId: string; value: string }> = [];
  if (params.fields) {
    for (const [name, value] of Object.entries(params.fields)) {
      const fieldDefId = resolveFieldDefId(name);
      if (fieldDefId) fieldFilters.push({ fieldDefId, value });
    }
  }

  // Subtree scoping
  const subtreeIds = params.parentId ? getSubtreeIds(params.parentId) : null;

  // Build candidate list
  let candidates = loroDoc.getAllNodeIds()
    .filter(isSearchCandidate)
    .filter((id) => subtreeIds === null || subtreeIds.has(id))
    .map((id) => loroDoc.toNodexNode(id)!)
    .filter((n) => requiredTagIds.every((tid) => n.tags.includes(tid)))
    .filter((n) => fromTs === null || n.createdAt >= fromTs)
    .filter((n) => toTs === null || n.createdAt <= toTs);

  // Field value filtering (reuses filter-utils.getFieldValue)
  if (fieldFilters.length > 0) {
    candidates = candidates.filter((node) =>
      fieldFilters.every(({ fieldDefId, value }) => {
        const values = getFieldDisplayValues(node, fieldDefId);
        const target = value.trim().toLowerCase();
        return values.some((v) => v.trim().toLowerCase() === target);
      }),
    );
  }

  // Count mode
  if (params.count) {
    if (query) {
      const ranked = fuzzySort(
        candidates.map((n) => ({ ...n, _h: `${n.name ?? ''}\n${n.description ?? ''}` })),
        query, (item) => item._h, candidates.length,
      );
      return countResult(ranked.length);
    }
    return countResult(candidates.length);
  }

  // Ranking
  let ranked: Array<NodexNode & { _fuzzyScore: number; _fuzzyRanges: unknown[] }>;
  if (query) {
    ranked = fuzzySort(
      candidates.map((n) => ({ ...n, _h: `${n.name ?? ''}\n${n.description ?? ''}` })),
      query, (item) => item._h, candidates.length,
    );
  } else {
    ranked = candidates.map((n) => ({ ...n, _fuzzyScore: 0, _fuzzyRanges: [] }));
  }

  // Sorting (relevance = fuzzySort order, skip additional sort)
  const sortField = params.sort?.field ?? (query ? 'relevance' : 'modified');
  const sortOrder = params.sort?.order ?? 'desc';

  if (sortField !== 'relevance') {
    const store = useNodeStore.getState();
    const backlinkCounts = sortField === 'refCount'
      ? buildBacklinkCountMap(store._version)
      : undefined;
    const sortConfig: SortConfig = {
      field: sortField === 'created' ? 'createdAt' : sortField === 'modified' ? 'updatedAt' : sortField,
      direction: sortOrder,
    };
    ranked.sort((a, b) => compareNodes(a, b, sortConfig, store.getNode, backlinkCounts));
  }

  // Pagination + output
  const items = ranked.slice(offset, offset + limit).map(formatSearchItem);
  const result = { total: ranked.length, offset, limit, items };
  return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
}

function countResult(total: number): AgentToolResult<unknown> {
  const result = { total };
  return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
}

// ─── Entry point ───

async function executeSearchTool(params: SearchToolParams): Promise<AgentToolResult<unknown>> {
  // Resolve tag display names → IDs
  const requiredTagIds = (params.searchTags ?? [])
    .map((name) => findTagDefIdByName(name))
    .filter((id): id is string => !!id);

  // If any tag name didn't resolve, result is empty
  if ((params.searchTags?.length ?? 0) > requiredTagIds.length) {
    const result = { total: 0, offset: params.offset ?? 0, limit: params.limit ?? DEFAULT_PAGE_SIZE, items: [] };
    return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
  }

  return params.linkedTo
    ? searchByBacklinks(params.linkedTo, requiredTagIds, params)
    : searchByFilters(params, requiredTagIds);
}

export const searchTool: AgentTool<typeof searchToolParameters, unknown> = {
  name: 'node_search',
  label: 'Search Nodes',
  description: [
    'Search the knowledge graph. Supports text search (fuzzy, CJK), tag filtering,',
    'field value filtering, backlink lookup, date range, subtree scoping, and',
    'structured sort. Think of it as Grep for your knowledge graph.',
    '',
    'Quick patterns:',
    '- Text search: node_search(query: "API design")',
    '- Tag + field: node_search(searchTags: ["task"], fields: {"Status": "Todo"})',
    '- Backlinks: node_search(linkedTo: "nodeId")  → all nodes referencing this node',
    '- Subtree: node_search(parentId: "projectId", query: "auth")',
    '- Count only: node_search(searchTags: ["task"], count: true)',
    '- Sorted: node_search(query: "auth", sort: { field: "modified", order: "desc" })',
  ].join('\n'),
  parameters: searchToolParameters,
  execute: async (_toolCallId, params) => executeSearchTool(params),
};
