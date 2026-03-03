/**
 * SettingsPanel — rendered when navigating to the SETTINGS container.
 *
 * Shows a list of feature toggles that persist to chrome.storage.local
 * (shared with content scripts via ui-store).
 */
import { useUIStore } from '../../stores/ui-store.js';
import { Settings } from '../../lib/icons.js';

export function SettingsPanel() {
  const highlightEnabled = useUIStore((s) => s.highlightEnabled);
  const setHighlightEnabled = useUIStore((s) => s.setHighlightEnabled);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto pt-12 px-4 pb-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.04] mix-blend-multiply text-foreground-tertiary">
            <Settings size={20} />
          </span>
          <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        </div>

        {/* Feature toggles */}
        <div className="space-y-1">
          <SettingsToggle
            label="Web Highlight & Comments"
            description="Show the highlight toolbar when selecting text on web pages"
            checked={highlightEnabled}
            onChange={setHighlightEnabled}
          />
        </div>
      </div>
    </div>
  );
}

interface SettingsToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function SettingsToggle({ label, description, checked, onChange }: SettingsToggleProps) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-lg px-3 py-3 hover:bg-foreground/[0.02] transition-colors cursor-pointer">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-foreground-tertiary mt-0.5">{description}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-primary' : 'bg-foreground/10'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </label>
  );
}
