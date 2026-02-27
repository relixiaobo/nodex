/**
 * NodeHeader — unified "node identity" area for NodePanel.
 *
 * Content (icon, tags, title, description) aligns to the panel left edge
 * (px-4 = 16px), flush with the panel margin.
 *
 * Three conditional blocks:
 *   ① Icon row (conditional: tagDef or fieldDef)
 *   ② Name row (always)
 *   ③ Supertag row (conditional: has tags, not a definition node)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Library, Inbox, CalendarDays, Trash2, Search, type AppIcon } from '../../lib/icons.js';
import { useNode } from '../../hooks/use-node';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useNodeCheckbox } from '../../hooks/use-node-checkbox';
import { resolveDataType, getFieldTypeIcon } from '../../lib/field-utils.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { isContainerNode } from '../../types/index.js';
import { getSystemContainerMeta, type ContainerIconKey } from '../../lib/system-node-registry.js';
import { TagBar } from '../tags/TagBar';
import { NodeDescription } from './NodeDescription';
import { isDayNode } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName, isToday } from '../../lib/date-utils.js';
import { getNodeCapabilities } from '../../lib/node-capabilities.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { t } from '../../i18n/strings.js';

const CONTAINER_HEADER_ICONS: Record<ContainerIconKey, AppIcon> = {
  library: Library,
  inbox: Inbox,
  journal: CalendarDays,
  trash: Trash2,
  search: Search,
  schema: Library,
  clips: Library,
  stash: Library,
};


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

  // Workspace root detection — show [W] avatar in icon block
  const wsId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const isWorkspaceRoot = !!wsId && nodeId === wsId;
  const wsInitial = useNodeStore((s) => {
    void s._version;
    if (!isWorkspaceRoot || !wsId) return 'W';
    const wsNode = loroDoc.toNodexNode(wsId);
    const raw = wsNode?.name ?? '';
    const clean = raw.replace(/<[^>]+>/g, '').trim();
    return clean.charAt(0).toUpperCase() || 'W';
  });

  // Container icon lookup
  const isContainer = isContainerNode(nodeId);
  const containerMeta = isContainer ? getSystemContainerMeta(nodeId as any) : undefined;
  const ContainerIcon = containerMeta ? CONTAINER_HEADER_ICONS[containerMeta.iconKey] : undefined;

  // Determine whether to show icon block (block ①)
  const showIconBlock = isTagDef || isFieldDef || isWorkspaceRoot || isContainer;

  return (
    <div className="pt-1 px-4">
      {/* ── Block ①: Icon (conditional) ── */}
      {showIconBlock && (
        <div className="mb-1">
          {isTagDef && tagDefColor && (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04] mix-blend-multiply"
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
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04] mix-blend-multiply text-foreground-tertiary">
              <FieldIcon size={20} />
            </span>
          )}
          {isWorkspaceRoot && (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
              {wsInitial}
            </span>
          )}
          {isContainer && ContainerIcon && (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04] mix-blend-multiply text-foreground-tertiary">
              <ContainerIcon size={20} />
            </span>
          )}
        </div>
      )}

      {/* ── Block ③: Supertag row (conditional) moved before name ── */}
      {hasTags && !isDefinitionNode && (
        <div className="mb-0.5">
          <TagBar nodeId={nodeId} />
        </div>
      )}

      {/* ── Block ②: Name row (always) ── */}
      <div
        className="flex min-h-6 items-start"
      >
        {/* Inner container: col B + col C */}
        <div
          className="flex items-start flex-1 min-w-0"
          style={{ gap: showCheckbox ? 8 : 0 }}
        >
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
            className={`text-xl font-semibold leading-8 outline-none min-h-8 flex-1 ${canEditNode ? 'cursor-text' : 'cursor-default'} ${isDone ? 'text-foreground/40 line-through' : ''}`}
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

      {/* ── Description ── */}
      <div>
        <NodeDescription nodeId={nodeId} editable={canEditNode} />
      </div>
    </div>
  );
}
