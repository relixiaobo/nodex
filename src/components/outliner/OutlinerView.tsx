import { useMemo } from 'react';
import { useNode } from '../../hooks/use-node';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { OutlinerItem } from './OutlinerItem';
import { FieldRow } from '../fields/FieldRow';
import { TrailingInput } from '../editor/TrailingInput';

interface OutlinerViewProps {
  rootNodeId: string;
  /** When true, show tuple children whose key is an attrDef (tagDef template fields). */
  showTemplateTuples?: boolean;
}

export function OutlinerView({ rootNodeId, showTemplateTuples }: OutlinerViewProps) {
  const node = useNode(rootNodeId);
  useChildren(rootNodeId);

  const allChildIds = node?.children ?? [];
  const entities = useNodeStore((s) => s.entities);
  const fields = useNodeFields(rootNodeId);

  // Build field lookup by tuple ID (same pattern as OutlinerItem)
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) m.set(f.tupleId, f);
    return m;
  }, [fields]);

  // Classify each child: field tuple → 'field', regular node → 'content', else skip
  const visibleChildren = useMemo(() => {
    const result: { id: string; type: 'field' | 'content' }[] = [];
    for (const cid of allChildIds) {
      const fieldEntry = fieldMap.get(cid);
      if (fieldEntry) {
        // When showTemplateTuples: skip config fields (handled by FieldList above)
        if (showTemplateTuples && fieldEntry.dataType.startsWith('__')) continue;
        result.push({ id: cid, type: 'field' });
      } else {
        const dt = entities[cid]?.props._docType;
        if (!dt) result.push({ id: cid, type: 'content' });
      }
    }
    return result;
  }, [allChildIds, fieldMap, entities, showTemplateTuples]);

  // Content-only IDs for keyboard navigation (rootChildIds)
  const contentChildIds = useMemo(
    () => visibleChildren.filter((c) => c.type === 'content').map((c) => c.id),
    [visibleChildren],
  );

  return (
    <div className="flex flex-col" role="tree">
      {visibleChildren.map(({ id, type }, i) =>
        type === 'field' ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 22.5 }}>
            <FieldRow
              nodeId={rootNodeId}
              attrDefId={fieldMap.get(id)!.attrDefId}
              attrDefName={fieldMap.get(id)!.attrDefName}
              tupleId={id}
              valueNodeId={fieldMap.get(id)!.valueNodeId}
              valueName={fieldMap.get(id)!.valueName}
              dataType={fieldMap.get(id)!.dataType}
              assocDataId={fieldMap.get(id)!.assocDataId}
              isLastInGroup={i === visibleChildren.length - 1 || visibleChildren[i + 1].type !== 'field'}
              trashed={fieldMap.get(id)!.trashed}
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
        ),
      )}
      <TrailingInput parentId={rootNodeId} depth={0} autoFocus={visibleChildren.length === 0} parentExpandKey={`${node?.props._ownerId ?? ''}:${rootNodeId}`} />
    </div>
  );
}
