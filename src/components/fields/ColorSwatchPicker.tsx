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
  tupleId: string;
}

export function ColorSwatchPicker({ tupleId }: ColorSwatchPickerProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const userId = useWorkspaceStore((s) => s.userId);

  // Read current color key from fieldEntry.children[0].
  // Color values are stored as raw strings ("emerald", "violet"), not node references.
  const selectedKey = useNodeStore((s) => {
    void s._version;
    const tuple = s.getNode(tupleId);
    return tuple?.children?.[0] || undefined;
  });

  const handleSelect = useCallback(
    (key: string) => {
      if (!userId) return;
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
    <div className="flex min-h-7 items-center gap-2 py-1.5" style={{ paddingLeft: 25 }}>
      <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} />
      <div className="flex flex-wrap gap-2">
        {SWATCH_OPTIONS.map((swatch) => {
          const isSelected = swatch.key === selectedKey;
          // Tana-style: selected swatch has a same-color ring with white gap
          return (
            <button
              key={swatch.key}
              onClick={() => handleSelect(swatch.key)}
              className="h-6 w-6 rounded-full transition-transform hover:scale-110 active:scale-90"
              style={{
                backgroundColor: swatch.color.text,
                boxShadow: isSelected
                  ? `0 0 0 2px var(--background, #fff), 0 0 0 4px ${swatch.color.text}`
                  : undefined,
              }}
              title={swatch.name}
            />
          );
        })}
      </div>
    </div>
  );
}
