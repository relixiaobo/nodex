import { shouldNodeShowCheckbox } from '../../src/lib/checkbox-utils.js';
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

describe('shouldNodeShowCheckbox', () => {
  it('returns false for node without tags', () => {
    const entities: Record<string, NodexNode> = {
      n1: makeNode('n1'),
    };
    const result = shouldNodeShowCheckbox('n1', entities);
    expect(result).toEqual({ showCheckbox: false, isDone: false });
  });

  it('returns false when tag has SYS_A55=NO', () => {
    const entities: Record<string, NodexNode> = {
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
        children: [SYS_A.SHOW_CHECKBOX, SYS_V.NO],
      }),
    };
    const result = shouldNodeShowCheckbox('n1', entities);
    expect(result).toEqual({ showCheckbox: false, isDone: false });
  });

  it('returns true when tag has SYS_A55=YES', () => {
    const entities: Record<string, NodexNode> = {
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
        children: [SYS_A.SHOW_CHECKBOX, SYS_V.YES],
      }),
    };
    const result = shouldNodeShowCheckbox('n1', entities);
    expect(result).toEqual({ showCheckbox: true, isDone: false });
  });

  it('returns showCheckbox=true when _done is set (manual toggle)', () => {
    const entities: Record<string, NodexNode> = {
      n1: makeNode('n1', { props: { created: 1, _done: 1700000000000 } }),
    };
    const result = shouldNodeShowCheckbox('n1', entities);
    expect(result).toEqual({ showCheckbox: true, isDone: true });
  });

  it('returns isDone=true when tag has SYS_A55=YES and _done is set', () => {
    const entities: Record<string, NodexNode> = {
      n1: makeNode('n1', { props: { created: 1, _metaNodeId: 'meta1', _done: 1700000000000 } }),
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
        children: [SYS_A.SHOW_CHECKBOX, SYS_V.YES],
      }),
    };
    const result = shouldNodeShowCheckbox('n1', entities);
    expect(result).toEqual({ showCheckbox: true, isDone: true });
  });

  it('returns false for nonexistent node', () => {
    const result = shouldNodeShowCheckbox('missing', {});
    expect(result).toEqual({ showCheckbox: false, isDone: false });
  });
});

describe('toggleNodeDone (store integration)', () => {
  it('toggles _done state', async () => {
    // Inline mini-store test using the Zustand store directly
    const { useNodeStore } = await import('../../src/stores/node-store.js');
    const store = useNodeStore.getState();

    // Seed a test node
    useNodeStore.setState({
      entities: {
        test_node: makeNode('test_node'),
      },
    });

    // Toggle on
    await useNodeStore.getState().toggleNodeDone('test_node', 'user1');
    const doneTs = useNodeStore.getState().entities.test_node.props._done;
    expect(doneTs).toBeGreaterThan(0);

    // Toggle off
    await useNodeStore.getState().toggleNodeDone('test_node', 'user1');
    expect(useNodeStore.getState().entities.test_node.props._done).toBeUndefined();
  });
});
