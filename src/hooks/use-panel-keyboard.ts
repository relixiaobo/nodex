/**
 * Global keyboard hook for multi-panel actions.
 *
 * - Cmd+\        → Open focused/selected node in a new panel
 * - Cmd+Shift+W  → Close the active panel (not the last one)
 * - Cmd+Option+← → Switch to previous panel
 * - Cmd+Option+→ → Switch to next panel
 */
import { useEffect } from 'react';
import { useUIStore, selectCurrentNodeId } from '../stores/ui-store.js';
import { getShortcutKeys, matchesShortcutEvent } from '../lib/shortcut-registry.js';
import { isAppPanel, isChatPanel } from '../types/index.js';

export function usePanelKeyboard() {
  useEffect(() => {
    const openBindings = getShortcutKeys('global.open_panel', ['Mod-\\']);
    const closeBindings = getShortcutKeys('global.close_panel', ['Mod-Shift-w']);
    const prevBindings = getShortcutKeys('global.prev_panel', ['Mod-Alt-ArrowLeft']);
    const nextBindings = getShortcutKeys('global.next_panel', ['Mod-Alt-ArrowRight']);

    function handler(e: KeyboardEvent) {
      const state = useUIStore.getState();

      // Open panel: Cmd+\ — open focused/selected node in new panel
      if (openBindings.some((b) => matchesShortcutEvent(e, b))) {
        const nodeId = state.focusedNodeId ?? state.selectedNodeId ?? selectCurrentNodeId(state);
        if (!nodeId || isChatPanel(nodeId) || isAppPanel(nodeId)) return;
        e.preventDefault();
        state.openPanel(nodeId);
        return;
      }

      // Close panel: Cmd+Shift+W
      if (closeBindings.some((b) => matchesShortcutEvent(e, b))) {
        if (state.panels.length <= 1) return;
        e.preventDefault();
        state.closePanel(state.activePanelId);
        return;
      }

      // Previous panel: Cmd+Option+←
      if (prevBindings.some((b) => matchesShortcutEvent(e, b))) {
        if (state.panels.length <= 1) return;
        e.preventDefault();
        const idx = state.panels.findIndex((p) => p.id === state.activePanelId);
        const prevIdx = idx > 0 ? idx - 1 : state.panels.length - 1;
        state.setActivePanel(state.panels[prevIdx].id);
        return;
      }

      // Next panel: Cmd+Option+→
      if (nextBindings.some((b) => matchesShortcutEvent(e, b))) {
        if (state.panels.length <= 1) return;
        e.preventDefault();
        const idx = state.panels.findIndex((p) => p.id === state.activePanelId);
        const nextIdx = idx < state.panels.length - 1 ? idx + 1 : 0;
        state.setActivePanel(state.panels[nextIdx].id);
        return;
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
