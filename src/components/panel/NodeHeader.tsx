/**
 * NodeHeader — unified "node identity" area for NodePanel.
 *
 * Replaces PanelTitle.tsx with a 3-column layout that aligns vertically
 * with OutlinerView items below:
 *   Col A (15px): drag handle — aligns with chevron
 *   Col B (15px): checkbox / icon — aligns with bullet
 *   Col C (flex): node name / tags — aligns with text
 *
 * Four conditional blocks:
 *   ① Icon row (conditional: tagDef or fieldDef)
 *   ② Name row (always)
 *   ③ Supertag row (conditional: has tags, not a definition node)
 *   ④ Extra row (plugin slot, currently unused)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { GripVertical } from '../../lib/icons.js';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import { useNodeCheckbox } from '../../hooks/use-node-checkbox';
import { resolveDataType, getFieldTypeIcon } from '../../lib/field-utils.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { TagBar } from '../tags/TagBar';
import { NodeDescription } from './NodeDescription';

/** Depth-0 padding formula from OutlinerItem: depth * 28 + 6. Header is always depth 0. */
const ROW_PADDING_LEFT = 6;
/** Col B offset: skip col A (15px) + gap-1 (4px). */
const COL_B_OFFSET = ROW_PADDING_LEFT + 15 + 4;

interface NodeHeaderProps {
  nodeId: string;
  onTitleRef?: (el: HTMLElement | null) => void;
}

export function NodeHeader({ nodeId, onTitleRef }: NodeHeaderProps) {
  const node = useNode(nodeId);
  const setNodeName = useNodeStore((s) => s.setNodeName);

  const isFieldDef = node?.type === 'fieldDef';
  const isTagDef = node?.type === 'tagDef';
  const isDefinitionNode = isFieldDef || isTagDef;

  // Checkbox
  const { showCheckbox, isDone } = useNodeCheckbox(nodeId);
  const cycleNodeCheckbox = useNodeStore((s) => s.cycleNodeCheckbox);

  // TagDef color
  const tagDefColor = useNodeStore((s) => {
    void s._version;
    return isTagDef ? resolveTagColor(nodeId) : null;
  });

  // FieldDef icon
  const dataType = useNodeStore((s) => {
    void s._version;
    return isFieldDef ? resolveDataType(nodeId) : '';
  });
  const FieldIcon = isFieldDef ? getFieldTypeIcon(dataType) : null;

  // Has supertags (for block ③)
  const hasTags = (node?.tags ?? []).length > 0;

  // Title editing
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
        if (titleRef.current) titleRef.current.textContent = displayName;
        setEditing(false);
      }
    },
    [displayName],
  );

  const handleCheckboxChange = useCallback(() => {
    cycleNodeCheckbox(nodeId);
  }, [nodeId, cycleNodeCheckbox]);

  // Determine whether to show icon block (block ①)
  const showIconBlock = isTagDef || isFieldDef;

  return (
    <div className="pt-3 pb-1">
      {/* ── Block ①: Icon (conditional) ── */}
      {showIconBlock && (
        <div className="mb-1" style={{ paddingLeft: COL_B_OFFSET }}>
          {isTagDef && tagDefColor && (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: tagDefColor.bg }}
            >
              <span
                className="text-base font-bold select-none"
                style={{ color: tagDefColor.text }}
              >
                #
              </span>
            </span>
          )}
          {isFieldDef && FieldIcon && (
            <span className="flex h-8 w-8 items-center justify-center text-foreground-tertiary">
              <FieldIcon size={20} />
            </span>
          )}
        </div>
      )}

      {/* ── Block ②: Name row (always) ── */}
      <div
        className="group/header-row flex gap-1 min-h-7 items-start"
        style={{ paddingLeft: ROW_PADDING_LEFT }}
      >
        {/* Col A: Drag handle (same position as chevron) */}
        <span
          className="flex shrink-0 h-7 w-[15px] items-center justify-center opacity-0 group-hover/header-row:opacity-40 hover:!opacity-100 cursor-grab transition-opacity"
          title="Drag to move (right-click for menu)"
        >
          <GripVertical size={12} />
        </span>

        {/* Inner container: col B + col C (matches OutlinerItem's flex gap-2) */}
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {/* Col B: Checkbox (conditional, same position as bullet) */}
          {showCheckbox && (
            <span className="flex shrink-0 h-8 w-[15px] items-center justify-center">
              <input
                type="checkbox"
                checked={isDone}
                onChange={handleCheckboxChange}
                className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
              />
            </span>
          )}

          {/* Col C: Editable name */}
          <h1
            ref={setRef}
            contentEditable={editing}
            suppressContentEditableWarning
            className={`text-xl font-semibold leading-8 outline-none min-h-8 flex-1 cursor-text ${isDone ? 'text-foreground/50 line-through' : ''}`}
            onClick={() => {
              if (!editing) setEditing(true);
            }}
            onBlur={handleBlur}
            onKeyDown={editing ? handleKeyDown : undefined}
            dangerouslySetInnerHTML={
              editing
                ? undefined
                : {
                    __html:
                      displayName ||
                      '<span class="text-foreground-tertiary">Untitled</span>',
                  }
            }
          />
        </div>
      </div>

      {/* ── Block ③: Supertag row (conditional) ── */}
      {hasTags && !isDefinitionNode && (
        <div className="mt-0.5" style={{ paddingLeft: COL_B_OFFSET }}>
          <TagBar nodeId={nodeId} />
        </div>
      )}

      {/* ── Block ④: Extra row (plugin slot — currently unused) ── */}

      {/* ── Description ── */}
      <div style={{ paddingLeft: COL_B_OFFSET }}>
        <NodeDescription nodeId={nodeId} />
      </div>
    </div>
  );
}
