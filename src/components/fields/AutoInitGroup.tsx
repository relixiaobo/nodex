/**
 * Auto-initialize toggle group for field definition config pages.
 *
 * Renders per-type toggles:
 * - Date: 3 toggles (current date / ancestor day node / ancestor field value)
 * - Options from supertag: 1 toggle (ancestor supertag ref)
 * - All others: 1 toggle (ancestor field value)
 *
 * All toggles read/write from the same `autoInitialize` property as
 * a comma-separated list of strategy names.
 */
import { useCallback } from 'react';
import { useNodeStore } from '../../stores/node-store';
import { AUTO_INIT_STRATEGY, FIELD_TYPES } from '../../types/index.js';
import type { AutoInitStrategy } from '../../types/index.js';
import { resolveDataType } from '../../lib/field-utils.js';
import { parseAutoInitStrategies, serializeAutoInitStrategies } from '../../lib/field-auto-init.js';
import { FieldValueRow } from './FieldValueRow.js';

interface AutoInitGroupProps {
  fieldDefId: string;
}

/** Toggle definitions per field type. */
const DATE_TOGGLES: Array<{ strategy: AutoInitStrategy; label: string }> = [
  { strategy: AUTO_INIT_STRATEGY.CURRENT_DATE, label: 'to current date' },
  { strategy: AUTO_INIT_STRATEGY.ANCESTOR_DAY_NODE, label: 'to date of ancestor day node' },
  { strategy: AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE, label: 'to value from ancestor with this field' },
];

const SUPERTAG_REF_TOGGLES: Array<{ strategy: AutoInitStrategy; label: string }> = [
  { strategy: AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF, label: 'to ancestor with this supertag' },
];

const DEFAULT_TOGGLES: Array<{ strategy: AutoInitStrategy; label: string }> = [
  { strategy: AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE, label: 'to value from ancestor with this field' },
];

export function AutoInitGroup({ fieldDefId }: AutoInitGroupProps) {
  const dataType = useNodeStore((s) => {
    void s._version;
    return resolveDataType(fieldDefId);
  });

  const rawAutoInit = useNodeStore((s) => {
    void s._version;
    return s.getNode(fieldDefId)?.autoInitialize ?? '';
  });

  const setConfigValue = useNodeStore((s) => s.setConfigValue);
  const enabled = parseAutoInitStrategies(rawAutoInit);
  const toggles = dataType === FIELD_TYPES.DATE
    ? DATE_TOGGLES
    : dataType === FIELD_TYPES.OPTIONS_FROM_SUPERTAG
      ? SUPERTAG_REF_TOGGLES
      : DEFAULT_TOGGLES;

  const handleToggle = useCallback((strategy: AutoInitStrategy) => {
    const current = new Set(enabled);
    if (current.has(strategy)) {
      current.delete(strategy);
    } else {
      current.add(strategy);
    }
    setConfigValue(fieldDefId, 'autoInitialize', serializeAutoInitStrategies([...current]));
  }, [enabled, fieldDefId, setConfigValue]);

  return (
    <div className="min-h-6">
      {toggles.map((t) => {
        const isOn = enabled.includes(t.strategy);
        return (
          <FieldValueRow key={t.strategy}>
            <div className="flex items-start gap-2">
              <button
                onClick={() => handleToggle(t.strategy)}
                className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isOn ? 'bg-primary' : 'bg-border hover:bg-foreground/20'
                }`}
                role="switch"
                aria-checked={isOn}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                    isOn ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
              <span className="text-[15px] leading-6 text-foreground select-none">{t.label}</span>
            </div>
          </FieldValueRow>
        );
      })}
    </div>
  );
}
