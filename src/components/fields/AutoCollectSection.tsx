/**
 * Auto-collect values outliner for OPTIONS-type attrDef config page.
 *
 * Shows option nodes that were auto-collected from field usage,
 * identified by the `autoCollected` flag set by autoCollectOption().
 * Pre-determined options (manually added, no flag) are shown in ConfigOutliner.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { FieldValueRow } from './FieldValueRow.js';

interface AutoCollectSectionProps {
  fieldDefId: string;
}

export function AutoCollectSection({ fieldDefId }: AutoCollectSectionProps) {
  const collectedJson = useNodeStore((s) => {
    void s._version;
    const fieldDef = s.getNode(fieldDefId);
    if (!fieldDef?.children || fieldDef.children.length === 0) return '[]';

    // Only show children marked as auto-collected
    const items = fieldDef.children
      .map((id) => s.getNode(id))
      .filter((n) => n && !n.type && n.autoCollected)
      .map((n) => ({ id: n!.id, name: n!.name ?? '' }));

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
