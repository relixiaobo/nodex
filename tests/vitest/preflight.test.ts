import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { useWorkspaceStore } from '../../src/stores/workspace-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('preflight', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('seeds standalone workspace and stores', () => {
    const entities = useNodeStore.getState().entities;
    const ws = useWorkspaceStore.getState();
    const ui = useUIStore.getState();

    expect(Object.keys(entities).length).toBeGreaterThanOrEqual(60);
    expect(ws.currentWorkspaceId).toBe('ws_default');
    expect(ws.userId).toBe('user_default');
    expect(ui.panelHistory.length).toBeGreaterThan(0);
    expect(ui.panelHistory[ui.panelIndex]).toBe('ws_default_LIBRARY');
  });
});

