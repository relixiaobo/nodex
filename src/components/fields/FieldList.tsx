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
import { toFieldRowEntryProps } from './field-row-props.js';

interface FieldListProps {
  nodeId: string;
  panelId?: string;
}

export function FieldList({ nodeId, panelId = 'node-main' }: FieldListProps) {
  const allFields = useNodeFields(nodeId);
  const isDefinitionNode = useNodeStore(
    (s) => {
      void s._version;
      const dt = s.getNode(nodeId)?.type;
      return dt === 'fieldDef' || dt === 'tagDef';
    },
  );

  // For definition nodes, only show config fields (dataType starts with __)
  const fields = useMemo(
    () => isDefinitionNode ? allFields.filter(f => f.isSystemConfig) : allFields,
    [allFields, isDefinitionNode],
  );

  if (fields.length === 0) return null;

  return (
    <div className="@container mt-0.5 ml-1">
      {fields.map((f) => (
        <div key={f.fieldEntryId}>
          <FieldRow
            nodeId={nodeId}
            {...toFieldRowEntryProps(f)}
            panelId={panelId}
            hideMode={f.hideMode}
          />
        </div>
      ))}
      <div className="border-b border-border-subtle" />
    </div>
  );
}
