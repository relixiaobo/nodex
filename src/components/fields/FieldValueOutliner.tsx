/**
 * Mini outliner for field values (all types that store values as nodes).
 *
 * Uses AssociatedData node as the root. Its children are value nodes
 * rendered with full OutlinerItem capabilities (Enter, Tab, children, etc.).
 * Field tuples are rendered as FieldRow (same as OutlinerItem).
 * Shows a TrailingInput when empty or at the end.
 *
 * Used for Plain and Options field types. fieldDataType and attrDefId are
 * passed through for future type-specific rendering (e.g., option autocomplete).
 */
import { useMemo } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useChildren } from '../../hooks/use-children';
import { useNodeFields, type FieldEntry } from '../../hooks/use-node-fields';
import { OutlinerItem } from '../outliner/OutlinerItem';
import { TrailingInput } from '../editor/TrailingInput';
import { FieldRow } from './FieldRow';
import { SYS_D } from '../../types';

interface FieldValueOutlinerProps {
  assocDataId: string;
  /** Field data type (e.g., SYS_D.OPTIONS) — for future type-specific value rendering */
  fieldDataType?: string;
  /** AttrDef ID — for future option autocomplete */
  attrDefId?: string;
}

export function FieldValueOutliner({ assocDataId, fieldDataType, attrDefId }: FieldValueOutlinerProps) {
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

  const isOptionsType = fieldDataType === SYS_D.OPTIONS || fieldDataType === SYS_D.OPTIONS_FROM_SUPERTAG;

  // Prevent border stacking: when nested FieldRows are first/last, add padding
  // so their border-t/border-b doesn't visually coincide with the parent FieldRow's borders
  const firstIsField = visibleChildren.length > 0 && visibleChildren[0].type === 'field';
  const lastIsField = visibleChildren.length > 0 && visibleChildren[visibleChildren.length - 1].type === 'field';

  return (
    <div className={`min-h-[22px]${firstIsField ? ' pt-1' : ''}${lastIsField ? ' pb-1' : ''}`}>
      {visibleChildren.map(({ id, type }, i) =>
        type === 'field' ? (
          <div key={id} className="@container" style={{ paddingLeft: 6 + 15 }}>
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
            fieldDataType={fieldDataType}
          />
        ),
      )}
      {/* Options fields: hide TrailingInput once a value is selected (user clicks existing value to change) */}
      {!(isOptionsType && contentChildIds.length > 0) && (
        <TrailingInput parentId={assocDataId} depth={0} parentExpandKey={`${entities[assocDataId]?.props._ownerId ?? ''}:${assocDataId}`} fieldDataType={fieldDataType} attrDefId={attrDefId} />
      )}
    </div>
  );
}
