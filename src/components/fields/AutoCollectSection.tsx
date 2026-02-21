/**
 * Auto-collect values outliner for OPTIONS-type attrDef config page.
 *
 * Renders option nodes under the fieldDef as reference bullets.
 */
import { useMemo } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { BulletChevron } from '../outliner/BulletChevron';
import { FIELD_VALUE_INSET } from './field-layout.js';

interface AutoCollectSectionProps {
  fieldDefId: string;
}

const noop = () => {};

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
      <div
        className="flex min-h-7 items-start gap-2 py-0.5"
        style={{ paddingLeft: FIELD_VALUE_INSET }}
      >
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onBulletClick={noop}
          dimmed
        />
        <span className="text-sm leading-[21px] text-foreground-tertiary select-none">
          Empty
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-[22px]">
      {collectedValues.map((item) => (
        <div
          key={item.id}
          className="flex min-h-7 items-start gap-2 py-0.5"
          style={{ paddingLeft: FIELD_VALUE_INSET }}
        >
          <BulletChevron
            hasChildren={false}
            isExpanded={false}
            onBulletClick={noop}
            isReference
          />
          <span className="text-sm leading-[21px] text-foreground">
            {item.name}
          </span>
        </div>
      ))}
    </div>
  );
}
