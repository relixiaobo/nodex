import { describe, it, expect, beforeEach } from 'vitest';
import { resetAndSeed } from './helpers/test-state.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { ensureTodayNode } from '../../src/lib/journal.js';

describe('duplicateNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates a sibling copy with the same name', () => {
    const store = useNodeStore.getState();
    const original = store.createChild(ensureTodayNode(), undefined, { name: 'Original' });

    const dup = store.duplicateNode(original.id);
    expect(dup).not.toBeNull();
    expect(dup!.name).toBe('Original');
    expect(dup!.id).not.toBe(original.id);
  });

  it('inserts the duplicate as next sibling', () => {
    const store = useNodeStore.getState();
    const parentId = ensureTodayNode();
    const a = store.createChild(parentId, undefined, { name: 'A' });
    store.createChild(parentId, undefined, { name: 'B' });

    store.duplicateNode(a.id);

    const children = store.getChildren(parentId);
    const names = children.map((c) => c.name);
    // After duplicating A, order should be: ..., A, A(dup), B, ...
    const aIdx = names.indexOf('A');
    expect(names[aIdx + 1]).toBe('A');
  });

  it('deep copies children recursively', () => {
    const store = useNodeStore.getState();
    const parent = store.createChild(ensureTodayNode(), undefined, { name: 'Parent' });
    const child = store.createChild(parent.id, undefined, { name: 'Child' });
    store.createChild(child.id, undefined, { name: 'Grandchild' });

    const dup = store.duplicateNode(parent.id)!;

    // Check duplicated children
    const dupChildren = store.getChildren(dup.id);
    expect(dupChildren).toHaveLength(1);
    expect(dupChildren[0].name).toBe('Child');
    expect(dupChildren[0].id).not.toBe(child.id);

    // Check grandchild
    const dupGrandchildren = store.getChildren(dupChildren[0].id);
    expect(dupGrandchildren).toHaveLength(1);
    expect(dupGrandchildren[0].name).toBe('Grandchild');
  });

  it('copies tags to the duplicate', () => {
    const store = useNodeStore.getState();
    const tag = store.createTagDef('TestTag');
    const node = store.createChild(ensureTodayNode(), undefined, { name: 'Tagged' });
    store.applyTag(node.id, tag.id);

    const dup = store.duplicateNode(node.id)!;
    expect(dup.tags).toContain(tag.id);
  });

  it('copies description', () => {
    const store = useNodeStore.getState();
    const node = store.createChild(ensureTodayNode(), undefined, { name: 'WithDesc' });
    store.updateNodeDescription(node.id, 'A description');

    const dup = store.duplicateNode(node.id)!;
    expect(dup.description).toBe('A description');
  });

  it('copies field entries with values', () => {
    const store = useNodeStore.getState();
    const node = store.createChild(ensureTodayNode(), undefined, { name: 'WithField' });
    // Add the Status field (from seed data)
    store.addFieldToNode(node.id, 'attrDef_status');
    const nodeData = store.getNode(node.id)!;
    const feId = nodeData.children!.find((cid) => {
      const c = store.getNode(cid);
      return c?.type === 'fieldEntry';
    })!;
    store.createChild(feId, undefined, { name: 'In Progress' });

    const dup = store.duplicateNode(node.id)!;

    // Find field entry in duplicate
    const dupChildren = store.getChildren(dup.id);
    const dupFieldEntry = dupChildren.find((c) => c.type === 'fieldEntry');
    expect(dupFieldEntry).toBeDefined();
    expect(dupFieldEntry!.fieldDefId).toBe('attrDef_status');

    // Check value was copied
    const dupValues = store.getChildren(dupFieldEntry!.id);
    expect(dupValues).toHaveLength(1);
    expect(dupValues[0].name).toBe('In Progress');
  });

  it('returns null for a non-existent node', () => {
    const store = useNodeStore.getState();
    const result = store.duplicateNode('non-existent-id');
    expect(result).toBeNull();
  });
});

