/**
 * node_search — Search the knowledge graph.
 *
 * Supports text search (fuzzy, CJK), tag filtering, field value filtering,
 * backlink lookup, date range, subtree scoping, structured sort, and count mode.
 */
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@mariozechner/pi-ai';
import * as loroDoc from '../loro-doc.js';
import { fuzzySort } from '../fuzzy-search.js';
import { computeBacklinks, buildBacklinkCountMap } from '../backlinks.js';
import { compareNodes, type SortConfig } from '../sort-utils.js';
import { computeNodeFields } from '../../hooks/use-node-fields.js';
import { getNavigableParentId } from '../tree-utils.js';
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

function toRangeStart(dateText?: string): number | null {
  if (!dateText) return null;
  const value = new Date(`${dateText}T00:00:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

function toRangeEnd(dateText?: string): number | null {
  if (!dateText) return null;
  const value = new Date(`${dateText}T23:59:59.999`).getTime();
  return Number.isFinite(value) ? value : null;
}

/**
 * Get field value(s) for a node given a fieldDefId.
 * Returns display names for options fields, raw names for plain fields.
 */
function getFieldValue(node: NodexNode, fieldDefId: string): string[] {
  const getNode = loroDoc.toNodexNode;
  const values: string[] = [];
  for (const childId of node.children) {
    const child = getNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      for (const valId of child.children) {
        const valNode = getNode(valId);
        if (!valNode) continue;
        if (valNode.targetId) {
          // Options field: resolve target name
          const target = getNode(valNode.targetId);
          if (target?.name) values.push(target.name);
        } else if (valNode.name) {
          values.push(valNode.name);
        }
      }
      break;
    }
  }
  return values;
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
    const children = loroDoc.getChildren(id);
    for (const cid of children) queue.push(cid);
  }
  return result;
}

/**
 * Get field display values for a node (for search results).
 */
function getNodeFieldsMap(nodeId: string): Record<string, string> {
  const store = useNodeStore.getState();
  const fields = computeNodeFields(store.getNode, store.getChildren, nodeId);
  const result: Record<string, string> = {};
  for (const f of fields) {
    if (f.isSystemConfig) continue;
    if (f.valueName) {
      result[f.attrDefName] = f.valueName;
    }
  }
  return result;
}

async function executeSearchTool(params: SearchToolParams): Promise<AgentToolResult<unknown>> {
  const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = params.offset ?? 0;
  const query = params.query?.trim() ?? '';

  // ── Tag resolution ──
  const requiredTagIds = (params.searchTags ?? [])
    .map((tagName) => findTagDefIdByName(tagName))
    .filter((tagId): tagId is string => !!tagId);
  const hasMissingTag = (params.searchTags?.length ?? 0) > requiredTagIds.length;
  if (hasMissingTag) {
    const result = { total: 0, offset, limit, items: [] };
    return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
  }

  // ── Date range ──
  const fromTs = toRangeStart(params.dateRange?.from);
  const toTs = toRangeEnd(params.dateRange?.to);

  // ── Field filter resolution ──
  const fieldFilters: Array<{ fieldDefId: string; value: string }> = [];
  if (params.fields) {
    // Resolve field names to fieldDefIds by scanning SCHEMA for all fieldDefs
    const allFieldDefs = loroDoc.getAllNodeIds()
      .map((id) => loroDoc.toNodexNode(id))
      .filter((n): n is NonNullable<ReturnType<typeof loroDoc.toNodexNode>> =>
        n !== null && n.type === 'fieldDef');

    for (const [fieldName, value] of Object.entries(params.fields)) {
      const normalized = fieldName.trim().toLowerCase();
      const match = allFieldDefs.find((fd) => (fd.name ?? '').trim().toLowerCase() === normalized);
      if (match) {
        fieldFilters.push({ fieldDefId: match.id, value });
      }
    }
  }

  // ── Backlinks mode ──
  if (params.linkedTo) {
    const backlinks = computeBacklinks(params.linkedTo);
    const mentionedIds = backlinks.mentionedIn.map((m) => m.referencingNodeId);
    // Also include field value references
    for (const refs of Object.values(backlinks.fieldValueRefs)) {
      for (const ref of refs) {
        if (!mentionedIds.includes(ref.ownerNodeId)) {
          mentionedIds.push(ref.ownerNodeId);
        }
      }
    }

    // Apply additional filters on the backlink results
    let filtered = mentionedIds
      .map((id) => loroDoc.toNodexNode(id))
      .filter((n): n is NodexNode => n !== null);

    if (requiredTagIds.length > 0) {
      filtered = filtered.filter((n) => requiredTagIds.every((tid) => n.tags.includes(tid)));
    }

    if (params.count) {
      const result = { total: filtered.length };
      return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
    }

    const items = filtered.slice(offset, offset + limit).map((node) => {
      const parentId = getNavigableParentId(node.id);
      const parentName = parentId ? (loroDoc.toNodexNode(parentId)?.name ?? parentId) : '';
      return {
        id: node.id,
        name: node.name ?? '',
        tags: getTagDisplayNames(node.tags),
        snippet: [node.name ?? '', node.description ?? ''].filter(Boolean).join(' — ').slice(0, 180),
        createdAt: new Date(node.createdAt).toISOString(),
        parentName,
        fields: getNodeFieldsMap(node.id),
      };
    });

    const result = { total: filtered.length, offset, limit, items };
    return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
  }

  // ── Subtree scoping ──
  let subtreeIds: Set<string> | null = null;
  if (params.parentId) {
    subtreeIds = getSubtreeIds(params.parentId);
  }

  // ── Build candidate list ──
  let candidates = loroDoc.getAllNodeIds()
    .filter(isSearchCandidate)
    .filter((id) => subtreeIds === null || subtreeIds.has(id))
    .map((nodeId) => loroDoc.toNodexNode(nodeId)!)
    .filter((node) => requiredTagIds.every((tagId) => node.tags.includes(tagId)))
    .filter((node) => fromTs === null || node.createdAt >= fromTs)
    .filter((node) => toTs === null || node.createdAt <= toTs);

  // ── Field value filtering ──
  if (fieldFilters.length > 0) {
    candidates = candidates.filter((node) => {
      return fieldFilters.every(({ fieldDefId, value }) => {
        const fieldValues = getFieldValue(node, fieldDefId);
        const normalizedTarget = value.trim().toLowerCase();
        return fieldValues.some((v) => v.trim().toLowerCase() === normalizedTarget);
      });
    });
  }

  // ── Count mode ──
  if (params.count) {
    // For count mode with query, we still need to filter by query
    if (query) {
      const ranked = fuzzySort(
        candidates.map((node) => ({
          ...node,
          _haystack: `${node.name ?? ''}\n${node.description ?? ''}`,
        })),
        query,
        (item) => item._haystack,
        candidates.length,
      );
      const result = { total: ranked.length };
      return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
    }
    const result = { total: candidates.length };
    return { content: [{ type: 'text', text: formatResultText(result) }], details: result };
  }

  // ── Ranking / sorting ──
  const sortField = params.sort?.field ?? (query ? 'relevance' : 'modified');
  const sortOrder = params.sort?.order ?? 'desc';

  let ranked: Array<NodexNode & { _fuzzyScore: number; _fuzzyRanges: unknown[] }>;

  if (query) {
    ranked = fuzzySort(
      candidates.map((node) => ({
        ...node,
        _haystack: `${node.name ?? ''}\n${node.description ?? ''}`,
      })),
      query,
      (item) => item._haystack,
      candidates.length,
    );
  } else {
    ranked = candidates
      .map((node) => ({ ...node, _fuzzyScore: 0, _fuzzyRanges: [] }));
  }

  // Apply sorting (unless sorting by relevance, which is already the fuzzySort order)
  if (sortField !== 'relevance') {
    const store = useNodeStore.getState();
    const getNode = store.getNode;
    const backlinkCounts = sortField === 'refCount'
      ? buildBacklinkCountMap(store._version)
      : undefined;

    const sortConfig: SortConfig = {
      field: sortField === 'created' ? 'createdAt'
        : sortField === 'modified' ? 'updatedAt'
        : sortField,
      direction: sortOrder,
    };

    ranked.sort((a, b) => compareNodes(a, b, sortConfig, getNode, backlinkCounts));
  }

  // ── Pagination + output ──
  const items = ranked.slice(offset, offset + limit).map((node) => {
    const snippetSource = [node.name ?? '', node.description ?? ''].filter(Boolean).join(' — ');
    const parentId = getNavigableParentId(node.id);
    const parentName = parentId ? (loroDoc.toNodexNode(parentId)?.name ?? parentId) : '';
    return {
      id: node.id,
      name: node.name ?? '',
      tags: getTagDisplayNames(node.tags),
      snippet: snippetSource.length > 180 ? `${snippetSource.slice(0, 177)}...` : snippetSource,
      createdAt: new Date(node.createdAt).toISOString(),
      parentName,
      fields: getNodeFieldsMap(node.id),
    };
  });

  const result = { total: ranked.length, offset, limit, items };
  return {
    content: [{ type: 'text', text: formatResultText(result) }],
    details: result,
  };
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
