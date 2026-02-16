/**
 * Color swatch selector for tagDef SYS_A11 (Color) config field.
 *
 * Renders 10 preset color circles in a grid. Click to select, click again to clear.
 * Selected color stored as named key (e.g., "violet", "rose") in the tuple value.
 */
import { useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { SWATCH_OPTIONS } from '../../lib/tag-colors.js';
import { BulletChevron } from '../outliner/BulletChevron';

interface ColorSwatchPickerProps {
  assocDataId: string;
}

export function ColorSwatchPicker({ assocDataId }: ColorSwatchPickerProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId);

  // Reverse-lookup tupleId from assocDataId (same pattern as BOOLEAN/SupertagPicker)
  const tupleId = useNodeStore((s) => {
    const assoc = s.entities[assocDataId];
    const parentId = assoc?.props._ownerId;
    const parent = parentId ? s.entities[parentId] : undefined;
    if (!parent?.associationMap) return undefined;
    for (const [tid, aid] of Object.entries(parent.associationMap)) {
      if (aid === assocDataId) return tid;
    }
    return undefined;
  });

  // Read current color value from AssociatedData children[0] → node name
  const selectedKey = useNodeStore((s) => {
    const assoc = s.entities[assocDataId];
    const valueId = assoc?.children?.[0];
    if (!valueId) return undefined;
    const valueNode = s.entities[valueId];
    return valueNode?.props.name || undefined;
  });

  const handleSelect = useCallback(
    (key: string) => {
      if (!userId || !tupleId) return;
      // Toggle: click same color → clear
      if (key === selectedKey) {
        setConfigValue(tupleId, '', userId);
      } else {
        setConfigValue(tupleId, key, userId);
      }
    },
    [userId, tupleId, selectedKey, setConfigValue],
  );

  return (
    <div className="flex min-h-7 items-center gap-2 py-1" style={{ paddingLeft: 25 }}>
      <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} />
      <div className="flex flex-wrap gap-1.5">
        {SWATCH_OPTIONS.map((swatch) => (
          <button
            key={swatch.key}
            onClick={() => handleSelect(swatch.key)}
            className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 active:scale-90 ${
              swatch.key === selectedKey
                ? 'border-foreground/60 ring-1 ring-foreground/20'
                : 'border-transparent'
            }`}
            style={{ backgroundColor: swatch.color.text }}
            title={swatch.name}
          />
        ))}
      </div>
    </div>
  );
}
