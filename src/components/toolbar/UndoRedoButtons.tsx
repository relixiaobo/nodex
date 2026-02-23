/**
 * Undo/Redo buttons — placeholder until #44 Undo/Redo is implemented.
 * Currently always disabled (opacity-30).
 */
import { Undo2, Redo2 } from '../../lib/icons.js';

export function UndoRedoButtons() {
  return (
    <div className="flex items-center gap-0.5">
      <button
        disabled
        className="flex h-7 w-7 items-center justify-center rounded-md opacity-30 cursor-default"
        title="Undo"
      >
        <Undo2 size={16} strokeWidth={1.5} />
      </button>
      <button
        disabled
        className="flex h-7 w-7 items-center justify-center rounded-md opacity-30 cursor-default"
        title="Redo"
      >
        <Redo2 size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
