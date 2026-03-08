/**
 * Group utilities for View Toolbar — group outliner children by field.
 *
 * Supports grouping by: tags, done, createdAt, updatedAt, fieldDefId.
 * Multi-value fields (tags, options) use combination keys:
 *   node with #note + #day → group "day, note" (alphabetically sorted).
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
      // Combination key: sort tag names alphabetically, join with ", "
      const tagEntries = node.tags
        .map((tagId) => ({ id: tagId, name: getNode(tagId)?.name ?? tagId }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const key = tagEntries.map((t) => t.id).join('+');
      const label = tagEntries.map((t) => t.name).join(', ');
      return [{ key, label }];
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

/** Get group values from a field entry — combination key for multi-value fields. */
function getFieldGroupValues(
  node: NodexNode,
  fieldDefId: string,
  getNode: (id: string) => NodexNode | null,
): Array<{ key: string; label: string }> {
  for (const childId of node.children) {
    const child = getNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      const entries: Array<{ key: string; label: string }> = [];
      for (const valId of child.children) {
        const valNode = getNode(valId);
        if (!valNode) continue;
        if (valNode.targetId) {
          const target = getNode(valNode.targetId);
          entries.push({ key: valNode.targetId, label: target?.name ?? valNode.name ?? valId });
        } else {
          entries.push({ key: valId, label: valNode.name ?? valId });
        }
      }
      if (entries.length === 0) return [];
      // Combination key: sort alphabetically, join
      entries.sort((a, b) => a.label.localeCompare(b.label));
      const key = entries.map((e) => e.key).join('+');
      const label = entries.map((e) => e.label).join(', ');
      return [{ key, label }];
    }
  }
  return [];
}
