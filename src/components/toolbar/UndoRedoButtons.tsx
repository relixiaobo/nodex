/**
 * Undo/Redo buttons — wired to Loro UndoManager (#44).
 * Same diameter as search pill height (h-8 w-8 = 32px).
 *
 * Reactively enables/disables based on canUndoDoc() / canRedoDoc(),
 * re-evaluated whenever node-store _version changes.
 */
import { useCallback } from 'react';
import { Undo2, Redo2 } from '../../lib/icons.js';
import { undoDoc, redoDoc, canUndoDoc, canRedoDoc } from '../../lib/loro-doc.js';
import { useNodeStore } from '../../stores/node-store.js';

const btnClass =
  'flex h-8 w-8 items-center justify-center rounded-full text-foreground-tertiary transition-colors hover:bg-foreground/10 hover:text-foreground-secondary disabled:pointer-events-none disabled:opacity-50';

export function UndoRedoButtons() {
  // Subscribe to _version so buttons re-evaluate after every Loro change
  const canUndo = useNodeStore((s: { _version: number }) => {
    void s._version;
    return canUndoDoc();
  });
  const canRedo = useNodeStore((s: { _version: number }) => {
    void s._version;
    return canRedoDoc();
  });

  const handleUndo = useCallback(() => { undoDoc(); }, []);
  const handleRedo = useCallback(() => { redoDoc(); }, []);

  return (
    <div className="flex items-center gap-0.5">
      <button
        disabled={!canUndo}
        onClick={handleUndo}
        className={btnClass}
        title="Undo (⌘Z)"
      >
        <Undo2 size={16} strokeWidth={1.5} />
      </button>
      <button
        disabled={!canRedo}
        onClick={handleRedo}
        className={btnClass}
        title="Redo (⌘⇧Z)"
      >
        <Redo2 size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
