/**
 * Done mapping entries — rendered as a normal outliner field value.
 *
 * This keeps UX identical to regular field values:
 * user can type `>` to insert field rows and set mapped option values.
 */
import { useEffect, useRef } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { FieldValueOutliner } from './FieldValueOutliner';

interface DoneMappingEntriesProps {
  /** Owner tagDef ID */
  tagDefId: string;
  /** NDX_A07 (checked) or NDX_A08 (unchecked) attrDef key */
  mappingKey: string;
}

export function DoneMappingEntries({ tagDefId, mappingKey }: DoneMappingEntriesProps) {
  const addFieldToNode = useNodeStore((s) => s.addFieldToNode);
  const fieldEntryId = useNodeStore((s) => {
    void s._version;
    const tagDef = s.getNode(tagDefId);
    if (!tagDef?.children?.length) return null;
    for (const cid of tagDef.children) {
      const child = s.getNode(cid);
      if (child?.type === 'fieldEntry' && child.fieldDefId === mappingKey) {
        return child.id;
      }
    }
    return null;
  });
  const hasAttemptedCreate = useRef(false);

  useEffect(() => {
    if (fieldEntryId || hasAttemptedCreate.current) return;
    hasAttemptedCreate.current = true;
    addFieldToNode(tagDefId, mappingKey);
  }, [fieldEntryId, addFieldToNode, tagDefId, mappingKey]);

  if (!fieldEntryId) return null;

  return (
    <FieldValueOutliner fieldEntryId={fieldEntryId} attrDefId={mappingKey} />
  );
}
