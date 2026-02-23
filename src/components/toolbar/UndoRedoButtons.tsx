/**
 * Undo/Redo buttons — placeholder until #44 Undo/Redo is implemented.
 * Sized to match the 15px gutter column (chevron/bullet/back button).
 */
import { ChevronLeft, ChevronRight } from '../../lib/icons.js';

export function UndoRedoButtons() {
  return (
    <div className="flex items-center">
      <button
        disabled
        className="flex h-7 w-[15px] shrink-0 items-center justify-center text-foreground-tertiary transition-colors hover:text-foreground-secondary disabled:pointer-events-none disabled:opacity-50"
        title="Undo"
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
      </button>
      <button
        disabled
        className="flex h-7 w-[15px] shrink-0 items-center justify-center text-foreground-tertiary transition-colors hover:text-foreground-secondary disabled:pointer-events-none disabled:opacity-50"
        title="Redo"
      >
        <ChevronRight size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
