const rootScopeRowIdsByKey = new Map<string, string[]>();

function getKey(rootNodeId: string, panelId: string): string {
  return `${panelId}:${rootNodeId}`;
}

export function setRootScopeRowIds(rootNodeId: string, panelId: string, rowIds: string[]): void {
  rootScopeRowIdsByKey.set(getKey(rootNodeId, panelId), rowIds);
}

export function clearRootScopeRowIds(rootNodeId: string, panelId: string): void {
  rootScopeRowIdsByKey.delete(getKey(rootNodeId, panelId));
}

export function getRootScopeRowIds(rootNodeId: string, panelId: string, fallback: string[] = []): string[] {
  return rootScopeRowIdsByKey.get(getKey(rootNodeId, panelId)) ?? fallback;
}
