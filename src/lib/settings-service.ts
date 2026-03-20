/**
 * Settings service — LoroDoc as source of truth + chrome.storage projection.
 *
 * Settings are stored as fixed nodes/field entries under the SETTINGS tree.
 * Changes are projected to chrome.storage['soma-settings'] so that
 * content scripts (which cannot access LoroDoc) can read them.
 */
import { SYSTEM_NODE_IDS } from '../types/index.js';
import { NDX_F, SYS_V } from '../types/system-nodes.js';
import * as loroDoc from './loro-doc.js';
import { useNodeStore } from '../stores/node-store.js';
import { getStartupPagePreference, STARTUP_PAGE, type StartupPagePreference } from './startup-page-preference.js';
import { SYSTEM_SCHEMA_NODE_IDS } from './system-schema-presets.js';

export { getStartupPagePreference, STARTUP_PAGE };
export type { StartupPagePreference };

const STORAGE_KEY = 'soma-settings';
let settingsProjectionStarted = false;
let lastProjectedSnapshotJson: string | null = null;

export interface SettingsSnapshot {
  highlightEnabled: boolean;
}

const DEFAULTS: SettingsSnapshot = {
  highlightEnabled: true,
};

function findFieldEntry(nodeId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const childId of children) {
    const child = loroDoc.toNodexNode(childId);
    if (child?.type === 'fieldEntry' && child.fieldDefId === fieldDefId) {
      return childId;
    }
  }
  return null;
}

// ── Read ────────────────────────────────────────────────

export function getHighlightEnabled(): boolean {
  const fieldEntryId = findFieldEntry(SYSTEM_NODE_IDS.SETTINGS, NDX_F.SETTING_HIGHLIGHT_ENABLED);
  if (!fieldEntryId) return DEFAULTS.highlightEnabled;

  const node = loroDoc.toNodexNode(fieldEntryId);
  const valChildren = node?.children ?? [];
  if (valChildren.length === 0) return DEFAULTS.highlightEnabled;
  const valNode = loroDoc.toNodexNode(valChildren[0]);
  return valNode?.name !== SYS_V.NO;
}

// ── Write ───────────────────────────────────────────────

export function setHighlightEnabled(enabled: boolean): void {
  const value = enabled ? SYS_V.YES : SYS_V.NO;
  useNodeStore.getState().setFieldValue(
    SYSTEM_NODE_IDS.SETTINGS,
    NDX_F.SETTING_HIGHLIGHT_ENABLED,
    [value],
  );
  void projectToStorage();
}

export function setStartupPagePreference(page: StartupPagePreference): void {
  const optionNodeId = page === STARTUP_PAGE.TODAY
    ? SYSTEM_SCHEMA_NODE_IDS.SETTINGS_STARTUP_PAGE_TODAY_OPTION
    : SYSTEM_SCHEMA_NODE_IDS.SETTINGS_STARTUP_PAGE_CHAT_OPTION;

  useNodeStore.getState().setOptionsFieldValue(
    SYSTEM_NODE_IDS.SETTINGS,
    NDX_F.SETTING_STARTUP_PAGE,
    optionNodeId,
  );
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
