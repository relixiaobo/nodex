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
import { SYSTEM_SCHEMA_NODE_IDS } from './system-schema-presets.js';

const STORAGE_KEY = 'soma-settings';
let settingsProjectionStarted = false;
let lastProjectedSnapshotJson: string | null = null;

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
  const snapshotJson = JSON.stringify(snapshot);
  if (snapshotJson === lastProjectedSnapshotJson) return;
  lastProjectedSnapshotJson = snapshotJson;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: snapshot });
  } catch {
    // chrome.storage may not be available in test environments
  }
}

export function startSettingsProjection(): void {
  if (settingsProjectionStarted) return;
  settingsProjectionStarted = true;
  void projectToStorage();
  loroDoc.subscribe(() => {
    void projectToStorage();
  });
}

// ── Migration from ui-store ─────────────────────────────

export async function migrateFromUIStore(): Promise<void> {
  // Read old value from ui-store in chrome.storage
  let storedLegacyValue: boolean | null = null;
  try {
    const stored = await chrome.storage.local.get('nodex-ui');
    const uiState = stored?.['nodex-ui']?.state;
    if (uiState && typeof uiState.highlightEnabled === 'boolean') {
      storedLegacyValue = uiState.highlightEnabled;
    }
  } catch {
    // Fallback to default
  }

  const settingFieldEntry = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_FIELD_ENTRY);
  const currentValueIds = settingFieldEntry?.children ?? [];
  const hasUserValue = currentValueIds.length > 0
    && !(
      currentValueIds.length === 1
      && currentValueIds[0] === SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE
      && loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_HIGHLIGHT_VALUE)?.name === SYS_V.YES
    );

  if (!hasUserValue && storedLegacyValue !== null) {
    setHighlightEnabled(storedLegacyValue);
    return;
  }

  await projectToStorage();
}
