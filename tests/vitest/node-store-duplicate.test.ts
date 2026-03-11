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
