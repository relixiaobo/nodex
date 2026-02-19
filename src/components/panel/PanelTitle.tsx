/**
 * Large editable title for the NodePanel scrollable content area.
 *
 * Renders node name in `text-lg font-semibold`.
 * Click to enter edit mode (contentEditable), blur/Enter to save.
 * For attrDef nodes, shows field type icon before title.
 * TagBar rendered below the title.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import { resolveDataType, getFieldTypeIcon } from '../../lib/field-utils.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { TagBar } from '../tags/TagBar';
import { NodeDescription } from './NodeDescription';

interface PanelTitleProps {
  nodeId: string;
  onTitleRef?: (el: HTMLElement | null) => void;
}

export function PanelTitle({ nodeId, onTitleRef }: PanelTitleProps) {
  const node = useNode(nodeId);
  const setNodeName = useNodeStore((s) => s.setNodeName);

  const isAttrDef = node?.type === 'fieldDef';
  const isTagDef = node?.type === 'tagDef';
  const dataType = useNodeStore((s) => {
    void s._version;
    return isAttrDef ? resolveDataType({}, nodeId) : '';
  });
  const FieldIcon = isAttrDef ? getFieldTypeIcon(dataType) : null;

  // TagDef: colored # badge reflecting configured SYS_A11 color
  const tagDefColor = useNodeStore((s) => {
    void s._version;
    return isTagDef ? resolveTagColor({}, nodeId) : null;
  });

  const rawName = node?.name ?? '';
  const displayName = rawName.replace(/<[^>]+>/g, '') || '';

  const [editing, setEditing] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Sync ref callback for IntersectionObserver
  const setRef = useCallback(
    (el: HTMLHeadingElement | null) => {
      (titleRef as React.MutableRefObject<HTMLHeadingElement | null>).current = el;
      onTitleRef?.(el);
    },
    [onTitleRef],
  );

  // When entering edit mode, set content and focus
  useEffect(() => {
    if (editing && titleRef.current) {
      titleRef.current.textContent = displayName;
      // Place cursor at end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(titleRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing, displayName]);

  const handleBlur = useCallback(() => {
    if (!titleRef.current) return;
    const newName = titleRef.current.textContent?.trim() ?? '';
    if (newName !== displayName) {
      setNodeName(nodeId, newName);
    }
    setEditing(false);
  }, [nodeId, displayName, setNodeName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleRef.current?.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Restore original content and blur
        if (titleRef.current) titleRef.current.textContent = displayName;
        setEditing(false);
      }
    },
    [displayName],
  );

  return (
    <div className="px-4 pt-3 pb-1">
      <div className="flex items-center gap-2">
        {isTagDef && tagDefColor && (
          <span
            className="shrink-0 flex h-7 w-7 items-center justify-center rounded-full"
            style={{ backgroundColor: tagDefColor.bg }}
          >
            <span className="text-sm font-bold select-none" style={{ color: tagDefColor.text }}>#</span>
          </span>
        )}
        {FieldIcon && (
          <span className="shrink-0 mt-1.5 text-foreground-tertiary">
            <FieldIcon size={16} />
          </span>
        )}
        <h1
          ref={setRef}
          contentEditable={editing}
          suppressContentEditableWarning
          className="text-lg font-semibold leading-6 outline-none min-h-7 flex-1 cursor-text"
          onClick={() => {
            if (!editing) setEditing(true);
          }}
          onBlur={handleBlur}
          onKeyDown={editing ? handleKeyDown : undefined}
          dangerouslySetInnerHTML={editing ? undefined : {
            __html: displayName || '<span class="text-foreground-tertiary">Untitled</span>',
          }}
        />
      </div>
      <div className="mt-0.5">
        <TagBar nodeId={nodeId} />
      </div>
      <NodeDescription nodeId={nodeId} />
    </div>
  );
}
