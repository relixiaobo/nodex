/**
 * Ensure fixed system nodes, journal tags, and system tags exist in LoroDoc.
 *
 * Shared between App.tsx bootstrap and workspace-store.ts sign-in transition.
 * Idempotent — safe to call multiple times for the same workspace.
 */
import * as loroDoc from './loro-doc.js';
import { commitDoc } from './loro-doc.js';
import { ensureWorkspaceHomeNode } from './workspace-root.js';
import { SYSTEM_NODE_IDS } from '../types/index.js';
import { BOOTSTRAP_SYSTEM_NODES } from './system-node-presets.js';
import { ensureJournalTagDefs } from './journal.js';
import { ensureHighlightTagDef, ensureNoteTagDef, type HighlightNodeStore } from './highlight-service.js';
import { useNodeStore } from '../stores/node-store.js';
import { migrateFromUIStore, startSettingsProjection } from './settings-service.js';
import { ensureSystemSchema } from './system-schema-presets.js';

const LEGACY_UNLOCKED_SYSTEM_NODE_IDS = [
  SYSTEM_NODE_IDS.LIBRARY,
  SYSTEM_NODE_IDS.INBOX,
  SYSTEM_NODE_IDS.SEARCHES,
  SYSTEM_NODE_IDS.CLIPS,
  SYSTEM_NODE_IDS.STASH,
] as const;

export const SYSTEM_BOOTSTRAP_VERSION = 1;

function applyOneTimeBootstrapMigrations(workspaceHomeId: string): void {
  const currentVersion = loroDoc.toNodexNode(workspaceHomeId)?.systemBootstrapVersion ?? 0;
  if (currentVersion >= SYSTEM_BOOTSTRAP_VERSION) return;

  for (const nodeId of LEGACY_UNLOCKED_SYSTEM_NODE_IDS) {
    if (loroDoc.toNodexNode(nodeId)?.locked) {
      loroDoc.deleteNodeData(nodeId, 'locked');
    }
  }

  loroDoc.setNodeData(workspaceHomeId, 'systemBootstrapVersion', SYSTEM_BOOTSTRAP_VERSION);
}

export function ensureSystemNodes(wsId: string): void {
  const workspaceHomeId = ensureWorkspaceHomeNode(wsId);
  if (!workspaceHomeId) return;

  for (const { id, defaultName, locked } of BOOTSTRAP_SYSTEM_NODES) {
    if (!loroDoc.hasNode(id)) {
      loroDoc.createNode(id, wsId);
      loroDoc.setNodeRichTextContent(id, defaultName, [], []);
      loroDoc.setNodeData(id, 'locked', locked);
    } else if (loroDoc.getParentId(id) !== wsId) {
      loroDoc.moveNode(id, wsId);
    }

    const node = loroDoc.toNodexNode(id);
    const patch: Record<string, unknown> = {};
    if (!node?.name?.trim()) patch.name = defaultName;
    if (node?.locked !== locked) patch.locked = locked;
    if (Object.keys(patch).length > 0) {
      loroDoc.setNodeDataBatch(id, patch);
    }
  }

  applyOneTimeBootstrapMigrations(workspaceHomeId);
  ensureSystemSchema();
  ensureJournalTagDefs();
  const store = useNodeStore.getState() as HighlightNodeStore;
  ensureHighlightTagDef(store);
  ensureNoteTagDef(store);
  commitDoc('system:bootstrap');
  startSettingsProjection();

  // Migrate settings from ui-store to LoroDoc (idempotent)
  void migrateFromUIStore();
}
