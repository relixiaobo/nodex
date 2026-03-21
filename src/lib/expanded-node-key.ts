export function buildExpandedNodeKey(parentId: string, nodeId: string): string {
  return `${parentId}:${nodeId}`;
}

export function normalizeExpandedNodeKey(key: string): string {
  const parts = key.split(':');
  if (parts.length >= 3) {
    return parts.slice(1).join(':');
  }
  return key;
}

export function normalizeExpandedNodeSet(keys: Iterable<string>): Set<string> {
  const normalized = new Set<string>();
  for (const key of keys) {
    normalized.add(normalizeExpandedNodeKey(key));
  }
  return normalized;
}

export function expandedNodeSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}
