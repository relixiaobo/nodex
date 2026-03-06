/**
 * Settings service — LoroDoc as source of truth + chrome.storage projection.
 *
 * Settings are stored as field entries on the SETTINGS container node.
 * Changes are projected to chrome.storage['soma-settings'] so that
 * content scripts (which cannot access LoroDoc) can read them.
 */
import { CONTAINER_IDS } from '../types/index.js';
import { NDX_F, SYS_V } from '../types/system-nodes.js';
import * as loroDoc from './loro-doc.js';
import { useNodeStore } from '../stores/node-store.js';

const STORAGE_KEY = 'soma-settings';

export interface SettingsSnapshot {
  highlightEnabled: boolean;
}

const DEFAULTS: SettingsSnapshot = {
  highlightEnabled: true,
};

// ── Read ────────────────────────────────────────────────

export function getHighlightEnabled(): boolean {
  const children = loroDoc.getChildren(CONTAINER_IDS.SETTINGS);
  for (const cid of children) {
    const node = loroDoc.toNodexNode(cid);
    if (node?.type === 'fieldEntry' && node.fieldDefId === NDX_F.SETTING_HIGHLIGHT_ENABLED) {
      const valChildren = node.children ?? [];
      if (valChildren.length === 0) return DEFAULTS.highlightEnabled;
      const valNode = loroDoc.toNodexNode(valChildren[0]);
      return valNode?.name !== SYS_V.NO;
    }
  }
  return DEFAULTS.highlightEnabled;
}

// ── Write ───────────────────────────────────────────────

export function setHighlightEnabled(enabled: boolean): void {
  const value = enabled ? SYS_V.YES : SYS_V.NO;
  useNodeStore.getState().setFieldValue(
    CONTAINER_IDS.SETTINGS,
    NDX_F.SETTING_HIGHLIGHT_ENABLED,
    [value],
  );
  void projectToStorage();
}

// ── Projection to chrome.storage ────────────────────────

export function getSettingsSnapshot(): SettingsSnapshot {
  return {
    highlightEnabled: getHighlightEnabled(),
  };
}

export async function projectToStorage(): Promise<void> {
  const snapshot = getSettingsSnapshot();
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: snapshot });
  } catch {
    // chrome.storage may not be available in test environments
  }
}

// ── Migration from ui-store ─────────────────────────────

export async function migrateFromUIStore(): Promise<void> {
  // Check if the setting already exists in LoroDoc
  const children = loroDoc.getChildren(CONTAINER_IDS.SETTINGS);
  const alreadyMigrated = children.some((cid) => {
    const node = loroDoc.toNodexNode(cid);
    return node?.type === 'fieldEntry' && node.fieldDefId === NDX_F.SETTING_HIGHLIGHT_ENABLED;
  });

  if (alreadyMigrated) {
    // Just project current value to chrome.storage
    await projectToStorage();
    return;
  }

  // Read old value from ui-store in chrome.storage
  let oldValue = DEFAULTS.highlightEnabled;
  try {
    const stored = await chrome.storage.local.get('nodex-ui');
    const uiState = stored?.['nodex-ui']?.state;
    if (uiState && typeof uiState.highlightEnabled === 'boolean') {
      oldValue = uiState.highlightEnabled;
    }
  } catch {
    // Fallback to default
  }

  // Write to LoroDoc
  setHighlightEnabled(oldValue);
}
