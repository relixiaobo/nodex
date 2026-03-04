/**
 * Auto-collect values outliner for OPTIONS-type attrDef config page.
 *
 * Renders option nodes under the fieldDef as reference bullets.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { FieldValueRow } from './FieldValueRow.js';

interface AutoCollectSectionProps {
  fieldDefId: string;
}

export function AutoCollectSection({ fieldDefId }: AutoCollectSectionProps) {
  // Read option nodes directly from fieldDef.children.
  const collectedJson = useNodeStore((s) => {
    void s._version;
    const fieldDef = s.getNode(fieldDefId);
    if (!fieldDef?.children || fieldDef.children.length === 0) return '[]';
    const ids = fieldDef.children;
    const items = ids
      .map((id) => {
        const node = s.getNode(id);
        if (!node || node.type) return null;
        return { id, name: node.name ?? '' };
      })
      .filter(Boolean);
    return JSON.stringify(items);
  });

  const collectedValues: { id: string; name: string }[] = useMemo(
    () => JSON.parse(collectedJson),
    [collectedJson],
  );

  if (collectedValues.length === 0) {
    return (
      <FieldValueRow dimmed>
        <span className="text-[15px] leading-6 text-foreground-tertiary select-none">
          Empty
        </span>
      </FieldValueRow>
    );
  }

  return (
    <div className="min-h-[22px]">
      {collectedValues.map((item) => (
        <FieldValueRow key={item.id} isReference>
          <span className="text-[15px] leading-6 text-foreground">
            {item.name}
          </span>
        </FieldValueRow>
      ))}
    </div>
  );
}
