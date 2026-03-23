export function buildExpandedNodeKey(panelId: string, parentId: string, nodeId: string): string {
  return `${panelId}:${parentId}:${nodeId}`;
}

export function expandedNodeSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}
