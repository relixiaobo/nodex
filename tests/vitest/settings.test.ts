import { describe, it, expect, beforeEach } from 'vitest';
import { resetStores } from './helpers/test-state.js';
import { useUIStore, partializeUIStore } from '../../src/stores/ui-store.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import {
  SYSTEM_CONTAINER_REGISTRY,
  BOOTSTRAP_CONTAINER_DEFS,
  SIDEBAR_CONTAINER_ITEMS,
  getSystemContainerMeta,
} from '../../src/lib/system-node-registry.js';

describe('settings system', () => {
  beforeEach(() => {
    resetStores();
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

  // ── highlightEnabled state ──

  it('highlightEnabled defaults to true', () => {
    const state = useUIStore.getState();
    expect(state.highlightEnabled).toBe(true);
  });

  it('setHighlightEnabled toggles the value', () => {
    useUIStore.getState().setHighlightEnabled(false);
    expect(useUIStore.getState().highlightEnabled).toBe(false);

    useUIStore.getState().setHighlightEnabled(true);
    expect(useUIStore.getState().highlightEnabled).toBe(true);
  });

  it('highlightEnabled is included in persisted state', () => {
    const state = useUIStore.getState();
    const persisted = partializeUIStore(state);
    expect(persisted).toHaveProperty('highlightEnabled');
    expect(persisted.highlightEnabled).toBe(true);
  });

  it('persisted state reflects updated highlightEnabled', () => {
    useUIStore.getState().setHighlightEnabled(false);
    const persisted = partializeUIStore(useUIStore.getState());
    expect(persisted.highlightEnabled).toBe(false);
  });
});
