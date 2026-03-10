import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useNodeTags } from '../../hooks/use-node-tags';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import * as loroDoc from '../../lib/loro-doc.js';
import { isOutlinerContentNodeType } from '../../lib/node-type-utils.js';
import { OutlinerItem } from './OutlinerItem';
import { RowHost } from './RowHost.js';
import { FieldRow } from '../fields/FieldRow';
import { toFieldRowEntryProps } from '../fields/field-row-props.js';
import { TrailingInput } from '../editor/TrailingInput';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { useDragSelect } from '../../hooks/use-drag-select.js';
import { getFlattenedVisibleNodes, getNodeTextLengthById } from '../../lib/tree-utils.js';
import {
  buildFieldOwnerColors,
  buildVisibleChildrenRows,
  getDragSelectableRowIds,
  type OutlinerRowItem,
} from './row-model.js';
import { navigateToSiblingRow } from '../../lib/outliner-navigation.js';
import { ViewToolbar } from './ViewToolbar.js';
import { readViewConfig, applyViewPipeline } from '../../lib/view-pipeline.js';
import { canCreateChildrenUnder } from '../../lib/node-capabilities.js';

interface OutlinerViewProps {
  rootNodeId: string;
  /** When true, show template fieldEntry children for tagDef nodes. */
  showTemplateFields?: boolean;
}

export type OutlinerVisibleChildRow = OutlinerRowItem;

export function getDragSelectableRootIds(
  rows: OutlinerVisibleChildRow[],
  isFieldRevealed: (fieldEntryId: string) => boolean,
): string[] {
  return getDragSelectableRowIds(rows, isFieldRevealed);
}

