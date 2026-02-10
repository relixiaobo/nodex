/**
 * Phase 1.1 — Store Preflight Check
 *
 * Verifies stores are mounted on window and seed data is loaded.
 * Run via chrome-devtools evaluate_script on localhost:5199.
 *
 * Expected: { ok: true, entities: 36+, workspace: 'ws_default' }
 */
(() => {
  const ns = window.__nodeStore;
  const ui = window.__uiStore;
  const ws = window.__wsStore;

  if (!ns || !ui || !ws) return { error: 'Stores not mounted on window' };

  const count = Object.keys(ns.getState().entities).length;
  if (count < 30) return { error: `Only ${count} entities, expected 36+ (seed data missing?)` };

  return {
    ok: true,
    entities: count,
    workspace: ws.getState().currentWorkspaceId,
    panelStack: ui.getState().panelStack,
  };
})()
