/**
 * NavButtons (panel navigation) tests.
 *
 * Verifies that goBack / goForward correctly navigate panel history,
 * matching the logic consumed by NavButtons.tsx.
 *
 * Seed data initializes panelHistory to ['LIBRARY'] via replacePanel,
 * so all tests start with index 0 pointing to LIBRARY.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

beforeEach(() => {
  resetAndSeed();
});

describe('NavButtons — panel history navigation', () => {
  it('seed initializes at LIBRARY with index 0', () => {
    const s = useUIStore.getState();
    expect(s.panelIndex).toBe(0);
    expect(s.panelHistory).toEqual(['LIBRARY']);
  });

  it('navigateTo pushes to history', () => {
    useUIStore.getState().navigateTo('proj_1');
    const s = useUIStore.getState();
    expect(s.panelHistory).toEqual(['LIBRARY', 'proj_1']);
    expect(s.panelIndex).toBe(1);
  });

  it('goBack moves index backward', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().goBack();

    const s = useUIStore.getState();
    expect(s.panelIndex).toBe(1);
    expect(s.panelHistory[s.panelIndex]).toBe('proj_1');
  });

  it('goForward moves index forward', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().goBack();
    useUIStore.getState().goForward();

    const s = useUIStore.getState();
    expect(s.panelIndex).toBe(2);
    expect(s.panelHistory[s.panelIndex]).toBe('note_1');
  });

  it('goBack is no-op at start of history', () => {
    // Already at index 0 (LIBRARY), goBack should be no-op
    useUIStore.getState().goBack();

    const s = useUIStore.getState();
    expect(s.panelIndex).toBe(0);
    expect(s.panelHistory[0]).toBe('LIBRARY');
  });

  it('goForward is no-op at end of history', () => {
    useUIStore.getState().navigateTo('proj_1');
    // Already at end, goForward should be no-op
    useUIStore.getState().goForward();

    const s = useUIStore.getState();
    expect(s.panelIndex).toBe(1);
  });

  it('navigateTo after goBack truncates forward history', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().navigateTo('note_2');
    useUIStore.getState().goBack(); // → note_1
    useUIStore.getState().navigateTo('person_1'); // truncates note_2

    const s = useUIStore.getState();
    expect(s.panelHistory).toEqual(['LIBRARY', 'proj_1', 'note_1', 'person_1']);
    expect(s.panelIndex).toBe(3);
  });
});
