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
  findFieldDefIdInSchema,
  findTagDefIdByName,
  getTagDisplayNames,
  isSearchCandidate,
  formatResultText,
  parseSortBy,
} from './shared.js';

const searchToolParameters = Type.Object({
  query: Type.Optional(Type.String({ description: 'Fuzzy text search across node names and descriptions. CJK-aware.' })),
  searchTags: Type.Optional(Type.Array(Type.String(), { description: 'Filter to nodes with ALL these tags (AND logic). Use display names. Every tag must resolve to an existing tag name.' })),
  fields: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Filter by exact field display values, e.g. {"Status": "Todo"}. Unknown field names are ignored with guidance.' })),
  linkedTo: Type.Optional(Type.String({ description: 'Find all nodes that reference this node ID (backlinks).' })),
  parentId: Type.Optional(Type.String({ description: 'Restrict search to this node and its descendants.' })),
  after: Type.Optional(Type.String({ description: 'Creation date lower bound (inclusive), ISO format e.g. "2026-01-15".' })),
  before: Type.Optional(Type.String({ description: 'Creation date upper bound (inclusive), ISO format e.g. "2026-03-12".' })),
  sortBy: Type.Optional(Type.String({ description: 'Sort string: "field" or "field:order". field = relevance|created|modified|name|refCount. order defaults to desc.' })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE, description: 'Max results per page (default 20, max 50).' })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0, description: 'Pagination offset.' })),
  count: Type.Optional(Type.Boolean({ description: 'If true, return only the total count — no items.' })),
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
  const fromTs = toTimestamp(params.after, false);
  const toTs = toTimestamp(params.before, true);

  // Field filters: resolve names → fieldDefIds
  const fieldFilters: Array<{ fieldDefId: string; value: string }> = [];
  const unresolvedFilters: string[] = [];
  if (params.fields) {
    for (const [name, value] of Object.entries(params.fields)) {
      const fieldDefId = findFieldDefIdInSchema(name);
      if (fieldDefId) {
        fieldFilters.push({ fieldDefId, value });
      } else {
        unresolvedFilters.push(name);
      }
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
      return countResult(ranked.length, unresolvedFilters);
    }
    return countResult(candidates.length, unresolvedFilters);
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
  const parsedSort = parseSortBy(params.sortBy);
  const sortField = parsedSort?.field ?? (query ? 'relevance' : 'modified');
  const sortOrder = parsedSort?.order ?? 'desc';

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
  const result: Record<string, unknown> = { total: ranked.length, offset, limit, items };
  if (unresolvedFilters.length > 0) {
    result.unresolvedFilters = unresolvedFilters;
    result.boundary = 'Unknown field filters were ignored; only existing field names affect the search.';
    result.nextStep = 'Retry with existing field display names, or remove the unresolved filters and search again.';
    result.fallback = 'If you are unsure about the field names, inspect the schema or run a broader search without those filters.';
    result.hint = 'Some field filters could not be resolved — those filters were ignored. Check field names match existing tag field definitions.';
  }
  return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
}

function countResult(total: number, unresolvedFilters: string[] = []): AgentToolResult<unknown> {
  const result: Record<string, unknown> = { total };
  if (unresolvedFilters.length > 0) {
    result.unresolvedFilters = unresolvedFilters;
    result.boundary = 'Unknown field filters were ignored; only existing field names affect the search.';
    result.nextStep = 'Retry with existing field display names, or remove the unresolved filters and search again.';
    result.fallback = 'If you are unsure about the field names, inspect the schema or run a broader search without those filters.';
    result.hint = 'Some field filters could not be resolved — those filters were ignored. Check field names match existing tag field definitions.';
  }
  return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
}

// ─── Entry point ───

async function executeSearchTool(params: SearchToolParams): Promise<AgentToolResult<unknown>> {
  // Resolve tag display names → IDs
  const resolvedTags: string[] = [];
  const unresolvedTags: string[] = [];
  for (const name of params.searchTags ?? []) {
    const id = findTagDefIdByName(name);
    if (id) {
      resolvedTags.push(id);
    } else {
      unresolvedTags.push(name);
    }
  }

  // If any tag name didn't resolve, return empty with hint
  if (unresolvedTags.length > 0) {
    const result: Record<string, unknown> = { total: 0, unresolvedTags };
    if (!params.count) {
      result.items = [];
    }
    result.boundary = 'All searchTags use AND logic and must resolve to existing tag names.';
    result.nextStep = 'Retry with existing tag display names, or drop searchTags and use text search to discover the right tags first.';
    result.fallback = 'If you do not know the exact tag names, inspect the schema or run a broader search without tag filters.';
    result.hint = `Tags not found: ${unresolvedTags.join(', ')}. No results because all searchTags must match (AND logic).`;
    return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
  }

  const requiredTagIds = resolvedTags;

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
    'sorting. Think of it as Grep for your knowledge graph.',
    '',
    'Quick patterns:',
    '- Text search: node_search(query: "API design")',
    '- Tag + field: node_search(searchTags: ["task"], fields: {"Status": "Todo"})',
    '- Backlinks: node_search(linkedTo: "nodeId")  → all nodes referencing this node',
    '- Subtree: node_search(parentId: "projectId", query: "auth")  → includes the parent node and its descendants',
    '- Count only: node_search(searchTags: ["task"], count: true)',
    '- Date range: node_search(after: "2026-03-01", before: "2026-03-31")',
    '- Sorted: node_search(query: "auth", sortBy: "modified:desc")',
    '',
    'Behavior boundaries:',
    '- searchTags are AND filters; if any tag name is unknown, the result is empty with guidance',
    '- Unknown field names are ignored and reported',
    '- count: true returns only the total count plus any guidance fields',
  ].join('\n'),
  parameters: searchToolParameters,
  execute: async (_toolCallId, params) => executeSearchTool(params),
};