export function OutlinerView({ rootNodeId, showTemplateFields }: OutlinerViewProps) {
  const node = useNode(rootNodeId);
  useChildren(rootNodeId);

  const allChildIds = node?.children ?? [];
  const _version = useNodeStore((s) => s._version);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const clearFocus = useUIStore((s) => s.clearFocus);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);

  // Sync template fieldEntries/content for tagged nodes — handles the case
  // where fieldDefs were added to tagDef Default content AFTER the tag was applied.
  const syncTemplateFields = useNodeStore((s) => s.syncTemplateFields);
  useEffect(() => {
    if (node?.tags && node.tags.length > 0) {
      syncTemplateFields(rootNodeId);
    }
  }, [node?.tags, rootNodeId, syncTemplateFields]);

  // Auto-refresh search results when a search node panel is opened
  const isSearchNode = node?.type === 'search';
  const refreshSearchResults = useNodeStore((s) => s.refreshSearchResults);
  useEffect(() => {
    if (isSearchNode) {
      refreshSearchResults(rootNodeId);
    }
  }, [isSearchNode, rootNodeId, refreshSearchResults]);

  const fields = useNodeFields(rootNodeId);
  const tagIds = useNodeTags(rootNodeId);
  const canCreateRootChildren = useNodeStore((s) => {
    void s._version;
    return canCreateChildrenUnder(rootNodeId);
  });

  // Hidden field reveal state from UIStore (session-only, keyed by "panelNodeId:fieldEntryId")
  const expandedHiddenFields = useUIStore((s) => s.expandedHiddenFields);
  const toggleHiddenField = useUIStore((s) => s.toggleHiddenField);

  // Build field lookup by fieldEntry ID (same pattern as OutlinerItem)
  // When showTemplateFields: exclude config fields (handled by FieldList above)
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) {
      if (showTemplateFields && f.dataType.startsWith('__')) continue;
      m.set(f.fieldEntryId, f);
    }
    return m;
  }, [fields, showTemplateFields]);

  const fieldOwnerColors = useMemo(() => (
    buildFieldOwnerColors(
      fieldMap,
      (fieldDefId) => loroDoc.getParentId(fieldDefId),
      (ownerId) => useNodeStore.getState().getNode(ownerId)?.type,
      (ownerId) => resolveTagColor(ownerId).text,
    )
  ), [fieldMap]);

  // Read view config from viewDef child (sort, filter, group)
  const viewConfig = useMemo(() => {
    const store = useNodeStore.getState();
    return readViewConfig(rootNodeId, store.getViewDefId, store.getNode, store.getFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootNodeId, _version]);

  // Classify children → apply filter → group → sort pipeline
  const visibleChildren = useMemo(() => {
    const rows = buildVisibleChildrenRows({
      allChildIds,
      fieldMap,
      tagIds,
      getFieldDefOwnerId: (fieldDefId) => loroDoc.getParentId(fieldDefId),
      getNodeType: (id) => useNodeStore.getState().getNode(id)?.type,
      getChildNodeType: (id) => useNodeStore.getState().getNode(id)?.type,
      isOutlinerContentType: isOutlinerContentNodeType,
    });
    return applyViewPipeline(rows, viewConfig, useNodeStore.getState().getNode, _version);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChildIds, fieldMap, tagIds, viewConfig, _version]);

  // Template content clone colors: content children with templateId get the owning tagDef's color.
  const templateContentColors = useMemo(() => {
    const map = new Map<string, string[]>();
    const getNode = useNodeStore.getState().getNode;
    for (const { id, type } of visibleChildren) {
      if (type !== 'content') continue;
      const child = getNode(id);
      if (!child?.templateId) continue;
      const ownerTagDefId = loroDoc.getParentId(child.templateId);
      if (!ownerTagDefId) continue;
      if (getNode(ownerTagDefId)?.type !== 'tagDef') continue;
      const color = resolveTagColor(ownerTagDefId).text;
      if (color) map.set(id, [color]);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleChildren, _version]);

  /** Check if a hidden field has been temporarily revealed via UIStore */
  const isFieldRevealed = (fieldEntryId: string) =>
    expandedHiddenFields.has(`${rootNodeId}:${fieldEntryId}`);

  const dragSelectableRootIds = useMemo(
    () => getDragSelectableRootIds(visibleChildren, isFieldRevealed),
    [visibleChildren, expandedHiddenFields, rootNodeId],
  );

  // All hidden fields (including ALWAYS): shown as compact pills, click to temporarily reveal
  const hiddenRevealableFields = useMemo(
    () => visibleChildren
      .filter((c) => c.hidden)
      .map((c) => ({ id: c.id, name: fieldMap.get(c.id)!.attrDefName })),
    [visibleChildren, fieldMap],
  );

  // Drag select: document-level mouse tracking for multi-node selection
  const containerRef = useRef<HTMLDivElement>(null);
  useDragSelect({ containerRef, rootChildIds: dragSelectableRootIds, rootNodeId });

  const navToField = useCallback((fieldId: string) => {
    clearFocus();
    setEditingFieldName(fieldId);
  }, [clearFocus, setEditingFieldName]);

  const navToContent = useCallback((id: string, parentId: string, textOffset: number) => {
    const offset = textOffset === Infinity
      ? (useNodeStore.getState().getNode(id)?.name ?? '').length
      : textOffset;
    useUIStore.getState().setFocusClickCoords({ nodeId: id, parentId, textOffset: offset });
    setFocusedNode(id, parentId);
  }, [setFocusedNode]);

  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-1.5 pr-4"
      role="tree"
      data-row-scope-parent-id={rootNodeId}
    >
      <ViewToolbar nodeId={rootNodeId} depth={0} />
      {/* Hidden field placeholder rows: ⊕ FieldName, aligned to col B */}
      {hiddenRevealableFields.length > 0 && hiddenRevealableFields.some(f => !isFieldRevealed(f.id)) && (
        <div className="flex flex-wrap gap-x-3 min-h-6 items-center" style={{ paddingLeft: 6 + 15 + 4 }}>
          {hiddenRevealableFields.filter(f => !isFieldRevealed(f.id)).map(f => (
            <button
              key={f.id}
              className="flex items-center gap-0.5 h-7 text-xs text-foreground-tertiary hover:text-foreground-secondary transition-colors cursor-pointer"
              onClick={() => toggleHiddenField(rootNodeId, f.id)}
              title={`Show ${f.name}`}
            >
              <span className="w-[15px] flex items-center justify-center text-[11px] leading-none shrink-0">+</span>
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      )}
      <RowHost
        rows={visibleChildren}
        isRowVisible={(row) => !row.hidden || isFieldRevealed(row.id)}
        renderField={(row, i, rows) => (
          <div className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={rootNodeId}
              {...toFieldRowEntryProps(fieldMap.get(row.id)!)}
              rootChildIds={dragSelectableRootIds}
              rootNodeId={rootNodeId}
              isLastInGroup={i === rows.length - 1 || rows[i + 1].type !== 'field'}
              ownerTagColor={fieldOwnerColors.get(row.id)}
              onNavigateOut={(direction) => navigateToSiblingRow({
                rows,
                currentIndex: i,
                direction,
                parentId: rootNodeId,
                onField: navToField,
                onContent: navToContent,
              })}
            />
          </div>
        )}
        renderContent={(row) => (
          <OutlinerItem
            nodeId={row.id}
            depth={0}
            rootChildIds={dragSelectableRootIds}
            parentId={rootNodeId}
            rootNodeId={rootNodeId}
            bulletColors={templateContentColors.get(row.id)}
          />
        )}
        renderGroupHeader={(row) => (
          <div
            className="flex items-center h-7 text-sm font-semibold text-foreground mt-2 first:mt-0"
            style={{ paddingLeft: 6 + 15 + 4 }}
          >
            {row.label}
          </div>
        )}
      />
      {/* Empty state for search nodes */}
      {isSearchNode && visibleChildren.length === 0 && (
        <div className="px-4 py-3 text-sm text-foreground-tertiary" style={{ paddingLeft: 6 + 15 + 4 }}>
          No matching nodes found.
        </div>
      )}
      {canCreateRootChildren && (
        <TrailingInput
          parentId={rootNodeId}
          depth={0}
          autoFocus={!isSearchNode && visibleChildren.length === 0}
          parentExpandKey={`${loroDoc.getParentId(rootNodeId) ?? ''}:${rootNodeId}`}
          isSearchContext={isSearchNode}
          onNavigateOut={(direction) => {
            if (direction !== 'up') return;
            const fl = getFlattenedVisibleNodes(
              dragSelectableRootIds,
              useUIStore.getState().expandedNodes,
              rootNodeId,
            );
            if (fl.length > 0) {
              const lastNode = fl[fl.length - 1];
              useUIStore.getState().setFocusClickCoords({
                nodeId: lastNode.nodeId,
                parentId: lastNode.parentId,
                textOffset: getNodeTextLengthById(lastNode.nodeId),
              });
              setFocusedNode(lastNode.nodeId, lastNode.parentId);
              return;
            }
          }}
        />
      )}
    </div>
  );
}
