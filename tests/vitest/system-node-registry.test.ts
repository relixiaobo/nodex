import { describe, it, expect } from 'vitest';
import { CONTAINER_IDS } from '../../src/types/index.js';
import {
  SYSTEM_CONTAINER_REGISTRY,
  BOOTSTRAP_CONTAINER_DEFS,
  SIDEBAR_CONTAINER_ITEMS,
  COMMAND_PALETTE_QUICK_CONTAINERS,
  getSystemContainerMeta,
} from '../../src/lib/system-node-registry.js';

describe('system node registry', () => {
  it('contains all declared container ids exactly once', () => {
    const ids = SYSTEM_CONTAINER_REGISTRY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(Object.values(CONTAINER_IDS)));
  });

  it('preserves bootstrap container list and order', () => {
    expect(BOOTSTRAP_CONTAINER_DEFS).toEqual([
      { id: CONTAINER_IDS.LIBRARY, name: 'Library' },
      { id: CONTAINER_IDS.INBOX, name: 'Inbox' },
      { id: CONTAINER_IDS.JOURNAL, name: 'Daily notes' },
      { id: CONTAINER_IDS.SEARCHES, name: 'Searches' },
      { id: CONTAINER_IDS.TRASH, name: 'Trash' },
      { id: CONTAINER_IDS.SCHEMA, name: 'Schema' },
      { id: CONTAINER_IDS.SETTINGS, name: 'Settings' },
      { id: CONTAINER_IDS.ABOUT, name: 'About' },
    ]);
  });

  it('preserves sidebar container items and order', () => {
    expect(SIDEBAR_CONTAINER_ITEMS.map((c) => c.id)).toEqual([
      CONTAINER_IDS.LIBRARY,
      CONTAINER_IDS.INBOX,
      CONTAINER_IDS.JOURNAL,
      CONTAINER_IDS.SEARCHES,
      CONTAINER_IDS.TRASH,
    ]);
    expect(SIDEBAR_CONTAINER_ITEMS.find((c) => c.id === CONTAINER_IDS.JOURNAL)?.showTodayShortcut).toBe(true);
  });

  it('preserves command palette quick-access containers and order', () => {
    expect(COMMAND_PALETTE_QUICK_CONTAINERS.map((c) => c.id)).toEqual([
      CONTAINER_IDS.LIBRARY,
      CONTAINER_IDS.INBOX,
      CONTAINER_IDS.JOURNAL,
      CONTAINER_IDS.TRASH,
    ]);
  });

  it('exposes metadata lookup by id', () => {
    expect(getSystemContainerMeta(CONTAINER_IDS.SCHEMA)?.defaultName).toBe('Schema');
    expect(getSystemContainerMeta(CONTAINER_IDS.CLIPS)?.seedInWorkspace).toBe(false);
  });
});
