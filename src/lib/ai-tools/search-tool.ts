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
import { fuzzyMatch, fuzzySort } from '../fuzzy-search.js';
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
  searchRulesSchema,
  type SearchRules,
} from './shared.js';

const searchToolParameters = Type.Object({
  rules: Type.Optional(searchRulesSchema),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE, description: 'Max results per page (default 20, max 50).' })),
  offset: Type.Optional(Type.Integer({ minimum: 0, default: 0, description: 'Pagination offset.' })),
  count: Type.Optional(Type.Boolean({ description: 'If true, return only the total count — no items.' })),
});

type SearchToolParams = typeof searchToolParameters.static;
type RankedSearchNode = NodexNode & {
  _fuzzyScore: number;
  _fuzzyRanges: number[];
  _matchedTokenCount?: number;
};

const QUERY_FALLBACK_SPLIT_RE = /[\s,，、;；|/]+/u;

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

function buildSearchHaystack(node: NodexNode): string {
  return `${node.name ?? ''}\n${node.description ?? ''}`;
}

function tokenizeSearchQuery(query: string): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const rawToken of query.split(QUERY_FALLBACK_SPLIT_RE)) {
    const token = rawToken.trim().toLowerCase();
    if (!token) continue;
    if (!/[\u3400-\u9fff]/u.test(token) && token.length < 2) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

function rankCandidatesByTokenCoverage(
  candidates: NodexNode[],
  tokens: string[],
  minMatchedTokens: number,
): RankedSearchNode[] {
  const ranked: RankedSearchNode[] = [];

  for (const node of candidates) {
    const haystack = buildSearchHaystack(node);
    let matchedTokenCount = 0;
    let bestRanges: number[] = [];
    let bestScore = Number.NEGATIVE_INFINITY;
    let totalScore = 0;

    for (const token of tokens) {
      const match = fuzzyMatch(token, haystack);
      if (!match) continue;
      matchedTokenCount += 1;
      totalScore += match.score;
      if (match.score > bestScore) {
        bestScore = match.score;
        bestRanges = match.ranges;
      }
    }

    if (matchedTokenCount < minMatchedTokens) continue;

    ranked.push({
      ...node,
      _fuzzyScore: totalScore + matchedTokenCount * 1000,
      _fuzzyRanges: bestRanges,
      _matchedTokenCount: matchedTokenCount,
    });
  }

  ranked.sort((a, b) =>
    (b._matchedTokenCount ?? 0) - (a._matchedTokenCount ?? 0)
    || b._fuzzyScore - a._fuzzyScore
    || b.updatedAt - a.updatedAt,
  );

  return ranked;
}

function rankCandidatesByQuery(candidates: NodexNode[], query: string): RankedSearchNode[] {
  const exactRanked = fuzzySort(
    candidates.map((node) => ({ ...node, _h: buildSearchHaystack(node) })),
    query,
    (item) => item._h,
    candidates.length,
  );
  if (exactRanked.length > 0) return exactRanked;

  const tokens = tokenizeSearchQuery(query);
  if (tokens.length < 2) return exactRanked;

  const allTokenRanked = rankCandidatesByTokenCoverage(candidates, tokens, 2);
  if (allTokenRanked.length > 0) return allTokenRanked;

  return rankCandidatesByTokenCoverage(candidates, tokens, 1);
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

  const filtered = [...refIds]
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

function searchByFilters(rules: SearchRules, params: SearchToolParams, requiredTagIds: string[]): AgentToolResult<unknown> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = params.offset ?? 0;
  const query = rules.query?.trim() ?? '';

  // Date range
  const fromTs = toTimestamp(rules.after, false);
  const toTs = toTimestamp(rules.before, true);

  // Field filters: resolve names → fieldDefIds
  const fieldFilters: Array<{ fieldDefId: string; value: string }> = [];
  const unresolvedFilters: string[] = [];
  if (rules.fields) {
    for (const [name, value] of Object.entries(rules.fields)) {
      const fieldDefId = findFieldDefIdInSchema(name);
      if (fieldDefId) {
        fieldFilters.push({ fieldDefId, value });
      } else {
        unresolvedFilters.push(name);
      }
    }
  }

  // Subtree scoping
  const scopeId = rules.scopeId ?? rules.parentId;
  const subtreeIds = scopeId ? getSubtreeIds(scopeId) : null;

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
      const ranked = rankCandidatesByQuery(candidates, query);
      return countResult(ranked.length, unresolvedFilters);
    }
    return countResult(candidates.length, unresolvedFilters);
  }

  // Ranking
  let ranked: RankedSearchNode[];
  if (query) {
    ranked = rankCandidatesByQuery(candidates, query);
  } else {
    ranked = candidates.map((n) => ({ ...n, _fuzzyScore: 0, _fuzzyRanges: [] }));
  }

  // Sorting (relevance = fuzzySort order, skip additional sort)
  const parsedSort = parseSortBy(rules.sortBy);
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
  const rules: SearchRules = params.rules ?? {};

  // Resolve tag display names → IDs
  const resolvedTags: string[] = [];
  const unresolvedTags: string[] = [];
  for (const name of rules.searchTags ?? []) {
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

  return rules.linkedTo
    ? searchByBacklinks(rules.linkedTo, requiredTagIds, params)
    : searchByFilters(rules, params, requiredTagIds);
}

export const searchTool: AgentTool<typeof searchToolParameters, unknown> = {
  name: 'node_search',
  label: 'Search Nodes',
  description: [
    'Search the knowledge graph. Supports text search (fuzzy, CJK), tag filtering,',
    'field value filtering, backlink lookup, date range, subtree scoping, and',
    'sorting. Think of it as Grep for your knowledge graph.',
    '',
    'All search conditions go inside the `rules` object (same schema as node_create type="search").',
    'Execution params (limit, offset, count) stay at top level.',
    '',
    'Quick patterns:',
    '- Text search: node_search({ rules: { query: "API design" } })',
    '- Tag + field: node_search({ rules: { searchTags: ["task"], fields: {"Status": "Todo"} } })',
    '- Backlinks: node_search({ rules: { linkedTo: "nodeId" } })  → all nodes referencing this node',
    '- Subtree: node_search({ rules: { scopeId: "projectId", query: "auth" } })  → includes the scope node and its descendants',
    '- Count only: node_search({ rules: { searchTags: ["task"] }, count: true })',
    '- Date range: node_search({ rules: { after: "2026-03-01", before: "2026-03-31" } })',
    '- Sorted: node_search({ rules: { query: "auth", sortBy: "modified:desc" } })',
    '',
    'Behavior boundaries:',
    '- searchTags are AND filters; if any tag name is unknown, the result is empty with guidance',
    '- Unknown field names are ignored and reported',
    '- count: true returns only the total count plus any guidance fields',
  ].join('\n'),
  parameters: searchToolParameters,
  execute: async (_toolCallId, params) => executeSearchTool(params),
};
