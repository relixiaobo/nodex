/**
 * 统一时间线 Undo/Redo — 轻量索引层
 *
 * 在 Loro UndoManager 和 navUndoStack 之上维护操作类型的时间顺序。
 * Cmd+Z 按时间线顺序委派给对应子系统（Loro / navUndo），而非固定优先级级联。
 *
 * 零外部导入，纯数据结构。
 */

export type TimelineEntry = 'structural' | 'nav';

let undoStack: TimelineEntry[] = [];
let redoStack: TimelineEntry[] = [];

/**
 * 记录一次用户操作到 undo 时间线。
 * @param clearRedo 是否清空 redo 栈（默认 true）。
 *   redo 恢复操作推入 undo 时不应清空 redo，需传 false。
 */
export function pushUndoEntry(type: TimelineEntry, clearRedo = true): void {
  undoStack.push(type);
  if (clearRedo) redoStack.length = 0;
}

export function popUndoEntry(): TimelineEntry | undefined {
  return undoStack.pop();
}

export function pushRedoEntry(type: TimelineEntry): void {
  redoStack.push(type);
}

export function popRedoEntry(): TimelineEntry | undefined {
  return redoStack.pop();
}

export function hasUndoEntries(): boolean {
  return undoStack.length > 0;
}

export function hasRedoEntries(): boolean {
  return redoStack.length > 0;
}

export function resetTimeline(): void {
  undoStack = [];
  redoStack = [];
}

/** 获取 undo 栈深度（仅测试用） */
export function getUndoDepth(): number {
  return undoStack.length;
}

/** 获取 redo 栈深度（仅测试用） */
export function getRedoDepth(): number {
  return redoStack.length;
}

