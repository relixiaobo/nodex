/**
 * Field list for a tagged node — renders field rows below node content.
 */
import { useNodeFields } from '../../hooks/use-node-fields';
import { FieldRow } from './FieldRow';

interface FieldListProps {
  nodeId: string;
}

export function FieldList({ nodeId }: FieldListProps) {
  const fields = useNodeFields(nodeId);

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
