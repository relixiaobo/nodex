/**
 * Global keyboard shortcut: Cmd+Shift+D / Ctrl+Shift+D → navigate to today.
 *
 * Only active when no node is focused (edit mode). When a node is focused,
 * selection-keyboard.ts handles Cmd+Shift+D as batch_duplicate.
 */
import { useEffect } from 'react';
import { useUIStore } from '../stores/ui-store';
import { ensureTodayNode } from '../lib/journal.js';

function shouldHandleGlobalShortcut(): boolean {
  const el = document.activeElement;
  if (!el) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return false;
  if ((el as HTMLElement).isContentEditable) return false;
  return true;
}

export function useTodayShortcut(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+Shift+D or Ctrl+Shift+D
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'd') return;

      // Only handle when not in an editor
      if (!shouldHandleGlobalShortcut()) return;

      // Don't handle if a node is focused or selected (selection-keyboard handles it as batch_duplicate)
      const { focusedNodeId, selectedNodeIds } = useUIStore.getState();
      if (focusedNodeId) return;
      if (selectedNodeIds.size > 0) return;

      e.preventDefault();
      e.stopPropagation();

      const dayNodeId = ensureTodayNode();
      useUIStore.getState().navigateToNode(dayNodeId);
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
