/**
 * Field list for a tagged node — renders field rows below node content.
 *
 * For definition nodes (attrDef/tagDef), only renders config-type fields
 * (dataType starts with __). Template field entries are shown in OutlinerView.
 */
import { useMemo } from 'react';
import { useNodeFields } from '../../hooks/use-node-fields';
import { useNodeStore } from '../../stores/node-store';
import { FieldRow } from './FieldRow';

interface FieldListProps {
  nodeId: string;
}

export function FieldList({ nodeId }: FieldListProps) {
  const allFields = useNodeFields(nodeId);
  const isDefinitionNode = useNodeStore(
    (s) => {
      const dt = s.entities[nodeId]?.props._docType;
      return dt === 'attrDef' || dt === 'tagDef';
    },
  );

  // For definition nodes, only show config fields (dataType starts with __)
  const fields = useMemo(
    () => isDefinitionNode ? allFields.filter(f => f.dataType.startsWith('__')) : allFields,
    [allFields, isDefinitionNode],
  );

  if (fields.length === 0) return null;

  return (
    <div className="mt-0.5 ml-1">
      {fields.map((f) => (
        <FieldRow
          key={f.tupleId}
          nodeId={nodeId}
          attrDefId={f.attrDefId}
          attrDefName={f.attrDefName}
          tupleId={f.tupleId}
          valueNodeId={f.valueNodeId}
          valueName={f.valueName}
          dataType={f.dataType}
          assocDataId={f.assocDataId}
        />
      ))}
      <div className="border-b border-border/40" />
    </div>
  );
}
