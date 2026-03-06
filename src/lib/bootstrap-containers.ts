/**
 * Ensure workspace containers, journal tags, and system tags exist in LoroDoc.
 *
 * Shared between App.tsx bootstrap and workspace-store.ts sign-in transition.
 * Idempotent — safe to call multiple times for the same workspace.
 */
import * as loroDoc from './loro-doc.js';
import { commitDoc } from './loro-doc.js';
import { ensureWorkspaceHomeNode } from './workspace-root.js';
import { BOOTSTRAP_CONTAINER_DEFS } from './system-node-registry.js';
import { ensureJournalTagDefs } from './journal.js';
import { ensureHighlightTagDef, ensureNoteTagDef, type HighlightNodeStore } from './highlight-service.js';
import { useNodeStore } from '../stores/node-store.js';
import { migrateFromUIStore } from './settings-service.js';

export function ensureContainers(wsId: string): void {
  ensureWorkspaceHomeNode(wsId);
  for (const { id, name } of BOOTSTRAP_CONTAINER_DEFS) {
    if (!loroDoc.hasNode(id)) {
      loroDoc.createNode(id, wsId);
      loroDoc.setNodeRichTextContent(id, name, [], []);
    } else if (loroDoc.getParentId(id) !== wsId) {
      loroDoc.moveNode(id, wsId);
    }
  }
  ensureJournalTagDefs();
  const store = useNodeStore.getState() as HighlightNodeStore;
  ensureHighlightTagDef(store);
  ensureNoteTagDef(store);
  commitDoc('system:bootstrap');

  // Migrate settings from ui-store to LoroDoc (idempotent)
  void migrateFromUIStore();
}
