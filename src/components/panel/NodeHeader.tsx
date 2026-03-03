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
import { useCallback, useRef, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import { Library, Inbox, CalendarDays, Trash2, Search, Settings, type AppIcon } from '../../lib/icons.js';
import { useNode } from '../../hooks/use-node';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { useNodeCheckbox } from '../../hooks/use-node-checkbox';
import { useEditorTriggers, buildTriggerEditorProps } from '../../hooks/use-editor-triggers.js';
import { resolveDataType, getFieldTypeIcon } from '../../lib/field-utils.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { isContainerNode } from '../../types/index.js';
import { getSystemContainerMeta, type ContainerIconKey } from '../../lib/system-node-registry.js';
import { TagBar } from '../tags/TagBar';
import { RichTextEditor } from '../editor/RichTextEditor';
import { TriggerDropdowns } from '../editor/TriggerDropdowns';
import { NodeDescription } from './NodeDescription';
import { isDayNode } from '../../lib/journal.js';
import { parseDayNodeName, parseYearNodeName, isToday } from '../../lib/date-utils.js';
import { getNodeCapabilities } from '../../lib/node-capabilities.js';
import { docToMarks } from '../../lib/pm-doc-utils.js';
import { marksToHtml } from '../../lib/editor-marks.js';
import { getTextOffsetFromPoint, getRenderedTextRightEdge } from '../../lib/dom-caret-utils.js';
import { getNodeTextLengthById } from '../../lib/tree-utils.js';
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
  settings: Settings,
};

// No-ops for outliner navigation callbacks that don't apply to NodeHeader
const noop = () => {};
const noopDelete = (): boolean => false;

interface NodeHeaderProps {
  nodeId: string;
  onTitleRef?: (el: HTMLElement | null) => void;
}

export function NodeHeader({ nodeId, onTitleRef }: NodeHeaderProps) {
  const node = useNode(nodeId);
  const updateNodeContent = useNodeStore((s) => s.updateNodeContent);

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
  const tagIds = useNodeTags(nodeId);
  const hasTags = tagIds.length > 0;

  // Title — day nodes show "Today, " prefix when viewing today
  const rawName = node?.name ?? '';
  const rawMarks = node?.marks ?? [];
  const rawInlineRefs = node?.inlineRefs ?? [];
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
  const editorRef = useRef<EditorView | null>(null);
  const titleWrapperRef = useRef<HTMLDivElement>(null);

  const handleCheckboxChange = useCallback(() => {
    cycleNodeCheckbox(nodeId);
  }, [nodeId, cycleNodeCheckbox]);

  // Trigger system for # @ / in header editor
  const triggers = useEditorTriggers({
    nodeId,
    parentId: null,
    editorRef,
    tagIds,
    isActive: editing,
    enableFieldTrigger: false,
    enableTreeReference: false,
    onCycleCheckbox: handleCheckboxChange,
  });

  const handleBlur = useCallback(() => {
    if (!canEditNode) {
      setEditing(false);
      return;
    }
    // Extract content from ProseMirror editor
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) {
      const parsed = docToMarks(ed.state.doc);
      const nameChanged = parsed.text !== rawName;
      const marksChanged = JSON.stringify(parsed.marks) !== JSON.stringify(rawMarks);
      const refsChanged = JSON.stringify(parsed.inlineRefs) !== JSON.stringify(rawInlineRefs);
      if (nameChanged || marksChanged || refsChanged) {
        updateNodeContent(nodeId, {
          name: parsed.text,
          marks: parsed.marks,
          inlineRefs: parsed.inlineRefs,
        });
      }
    }
    triggers.resetAll();
    setEditing(false);
  }, [canEditNode, nodeId, rawName, rawMarks, rawInlineRefs, updateNodeContent, triggers]);

  const handleEnter = useCallback(() => {
    // Single-line header: Enter = blur
    editorRef.current?.dom?.blur();
  }, []);

  // Click-to-edit: record text offset on mousedown so RichTextEditor can
  // restore the caret at the correct position when it mounts.
  const handleTitleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!canEditNode || e.button !== 0) return;
    if (editing) return; // already editing — let ProseMirror handle clicks

    const container = e.currentTarget as HTMLElement;
    const textOffset = getTextOffsetFromPoint(container, e.clientX, e.clientY);
    const textLength = getNodeTextLengthById(nodeId);
    const textRightEdge = getRenderedTextRightEdge(container);
    const rect = container.getBoundingClientRect();

    // If click is past the text's right edge → place caret at end
    const pastTextEnd = textRightEdge !== null && e.clientX > textRightEdge + 1;
    const pastContainerMid = textLength > 0 && e.clientX >= rect.left + rect.width * 0.66;
    const resolvedOffset = pastTextEnd
      ? textLength
      : textOffset ?? (pastContainerMid ? textLength : 0);

    // parentId = nodeId because RichTextEditor receives parentId={nodeId}
    useUIStore.getState().setFocusClickCoords({ nodeId, parentId: nodeId, textOffset: resolvedOffset });
    e.preventDefault();
    setEditing(true);
  }, [canEditNode, editing, nodeId]);

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

  // Static display HTML for non-editing state
  const displayHtml = marksToHtml(displayName, rawMarks, rawInlineRefs);

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
            <span className="flex shrink-0 h-8 w-5 items-center justify-center">
              <input
                type="checkbox"
                checked={isDone}
                onChange={handleCheckboxChange}
                className="h-5 w-5 appearance-none rounded border border-border bg-transparent checked:border-primary checked:bg-primary checked:bg-[url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22white%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cpath%20d%3D%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_16px] bg-center bg-no-repeat cursor-pointer"
              />
            </span>
          )}

          {/* Col C: Editable name */}
          <div
            ref={(el) => {
              (titleWrapperRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              onTitleRef?.(el);
            }}
            className={`relative text-xl font-semibold leading-8 outline-none min-h-8 flex-1 ${canEditNode ? 'cursor-text' : 'cursor-default'} ${isDone ? 'text-foreground/40' : ''}`}
            onMouseDown={handleTitleMouseDown}
          >
            {editing ? (
              <>
                <RichTextEditor
                  nodeId={nodeId}
                  parentId={nodeId}
                  initialText={rawName}
                  initialMarks={rawMarks}
                  initialInlineRefs={rawInlineRefs}
                  readOnly={!canEditNode}
                  mountClassName="text-xl font-semibold leading-8"
                  onBlur={handleBlur}
                  onEnter={handleEnter}
                  onIndent={noop}
                  onOutdent={noop}
                  onDelete={noopDelete}
                  onArrowUp={noop}
                  onArrowDown={noop}
                  onMoveUp={noop}
                  onMoveDown={noop}
                  {...buildTriggerEditorProps(triggers)}
                  editorRef={editorRef}
                  onToggleDone={handleCheckboxChange}
                />
                <TriggerDropdowns
                  triggers={triggers}
                  nodeId={nodeId}
                  tagIds={tagIds}
                  visible={editing}
                />
              </>
            ) : displayHtml ? (
              <span
                className="node-content"
                dangerouslySetInnerHTML={{ __html: displayHtml }}
              />
            ) : (
              <span className="text-foreground-tertiary">{t('common.untitled')}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Description ── */}
      <div>
        <NodeDescription nodeId={nodeId} editable={canEditNode} />
      </div>
    </div>
  );
}
