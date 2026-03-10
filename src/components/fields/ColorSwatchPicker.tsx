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
import { SWATCH_OPTIONS, normalizeColorKey, resolveTagColor } from '../../lib/tag-colors.js';
import { BulletChevron } from '../outliner/BulletChevron';
import * as loroDoc from '../../lib/loro-doc.js';
import { FIELD_VALUE_INSET } from './field-layout.js';

interface ColorSwatchPickerProps {
  fieldEntryId: string;
  /** For virtual config entries: parent tagDef/fieldDef node ID to resolve color from */
  configNodeId?: string;
}

export function ColorSwatchPicker({ fieldEntryId, configNodeId }: ColorSwatchPickerProps) {
  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const isVirtual = fieldEntryId.startsWith('__virtual_');

  // Whether this tagDef has an explicitly stored color (vs hash-assigned).
  const hasExplicitColor = useNodeStore((s) => {
    void s._version;
    if (isVirtual && configNodeId) {
      return !!loroDoc.toNodexNode(configNodeId)?.color;
    }
    const fieldEntry = s.getNode(fieldEntryId);
    return !!(fieldEntry?.children?.[0]);
  });

  // Resolved color key: explicit → normalized, or hash fallback → matched swatch key.
  // Must return a primitive (string | undefined) to avoid Zustand infinite re-render.
  const selectedKey = useNodeStore((s) => {
    void s._version;
    let raw: string | undefined;
    if (isVirtual && configNodeId) {
      raw = loroDoc.toNodexNode(configNodeId)?.color ?? undefined;
    } else {
      const fieldEntry = s.getNode(fieldEntryId);
      raw = fieldEntry?.children?.[0] || undefined;
    }
    if (raw) return normalizeColorKey(raw);
    // No explicit color → match the hash-assigned color to a swatch
    if (configNodeId) {
      const effective = resolveTagColor(configNodeId);
      const match = SWATCH_OPTIONS.find((sw) => sw.color.text === effective.text);
      return match?.key;
    }
    return undefined;
  });

  const handleSelect = useCallback(
    (key: string) => {
      if (isVirtual && configNodeId) {
        // Toggle off only if clicking an already explicitly-stored color.
        // Clicking the hash-assigned swatch writes it explicitly.
        const newColor = (key === selectedKey && hasExplicitColor) ? '' : key;
        setConfigValue(configNodeId, 'color', newColor || null);
      }
    },
    [isVirtual, configNodeId, selectedKey, hasExplicitColor, setConfigValue],
  );

  return (
    <div className="flex min-h-6 items-center gap-1.5 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
      <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} />
      <div className="flex flex-wrap gap-1.5">
        {SWATCH_OPTIONS.map((swatch) => {
          const isSelected = swatch.key === selectedKey;
          return (
            <button
              key={swatch.key}
              onClick={() => handleSelect(swatch.key)}
              className="h-4 w-4 rounded-full transition-transform hover:scale-110 active:scale-90"
              style={{
                backgroundColor: swatch.color.text,
                boxShadow: isSelected
                  ? `0 0 0 1.5px var(--background, #fff), 0 0 0 3px ${swatch.color.text}`
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
