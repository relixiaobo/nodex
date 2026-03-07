/**
 * Group utilities for View Toolbar — group outliner children by field.
 *
 * Supports grouping by: tags, done, createdAt, updatedAt, fieldDefId.
 * A node can appear in multiple groups (e.g., Tags with multiple tags).
 * Groups are sorted alphabetically by label. Items within groups keep
 * their original order (sort is applied separately).
 */
import type { NodexNode } from '../types/node.js';

export interface GroupResult {
  key: string;
  label: string;
  ids: string[];
}

/**
 * Group node IDs by the given field.
 * Returns groups sorted alphabetically by label.
 * Nodes with no group value go into an "(Empty)" group at the end.
 */
export function groupNodes(
  ids: string[],
  groupField: string,
  getNode: (id: string) => NodexNode | null,
): GroupResult[] {
  const groupMap = new Map<string, { label: string; ids: string[] }>();
  const emptyIds: string[] = [];

  for (const id of ids) {
    const node = getNode(id);
    if (!node) continue;

    const groupValues = getGroupValues(node, groupField, getNode);
    if (groupValues.length === 0) {
      emptyIds.push(id);
    } else {
      for (const { key, label } of groupValues) {
        let group = groupMap.get(key);
        if (!group) {
          group = { label, ids: [] };
          groupMap.set(key, group);
        }
        group.ids.push(id);
      }
    }
  }

  // Sort groups alphabetically by label
  const groups: GroupResult[] = [...groupMap.entries()]
    .sort(([, a], [, b]) => a.label.localeCompare(b.label))
    .map(([key, { label, ids: gIds }]) => ({ key, label, ids: gIds }));

  // Empty group at the end
  if (emptyIds.length > 0) {
    groups.push({ key: '__empty__', label: '(Empty)', ids: emptyIds });
  }

  return groups;
}

/**
 * Get group key/label pairs for a node.
 * Returns multiple entries for multi-value fields (e.g., Tags).
 */
function getGroupValues(
  node: NodexNode,
  groupField: string,
  getNode: (id: string) => NodexNode | null,
): Array<{ key: string; label: string }> {
  switch (groupField) {
    case 'tags': {
      if (node.tags.length === 0) return [];
      return node.tags.map((tagId) => {
        const tagDef = getNode(tagId);
        return { key: tagId, label: tagDef?.name ?? tagId };
      });
    }
    case 'done': {
      const isDone = node.completedAt != null;
      return [{ key: isDone ? 'done' : 'not-done', label: isDone ? 'Done' : 'Not done' }];
    }
    case 'createdAt': {
      return [dateGroupValue(node.createdAt)];
    }
    case 'updatedAt': {
      return [dateGroupValue(node.updatedAt)];
    }
    default: {
      // Field value grouping
      return getFieldGroupValues(node, groupField, getNode);
    }
  }
}

/** Format a timestamp into a date group key/label. */
function dateGroupValue(ts: number): { key: string; label: string } {
  const d = new Date(ts);
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { key, label: key };
}

/** Get group values from a field entry. */
function getFieldGroupValues(
  node: NodexNode,
  fieldDefId: string,
  getNode: (id: string) => NodexNode | null,
): Array<{ key: string; label: string }> {
  for (const childId of node.children) {
    const child = getNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      const values: Array<{ key: string; label: string }> = [];
      for (const valId of child.children) {
        const valNode = getNode(valId);
        if (!valNode) continue;
        if (valNode.targetId) {
          const target = getNode(valNode.targetId);
          values.push({ key: valNode.targetId, label: target?.name ?? valNode.name ?? valId });
        } else {
          values.push({ key: valId, label: valNode.name ?? valId });
        }
      }
      return values;
    }
  }
  return [];
}
