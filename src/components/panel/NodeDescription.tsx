/**
 * Editable description line for NodeHeader.
 *
 * Displays below TagBar as gray small text.
 * MouseDown to edit (contentEditable), blur/Enter to save, Escape to cancel.
 * Cursor placed at click position via caretPositionFromPoint.
 * When empty and not editing, renders nothing — unless triggered externally
 * via ui-store.editingDescriptionNodeId (set by context menu "Add description").
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNode } from '../../hooks/use-node';
import { shouldRenderNodeDescription } from '../../lib/node-description-visibility.js';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';

interface NodeDescriptionProps {
  nodeId: string;
  editable?: boolean;
}

export function NodeDescription({ nodeId, editable = true }: NodeDescriptionProps) {
  const node = useNode(nodeId);
  const updateNodeDescription = useNodeStore((s) => s.updateNodeDescription);

  const description = node?.description ?? '';
  const [editing, setEditing] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);
  const clickCoordsRef = useRef<{ x: number; y: number } | null>(null);

  // External trigger: context menu "Add description" sets editingDescriptionNodeId
  const editingDescriptionNodeId = useUIStore((s) => s.editingDescriptionNodeId);
  useEffect(() => {
    if (editingDescriptionNodeId === nodeId && editable) {
      setEditing(true);
      useUIStore.getState().setEditingDescription(null);
    }
  }, [editingDescriptionNodeId, nodeId, editable]);

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
    if (!editable) return;
    e.preventDefault();
    clickCoordsRef.current = { x: e.clientX, y: e.clientY };
    setEditing(true);
  }, [editable]);

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

  if (!shouldRenderNodeDescription({ description, editing, tags: node?.tags })) return null;

  return (
    <div
      ref={editing ? descRef : undefined}
      contentEditable={editing}
      suppressContentEditableWarning
      className={`text-xs leading-[15px] min-h-[15px] text-foreground-tertiary mt-1 ${editable ? 'cursor-text' : 'cursor-default'} ${editing ? 'outline-none' : ''}`}
      data-placeholder={editing ? 'Add description' : undefined}
      onMouseDown={editable && !editing ? handleMouseDown : undefined}
      onBlur={editing ? handleBlur : undefined}
      onKeyDown={editing ? handleKeyDown : undefined}
    >
      {!editing && description}
    </div>
  );
}
