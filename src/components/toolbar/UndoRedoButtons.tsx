/**
 * Undo/Redo buttons — placeholder until #44 Undo/Redo is implemented.
 * Same diameter as search pill height (h-8 w-8 = 32px).
 */
import { ArrowLeft, ArrowRight } from '../../lib/icons.js';

export function UndoRedoButtons() {
  return (
    <div className="flex items-center gap-0.5">
      <button
        disabled
        className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/10 hover:text-foreground-secondary disabled:pointer-events-none disabled:opacity-50"
        title="Undo"
      >
        <ArrowLeft size={16} strokeWidth={1.5} />
      </button>
      <button
        disabled
        className="flex h-8 w-8 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/10 hover:text-foreground-secondary disabled:pointer-events-none disabled:opacity-50"
        title="Redo"
      >
        <ArrowRight size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
