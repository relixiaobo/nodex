import { getAllNodeIds } from '../../src/lib/loro-doc.js';
import { ensureTodayNode } from '../../src/lib/journal.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { useWorkspaceStore } from '../../src/stores/workspace-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('preflight', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('seeds standalone workspace and stores', () => {
    const nodeIds = getAllNodeIds();
    const ws = useWorkspaceStore.getState();
    const ui = useUIStore.getState();

    expect(nodeIds.length).toBeGreaterThanOrEqual(20);
    expect(ws.currentWorkspaceId).toBe('ws_default');
    expect(ws.userId).toBe('user_default');
    expect(ui.panels.length).toBeGreaterThan(0);
    const currentNodeId = ui.panels.find((p) => p.id === ui.activePanelId)?.nodeId;
    expect(currentNodeId).toBe(ensureTodayNode());
  });
});
