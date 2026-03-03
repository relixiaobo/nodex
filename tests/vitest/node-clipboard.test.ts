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
});
