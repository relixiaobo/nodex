/**
 * Auto-collect values config section for OPTIONS-type attrDef.
 *
 * Renders:
 * 1. Toggle switch (ON/OFF) — same as ConfigToggle
 * 2. Description text inline with toggle
 * 3. List of auto-collected value nodes as reference bullets
 *
 * Auto-collected values are stored as children[2+] of the autocollect Tuple:
 *   children = [SYS_A44, SYS_V03|SYS_V04, valId1, valId2, ...]
 */
import { useCallback, useMemo } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { SYS_V } from '../../types/index.js';
import { BulletChevron } from '../outliner/BulletChevron';

interface AutoCollectSectionProps {
  tupleId: string;
  currentValue?: string;
}

const noop = () => {};

export function AutoCollectSection({ tupleId, currentValue }: AutoCollectSectionProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId) ?? 'local';

  const isOn = currentValue === SYS_V.YES;

  const handleToggle = useCallback(() => {
    setConfigValue(tupleId, isOn ? SYS_V.NO : SYS_V.YES, userId);
  }, [tupleId, isOn, setConfigValue, userId]);

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

  return (
    <div>
      {/* Toggle row */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          onClick={handleToggle}
          className={`
            relative inline-flex h-[18px] w-8 shrink-0 cursor-pointer rounded-full
            transition-colors duration-200 ease-in-out
            ${isOn ? 'bg-green-500' : 'bg-muted-foreground/25'}
          `}
        >
          <span
            className={`
              pointer-events-none inline-block h-[14px] w-[14px] rounded-full bg-white shadow-sm
              transform transition-transform duration-200 ease-in-out mt-[2px]
              ${isOn ? 'translate-x-[16px]' : 'translate-x-[2px]'}
            `}
          />
        </button>
        <span className="text-xs text-muted-foreground/50">
          Include auto-collected values as options
        </span>
      </div>

      {/* Auto-collected values list */}
      {collectedValues.length > 0 && (
        <div className="mt-1">
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
      )}
    </div>
  );
}
