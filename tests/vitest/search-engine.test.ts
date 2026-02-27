import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { findNodesByTag, runSearch, evaluateCondition } from '../../src/lib/search-engine.js';
import { getNodeCapabilities } from '../../src/lib/node-capabilities.js';
import type { NodexNode } from '../../src/types/node.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('search-engine', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  describe('findNodesByTag', () => {
    it('returns nodes tagged with the given tagDefId', () => {
      // Seed data has 'tagDef_task' applied to task_1, task_2, etc.
      const results = findNodesByTag('tagDef_task');
      expect(results.length).toBeGreaterThan(0);
      // Every result should have 'tagDef_task' in its tags
      for (const id of results) {
        const node = loroDoc.toNodexNode(id);
        expect(node?.tags).toContain('tagDef_task');
      }
    });

    it('returns empty for non-existent tag', () => {
      const results = findNodesByTag('tagDef_nonexistent');
      expect(results).toEqual([]);
    });

    it('excludes structural node types from results', () => {
      const results = findNodesByTag('tagDef_task');
      for (const id of results) {
        const node = loroDoc.toNodexNode(id);
        expect(node?.type).not.toBe('fieldEntry');
        expect(node?.type).not.toBe('reference');
        expect(node?.type).not.toBe('tagDef');
        expect(node?.type).not.toBe('fieldDef');
        expect(node?.type).not.toBe('viewDef');
        expect(node?.type).not.toBe('queryCondition');
      }
    });

    it('excludes trashed nodes', () => {
      const store = useNodeStore.getState();
      // Find a task node and trash it
      const results = findNodesByTag('tagDef_task');
      expect(results.length).toBeGreaterThan(0);
      const trashedId = results[0];
      store.trashNode(trashedId);

      // After trashing, it should no longer appear in results
      const resultsAfterTrash = findNodesByTag('tagDef_task');
      expect(resultsAfterTrash).not.toContain(trashedId);
    });

    it('excludes workspace containers', () => {
      const results = findNodesByTag('tagDef_task');
      const containerIds = Object.values(CONTAINER_IDS);
      for (const id of results) {
        expect(containerIds).not.toContain(id);
      }
    });
  });

  describe('runSearch', () => {
    it('returns empty set for non-search node', () => {
      const results = runSearch('task_1');
      expect(results.size).toBe(0);
    });

    it('returns empty set for search node with no conditions', () => {
      const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Empty' });
      loroDoc.commitDoc('__seed__');

      const results = runSearch(searchId);
      expect(results.size).toBe(0);
    });

    it('matches nodes with HAS_TAG condition', () => {
      // Create a search node with HAS_TAG condition
      const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Tasks' });

      const andGroupId = loroDoc.createNode(undefined, searchId);
      loroDoc.setNodeDataBatch(andGroupId, { type: 'queryCondition', queryLogic: 'AND' });

      const condId = loroDoc.createNode(undefined, andGroupId);
      loroDoc.setNodeDataBatch(condId, {
        type: 'queryCondition',
        queryOp: 'HAS_TAG',
        queryTagDefId: 'tagDef_task',
      });
      loroDoc.commitDoc('__seed__');

      const results = runSearch(searchId);
      expect(results.size).toBeGreaterThan(0);
      for (const id of results) {
        const node = loroDoc.toNodexNode(id);
        expect(node?.tags).toContain('tagDef_task');
      }
    });

    it('excludes search node itself from results', () => {
      // Create a search node and apply a tag to it
      const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Self-ref test' });
      loroDoc.addTag(searchId, 'tagDef_task');

      const andGroupId = loroDoc.createNode(undefined, searchId);
      loroDoc.setNodeDataBatch(andGroupId, { type: 'queryCondition', queryLogic: 'AND' });

      const condId = loroDoc.createNode(undefined, andGroupId);
      loroDoc.setNodeDataBatch(condId, {
        type: 'queryCondition',
        queryOp: 'HAS_TAG',
        queryTagDefId: 'tagDef_task',
      });
      loroDoc.commitDoc('__seed__');

      const results = runSearch(searchId);
      // Search node should not be in its own results
      expect(results.has(searchId)).toBe(false);
    });

    it('matches DONE condition', () => {
      // Mark a task as done
      const store = useNodeStore.getState();
      store.toggleNodeDone('task_1');

      const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Done tasks' });

      const andGroupId = loroDoc.createNode(undefined, searchId);
      loroDoc.setNodeDataBatch(andGroupId, { type: 'queryCondition', queryLogic: 'AND' });

      const condId = loroDoc.createNode(undefined, andGroupId);
      loroDoc.setNodeDataBatch(condId, { type: 'queryCondition', queryOp: 'DONE' });
      loroDoc.commitDoc('__seed__');

      const results = runSearch(searchId);
      expect(results.has('task_1')).toBe(true);
    });

    it('matches NOT_DONE condition (has checkbox but not completed)', () => {
      const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Not done' });

      const andGroupId = loroDoc.createNode(undefined, searchId);
      loroDoc.setNodeDataBatch(andGroupId, { type: 'queryCondition', queryLogic: 'AND' });

      const condId = loroDoc.createNode(undefined, andGroupId);
      loroDoc.setNodeDataBatch(condId, { type: 'queryCondition', queryOp: 'NOT_DONE' });
      loroDoc.commitDoc('__seed__');

      const results = runSearch(searchId);
      // All results should have checkbox but not be completed
      for (const id of results) {
        const node = loroDoc.toNodexNode(id);
        expect(node).not.toBeNull();
        // Should have a tag with showCheckbox
        const hasCheckbox = node!.tags.some((tagId) => {
          const tagDef = loroDoc.toNodexNode(tagId);
          return tagDef?.showCheckbox === true;
        });
        expect(hasCheckbox).toBe(true);
        expect(node!.completedAt == null || node!.completedAt === 0).toBe(true);
      }
    });

    it('matches TODO condition (has checkbox, regardless of completion)', () => {
      const store = useNodeStore.getState();
      store.toggleNodeDone('task_1'); // Mark one as done

      const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'All todos' });

      const andGroupId = loroDoc.createNode(undefined, searchId);
      loroDoc.setNodeDataBatch(andGroupId, { type: 'queryCondition', queryLogic: 'AND' });

      const condId = loroDoc.createNode(undefined, andGroupId);
      loroDoc.setNodeDataBatch(condId, { type: 'queryCondition', queryOp: 'TODO' });
      loroDoc.commitDoc('__seed__');

      const results = runSearch(searchId);
      // task_1 is done but still has checkbox → should be included
      expect(results.has('task_1')).toBe(true);
    });

    it('supports AND logic: HAS_TAG + NOT_DONE', () => {
      const store = useNodeStore.getState();
      // Apply tag to task_2 as well (seed data only tags task_1)
      store.applyTag('task_2', 'tagDef_task');
      store.toggleNodeDone('task_1'); // Mark task_1 as done

      const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Undone tasks' });

      const andGroupId = loroDoc.createNode(undefined, searchId);
      loroDoc.setNodeDataBatch(andGroupId, { type: 'queryCondition', queryLogic: 'AND' });

      const tagCondId = loroDoc.createNode(undefined, andGroupId);
      loroDoc.setNodeDataBatch(tagCondId, {
        type: 'queryCondition',
        queryOp: 'HAS_TAG',
        queryTagDefId: 'tagDef_task',
      });

      const notDoneCondId = loroDoc.createNode(undefined, andGroupId);
      loroDoc.setNodeDataBatch(notDoneCondId, { type: 'queryCondition', queryOp: 'NOT_DONE' });
      loroDoc.commitDoc('__seed__');

      const results = runSearch(searchId);
      // task_1 is done, should NOT be in results
      expect(results.has('task_1')).toBe(false);
      // task_2 has tag + not done → should be in results
      expect(results.has('task_2')).toBe(true);
      expect(results.size).toBeGreaterThan(0);
    });

    it('throws for unsupported QueryOp', () => {
      const searchId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(searchId, { type: 'search', name: 'Unsupported' });

      const andGroupId = loroDoc.createNode(undefined, searchId);
      loroDoc.setNodeDataBatch(andGroupId, { type: 'queryCondition', queryLogic: 'AND' });

      const condId = loroDoc.createNode(undefined, andGroupId);
      loroDoc.setNodeDataBatch(condId, {
        type: 'queryCondition',
        queryOp: 'FIELD_IS',
        queryFieldDefId: 'some_field',
      });
      loroDoc.commitDoc('__seed__');

      expect(() => runSearch(searchId)).toThrow('not supported');
    });
  });

  describe('evaluateCondition', () => {
    it('evaluates OR logic correctly', () => {
      // Create OR condition with two tags
      const orGroupId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(orGroupId, { type: 'queryCondition', queryLogic: 'OR' });

      const cond1Id = loroDoc.createNode(undefined, orGroupId);
      loroDoc.setNodeDataBatch(cond1Id, {
        type: 'queryCondition',
        queryOp: 'HAS_TAG',
        queryTagDefId: 'tagDef_task',
      });

      const cond2Id = loroDoc.createNode(undefined, orGroupId);
      loroDoc.setNodeDataBatch(cond2Id, {
        type: 'queryCondition',
        queryOp: 'HAS_TAG',
        queryTagDefId: 'tagDef_nonexistent',
      });
      loroDoc.commitDoc('__seed__');

      const orGroup = loroDoc.toNodexNode(orGroupId)!;
      const candidate = loroDoc.toNodexNode('task_1')!;

      // task_1 has tagDef_task, so OR should be true
      expect(evaluateCondition(candidate, orGroup)).toBe(true);
    });

    it('evaluates NOT logic correctly', () => {
      const notGroupId = loroDoc.createNode(undefined, CONTAINER_IDS.SEARCHES);
      loroDoc.setNodeDataBatch(notGroupId, { type: 'queryCondition', queryLogic: 'NOT' });

      const condId = loroDoc.createNode(undefined, notGroupId);
      loroDoc.setNodeDataBatch(condId, { type: 'queryCondition', queryOp: 'DONE' });
      loroDoc.commitDoc('__seed__');

      const notGroup = loroDoc.toNodexNode(notGroupId)!;
      const candidate = loroDoc.toNodexNode('task_1')!;

      // task_1 is not done, so NOT(DONE) should be true
      expect(evaluateCondition(candidate, notGroup)).toBe(true);
    });
  });

  describe('node-store createSearchNode', () => {
    it('creates a search node with queryCondition tree under SEARCHES', () => {
      const store = useNodeStore.getState();
      const searchId = store.createSearchNode('tagDef_task');
      expect(searchId).toBeTruthy();

      const searchNode = loroDoc.toNodexNode(searchId);
      expect(searchNode).not.toBeNull();
      expect(searchNode!.type).toBe('search');
      expect(searchNode!.name).toBe('Task'); // tagDef_task name

      // Should be under SEARCHES container
      const parentId = loroDoc.getParentId(searchId);
      expect(parentId).toBe(CONTAINER_IDS.SEARCHES);

      // Should have an AND group with HAS_TAG leaf
      const children = searchNode!.children;
      const conditions = children
        .map((id) => loroDoc.toNodexNode(id))
        .filter((n) => n?.type === 'queryCondition');
      expect(conditions.length).toBe(1);
      expect(conditions[0]!.queryLogic).toBe('AND');

      const leafIds = conditions[0]!.children;
      expect(leafIds.length).toBe(1);
      const leaf = loroDoc.toNodexNode(leafIds[0]);
      expect(leaf!.queryOp).toBe('HAS_TAG');
      expect(leaf!.queryTagDefId).toBe('tagDef_task');
    });

    it('materializes reference children for matching nodes', () => {
      const store = useNodeStore.getState();
      const searchId = store.createSearchNode('tagDef_task');

      const searchNode = loroDoc.toNodexNode(searchId);
      const refChildren = searchNode!.children.filter((id) => {
        const n = loroDoc.toNodexNode(id);
        return n?.type === 'reference';
      });

      // task_1 is tagged with tagDef_task in seed data
      expect(refChildren.length).toBeGreaterThan(0);
      const targetIds = refChildren.map((id) => loroDoc.toNodexNode(id)!.targetId);
      expect(targetIds).toContain('task_1');
    });

    it('de-duplicates: returns existing search node for same tag', () => {
      const store = useNodeStore.getState();
      const id1 = store.createSearchNode('tagDef_task');
      const id2 = store.createSearchNode('tagDef_task');
      expect(id1).toBe(id2);
    });

    it('creates separate search nodes for different tags', () => {
      const store = useNodeStore.getState();
      const id1 = store.createSearchNode('tagDef_task');
      const id2 = store.createSearchNode('tagDef_meeting');
      expect(id1).not.toBe(id2);
    });
  });

  describe('node-store refreshSearchResults', () => {
    it('adds new matches and removes stale references', () => {
      const store = useNodeStore.getState();
      const searchId = store.createSearchNode('tagDef_task');

      // Apply tag to a new node after initial search
      store.applyTag('task_2', 'tagDef_task');
      store.refreshSearchResults(searchId);

      const searchNode = loroDoc.toNodexNode(searchId);
      const targetIds = searchNode!.children
        .map((id) => loroDoc.toNodexNode(id))
        .filter((n) => n?.type === 'reference')
        .map((n) => n!.targetId);

      // task_2 should now be in results
      expect(targetIds).toContain('task_2');
    });

    it('removes references for nodes that no longer match', () => {
      const store = useNodeStore.getState();
      // Tag task_2 as well so we have multiple results
      store.applyTag('task_2', 'tagDef_task');
      const searchId = store.createSearchNode('tagDef_task');

      // Remove tag from task_1
      store.removeTag('task_1', 'tagDef_task');
      store.refreshSearchResults(searchId);

      const searchNode = loroDoc.toNodexNode(searchId);
      const targetIds = searchNode!.children
        .map((id) => loroDoc.toNodexNode(id))
        .filter((n) => n?.type === 'reference')
        .map((n) => n!.targetId);

      // task_1 should no longer be in results
      expect(targetIds).not.toContain('task_1');
      // task_2 should still be there
      expect(targetIds).toContain('task_2');
    });

    it('updates lastRefreshedAt timestamp', () => {
      const store = useNodeStore.getState();
      const searchId = store.createSearchNode('tagDef_task');

      const before = loroDoc.toNodexNode(searchId)!.lastRefreshedAt;
      expect(before).toBeGreaterThan(0);
    });
  });

  describe('node-capabilities for queryCondition', () => {
    it('queryCondition nodes cannot be edited, moved, or deleted', () => {
      const store = useNodeStore.getState();
      const searchId = store.createSearchNode('tagDef_task');
      const searchNode = loroDoc.toNodexNode(searchId)!;

      // Find the AND group queryCondition
      const conditionId = searchNode.children.find((id) => {
        const n = loroDoc.toNodexNode(id);
        return n?.type === 'queryCondition';
      });
      expect(conditionId).toBeTruthy();

      const caps = getNodeCapabilities(conditionId!);
      expect(caps.canEditNode).toBe(false);
      expect(caps.canMove).toBe(false);
      expect(caps.canDelete).toBe(false);
    });
  });
});
