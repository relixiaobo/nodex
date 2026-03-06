import { describe, it, expect, beforeEach } from 'vitest';
import { resetAndSeed } from './helpers/test-state.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import {
  BOOTSTRAP_CONTAINER_DEFS,
  SIDEBAR_CONTAINER_ITEMS,
  getSystemContainerMeta,
} from '../../src/lib/system-node-registry.js';
import { getHighlightEnabled, setHighlightEnabled } from '../../src/lib/settings-service.js';

describe('settings system', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  // ── SETTINGS container registry ──

  it('SETTINGS exists in CONTAINER_IDS', () => {
    expect(CONTAINER_IDS.SETTINGS).toBe('SETTINGS');
  });

  it('SETTINGS is in the system container registry', () => {
    const meta = getSystemContainerMeta(CONTAINER_IDS.SETTINGS as any);
    expect(meta).toBeDefined();
    expect(meta!.defaultName).toBe('Settings');
    expect(meta!.iconKey).toBe('settings');
    expect(meta!.seedInWorkspace).toBe(true);
  });

  it('SETTINGS is included in bootstrap container defs', () => {
    const settingsDef = BOOTSTRAP_CONTAINER_DEFS.find((c) => c.id === CONTAINER_IDS.SETTINGS);
    expect(settingsDef).toBeDefined();
    expect(settingsDef!.name).toBe('Settings');
  });

  it('SETTINGS is NOT in sidebar items', () => {
    const found = SIDEBAR_CONTAINER_ITEMS.find((c) => c.id === CONTAINER_IDS.SETTINGS);
    expect(found).toBeUndefined();
  });

  // ── highlightEnabled (LoroDoc field on SETTINGS node) ──

  it('highlightEnabled defaults to true', () => {
    expect(getHighlightEnabled()).toBe(true);
  });

  it('setHighlightEnabled toggles the value', () => {
    setHighlightEnabled(false);
    expect(getHighlightEnabled()).toBe(false);

    setHighlightEnabled(true);
    expect(getHighlightEnabled()).toBe(true);
  });
});
