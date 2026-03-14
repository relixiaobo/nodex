/**
 * NavButtons (panel navigation) tests.
 *
 * Verifies that goBack / goForward correctly navigate via navHistory events,
 * matching the logic consumed by NavButtons.tsx.
 *
 * Seed data initializes panels to [{id:'main', nodeId: Today}] via replacePanel,
 * so all tests start with a single panel showing the current day node.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureTodayNode } from '../../src/lib/journal.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetAndSeed } from './helpers/test-state.js';

/** Helper: get current active panel node ID */
function currentNodeId(): string | null {
  const s = useUIStore.getState();
  return s.panels.find((p) => p.id === s.activePanelId)?.nodeId ?? null;
}

beforeEach(() => {
  resetAndSeed();
});

describe('NavButtons — panel navigation', () => {
  it('seed initializes with a panel showing Today', () => {
    const s = useUIStore.getState();
    expect(s.panels.length).toBe(1);
    expect(s.panels[0].nodeId).toBe(ensureTodayNode());
    expect(s.activePanelId).toBe(s.panels[0].id);
  });

  it('navigateTo updates active panel nodeId and pushes navHistory', () => {
    useUIStore.getState().navigateTo('proj_1');
    const s = useUIStore.getState();
    expect(currentNodeId()).toBe('proj_1');
    expect(s.navHistory.length).toBe(1);
    expect(s.navIndex).toBe(0);
  });

  it('goBack restores previous nodeId', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().goBack();

    expect(currentNodeId()).toBe('proj_1');
  });

  it('goForward restores forward nodeId', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().goBack();
    useUIStore.getState().goForward();

    expect(currentNodeId()).toBe('note_1');
  });

  it('goBack is no-op at start of history', () => {
    const todayId = ensureTodayNode();
    // No navHistory events yet, goBack should be no-op
    useUIStore.getState().goBack();

    expect(currentNodeId()).toBe(todayId);
  });

  it('goForward is no-op at end of history', () => {
    useUIStore.getState().navigateTo('proj_1');
    // Already at end, goForward should be no-op
    useUIStore.getState().goForward();

    expect(currentNodeId()).toBe('proj_1');
  });

  it('navigateTo after goBack truncates forward history', () => {
    useUIStore.getState().navigateTo('proj_1');
    useUIStore.getState().navigateTo('note_1');
    useUIStore.getState().navigateTo('note_2');
    useUIStore.getState().goBack(); // → note_1
    useUIStore.getState().navigateTo('person_1'); // truncates note_2

    expect(currentNodeId()).toBe('person_1');
    // navHistory should have: navigate(today→proj_1), navigate(proj_1→note_1), navigate(note_1→person_1)
    const s = useUIStore.getState();
    expect(s.navHistory.length).toBe(3);
    expect(s.navIndex).toBe(2);
  });
});
