/**
 * Settings toggle list rendered inside the SETTINGS container panel.
 *
 * Each setting row is a label + description + toggle switch.
 * Values are read/written via ui-store (persisted to chrome.storage).
 */
import { useUIStore } from '../../stores/ui-store.js';

// ── Toggle switch ──

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
        transition-colors duration-200
        ${checked ? 'bg-primary' : 'bg-foreground/15'}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm
          transition-transform duration-200
          ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}
        `}
      />
    </button>
  );
}

// ── Setting row ──

interface SettingRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SettingRow({ label, description, checked, onChange }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-[15px] leading-6 text-foreground">{label}</div>
        <div className="text-xs leading-4 text-foreground-tertiary">{description}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

// ── Settings section ──

export function SettingsSection() {
  const highlightEnabled = useUIStore((s) => s.highlightEnabled);
  const setHighlightEnabled = useUIStore((s) => s.setHighlightEnabled);

  return (
    <div className="ml-4 px-2 pb-2">
      <div className="text-xs font-medium text-foreground-tertiary uppercase tracking-wider pb-1">
        Web Clipper
      </div>
      <SettingRow
        label="Highlight & Comment"
        description="Show floating toolbar when selecting text on web pages"
        checked={highlightEnabled}
        onChange={setHighlightEnabled}
      />
    </div>
  );
}
