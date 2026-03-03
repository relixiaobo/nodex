/**
 * Settings section rendered inside the SETTINGS container panel.
 *
 * Mirrors the FieldRow system-config layout (Path 2) so that settings
 * rows look identical to supertag / field configure pages.
 *
 * Values are read/written via ui-store (persisted to chrome.storage).
 */
import { useCallback } from 'react';
import { ToggleLeft } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store.js';
import { BulletChevron } from '../outliner/BulletChevron.js';
import { FIELD_VALUE_INSET } from '../fields/field-layout.js';

// ── Reusable toggle (matches FieldValueOutliner boolean switch exactly) ──

function SettingsToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  const label = checked ? 'Yes' : 'No';
  return (
    <div className="flex min-h-6 items-start gap-2 py-1" style={{ paddingLeft: FIELD_VALUE_INSET }}>
      <BulletChevron hasChildren={false} isExpanded={false} onBulletClick={() => {}} />
      <button
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${checked ? 'bg-primary' : 'bg-border hover:bg-foreground/20'}`}
        role="switch"
        aria-checked={checked}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </button>
      <span className="text-[15px] leading-6 text-foreground select-none">{label}</span>
    </div>
  );
}

// ── Settings section (FieldRow system-config layout) ──

export function SettingsSection() {
  const highlightEnabled = useUIStore((s) => s.highlightEnabled);
  const setHighlightEnabled = useUIStore((s) => s.setHighlightEnabled);

  const toggleHighlight = useCallback(() => {
    setHighlightEnabled(!highlightEnabled);
  }, [highlightEnabled, setHighlightEnabled]);

  return (
    <div className="@container mb-2 ml-4 ml-1 px-2">
      {/* Row: Highlight & Comment — matches FieldRow isSystemConfig path */}
      <div className="border-t border-border-subtle flex flex-col @sm:flex-row @sm:items-start min-h-6 py-1">
        {/* Name column — icon + name + description */}
        <div className="flex gap-1 @sm:shrink-0 @sm:w-[180px] min-w-0 min-h-6 py-1">
          <span className="shrink-0 w-[15px] flex items-start justify-center text-foreground-tertiary mt-1.5">
            <ToggleLeft size={12} />
          </span>
          <div className="flex-1 min-w-0">
            <span className="block text-[15px] font-medium leading-6 text-foreground">
              Highlight & Comment
            </span>
            <span className="block text-xs leading-tight text-foreground-tertiary mt-0.5">
              Show floating toolbar when selecting text on web pages
            </span>
          </div>
        </div>
        {/* Value column — toggle */}
        <div className="flex flex-1 min-w-0 items-start py-1" data-field-value>
          <div className="flex-1 min-w-0 min-h-[22px]">
            <SettingsToggle checked={highlightEnabled} onChange={toggleHighlight} />
          </div>
        </div>
      </div>
      <div className="border-b border-border-subtle" />
    </div>
  );
}
