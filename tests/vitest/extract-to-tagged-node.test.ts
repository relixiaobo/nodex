import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';
import { resolveClipNodeIdForHighlight } from '../../src/lib/extract-to-tagged-node.js';

describe('resolveClipNodeIdForHighlight', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns self when current node is a clip page', () => {
    expect(resolveClipNodeIdForHighlight('webclip_1')).toBe('webclip_1');
  });

  it('returns nearest clip ancestor when selection is inside clip content', () => {
    expect(resolveClipNodeIdForHighlight('wc1_p1')).toBe('webclip_1');
  });

  it('returns null when no clip ancestor exists', () => {
    const store = useNodeStore.getState();
    const plainNode = store.createChild(SYSTEM_NODE_IDS.LIBRARY, undefined, { name: 'plain node' });
    expect(resolveClipNodeIdForHighlight(plainNode.id)).toBeNull();
  });
});
