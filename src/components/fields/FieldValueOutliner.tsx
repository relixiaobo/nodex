/**
 * Mini outliner for plain-type field values.
 *
 * Uses AssociatedData node as the root. Its children are value nodes
 * rendered with full OutlinerItem capabilities (Enter, Tab, children, etc.).
 * Field tuples are rendered as FieldRow (same as OutlinerItem).
 * Shows a TrailingInput when empty or at the end.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';

interface FieldValueOutlinerProps {
  assocDataId: string;
  /** Hide the TrailingInput at the bottom (used by Options fields which provide their own picker) */
  hideTrailing?: boolean;
}

export function FieldValueOutliner({ assocDataId, hideTrailing }: FieldValueOutlinerProps) {
  useChildren(assocDataId);
  const childIds = useNodeStore((s) => s.entities[assocDataId]?.children ?? []);
  const entities = useNodeStore((s) => s.entities);

  // Detect fields on the AssociatedData (created via > trigger inside field values)
  const fields = useNodeFields(assocDataId);
  const fieldMap = useMemo(() => {
    const m = new Map<string, FieldEntry>();
    for (const f of fields) m.set(f.tupleId, f);
    return m;
  }, [fields]);

  // Separate children into fields and content (same logic as OutlinerItem)
  const visibleChildren = useMemo(() => {
    const result: { id: string; type: 'field' | 'content' }[] = [];
    for (const cid of childIds) {
      if (fieldMap.has(cid)) {
        result.push({ id: cid, type: 'field' });
      } else {
        const dt = entities[cid]?.props._docType;
        if (!dt) result.push({ id: cid, type: 'content' });
        // else skip: metanode, associatedData, SYS tuple, tag tuple
      }
    }
    return result;
  }, [childIds, fieldMap, entities]);

  const contentChildIds = useMemo(
    () => visibleChildren.filter((c) => c.type === 'content').map((c) => c.id),
    [visibleChildren],
  );

  return (
    <div className="min-h-[22px]">
      {visibleChildren.map(({ id, type }, i) =>
        type === 'field' ? (
          <div key={id} style={{ paddingLeft: 15 }}>
            <FieldRow
              nodeId={assocDataId}
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
            parentId={assocDataId}
            rootNodeId={assocDataId}
          />
        ),
      )}
      {!hideTrailing && (
        <TrailingInput parentId={assocDataId} depth={0} parentExpandKey={`${entities[assocDataId]?.props._ownerId ?? ''}:${assocDataId}`} />
      )}
    </div>
  );
}
