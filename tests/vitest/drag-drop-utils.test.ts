import { resolveDropMove } from '../../src/lib/drag-drop.js';

describe('drag-drop decision helper', () => {
  it('returns null for invalid drag context', () => {
    expect(resolveDropMove({
      dragNodeId: null,
      targetNodeId: 'task_1',
      targetParentId: 'proj_1',
      targetParentKey: 'node-main:proj_1:task_1',
      siblingIndex: 1,
      dropPosition: 'before',
      targetHasChildren: true,
      targetIsExpanded: true,
    })).toBeNull();

    expect(resolveDropMove({
      dragNodeId: 'task_1',
      targetNodeId: 'task_1',
      targetParentId: 'proj_1',
      targetParentKey: 'node-main:proj_1:task_1',
      siblingIndex: 1,
      dropPosition: 'after',
      targetHasChildren: true,
      targetIsExpanded: false,
    })).toBeNull();

    expect(resolveDropMove({
      dragNodeId: 'task_2',
      targetNodeId: 'task_1',
      targetParentId: undefined,
      targetParentKey: 'node-main:proj_1:task_1',
      siblingIndex: 0,
      dropPosition: 'before',
      targetHasChildren: false,
      targetIsExpanded: false,
    })).toBeNull();

    expect(resolveDropMove({
      dragNodeId: 'task_2',
      targetNodeId: 'task_1',
      targetParentId: 'proj_1',
      targetParentKey: 'node-main:proj_1:task_1',
      siblingIndex: 0,
      dropPosition: null,
      targetHasChildren: false,
      targetIsExpanded: false,
    })).toBeNull();
  });

  it('resolves before/after/inside semantics', () => {
    expect(resolveDropMove({
      dragNodeId: 'subtask_1b',
      targetNodeId: 'task_2',
      targetParentId: 'proj_1',
      targetParentKey: 'node-main:proj_1:task_2',
      siblingIndex: 1,
      dropPosition: 'before',
      targetHasChildren: true,
      targetIsExpanded: true,
    })).toEqual({
      newParentId: 'proj_1',
      position: 1,
    });

    expect(resolveDropMove({
      dragNodeId: 'subtask_1b',
      targetNodeId: 'task_2',
      targetParentId: 'proj_1',
      targetParentKey: 'node-main:proj_1:task_2',
      siblingIndex: 1,
      dropPosition: 'after',
      targetHasChildren: false,
      targetIsExpanded: false,
    })).toEqual({
      newParentId: 'proj_1',
      position: 2,
    });

    // Expanded target with children: "after" is interpreted as first child.
    expect(resolveDropMove({
      dragNodeId: 'subtask_1b',
      targetNodeId: 'task_2',
      targetParentId: 'proj_1',
      targetParentKey: 'node-main:proj_1:task_2',
      siblingIndex: 1,
      dropPosition: 'after',
      targetHasChildren: true,
      targetIsExpanded: true,
    })).toEqual({
      newParentId: 'task_2',
      position: 0,
    });

    // Non-expanded target: "after" remains sibling insertion.
    expect(resolveDropMove({
      dragNodeId: 'subtask_1b',
      targetNodeId: 'task_2',
      targetParentId: 'proj_1',
      targetParentKey: 'node-main:proj_1:task_2',
      siblingIndex: 1,
      dropPosition: 'after',
      targetHasChildren: true,
      targetIsExpanded: false,
    })).toEqual({
      newParentId: 'proj_1',
      position: 2,
    });

    expect(resolveDropMove({
      dragNodeId: 'subtask_1b',
      targetNodeId: 'task_2',
      targetParentId: 'proj_1',
      targetParentKey: 'node-main:proj_1:task_2',
      siblingIndex: 1,
      dropPosition: 'inside',
      targetHasChildren: false,
      targetIsExpanded: false,
    })).toEqual({
      newParentId: 'task_2',
      position: 0,
      expandKey: 'node-main:proj_1:task_2',
    });
  });

  it('resolves drops on nodes inside a field entry (field value context)', () => {
    // Drop "before" a value node inside a field entry — parent is the field entry
    expect(resolveDropMove({
      dragNodeId: 'content_node_3',
      targetNodeId: 'value_node_1',
      targetParentId: 'field_entry_1',
      targetParentKey: 'node-main:field_entry_1:value_node_1',
      siblingIndex: 0,
      dropPosition: 'before',
      targetHasChildren: false,
      targetIsExpanded: false,
    })).toEqual({
      newParentId: 'field_entry_1',
      position: 0,
    });

    // Drop "after" a value node inside a field entry
    expect(resolveDropMove({
      dragNodeId: 'content_node_3',
      targetNodeId: 'value_node_1',
      targetParentId: 'field_entry_1',
      targetParentKey: 'node-main:field_entry_1:value_node_1',
      siblingIndex: 0,
      dropPosition: 'after',
      targetHasChildren: false,
      targetIsExpanded: false,
    })).toEqual({
      newParentId: 'field_entry_1',
      position: 1,
    });

    // Drop "inside" a value node inside a field entry (nesting)
    expect(resolveDropMove({
      dragNodeId: 'content_node_3',
      targetNodeId: 'value_node_1',
      targetParentId: 'field_entry_1',
      targetParentKey: 'node-main:field_entry_1:value_node_1',
      siblingIndex: 0,
      dropPosition: 'inside',
      targetHasChildren: false,
      targetIsExpanded: false,
    })).toEqual({
      newParentId: 'value_node_1',
      position: 0,
      expandKey: 'node-main:field_entry_1:value_node_1',
    });
  });
});
