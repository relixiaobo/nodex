import { useEffect, useMemo, useRef } from 'react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import * as loroDoc from '../../lib/loro-doc.js';
import { isOutlinerContentNodeType } from '../../lib/node-type-utils.js';
import { OutlinerItem, buildFieldOwnerColors } from './OutlinerItem';
import { FieldRow } from '../fields/FieldRow';
import { toFieldRowEntryProps } from '../fields/field-row-props.js';
import { TrailingInput } from '../editor/TrailingInput';
import { SYS_V } from '../../types/index.js';
import { resolveTagColor } from '../../lib/tag-colors.js';
import { useDragSelect } from '../../hooks/use-drag-select.js';
import { getFlattenedVisibleNodes, getNodeTextLengthById } from '../../lib/tree-utils.js';

interface OutlinerViewProps {
  rootNodeId: string;
  /** When true, show tuple children whose key is an attrDef (tagDef template fields). */
  showTemplateTuples?: boolean;
}

export interface OutlinerVisibleChildRow {
  id: string;
  type: 'field' | 'content';
  hidden?: boolean;
}

export function getDragSelectableRootIds(
  rows: OutlinerVisibleChildRow[],
  isFieldRevealed: (fieldEntryId: string) => boolean,
): string[] {
  return rows
    .filter((row) => !row.hidden || isFieldRevealed(row.id))
    .map((row) => row.id);
}

export function OutlinerView({ rootNodeId, showTemplateTuples }: OutlinerViewProps) {
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

  const fields = useNodeFields(rootNodeId);

  // Hidden field reveal state from UIStore (session-only, keyed by "panelNodeId:fieldEntryId")
  const expandedHiddenFields = useUIStore((s) => s.expandedHiddenFields);
  const toggleHiddenField = useUIStore((s) => s.toggleHiddenField);

  // Build field lookup by tuple ID (same pattern as OutlinerItem)
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) m.set(f.fieldEntryId, f);
    return m;
  }, [fields]);

  const fieldOwnerColors = useMemo(() => (
    buildFieldOwnerColors(
      fieldMap,
      (fieldDefId) => loroDoc.getParentId(fieldDefId),
      (ownerId) => useNodeStore.getState().getNode(ownerId)?.type,
      (ownerId) => resolveTagColor(ownerId).text,
    )
  ), [fieldMap]);

  // Classify each child: field tuple → 'field', regular node → 'content', else skip
  // Also evaluate hide-field rules for field entries
  const visibleChildren = useMemo(() => {
    const result: { id: string; type: 'field' | 'content'; hidden?: boolean }[] = [];
    for (const cid of allChildIds) {
      const fieldEntry = fieldMap.get(cid);
      if (fieldEntry) {
        // When showTemplateTuples: skip config fields (handled by FieldList above)
        if (showTemplateTuples && fieldEntry.dataType.startsWith('__')) continue;
        // Evaluate hide-field condition
        let hidden = false;
        switch (fieldEntry.hideMode) {
          case SYS_V.ALWAYS:
            hidden = true;
            break;
          case SYS_V.WHEN_EMPTY:
            hidden = !!fieldEntry.isEmpty;
            break;
          case SYS_V.WHEN_NOT_EMPTY:
            hidden = !fieldEntry.isEmpty;
            break;
          // WHEN_VALUE_IS_DEFAULT: needs "default" concept — skip for now
          // NEVER: default, not hidden
        }
        result.push({ id: cid, type: 'field', hidden });
      } else {
        const nodeType = useNodeStore.getState().getNode(cid)?.type;
        if (isOutlinerContentNodeType(nodeType)) result.push({ id: cid, type: 'content' });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChildIds, fieldMap, _version, showTemplateTuples]);

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

  return (
    <div
      ref={containerRef}
      className="flex flex-col pr-4"
      role="tree"
      data-row-scope-parent-id={rootNodeId}
    >
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
      {visibleChildren.map(({ id, type, hidden }, i) => {
        // Hidden fields: skip unless manually revealed via UIStore toggle
        if (hidden && !isFieldRevealed(id)) return null;
        return type === 'field' ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={rootNodeId}
              {...toFieldRowEntryProps(fieldMap.get(id)!)}
              rootChildIds={dragSelectableRootIds}
              rootNodeId={rootNodeId}
              isLastInGroup={i === visibleChildren.length - 1 || visibleChildren[i + 1].type !== 'field'}
              ownerTagColor={fieldOwnerColors.get(id)}
              onNavigateOut={(direction) => {
                if (direction === 'up') {
                  for (let j = i - 1; j >= 0; j--) {
                    const prev = visibleChildren[j];
                    if (prev.hidden) continue;
                    if (prev.type === 'field') {
                      clearFocus();
                      setEditingFieldName(prev.id);
                      return;
                    }
                    useUIStore.getState().setFocusClickCoords({
                      nodeId: prev.id,
                      parentId: rootNodeId,
                      textOffset: (useNodeStore.getState().getNode(prev.id)?.name ?? '').length,
                    });
                    setFocusedNode(prev.id, rootNodeId);
                    return;
                  }
                  return;
                }

                for (let j = i + 1; j < visibleChildren.length; j++) {
                  const next = visibleChildren[j];
                  if (next.hidden) continue;
                  if (next.type === 'field') {
                    clearFocus();
                    setEditingFieldName(next.id);
                    return;
                  }
                  useUIStore.getState().setFocusClickCoords({
                    nodeId: next.id,
                    parentId: rootNodeId,
                    textOffset: 0,
                  });
                  setFocusedNode(next.id, rootNodeId);
                  return;
                }
              }}
            />
          </div>
        ) : (
          <OutlinerItem
            key={id}
            nodeId={id}
            depth={0}
            rootChildIds={dragSelectableRootIds}
            parentId={rootNodeId}
            rootNodeId={rootNodeId}
            bulletColors={templateContentColors.get(id)}
          />
        );
      })}
      <TrailingInput
        parentId={rootNodeId}
        depth={0}
        autoFocus={visibleChildren.length === 0}
        parentExpandKey={`${loroDoc.getParentId(rootNodeId) ?? ''}:${rootNodeId}`}
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
    </div>
  );
}
