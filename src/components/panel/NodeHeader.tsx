/**
 * NodeHeader — unified "node identity" area for NodePanel.
 *
 * Replaces PanelTitle.tsx with a 3-column layout that aligns vertically
 * with OutlinerView items below:
 *   Col A (15px): drag handle — aligns with chevron
 *   Col B (15px): checkbox / icon — aligns with bullet
 *   Col C (flex): node name / tags — aligns with text
 *
 * Three conditional blocks:
 *   ① Icon row (conditional: tagDef or fieldDef)
 *   ② Name row (always)
 *   ③ Supertag row (conditional: has tags, not a definition node)
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
import { isDayNode } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName, isToday } from '../../lib/date-utils.js';
import { getNodeCapabilities } from '../../lib/node-capabilities.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { t } from '../../i18n/strings.js';

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
  const canEditNode = getNodeCapabilities(nodeId).canEditNode;

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

  // Title editing — day nodes show "Today, " prefix when viewing today
  const rawName = node?.name ?? '';
  const isTodayNode = useNodeStore((s) => {
    void s._version;
    if (!isDayNode(nodeId)) return false;
    const weekId = loroDoc.getParentId(nodeId);
    if (!weekId) return false;
    const yearId = loroDoc.getParentId(weekId);
    if (!yearId) return false;
    const yearNode = loroDoc.toNodexNode(yearId);
    const year = yearNode?.name ? parseYearNodeName(yearNode.name) : null;
    if (year === null) return false;
    const date = parseDayNodeName(rawName, year);
    return date ? isToday(date) : false;
  });
  const displayName = isTodayNode ? t('common.todayPrefix', { name: rawName }) : rawName;
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

  // When entering edit mode, set content and focus (use rawName, not displayName with "Today, " prefix)
  useEffect(() => {
    if (editing && titleRef.current) {
      titleRef.current.textContent = rawName;
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(titleRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, [editing, rawName]);

  const handleBlur = useCallback(() => {
    if (!canEditNode) {
      setEditing(false);
      return;
    }
    if (!titleRef.current) return;
    const newName = titleRef.current.textContent?.trim() ?? '';
    if (newName !== rawName) {
      setNodeName(nodeId, newName);
    }
    setEditing(false);
  }, [canEditNode, nodeId, rawName, setNodeName]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleRef.current?.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (titleRef.current) titleRef.current.textContent = rawName;
        setEditing(false);
      }
    },
    [rawName],
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
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: tagDefColor.bg }}
            >
              <span
                className="text-lg font-bold select-none"
                style={{ color: tagDefColor.text }}
              >
                #
              </span>
            </span>
          )}
          {isFieldDef && FieldIcon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground-tertiary">
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
          className="flex shrink-0 h-8 w-[15px] items-center justify-center opacity-0 group-hover/header-row:opacity-40 hover:!opacity-100 cursor-grab transition-opacity"
          title={t('nodeHeader.dragToMove')}
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
            contentEditable={canEditNode && editing}
            suppressContentEditableWarning
            className={`text-xl font-semibold leading-8 outline-none min-h-8 flex-1 ${canEditNode ? 'cursor-text' : 'cursor-default'} ${isDone ? 'text-foreground/50 line-through' : ''}`}
            onClick={() => {
              if (!canEditNode) return;
              if (!editing) setEditing(true);
            }}
            onBlur={handleBlur}
            onKeyDown={editing ? handleKeyDown : undefined}
          >
            {!editing && (displayName || <span className="text-foreground-tertiary">{t('common.untitled')}</span>)}
          </h1>
        </div>
      </div>

      {/* ── Block ③: Supertag row (conditional) ── */}
      {hasTags && !isDefinitionNode && (
        <div className="mt-0.5" style={{ paddingLeft: COL_B_OFFSET }}>
          <TagBar nodeId={nodeId} />
        </div>
      )}

      {/* ── Description ── */}
      <div style={{ paddingLeft: COL_B_OFFSET }}>
        <NodeDescription nodeId={nodeId} editable={canEditNode} />
      </div>
    </div>
  );
}
