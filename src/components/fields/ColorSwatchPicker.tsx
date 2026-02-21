/**
 * Color swatch selector for tagDef SYS_A11 (Color) config field.
 *
 * Renders 10 preset color circles in a grid. Click to select, click again to clear.
 * Selected color stored as named key (e.g., "violet", "rose") in the node attribute.
 *
 * For virtual config entries (configNodeId provided): reads/writes from tagDef.color directly.
 */
import { useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { SWATCH_OPTIONS } from '../../lib/tag-colors.js';
import { BulletChevron } from '../outliner/BulletChevron';
import * as loroDoc from '../../lib/loro-doc.js';
import { FIELD_VALUE_INSET } from './field-layout.js';

interface ColorSwatchPickerProps {
  tupleId: string;
  /** For virtual config entries: parent tagDef/fieldDef node ID to resolve color from */
  configNodeId?: string;
}

export function ColorSwatchPicker({ tupleId, configNodeId }: ColorSwatchPickerProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const isVirtual = tupleId.startsWith('__virtual_');

  // Read current color key.
  // For virtual config entries: read from tagDef.color attribute directly.
  // For real fieldEntry: read from fieldEntry.children[0].
  const selectedKey = useNodeStore((s) => {
    void s._version;
    if (isVirtual && configNodeId) {
      return loroDoc.toNodexNode(configNodeId)?.color ?? undefined;
    }
    const tuple = s.getNode(tupleId);
    return tuple?.children?.[0] || undefined;
  });

  const handleSelect = useCallback(
    (key: string) => {
      if (isVirtual && configNodeId) {
        // Write directly to tagDef.color node attribute
        const newColor = key === selectedKey ? '' : key;
        setConfigValue(configNodeId, 'color', newColor || null);
      }
      // Non-virtual path is not currently used in new Loro model
    },
    [isVirtual, configNodeId, selectedKey, setConfigValue],
  );

  return (
    <div className="flex min-h-7 items-center gap-2 py-1.5" style={{ paddingLeft: FIELD_VALUE_INSET }}>
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
