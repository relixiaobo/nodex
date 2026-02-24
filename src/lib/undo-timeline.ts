/**
 * Unified timeline undo/redo — lightweight ordering index.
 *
 * Tracks the temporal order of user actions across subsystems (Loro structural
 * mutations, UI navigation, expand/collapse), then delegates undo/redo to the
 * corresponding subsystem in reverse order.
 *
 * Pure data structure, zero imports.
 */

export type TimelineEntry = 'structural' | 'nav' | 'expand';

let undoStack: TimelineEntry[] = [];
let redoStack: TimelineEntry[] = [];

/**
 * Record a new user action in the undo timeline.
 * @param clearRedo Whether to clear redo stack (default true).
 *   Redo replay paths push back into undo without clearing redo, so pass false.
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

/** Test-only helpers */
export function getUndoDepth(): number {
  return undoStack.length;
}

/** Test-only helpers */
export function getRedoDepth(): number {
  return redoStack.length;
}
