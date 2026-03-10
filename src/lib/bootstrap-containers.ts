/**
 * Ensure workspace containers, journal tags, and system tags exist in LoroDoc.
 *
 * Shared between App.tsx bootstrap and workspace-store.ts sign-in transition.
 * Idempotent — safe to call multiple times for the same workspace.
 */
import * as loroDoc from './loro-doc.js';
import { commitDoc } from './loro-doc.js';
import { ensureWorkspaceHomeNode } from './workspace-root.js';
import { CONTAINER_IDS } from '../types/index.js';
import { BOOTSTRAP_SYSTEM_NODES } from './system-node-presets.js';
import { ensureJournalTagDefs } from './journal.js';
import { ensureHighlightTagDef, ensureNoteTagDef, type HighlightNodeStore } from './highlight-service.js';
import { useNodeStore } from '../stores/node-store.js';
import { migrateFromUIStore, startSettingsProjection } from './settings-service.js';
import { ensureSystemSchema } from './system-schema-presets.js';

export function ensureContainers(wsId: string): void {
  ensureWorkspaceHomeNode(wsId);
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

  for (const nodeId of [CONTAINER_IDS.LIBRARY, CONTAINER_IDS.INBOX, CONTAINER_IDS.SEARCHES, CONTAINER_IDS.CLIPS, CONTAINER_IDS.STASH]) {
    if (loroDoc.toNodexNode(nodeId)?.locked) {
      loroDoc.deleteNodeData(nodeId, 'locked');
    }
  }
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
