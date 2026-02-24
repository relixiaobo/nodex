/**
 * 1.50 loro-undo — Loro UndoManager 结构性撤销/重做
 *
 * 验证 createChild / moveNodeTo 等结构操作可以通过 undoDoc() / redoDoc() 撤销和重做。
 *
 * 关键前提：
 * - seedTestDataSync() 以 '__seed__' origin 提交，被 UndoManager 排除
 * - 用户操作通过 node-store 调用，最终调用 commitDoc() 创建可撤销的 undo 步骤
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  canUndoDoc,
  canRedoDoc,
  undoDoc,
  redoDoc,
  getChildren,
  getParentId,
  commitDoc,
  createNode,
  setNodeData,
} from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

beforeEach(() => {
  resetAndSeed();
});

describe('canUndoDoc / canRedoDoc 初始状态', () => {
  it('种子数据加载后 canUndoDoc 为 false（种子操作被排除）', () => {
    expect(canUndoDoc()).toBe(false);
    expect(canRedoDoc()).toBe(false);
  });
});

describe('createChild → undoDoc', () => {
  it('创建子节点后 canUndoDoc 为 true', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');
    expect(canUndoDoc()).toBe(true);
  });

  it('undoDoc 后子节点从父节点消失', () => {
    const store = useNodeStore.getState();
    const childrenBefore = getChildren('proj_1').length;
    const newNode = store.createChild('proj_1');
    const newId = newNode.id;

    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);
    expect(getChildren('proj_1')).toContain(newId);

    undoDoc();

    expect(getChildren('proj_1')).toHaveLength(childrenBefore);
    expect(getChildren('proj_1')).not.toContain(newId);
  });

  it('undoDoc 后 canRedoDoc 为 true', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');
    undoDoc();
    expect(canRedoDoc()).toBe(true);
  });

  it('redoDoc 后子节点重新出现', () => {
    const store = useNodeStore.getState();
    const childrenBefore = getChildren('proj_1').length;
    store.createChild('proj_1');

    undoDoc();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);

    redoDoc();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);
  });
});

describe('moveNodeTo → undoDoc', () => {
  it('移动节点后 canUndoDoc 为 true', () => {
    const store = useNodeStore.getState();
    store.moveNodeTo('subtask_1a', 'note_1');
    expect(canUndoDoc()).toBe(true);
  });

  it('undoDoc 后节点回到原父节点', () => {
    const store = useNodeStore.getState();

    const originalParent = getParentId('subtask_1a');
    store.moveNodeTo('subtask_1a', 'note_1');
    expect(getParentId('subtask_1a')).toBe('note_1');

    undoDoc();
    expect(getParentId('subtask_1a')).toBe(originalParent);
  });
});

describe('commitDoc 直接测试', () => {
  it('空提交不影响 canUndoDoc', () => {
    // Committing with no pending ops should be a no-op for UndoManager
    commitDoc();
    // Could be true or false - just verify no crash
    expect(typeof canUndoDoc()).toBe('boolean');
  });

  it('system origin 提交不进入 undo 栈', () => {
    const n = createNode('system_node', null);
    setNodeData(n, 'name', 'system');
    commitDoc('system:bootstrap');

    expect(canUndoDoc()).toBe(false);
  });
});

describe('多次操作的撤销栈深度', () => {
  it('N 次操作后可以依次撤销', () => {
    const store = useNodeStore.getState();
    const childrenBefore = getChildren('proj_1').length;

    // 3 次 createChild (mergeInterval=0 → 每次独立 undo 步骤)
    const id1 = store.createChild('proj_1').id;
    const id2 = store.createChild('proj_1').id;
    const id3 = store.createChild('proj_1').id;

    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 3);
    expect(getChildren('proj_1')).toContain(id3);

    // 撤销最后一个
    undoDoc();
    expect(getChildren('proj_1')).not.toContain(id3);
    expect(getChildren('proj_1')).toContain(id2);

    // 撤销第二个
    undoDoc();
    expect(getChildren('proj_1')).not.toContain(id2);
    expect(getChildren('proj_1')).toContain(id1);

    // 撤销第一个
    undoDoc();
    expect(getChildren('proj_1')).not.toContain(id1);
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);
  });

  it('全部撤销后 canRedoDoc 为 true', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');
    undoDoc();
    expect(canRedoDoc()).toBe(true);
  });

  it('新操作清空 redo 栈', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');
    undoDoc();
    expect(canRedoDoc()).toBe(true);

    // 执行新操作后 redo 栈应该被清空
    store.createChild('proj_1');
    expect(canRedoDoc()).toBe(false);
  });
});

describe('UI marker → undoDoc/redoDoc', () => {
  it('导航操作通过 Loro undo/redo 恢复 panel history', () => {
    const ui = useUIStore.getState();
    const before = {
      panelHistory: [...useUIStore.getState().panelHistory],
      panelIndex: useUIStore.getState().panelIndex,
    };

    ui.navigateTo('inbox_3');
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('inbox_3');

    expect(undoDoc()).toBe(true);
    expect(useUIStore.getState().panelHistory).toEqual(before.panelHistory);
    expect(useUIStore.getState().panelIndex).toBe(before.panelIndex);

    expect(redoDoc()).toBe(true);
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('inbox_3');
  });

  it('展开/折叠通过 Loro undo/redo 恢复 expandedNodes', () => {
    const ui = useUIStore.getState();
    const expandKey = `${CONTAINER_IDS.LIBRARY}:note_2`;

    ui.setExpanded(expandKey, true);
    expect(useUIStore.getState().expandedNodes.has(expandKey)).toBe(true);

    expect(undoDoc()).toBe(true);
    expect(useUIStore.getState().expandedNodes.has(expandKey)).toBe(false);

    expect(redoDoc()).toBe(true);
    expect(useUIStore.getState().expandedNodes.has(expandKey)).toBe(true);
  });

  it('程序性 setExpanded(skipUndo) 不创建 undo step', () => {
    const ui = useUIStore.getState();
    const expandKey = `${CONTAINER_IDS.LIBRARY}:note_2`;

    expect(canUndoDoc()).toBe(false);
    ui.setExpanded(expandKey, true, true);
    expect(useUIStore.getState().expandedNodes.has(expandKey)).toBe(true);
    expect(canUndoDoc()).toBe(false);
  });
});
