/**
 * View pipeline — shared filter → group → sort logic for outliner containers.
 *
 * Both OutlinerView and OutlinerItem apply the same transformation pipeline
 * to their content rows. This module extracts that logic into pure functions.
 */
import type { NodexNode } from '../types/node.js';
import type { OutlinerRowItem } from '../components/outliner/row-model.js';
import { compareNodesByRules, type SortConfig } from './sort-utils.js';
import { matchesAllFilters, type FilterCondition } from './filter-utils.js';
import { groupNodes } from './group-utils.js';
import { buildBacklinkCountMap } from './backlinks.js';

export interface ViewConfig {
  sortRules: SortConfig[];
  filters: FilterCondition[];
  groupField: string | null;
}

/**
 * Read view config (sort/filter/group) from a node's ViewDef child.
 *
 * Sort rules: reads sortRule child nodes first, then falls back to legacy
 * sortField/sortDirection properties on the viewDef itself.
 *
 * @param parentId  The outliner parent node ID
 * @param getViewDefId  Resolve viewDef child ID
 * @param getNode  Node accessor
 * @param getFilters  Filter accessor (reads viewDef children)
 */
export function readViewConfig(
  parentId: string,
  getViewDefId: (id: string) => string | null,
  getNode: (id: string) => NodexNode | null,
  getFilters: (id: string) => Array<{ field: string; op: 'all' | 'any'; values: string[] }>,
): ViewConfig {
  const viewDefId = getViewDefId(parentId);
  if (!viewDefId) return { sortRules: [], filters: [], groupField: null };
  const viewDef = getNode(viewDefId);

  // Read sort rules from child nodes
  const sortRules: SortConfig[] = [];
  if (viewDef) {
    for (const childId of viewDef.children) {
      const child = getNode(childId);
      if (child?.type === 'sortRule' && child.sortField) {
        sortRules.push({
          field: child.sortField,
          direction: (child.sortDirection as 'asc' | 'desc') ?? 'asc',
        });
      }
    }
  }

  // Legacy fallback: single sortField/sortDirection on viewDef
  if (sortRules.length === 0 && viewDef?.sortField) {
    sortRules.push({
      field: viewDef.sortField,
      direction: (viewDef.sortDirection as 'asc' | 'desc') ?? 'asc',
    });
  }

  const filters: FilterCondition[] = getFilters(parentId).map((f) => ({
    field: f.field,
    op: f.op,
    values: f.values,
  }));
  const groupField = viewDef?.groupField ?? null;
  return { sortRules, filters, groupField };
}

/**
 * Resolve a node through references: if the node is a reference node,
 * return the target node; otherwise return the node itself.
 */
function resolveNode(
  node: NodexNode,
  getNode: (id: string) => NodexNode | null,
): NodexNode {
  if (node.type === 'reference' && node.targetId) {
    return getNode(node.targetId) ?? node;
  }
  return node;
}

/**
 * Apply the view pipeline to outliner rows: filter → group → sort.
 *
 * Field rows pass through unchanged; only content rows are processed.
 * Returns a new array with groupHeader rows inserted when grouping.
 */
export function applyViewPipeline(
  rows: OutlinerRowItem[],
  config: ViewConfig,
  getNode: (id: string) => NodexNode | null,
  version: number,
): OutlinerRowItem[] {
  const { sortRules, filters, groupField } = config;

  // No view features active → preserve natural order from buildVisibleChildrenRows
  // (template fields already at front, non-template fields interleaved with content)
  if (sortRules.length === 0 && filters.length === 0 && !groupField) {
    return rows;
  }

  // Split: template field prefix (consecutive fields at the start) vs remaining
  let templateEnd = 0;
  while (templateEnd < rows.length && rows[templateEnd].type === 'field') {
    templateEnd++;
  }
  const templateFields = rows.slice(0, templateEnd);
  const remaining = rows.slice(templateEnd);

  // Extract content rows from remaining for filter/sort/group
  let contentRows = remaining.filter((r) => r.type === 'content');

  // Reference-aware node accessor: resolves reference → target transparently.
  const getEffectiveNode = (id: string): NodexNode | null => {
    const raw = getNode(id);
    return raw ? resolveNode(raw, getNode) : null;
  };

  // 1. Filter
  if (filters.length > 0) {
    const kept = new Set(contentRows.filter((r) => {
      const node = getEffectiveNode(r.id);
      return node ? matchesAllFilters(node, filters, getEffectiveNode) : false;
    }).map((r) => r.id));
    // Remove filtered-out content from remaining, keep non-template fields in place
    contentRows = contentRows.filter((r) => kept.has(r.id));
  }

  // Sort comparator using multi-sort rules
  const needsRefCount = sortRules.some((r) => r.field === 'refCount');
  const backlinkCounts = needsRefCount ? buildBacklinkCountMap(version) : undefined;
  const sortFn = (a: OutlinerRowItem, b: OutlinerRowItem) => {
    const nodeA = getEffectiveNode(a.id);
    const nodeB = getEffectiveNode(b.id);
    if (!nodeA || !nodeB) return 0;
    return compareNodesByRules(nodeA, nodeB, sortRules, getEffectiveNode, backlinkCounts);
  };

  // Non-template field rows from remaining (preserve their positions later)
  const inlineFieldRows = remaining.filter((r) => r.type === 'field');

  // 2. Group + Sort
  if (groupField) {
    const contentIds = contentRows.map((r) => r.id);
    const groups = groupNodes(contentIds, groupField, getEffectiveNode);
    const result: OutlinerRowItem[] = [...templateFields, ...inlineFieldRows];
    for (const group of groups) {
      result.push({ id: `__group__${group.key}`, type: 'groupHeader', label: group.label });
      const groupItems: OutlinerRowItem[] = group.ids.map((id) => ({ id, type: 'content' as const }));
      if (sortRules.length > 0) groupItems.sort(sortFn);
      result.push(...groupItems);
    }
    return result;
  }

  // 3. Sort only (no group)
  if (sortRules.length > 0) {
    contentRows.sort(sortFn);
  }

  return [...templateFields, ...inlineFieldRows, ...contentRows];
}
