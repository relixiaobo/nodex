import {
  shouldNodeShowCheckbox,
  hasTagShowCheckbox,
  resolveCheckboxClick,
  resolveCmdEnterCycle,
} from '../../src/lib/checkbox-utils.js';
import type { NodexNode } from '../../src/types/node.js';
import { SYS_A, SYS_V } from '../../src/types/index.js';

function makeNode(id: string, overrides: Partial<NodexNode> = {}): NodexNode {
  return {
    id,
    props: { created: 1 },
    children: [],
    workspaceId: 'ws',
    version: 1,
    updatedAt: 1,
    createdBy: 'u',
    updatedBy: 'u',
    ...overrides,
  };
}

// ─── Tag helper for building SYS_A55 config chain ───

function buildTagCheckboxEntities(
  checkboxValue: string,
): Record<string, NodexNode> {
  return {
    n1: makeNode('n1', { props: { created: 1, _metaNodeId: 'meta1' } }),
    meta1: makeNode('meta1', {
      props: { created: 1, _docType: 'metanode' },
      children: ['tuple_tag'],
    }),
    tuple_tag: makeNode('tuple_tag', {
      props: { created: 1, _docType: 'tuple' },
      children: [SYS_A.NODE_SUPERTAGS, 'tagDef1'],
    }),
    tagDef1: makeNode('tagDef1', {
      props: { created: 1, _docType: 'tagDef' },
      children: ['cfg_cb'],
    }),
    cfg_cb: makeNode('cfg_cb', {
      props: { created: 1, _docType: 'tuple' },
      children: [SYS_A.SHOW_CHECKBOX, checkboxValue],
    }),
  };
}

// ─── shouldNodeShowCheckbox ───

describe('shouldNodeShowCheckbox', () => {
  it('returns false for node without tags and no _done', () => {
    const entities = { n1: makeNode('n1') };
    expect(shouldNodeShowCheckbox('n1', entities)).toEqual({ showCheckbox: false, isDone: false });
  });

  it('returns false when tag has SYS_A55=NO and no _done', () => {
    const entities = buildTagCheckboxEntities(SYS_V.NO);
    expect(shouldNodeShowCheckbox('n1', entities)).toEqual({ showCheckbox: false, isDone: false });
  });

  it('returns showCheckbox=true when tag has SYS_A55=YES', () => {
    const entities = buildTagCheckboxEntities(SYS_V.YES);
    expect(shouldNodeShowCheckbox('n1', entities)).toEqual({ showCheckbox: true, isDone: false });
  });

  it('returns isDone=true when tag has SYS_A55=YES and _done > 0', () => {
    const entities = buildTagCheckboxEntities(SYS_V.YES);
    entities.n1.props._done = 1700000000000;
    expect(shouldNodeShowCheckbox('n1', entities)).toEqual({ showCheckbox: true, isDone: true });
  });

  it('returns showCheckbox=true, isDone=false when _done=0 (manual undone)', () => {
    const entities = { n1: makeNode('n1', { props: { created: 1, _done: 0 } }) };
    expect(shouldNodeShowCheckbox('n1', entities)).toEqual({ showCheckbox: true, isDone: false });
  });

  it('returns showCheckbox=true, isDone=true when _done > 0 (manual done)', () => {
    const entities = { n1: makeNode('n1', { props: { created: 1, _done: 1700000000000 } }) };
    expect(shouldNodeShowCheckbox('n1', entities)).toEqual({ showCheckbox: true, isDone: true });
  });

  it('returns false for nonexistent node', () => {
    expect(shouldNodeShowCheckbox('missing', {})).toEqual({ showCheckbox: false, isDone: false });
  });
});

// ─── resolveCheckboxClick ───

describe('resolveCheckboxClick', () => {
  it('undone → done (manual node)', () => {
    const result = resolveCheckboxClick(0, false);
    expect(result).toBeGreaterThan(0);
  });

  it('done → undone=0 (manual node, keeps checkbox)', () => {
    expect(resolveCheckboxClick(1700000000000, false)).toBe(0);
  });

  it('undone → done (tag-driven node)', () => {
    const result = resolveCheckboxClick(undefined, true);
    expect(result).toBeGreaterThan(0);
  });

  it('done → undefined (tag-driven, tag keeps checkbox)', () => {
    expect(resolveCheckboxClick(1700000000000, true)).toBeUndefined();
  });
});

// ─── resolveCmdEnterCycle ───

describe('resolveCmdEnterCycle', () => {
  describe('manual node (no tag)', () => {
    it('No → Undone (0)', () => {
      expect(resolveCmdEnterCycle(undefined, false)).toBe(0);
    });

    it('Undone → Done (timestamp)', () => {
      const result = resolveCmdEnterCycle(0, false);
      expect(result).toBeGreaterThan(0);
    });

    it('Done → No (undefined)', () => {
      expect(resolveCmdEnterCycle(1700000000000, false)).toBeUndefined();
    });
  });

  describe('tag-driven node', () => {
    it('undone → done', () => {
      const result = resolveCmdEnterCycle(undefined, true);
      expect(result).toBeGreaterThan(0);
    });

    it('done → undone (undefined, tag keeps checkbox)', () => {
      expect(resolveCmdEnterCycle(1700000000000, true)).toBeUndefined();
    });
  });
});

// ─── Store integration ───

describe('store toggleNodeDone + cycleNodeCheckbox', () => {
  it('toggleNodeDone: click toggles undone ↔ done', async () => {
    const { useNodeStore } = await import('../../src/stores/node-store.js');

    // Seed a node with checkbox undone (_done=0)
    useNodeStore.setState({
      entities: {
        test_node: makeNode('test_node', { props: { created: 1, _done: 0 } }),
      },
    });

    // Click: undone → done
    await useNodeStore.getState().toggleNodeDone('test_node', 'user1');
    const doneTs = useNodeStore.getState().entities.test_node.props._done;
    expect(doneTs).toBeGreaterThan(0);

    // Click: done → undone (0, keeps checkbox)
    await useNodeStore.getState().toggleNodeDone('test_node', 'user1');
    expect(useNodeStore.getState().entities.test_node.props._done).toBe(0);
  });

  it('cycleNodeCheckbox: 3-state cycle for manual nodes', async () => {
    const { useNodeStore } = await import('../../src/stores/node-store.js');

    // Seed a plain node (no checkbox)
    useNodeStore.setState({
      entities: {
        test_node: makeNode('test_node'),
      },
    });

    // Cmd+Enter: No → Undone (0)
    await useNodeStore.getState().cycleNodeCheckbox('test_node', 'user1');
    expect(useNodeStore.getState().entities.test_node.props._done).toBe(0);

    // Cmd+Enter: Undone → Done (timestamp)
    await useNodeStore.getState().cycleNodeCheckbox('test_node', 'user1');
    const doneTs = useNodeStore.getState().entities.test_node.props._done;
    expect(doneTs).toBeGreaterThan(0);

    // Cmd+Enter: Done → No (undefined)
    await useNodeStore.getState().cycleNodeCheckbox('test_node', 'user1');
    expect(useNodeStore.getState().entities.test_node.props._done).toBeUndefined();
  });
});