describe('duplicateNodes (batch)', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns empty array for empty input', () => {
    const store = useNodeStore.getState();
    const result = store.duplicateNodes([]);
    expect(result).toEqual([]);
  });

  it('duplicates a single node with deep copy', () => {
    const store = useNodeStore.getState();
    const parentId = ensureTodayNode();
    const node = store.createChild(parentId, undefined, { name: 'Solo' });
    store.createChild(node.id, undefined, { name: 'Child' });

    const newIds = store.duplicateNodes([node.id]);
    expect(newIds).toHaveLength(1);

    const dup = store.getNode(newIds[0])!;
    expect(dup.name).toBe('Solo');
    expect(dup.id).not.toBe(node.id);

    // Verify children are deep copied
    const dupChildren = store.getChildren(newIds[0]);
    expect(dupChildren).toHaveLength(1);
    expect(dupChildren[0].name).toBe('Child');
  });

  it('duplicates multiple sibling nodes preserving order', () => {
    const store = useNodeStore.getState();
    const parentId = ensureTodayNode();
    const a = store.createChild(parentId, undefined, { name: 'Alpha' });
    const b = store.createChild(parentId, undefined, { name: 'Beta' });
    store.createChild(parentId, undefined, { name: 'Gamma' });

    const newIds = store.duplicateNodes([a.id, b.id]);
    expect(newIds).toHaveLength(2);

    const children = store.getChildren(parentId);
    const names = children.map((c) => c.name);
    // Expected order: ..., Alpha, Beta, Alpha(dup), Beta(dup), Gamma, ...
    const alphaIdx = names.indexOf('Alpha');
    const betaIdx = names.indexOf('Beta');
    // After the last selected (Beta), the copies should appear
    expect(names[betaIdx + 1]).toBe('Alpha'); // first dup
    expect(names[betaIdx + 2]).toBe('Beta');  // second dup
    // Original Alpha still before original Beta
    expect(alphaIdx).toBeLessThan(betaIdx);
  });

  it('inserts copies after the last selected node', () => {
    const store = useNodeStore.getState();
    const parentId = ensureTodayNode();
    const a = store.createChild(parentId, undefined, { name: 'A' });
    const b = store.createChild(parentId, undefined, { name: 'B' });
    const c = store.createChild(parentId, undefined, { name: 'C' });

    // Only duplicate A and C (non-contiguous)
    store.duplicateNodes([a.id, c.id]);

    const children = store.getChildren(parentId);
    const names = children.map((c) => c.name);
    // C is the last selected (highest index), so copies go after C
    const cIdx = names.indexOf('C');
    expect(names[cIdx + 1]).toBe('A'); // copy of A
    expect(names[cIdx + 2]).toBe('C'); // copy of C
  });

  it('deep copies children and tags for each duplicated node', () => {
    const store = useNodeStore.getState();
    const parentId = ensureTodayNode();
    const tag = store.createTagDef('BatchTag');

    const node1 = store.createChild(parentId, undefined, { name: 'Node1' });
    store.createChild(node1.id, undefined, { name: 'Child1' });
    store.applyTag(node1.id, tag.id);

    const node2 = store.createChild(parentId, undefined, { name: 'Node2' });
    store.updateNodeDescription(node2.id, 'Desc2');

    const newIds = store.duplicateNodes([node1.id, node2.id]);
    expect(newIds).toHaveLength(2);

    // First duplicate: check children and tags
    const dup1 = store.getNode(newIds[0])!;
    expect(dup1.name).toBe('Node1');
    expect(dup1.tags).toContain(tag.id);
    const dup1Children = store.getChildren(newIds[0]);
    expect(dup1Children).toHaveLength(1);
    expect(dup1Children[0].name).toBe('Child1');

    // Second duplicate: check description
    const dup2 = store.getNode(newIds[1])!;
    expect(dup2.name).toBe('Node2');
    expect(dup2.description).toBe('Desc2');
  });

  it('generates unique IDs for all duplicated nodes', () => {
    const store = useNodeStore.getState();
    const parentId = ensureTodayNode();
    const a = store.createChild(parentId, undefined, { name: 'A' });
    const b = store.createChild(parentId, undefined, { name: 'B' });
    store.createChild(a.id, undefined, { name: 'A-Child' });

    const newIds = store.duplicateNodes([a.id, b.id]);

    // All new IDs should be unique from originals and each other
    const allIds = new Set([a.id, b.id, ...newIds]);
    expect(allIds.size).toBe(4); // 2 original + 2 new

    // Children of duplicated A should also have new IDs
    const dupAChildren = store.getChildren(newIds[0]);
    expect(dupAChildren).toHaveLength(1);
    expect(allIds.has(dupAChildren[0].id)).toBe(false);
  });

  it('copies field entries with values in batch duplication', () => {
    const store = useNodeStore.getState();
    const parentId = ensureTodayNode();
    const node = store.createChild(parentId, undefined, { name: 'WithField' });
    store.addFieldToNode(node.id, 'attrDef_status');
    const nodeData = store.getNode(node.id)!;
    const feId = nodeData.children!.find((cid) => {
      const c = store.getNode(cid);
      return c?.type === 'fieldEntry';
    })!;
    store.createChild(feId, undefined, { name: 'To Do' });

    const newIds = store.duplicateNodes([node.id]);
    expect(newIds).toHaveLength(1);

    const dupChildren = store.getChildren(newIds[0]);
    const dupFieldEntry = dupChildren.find((c) => c.type === 'fieldEntry');
    expect(dupFieldEntry).toBeDefined();
    expect(dupFieldEntry!.fieldDefId).toBe('attrDef_status');

    const dupValues = store.getChildren(dupFieldEntry!.id);
    expect(dupValues).toHaveLength(1);
    expect(dupValues[0].name).toBe('To Do');
  });

  it('skips non-movable nodes gracefully', () => {
    const store = useNodeStore.getState();
    const parentId = ensureTodayNode();
    const node = store.createChild(parentId, undefined, { name: 'Movable' });

    // non-existent node should be skipped
    const newIds = store.duplicateNodes([node.id, 'non-existent-id']);
    expect(newIds).toHaveLength(1);
    expect(store.getNode(newIds[0])!.name).toBe('Movable');
  });
});
