/**
 * View pipeline — shared filter → group → sort logic for outliner containers.
 *
 * Both OutlinerView and OutlinerItem apply the same transformation pipeline
 * to their content rows. This module extracts that logic into pure functions.
 */
import type { NodexNode } from '../types/node.js';
import type { OutlinerRowItem } from '../components/outliner/row-model.js';
import { compareNodes, type SortConfig } from './sort-utils.js';
import { matchesAllFilters, type FilterCondition } from './filter-utils.js';
import { groupNodes } from './group-utils.js';
import { buildBacklinkCountMap } from './backlinks.js';

export interface ViewConfig {
  sort: SortConfig | null;
  filters: FilterCondition[];
  groupField: string | null;
}

/**
 * Read view config (sort/filter/group) from a node's ViewDef child.
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
  if (!viewDefId) return { sort: null, filters: [], groupField: null };
  const viewDef = getNode(viewDefId);
  const sort: SortConfig | null = viewDef?.sortField
    ? { field: viewDef.sortField, direction: viewDef.sortDirection ?? 'asc' }
    : null;
  const filters: FilterCondition[] = getFilters(parentId).map((f) => ({
    field: f.field,
    op: f.op,
    values: f.values,
  }));
  const groupField = viewDef?.groupField ?? null;
  return { sort, filters, groupField };
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
  const fieldRows = rows.filter((r) => r.type === 'field');
  let contentRows = rows.filter((r) => r.type === 'content');
  const { sort, filters, groupField } = config;

  // 1. Filter
  if (filters.length > 0) {
    contentRows = contentRows.filter((r) => {
      const node = getNode(r.id);
      return node ? matchesAllFilters(node, filters, getNode) : false;
    });
  }

  // 2. Group + Sort
  if (groupField) {
    const contentIds = contentRows.map((r) => r.id);
    const groups = groupNodes(contentIds, groupField, getNode);
    const result: OutlinerRowItem[] = [...fieldRows];
    const backlinkCounts = sort?.field === 'refCount' ? buildBacklinkCountMap(version) : undefined;
    for (const group of groups) {
      result.push({ id: `__group__${group.key}`, type: 'groupHeader', label: group.label });
      const groupItems: OutlinerRowItem[] = group.ids.map((id) => ({ id, type: 'content' as const }));
      if (sort) {
        groupItems.sort((a, b) => {
          const nodeA = getNode(a.id);
          const nodeB = getNode(b.id);
          if (!nodeA || !nodeB) return 0;
          return compareNodes(nodeA, nodeB, sort, getNode, backlinkCounts);
        });
      }
      result.push(...groupItems);
    }
    return result;
  }

  // 3. Sort only (no group)
  if (sort) {
    const backlinkCounts = sort.field === 'refCount' ? buildBacklinkCountMap(version) : undefined;
    contentRows.sort((a, b) => {
      const nodeA = getNode(a.id);
      const nodeB = getNode(b.id);
      if (!nodeA || !nodeB) return 0;
      return compareNodes(nodeA, nodeB, sort, getNode, backlinkCounts);
    });
  }

  return [...fieldRows, ...contentRows];
}
