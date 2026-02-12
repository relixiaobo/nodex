/**
 * Auto-collect values outliner for OPTIONS-type attrDef config page.
 *
 * Renders auto-collected value nodes as reference bullets.
 * Values are stored as children[2+] of the autocollect Tuple:
 *   children = [SYS_A44, SYS_V03|SYS_V04, valId1, valId2, ...]
 */
import { useMemo } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { BulletChevron } from '../outliner/BulletChevron';

interface AutoCollectSectionProps {
  tupleId: string;
}

const noop = () => {};

export function AutoCollectSection({ tupleId }: AutoCollectSectionProps) {
  // Read auto-collected value IDs from tuple children[2+]
  const collectedJson = useNodeStore((s) => {
    const tuple = s.entities[tupleId];
    if (!tuple?.children || tuple.children.length <= 2) return '[]';
    const ids = tuple.children.slice(2);
    const items = ids
      .map((id) => {
        const node = s.entities[id];
        return node ? { id, name: node.props.name ?? '' } : null;
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
      <span className="text-xs text-muted-foreground/40 leading-[22px] select-none italic">
        Empty
      </span>
    );
  }

  return (
    <div className="min-h-[22px]">
      {collectedValues.map((item) => (
        <div
          key={item.id}
          className="flex min-h-7 items-start gap-[7.5px] py-0.5"
          style={{ paddingLeft: 6 }}
        >
          <BulletChevron
            hasChildren={false}
            isExpanded={false}
            onToggle={noop}
            onDrillDown={noop}
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
