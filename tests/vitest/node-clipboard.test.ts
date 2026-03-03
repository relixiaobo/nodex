import { describe, it, expect, beforeEach } from 'vitest';
import { resetAndSeed } from './helpers/test-state.js';
import { serializeNodesToMarkdown } from '../../src/lib/node-clipboard.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { CONTAINER_IDS } from '../../src/types/index.js';

describe('serializeNodesToMarkdown', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('serializes a single node with no children', () => {
    const store = useNodeStore.getState();
    const child = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'Hello world' });
    const result = serializeNodesToMarkdown([child.id]);
    expect(result).toBe('- Hello world');
  });

  it('serializes a node with nested children', () => {
    const store = useNodeStore.getState();
    const parent = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'Parent' });
    const child1 = store.createChild(parent.id, undefined, { name: 'Child 1' });
    store.createChild(child1.id, undefined, { name: 'Grandchild' });
    store.createChild(parent.id, undefined, { name: 'Child 2' });

    const result = serializeNodesToMarkdown([parent.id]);
    expect(result).toBe(
      '- Parent\n' +
      '  - Child 1\n' +
      '    - Grandchild\n' +
      '  - Child 2',
    );
  });

  it('serializes multiple top-level nodes', () => {
    const store = useNodeStore.getState();
    const a = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'Node A' });
    const b = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'Node B' });
    const c = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'Node C' });

    const result = serializeNodesToMarkdown([a.id, b.id, c.id]);
    expect(result).toBe(
      '- Node A\n' +
      '- Node B\n' +
      '- Node C',
    );
  });

  it('returns empty string for empty input', () => {
    expect(serializeNodesToMarkdown([])).toBe('');
  });

  it('handles nodes with empty names', () => {
    const store = useNodeStore.getState();
    const node = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: '' });
    const result = serializeNodesToMarkdown([node.id]);
    // trimEnd() removes trailing space from "- "
    expect(result).toBe('-');
  });

  // ── Field entry serialization ──

  it('serializes a field entry as "field name:: " with value children', () => {
    const store = useNodeStore.getState();
    const parent = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'My task' });
    // Add the Status field (fieldDef name = 'Status', seed has attrDef_status)
    store.addFieldToNode(parent.id, 'attrDef_status');
    // Find the fieldEntry
    const parentNode = store.getNode(parent.id);
    const fieldEntryId = parentNode!.children!.find((cid) => {
      const c = store.getNode(cid);
      return c?.type === 'fieldEntry';
    })!;
    // Add a value child under the fieldEntry
    store.createChild(fieldEntryId, undefined, { name: 'In Progress' });

    const result = serializeNodesToMarkdown([fieldEntryId]);
    expect(result).toBe(
      '- Status:: \n' +
      '  - In Progress',
    );
  });

  it('serializes a content node including its field entries', () => {
    const store = useNodeStore.getState();
    const parent = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'My task' });
    store.createChild(parent.id, undefined, { name: 'Some note' });
    store.addFieldToNode(parent.id, 'attrDef_status');
    // Find the fieldEntry and add a value
    const parentNode = store.getNode(parent.id);
    const fieldEntryId = parentNode!.children!.find((cid) => {
      const c = store.getNode(cid);
      return c?.type === 'fieldEntry';
    })!;
    store.createChild(fieldEntryId, undefined, { name: 'Done' });

    const result = serializeNodesToMarkdown([parent.id]);
    // Content child + field entry both serialized
    expect(result).toContain('- Some note');
    expect(result).toContain('- Status:: ');
    expect(result).toContain('  - Done');
  });

  it('serializes field entry with nested value children', () => {
    const store = useNodeStore.getState();
    const parent = store.createChild(CONTAINER_IDS.LIBRARY, undefined, { name: 'Project' });
    store.addFieldToNode(parent.id, 'attrDef_status');
    const parentNode = store.getNode(parent.id);
    const fieldEntryId = parentNode!.children!.find((cid) => {
      const c = store.getNode(cid);
      return c?.type === 'fieldEntry';
    })!;
    const val1 = store.createChild(fieldEntryId, undefined, { name: 'Value 1' });
    store.createChild(val1.id, undefined, { name: 'Nested under value' });
    store.createChild(fieldEntryId, undefined, { name: 'Value 2' });

    const result = serializeNodesToMarkdown([fieldEntryId]);
    expect(result).toBe(
      '- Status:: \n' +
      '  - Value 1\n' +
      '    - Nested under value\n' +
      '  - Value 2',
    );
  });
});
