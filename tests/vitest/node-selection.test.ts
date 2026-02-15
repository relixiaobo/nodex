/**
 * Tests for node selection mode state transitions (Phase 1).
 *
 * Covers:
 * - Escape in editor → select current node (via resolveNodeEditorEscapeIntent)
 * - setSelectedNode / setFocusedNode mutual exclusion
 * - Selection mode navigation (↑/↓ via tree-utils)
 * - Enter in selection → edit mode
 * - Escape in selection → deselect
 */
import { resolveNodeEditorEscapeIntent } from '../../src/lib/node-editor-shortcuts.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import {
  getFlattenedVisibleNodes,
  getPreviousVisibleNode,
  getNextVisibleNode,
} from '../../src/lib/tree-utils.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node selection (Phase 1)', () => {
  beforeEach(() => {
    resetAndSeed();
    // Reset UI store selection/focus state
    useUIStore.setState({
      focusedNodeId: null,
      focusedParentId: null,
      selectedNodeId: null,
      selectedParentId: null,
    });
  });

  // ─── Escape intent returns select_current ───

  describe('resolveNodeEditorEscapeIntent', () => {
    it('returns select_current when no dropdown is open', () => {
      expect(resolveNodeEditorEscapeIntent(false, false, false)).toBe('select_current');
    });

    it('returns reference_close when reference dropdown is open', () => {
      expect(resolveNodeEditorEscapeIntent(true, false, false)).toBe('reference_close');
    });

    it('returns hashtag_close when hashtag dropdown is open', () => {
      expect(resolveNodeEditorEscapeIntent(false, true, false)).toBe('hashtag_close');
    });

    it('returns slash_close when slash dropdown is open', () => {
      expect(resolveNodeEditorEscapeIntent(false, false, true)).toBe('slash_close');
    });
  });

  // ─── Focus ↔ Selection mutual exclusion ───

  describe('focus/selection mutual exclusion', () => {
    it('setFocusedNode clears selection', () => {
      useUIStore.getState().setSelectedNode('idea_1', 'ws_default_INBOX');
      expect(useUIStore.getState().selectedNodeId).toBe('idea_1');

      useUIStore.getState().setFocusedNode('idea_2', 'ws_default_INBOX');
      expect(useUIStore.getState().focusedNodeId).toBe('idea_2');
      expect(useUIStore.getState().selectedNodeId).toBeNull();
    });

    it('setSelectedNode clears focus', () => {
      useUIStore.getState().setFocusedNode('idea_1', 'ws_default_INBOX');
      expect(useUIStore.getState().focusedNodeId).toBe('idea_1');

      useUIStore.getState().setSelectedNode('idea_2', 'ws_default_INBOX');
      expect(useUIStore.getState().selectedNodeId).toBe('idea_2');
      expect(useUIStore.getState().focusedNodeId).toBeNull();
    });

    it('setSelectedNode(null) clears selection without setting focus', () => {
      useUIStore.getState().setSelectedNode('idea_1', 'ws_default_INBOX');
      useUIStore.getState().setSelectedNode(null);
      expect(useUIStore.getState().selectedNodeId).toBeNull();
      expect(useUIStore.getState().focusedNodeId).toBeNull();
    });
  });

  // ─── Selection mode navigation via tree-utils ───

  describe('selection navigation (↑/↓)', () => {
    it('navigates to previous visible node', () => {
      const entities = useNodeStore.getState().entities;
      const expandedNodes = new Set<string>();
      const inboxChildren = entities.ws_default_INBOX?.children ?? [];

      const flatList = getFlattenedVisibleNodes(inboxChildren, entities, expandedNodes, 'ws_default_INBOX');
      expect(flatList.length).toBeGreaterThan(1);

      const second = flatList[1];
      const prev = getPreviousVisibleNode(second.nodeId, second.parentId, flatList);
      expect(prev).toEqual({ nodeId: flatList[0].nodeId, parentId: flatList[0].parentId });
    });

    it('navigates to next visible node', () => {
      const entities = useNodeStore.getState().entities;
      const expandedNodes = new Set<string>();
      const inboxChildren = entities.ws_default_INBOX?.children ?? [];

      const flatList = getFlattenedVisibleNodes(inboxChildren, entities, expandedNodes, 'ws_default_INBOX');
      expect(flatList.length).toBeGreaterThan(1);

      const first = flatList[0];
      const next = getNextVisibleNode(first.nodeId, first.parentId, flatList);
      expect(next).toEqual({ nodeId: flatList[1].nodeId, parentId: flatList[1].parentId });
    });

    it('returns null at boundaries', () => {
      const entities = useNodeStore.getState().entities;
      const expandedNodes = new Set<string>();
      const inboxChildren = entities.ws_default_INBOX?.children ?? [];

      const flatList = getFlattenedVisibleNodes(inboxChildren, entities, expandedNodes, 'ws_default_INBOX');

      // First node has no previous
      const first = flatList[0];
      expect(getPreviousVisibleNode(first.nodeId, first.parentId, flatList)).toBeNull();

      // Last node has no next
      const last = flatList[flatList.length - 1];
      expect(getNextVisibleNode(last.nodeId, last.parentId, flatList)).toBeNull();
    });
  });

  // ─── Escape → select → Enter → edit ───

  describe('Escape → Select → Enter → Edit state transitions', () => {
    it('simulates Escape → Select flow via setSelectedNode', () => {
      // Simulate: user is editing idea_1
      useUIStore.getState().setFocusedNode('idea_1', 'ws_default_INBOX');
      expect(useUIStore.getState().focusedNodeId).toBe('idea_1');

      // Escape pressed (no dropdown) → onEscapeSelect calls setSelectedNode
      useUIStore.getState().setSelectedNode('idea_1', 'ws_default_INBOX');
      expect(useUIStore.getState().selectedNodeId).toBe('idea_1');
      expect(useUIStore.getState().selectedParentId).toBe('ws_default_INBOX');
      expect(useUIStore.getState().focusedNodeId).toBeNull();
    });

    it('simulates Enter in selection → re-enter edit', () => {
      // Node is selected
      useUIStore.getState().setSelectedNode('idea_1', 'ws_default_INBOX');
      expect(useUIStore.getState().selectedNodeId).toBe('idea_1');

      // Enter pressed → setFocusedNode
      useUIStore.getState().setFocusedNode('idea_1', 'ws_default_INBOX');
      expect(useUIStore.getState().focusedNodeId).toBe('idea_1');
      expect(useUIStore.getState().selectedNodeId).toBeNull();
    });

    it('simulates Escape in selection → deselect', () => {
      useUIStore.getState().setSelectedNode('idea_1', 'ws_default_INBOX');
      expect(useUIStore.getState().selectedNodeId).toBe('idea_1');

      // Escape pressed → setSelectedNode(null)
      useUIStore.getState().setSelectedNode(null);
      expect(useUIStore.getState().selectedNodeId).toBeNull();
      expect(useUIStore.getState().focusedNodeId).toBeNull();
    });

    it('simulates ↑/↓ navigation in selection mode', () => {
      const entities = useNodeStore.getState().entities;
      const expandedNodes = new Set<string>();
      const inboxChildren = entities.ws_default_INBOX?.children ?? [];
      const flatList = getFlattenedVisibleNodes(inboxChildren, entities, expandedNodes, 'ws_default_INBOX');

      if (flatList.length < 2) return; // guard for thin seed data

      // Select first node
      const first = flatList[0];
      useUIStore.getState().setSelectedNode(first.nodeId, first.parentId);
      expect(useUIStore.getState().selectedNodeId).toBe(first.nodeId);

      // Arrow down → select next
      const next = getNextVisibleNode(first.nodeId, first.parentId, flatList);
      expect(next).not.toBeNull();
      useUIStore.getState().setSelectedNode(next!.nodeId, next!.parentId);
      expect(useUIStore.getState().selectedNodeId).toBe(next!.nodeId);

      // Arrow up → back to first
      const prev = getPreviousVisibleNode(next!.nodeId, next!.parentId, flatList);
      expect(prev).not.toBeNull();
      useUIStore.getState().setSelectedNode(prev!.nodeId, prev!.parentId);
      expect(useUIStore.getState().selectedNodeId).toBe(first.nodeId);
    });
  });
});
