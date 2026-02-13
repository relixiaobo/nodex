/**
 * Editable description line for PanelTitle.
 *
 * Displays below TagBar as gray small text.
 * Click to edit (contentEditable), blur/Enter to save, Escape to cancel.
 * When empty and not editing, renders nothing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';

interface NodeDescriptionProps {
  nodeId: string;
}

export function NodeDescription({ nodeId }: NodeDescriptionProps) {
  const node = useNode(nodeId);
  const updateNodeDescription = useNodeStore((s) => s.updateNodeDescription);
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const description = node?.props.description ?? '';
  const [editing, setEditing] = useState(false);
  const descRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing && descRef.current) {
      descRef.current.textContent = description;
      descRef.current.focus();
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(descRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing, description]);

  const handleBlur = useCallback(() => {
    if (!descRef.current) return;
    const newDesc = descRef.current.textContent?.trim() ?? '';
    if (newDesc !== description) {
      updateNodeDescription(nodeId, newDesc, userId);
    }
    setEditing(false);
  }, [nodeId, description, userId, updateNodeDescription]);

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
      className={`text-xs leading-tight text-foreground-tertiary mt-1 ${editing ? 'outline-none cursor-text' : 'cursor-pointer'}`}
      onClick={!editing ? () => setEditing(true) : undefined}
      onBlur={editing ? handleBlur : undefined}
      onKeyDown={editing ? handleKeyDown : undefined}
    >
      {!editing && description}
    </div>
  );
}
