import { describe, it, expect, beforeEach } from 'vitest';
import { ensureTodayNode } from '../../src/lib/journal.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

function currentNodeId(): string | null {
  return useUIStore.getState().currentNodeId;
}

beforeEach(() => {
  resetAndSeed();
});

describe('node history navigation', () => {
  it('seed initializes the node view with Today', () => {
    const s = useUIStore.getState();
    expect(s.currentNodeId).toBe(ensureTodayNode());
    expect(s.nodeHistory).toEqual([ensureTodayNode()]);
    expect(s.nodeHistoryIndex).toBe(0);
  });

  it('navigateTo updates currentNodeId and pushes nodeHistory', () => {
    useUIStore.getState().navigateTo('proj_1');
    const s = useUIStore.getState();
    expect(currentNodeId()).toBe('proj_1');
    expect(s.nodeHistory).toEqual([ensureTodayNode(), 'proj_1']);
    expect(s.nodeHistoryIndex).toBe(1);
  });

  it('goBackNode restores the previous node id', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().goBackNode();

    expect(currentNodeId()).toBe('proj_1');
  });

  it('goForwardNode restores the forward node id', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().goBackNode();
    useUIStore.getState().goForwardNode();

    expect(currentNodeId()).toBe('note_1');
  });

  it('goBackNode is a no-op at the start of history', () => {
    const todayId = ensureTodayNode();
    useUIStore.getState().goBackNode();
    expect(currentNodeId()).toBe(todayId);
  });

  it('goForwardNode is a no-op at the end of history', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().goForwardNode();
    expect(currentNodeId()).toBe('proj_1');
  });

  it('navigateTo after goBackNode truncates forward history', () => {
    const todayId = ensureTodayNode();
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().navigateTo('note_2');
    useUIStore.getState().goBackNode();
    useUIStore.getState().navigateTo('person_1');

    expect(currentNodeId()).toBe('person_1');
    const s = useUIStore.getState();
    expect(s.nodeHistory).toEqual([todayId, 'proj_1', 'note_1', 'person_1']);
    expect(s.nodeHistoryIndex).toBe(3);
  });
});
