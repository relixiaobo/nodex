import { useMemo, useRef, useState } from 'react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import * as loroDoc from '../../lib/loro-doc.js';
import { OutlinerItem } from './OutlinerItem';
import { FieldRow } from '../fields/FieldRow';
import { TrailingInput } from '../editor/TrailingInput';
import { SYS_V } from '../../types/index.js';
import { useDragSelect } from '../../hooks/use-drag-select.js';

interface OutlinerViewProps {
  rootNodeId: string;
  /** When true, show tuple children whose key is an attrDef (tagDef template fields). */
  showTemplateTuples?: boolean;
}

export function OutlinerView({ rootNodeId, showTemplateTuples }: OutlinerViewProps) {
  const node = useNode(rootNodeId);
  useChildren(rootNodeId);

  const allChildIds = node?.children ?? [];
  const _version = useNodeStore((s) => s._version);
  const setFocusedNode = useUIStore((s) => s.setFocusedNode);
  const clearFocus = useUIStore((s) => s.clearFocus);
  const setEditingFieldName = useUIStore((s) => s.setEditingFieldName);
  const fields = useNodeFields(rootNodeId);

  // Build field lookup by tuple ID (same pattern as OutlinerItem)
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) m.set(f.tupleId, f);
    return m;
  }, [fields]);

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
        if (!nodeType) result.push({ id: cid, type: 'content' });
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChildIds, fieldMap, _version, showTemplateTuples]);

  // Content-only IDs for keyboard navigation (rootChildIds)
  const contentChildIds = useMemo(
    () => visibleChildren.filter((c) => c.type === 'content').map((c) => c.id),
    [visibleChildren],
  );

  // All hidden fields (including ALWAYS): shown as compact pills, click to temporarily reveal
  const hiddenRevealableFields = useMemo(
    () => visibleChildren
      .filter((c) => c.hidden)
      .map((c) => ({ id: c.id, name: fieldMap.get(c.id)!.attrDefName })),
    [visibleChildren, fieldMap],
  );
  const [revealedFieldIds, setRevealedFieldIds] = useState<Set<string>>(() => new Set());

  // Drag select: document-level mouse tracking for multi-node selection
  const containerRef = useRef<HTMLDivElement>(null);
  useDragSelect({ containerRef, rootChildIds: contentChildIds, rootNodeId });

  return (
    <div
      ref={containerRef}
      className="flex flex-col pr-4"
      role="tree"
      data-row-scope-parent-id={rootNodeId}
    >
      {/* Hidden field pills: compact clickable chips to temporarily reveal hidden fields */}
      {hiddenRevealableFields.length > 0 && hiddenRevealableFields.some(f => !revealedFieldIds.has(f.id)) && (
        <div className="flex flex-wrap gap-x-3 min-h-7 items-center" style={{ paddingLeft: 6 + 15 + 4 }}>
          {hiddenRevealableFields.filter(f => !revealedFieldIds.has(f.id)).map(f => (
            <button
              key={f.id}
              className="flex items-center gap-0.5 h-7 text-xs text-foreground-tertiary hover:text-foreground-secondary transition-colors cursor-pointer"
              onClick={() => setRevealedFieldIds(prev => new Set(prev).add(f.id))}
              title={`Show ${f.name}`}
            >
              <span className="w-[15px] flex items-center justify-center text-[11px] leading-none shrink-0">+</span>
              <span>{f.name}</span>
            </button>
          ))}
        </div>
      )}
      {visibleChildren.map(({ id, type, hidden }, i) => {
        // Hidden fields: skip unless manually revealed via pill click
        if (hidden && !revealedFieldIds.has(id)) return null;
        return type === 'field' ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 15 + 4 }}>
            <FieldRow
              nodeId={rootNodeId}
              attrDefId={fieldMap.get(id)!.attrDefId}
              attrDefName={fieldMap.get(id)!.attrDefName}
              tupleId={id}
              valueNodeId={fieldMap.get(id)!.valueNodeId}
              valueName={fieldMap.get(id)!.valueName}
              dataType={fieldMap.get(id)!.dataType}
              isLastInGroup={i === visibleChildren.length - 1 || visibleChildren[i + 1].type !== 'field'}
              trashed={fieldMap.get(id)!.trashed}
              isRequired={fieldMap.get(id)!.isRequired}
              isEmpty={fieldMap.get(id)!.isEmpty}
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
            rootChildIds={contentChildIds}
            parentId={rootNodeId}
            rootNodeId={rootNodeId}
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
          for (let j = visibleChildren.length - 1; j >= 0; j--) {
            const last = visibleChildren[j];
            if (last.hidden && !revealedFieldIds.has(last.id)) continue;
            if (last.type === 'field') {
              clearFocus();
              setEditingFieldName(last.id);
              return;
            }
            useUIStore.getState().setFocusClickCoords({
              nodeId: last.id,
              parentId: rootNodeId,
              textOffset: (useNodeStore.getState().getNode(last.id)?.name ?? '').length,
            });
            setFocusedNode(last.id, rootNodeId);
            return;
          }
        }}
      />
    </div>
  );
}
