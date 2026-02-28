import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetAndSeed } from './helpers/test-state.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import type { ParsedPasteNode } from '../../src/lib/paste-parser.js';

function node(name: string, overrides?: Partial<ParsedPasteNode>): ParsedPasteNode {
  return {
    name,
    marks: [],
    inlineRefs: [],
    children: [],
    ...overrides,
  };
}

describe('createSiblingNodesFromPaste — parsed paste nodes', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates sibling nodes for each top-level parsed node after current node', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;
    const childrenBefore = loroDoc.getChildren(parentId);

    const lastId = store.createSiblingNodesFromPaste('subtask_1a', [
      node('Line two'),
      node('Line three'),
    ]);

    expect(lastId).not.toBeNull();
    const childrenAfter = loroDoc.getChildren(parentId);
    expect(childrenAfter.length).toBe(childrenBefore.length + 2);

    const idx = childrenAfter.indexOf('subtask_1a');
    const node1 = loroDoc.toNodexNode(childrenAfter[idx + 1]);
    const node2 = loroDoc.toNodexNode(childrenAfter[idx + 2]);
    expect(node1?.name).toBe('Line two');
    expect(node2?.name).toBe('Line three');

    expect(lastId).toBe(childrenAfter[idx + 2]);
  });

  it('returns null when parsed nodes are empty', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;
    const childrenBefore = loroDoc.getChildren(parentId);

    const lastId = store.createSiblingNodesFromPaste('subtask_1a', []);

    expect(lastId).toBeNull();
    const childrenAfter = loroDoc.getChildren(parentId);
    expect(childrenAfter.length).toBe(childrenBefore.length);
  });

  it('writes marks to created nodes', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;

    store.createSiblingNodesFromPaste('subtask_1a', [
      node('Bold text', {
        marks: [{ start: 0, end: 4, type: 'bold' }],
      }),
    ]);

    const children = loroDoc.getChildren(parentId);
    const idx = children.indexOf('subtask_1a');
    const created = loroDoc.toNodexNode(children[idx + 1]);
    expect(created?.name).toBe('Bold text');
    expect(created?.marks).toEqual([{ start: 0, end: 4, type: 'bold' }]);
  });

  it('creates nested children from parsed tree structure', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;

    store.createSiblingNodesFromPaste('subtask_1a', [
      node('Parent', {
        children: [
          node('Child A'),
          node('Child B'),
        ],
      }),
      node('Sibling'),
    ]);

    const children = loroDoc.getChildren(parentId);
    const idx = children.indexOf('subtask_1a');

    const parentNodeId = children[idx + 1];
    const siblingNodeId = children[idx + 2];

    expect(loroDoc.toNodexNode(parentNodeId)?.name).toBe('Parent');
    expect(loroDoc.toNodexNode(siblingNodeId)?.name).toBe('Sibling');

    const nested = loroDoc.getChildren(parentNodeId).map((id) => loroDoc.toNodexNode(id)?.name);
    expect(nested).toEqual(['Child A', 'Child B']);
  });

  it('applies parsed tags and fields', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;

    store.createSiblingNodesFromPaste('subtask_1a', [
      node('Buy milk', {
        tags: ['Task'],
        fields: [{ name: 'Priority', value: 'High' }],
      }),
    ]);

    const children = loroDoc.getChildren(parentId);
    const idx = children.indexOf('subtask_1a');
    const createdId = children[idx + 1];
    const created = loroDoc.toNodexNode(createdId)!;

    expect(created.tags).toContain('tagDef_task');

    const fieldEntryId = created.children.find((cid) => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_priority';
    });
    expect(fieldEntryId).toBeTruthy();

    const valueNodeId = loroDoc.getChildren(fieldEntryId!)[0];
    expect(loroDoc.toNodexNode(valueNodeId)?.name).toBe('High');
  });

  it('persists code block node type and language', () => {
    const store = useNodeStore.getState();
    const parentId = loroDoc.getParentId('subtask_1a')!;

    store.createSiblingNodesFromPaste('subtask_1a', [
      node('const x = 1;', {
        type: 'codeBlock',
        codeLanguage: 'ts',
      }),
    ]);

    const children = loroDoc.getChildren(parentId);
    const idx = children.indexOf('subtask_1a');
    const created = loroDoc.toNodexNode(children[idx + 1]);
    expect(created?.type).toBe('codeBlock');
    expect(created?.codeLanguage).toBe('ts');
    expect(created?.name).toBe('const x = 1;');
  });

  it('preserves tree invariants after parsed paste', () => {
    const store = useNodeStore.getState();
    store.createSiblingNodesFromPaste('subtask_1a', [
      node('Alpha'),
      node('Beta', { children: [node('Beta-1'), node('Beta-2')] }),
      node('Gamma'),
    ]);

    const errors = collectNodeGraphErrors();
    expect(errors).toEqual([]);
  });
});
