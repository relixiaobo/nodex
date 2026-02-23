/**
 * 1.51 undo-timeline — 统一时间线 Undo/Redo
 *
 * 验证：
 * 1. 纯数据结构 push/pop/reset
 * 2. 交错操作顺序（S→N→S→N，undo 应为 N→S→N→S）
 * 3. Loro mergeInterval 跳过（timeline 有多个 S 但 canUndoDoc 不够）
 * 4. 新操作清空 redo
 * 5. redo 恢复后再 undo 往返
 * 6. 集成：navigateTo/goBack/goForward 推入 'nav'，commitDoc 推入 'structural'
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  pushUndoEntry,
  popUndoEntry,
  pushRedoEntry,
  popRedoEntry,
  hasUndoEntries,
  hasRedoEntries,
  resetTimeline,
  getUndoDepth,
  getRedoDepth,
} from '../../src/lib/undo-timeline.js';
import {
  canUndoDoc,
  canRedoDoc,
  getChildren,
} from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { performTimelineUndo, performTimelineRedo } from '../../src/hooks/use-nav-undo-keyboard.js';
import { resetAndSeed } from './helpers/test-state.js';

beforeEach(() => {
  resetAndSeed();
});

// ──────────────────────────────────────────────
// 纯数据结构测试
// ──────────────────────────────────────────────

describe('undo-timeline 纯数据结构', () => {
  it('push/pop 基本操作', () => {
    expect(hasUndoEntries()).toBe(false);
    expect(hasRedoEntries()).toBe(false);

    pushUndoEntry('structural');
    pushUndoEntry('nav');
    expect(hasUndoEntries()).toBe(true);
    expect(getUndoDepth()).toBe(2);

    expect(popUndoEntry()).toBe('nav');
    expect(popUndoEntry()).toBe('structural');
    expect(popUndoEntry()).toBeUndefined();
    expect(hasUndoEntries()).toBe(false);
  });

  it('redo push/pop 基本操作', () => {
    pushRedoEntry('nav');
    pushRedoEntry('structural');
    expect(hasRedoEntries()).toBe(true);
    expect(getRedoDepth()).toBe(2);

    expect(popRedoEntry()).toBe('structural');
    expect(popRedoEntry()).toBe('nav');
    expect(popRedoEntry()).toBeUndefined();
  });

  it('pushUndoEntry 默认清空 redo', () => {
    pushRedoEntry('nav');
    pushRedoEntry('structural');
    expect(hasRedoEntries()).toBe(true);

    pushUndoEntry('structural'); // clearRedo=true (default)
    expect(hasRedoEntries()).toBe(false);
  });

  it('pushUndoEntry(type, false) 不清空 redo', () => {
    pushRedoEntry('nav');
    pushUndoEntry('structural', false);
    expect(hasRedoEntries()).toBe(true);
    expect(getRedoDepth()).toBe(1);
  });

  it('resetTimeline 清空两个栈', () => {
    pushUndoEntry('structural');
    pushUndoEntry('nav');
    pushRedoEntry('structural');
    resetTimeline();
    expect(hasUndoEntries()).toBe(false);
    expect(hasRedoEntries()).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 集成：navigateTo / commitDoc 推入时间线
// ──────────────────────────────────────────────

describe('集成：navigateTo 推入 nav 条目', () => {
  it('navigateTo 推入 nav 到 timeline', () => {
    expect(getUndoDepth()).toBe(0);
    useUIStore.getState().navigateTo('note_2');
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('nav');
  });

  it('goBack 推入 nav 到 timeline', () => {
    useUIStore.getState().navigateTo('note_2');
    resetTimeline(); // 清空之前的
    useUIStore.getState().goBack();
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('nav');
  });

  it('goForward 推入 nav 到 timeline', () => {
    useUIStore.getState().navigateTo('note_2');
    useUIStore.getState().goBack();
    resetTimeline();
    useUIStore.getState().goForward();
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('nav');
  });

  it('navigateTo 到当前页面 no-op，不推入 timeline', () => {
    // panelHistory starts at LIBRARY after seed
    const current = useUIStore.getState().panelHistory[useUIStore.getState().panelIndex];
    resetTimeline();
    useUIStore.getState().navigateTo(current);
    expect(getUndoDepth()).toBe(0);
  });
});

describe('集成：commitDoc 推入 structural 条目', () => {
  it('createChild → commitDoc 推入 structural', () => {
    resetTimeline();
    useNodeStore.getState().createChild('proj_1');
    expect(getUndoDepth()).toBe(1);
    expect(popUndoEntry()).toBe('structural');
  });
});

// ──────────────────────────────────────────────
// 交错操作顺序验证
// ──────────────────────────────────────────────

describe('交错操作时间线顺序', () => {
  it('S→N→S→N，undo 顺序应为 N→S→N→S', () => {
    const store = useNodeStore.getState();
    const ui = useUIStore.getState();

    // S1: 创建节点
    store.createChild('proj_1');
    // N1: 导航
    ui.navigateTo('note_2');
    // S2: 创建节点
    store.createChild('proj_1');
    // N2: 导航
    ui.navigateTo('task_1');

    expect(getUndoDepth()).toBe(4);

    // undo 应按时间逆序：N2→S2→N1→S1
    const result = performTimelineUndo();
    expect(result).toBe(true);
    // N2 undone → 导航回到 note_2
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('note_2');

    const result2 = performTimelineUndo();
    expect(result2).toBe(true);
    // S2 undone → 子节点减少

    const result3 = performTimelineUndo();
    expect(result3).toBe(true);
    // N1 undone → 导航回到 LIBRARY
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('LIBRARY');

    const result4 = performTimelineUndo();
    expect(result4).toBe(true);
    // S1 undone

    // 全部 undo 后无更多条目
    expect(performTimelineUndo()).toBe(false);
  });

  it('undo 后 redo 可恢复', () => {
    const store = useNodeStore.getState();
    const ui = useUIStore.getState();
    const childrenBefore = getChildren('proj_1').length;

    store.createChild('proj_1');  // S
    ui.navigateTo('note_2');      // N

    // undo N
    performTimelineUndo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('LIBRARY');

    // redo N
    performTimelineRedo();
    expect(useUIStore.getState().panelHistory[useUIStore.getState().panelIndex]).toBe('note_2');

    // undo N again
    performTimelineUndo();
    // undo S
    performTimelineUndo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);

    // redo S
    performTimelineRedo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);
  });
});

// ──────────────────────────────────────────────
// Loro mergeInterval 跳过验证
// ──────────────────────────────────────────────

describe('Loro mergeInterval 跳过', () => {
  it('timeline 有多个 S 但 canUndoDoc 只够一次时跳过多余条目', () => {
    // 在 test 中 mergeInterval=0 所以每个 commit 独立
    // 模拟场景：手动 push 多个 structural 条目但 Loro 只有 1 步
    const store = useNodeStore.getState();
    store.createChild('proj_1'); // 1 real undo step

    // 手动额外 push（模拟 mergeInterval 合并场景）
    pushUndoEntry('structural');
    pushUndoEntry('structural');
    // 现在 timeline 有 3 个 structural 但 Loro 只有 1 步可撤销

    // 第一次 undo 应该跳过多余的 structural 直到找到可撤销的
    const result = performTimelineUndo();
    expect(result).toBe(true);
    expect(canUndoDoc()).toBe(false); // Loro 栈耗尽

    // 之后 timeline 也无更多可执行条目
    expect(performTimelineUndo()).toBe(false);
  });
});

// ──────────────────────────────────────────────
// 新操作清空 redo
// ──────────────────────────────────────────────

describe('新操作清空 redo', () => {
  it('undo 后执行新操作清空 redo timeline', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');
    store.createChild('proj_1');

    performTimelineUndo(); // undo S2
    expect(hasRedoEntries()).toBe(true);

    // 新操作（commitDoc 内部 pushUndoEntry 默认 clearRedo=true）
    store.createChild('proj_1');
    expect(hasRedoEntries()).toBe(false);
  });

  it('undo 后导航也清空 redo timeline', () => {
    const store = useNodeStore.getState();
    store.createChild('proj_1');

    performTimelineUndo();
    expect(hasRedoEntries()).toBe(true);

    useUIStore.getState().navigateTo('note_2'); // pushUndoEntry('nav') clears redo
    expect(hasRedoEntries()).toBe(false);
  });
});

// ──────────────────────────────────────────────
// redo 恢复后再 undo 的往返
// ──────────────────────────────────────────────

describe('redo→undo 往返', () => {
  it('undo→redo→undo 循环稳定', () => {
    const store = useNodeStore.getState();
    const childrenBefore = getChildren('proj_1').length;

    store.createChild('proj_1');
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);

    // undo
    performTimelineUndo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);

    // redo
    performTimelineRedo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore + 1);

    // undo again
    performTimelineUndo();
    expect(getChildren('proj_1')).toHaveLength(childrenBefore);
  });
});
