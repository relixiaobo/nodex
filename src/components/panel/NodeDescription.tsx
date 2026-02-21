/**
 * Editable description line for NodeHeader.
 *
 * Displays below TagBar as gray small text.
 * MouseDown to edit (contentEditable), blur/Enter to save, Escape to cancel.
 * Cursor placed at click position via caretPositionFromPoint.
 * When empty and not editing, renders nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';

interface NodeDescriptionProps {
  nodeId: string;
}

export function NodeDescription({ nodeId }: NodeDescriptionProps) {
  const node = useNode(nodeId);
  const updateNodeDescription = useNodeStore((s) => s.updateNodeDescription);

  const description = node?.description ?? '';
  const [editing, setEditing] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  const clickCoordsRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (editing && descRef.current) {
      const el = descRef.current;
      el.textContent = description;
      el.focus();

      const coords = clickCoordsRef.current;
      clickCoordsRef.current = null;

      if (coords && description) {
        const doc = el.ownerDocument;
        const caretDoc = doc as Document & {
          caretPositionFromPoint?: (x: number, y: number) => CaretPosition | null;
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
        };
        try {
          const pos = caretDoc.caretPositionFromPoint?.(coords.x, coords.y);
          if (pos && el.contains(pos.offsetNode)) {
            const range = doc.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            return;
          }
          const range = caretDoc.caretRangeFromPoint?.(coords.x, coords.y);
          if (range && el.contains(range.startContainer)) {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            return;
          }
        } catch { /* fallback to cursor at end */ }
      }

      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing, description]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    clickCoordsRef.current = { x: e.clientX, y: e.clientY };
    setEditing(true);
  }, []);

  const handleBlur = useCallback(() => {
    if (!descRef.current) return;
    const newDesc = descRef.current.textContent?.trim() ?? '';
    if (newDesc !== description) {
      updateNodeDescription(nodeId, newDesc);
    }
    setEditing(false);
  }, [nodeId, description, updateNodeDescription]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        descRef.current?.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (descRef.current) descRef.current.textContent = description;
        setEditing(false);
      }
    },
    [description],
  );

  if (!description && !editing) return null;

  return (
    <div
      ref={editing ? descRef : undefined}
      contentEditable={editing}
      suppressContentEditableWarning
      className={`text-xs leading-[15px] min-h-[15px] text-foreground-tertiary mt-1 cursor-text ${editing ? 'outline-none' : ''}`}
      onMouseDown={!editing ? handleMouseDown : undefined}
      onBlur={editing ? handleBlur : undefined}
      onKeyDown={editing ? handleKeyDown : undefined}
    >
      {!editing && description}
    </div>
  );
}
