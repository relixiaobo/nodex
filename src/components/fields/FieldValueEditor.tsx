/**
 * Polymorphic field value editor — switches UI by data type.
 * All types render with a BulletChevron for visual alignment with
 * OptionsPicker and FieldValueOutliner.
 *
 * Handles: Date, Number, Integer, URL, Email, Checkbox.
 * Options are handled by OptionsPicker; Plain by FieldValueOutliner.
 */
import { useState, useCallback, useRef } from 'react';
import { SYS_D, SYS_V } from '../../types/index.js';
import { BulletChevron } from '../outliner/BulletChevron';

const INPUT_CLASS =
  'flex-1 min-w-0 bg-transparent text-sm leading-[21px] text-foreground outline-none placeholder:text-muted-foreground/40';

interface FieldValueEditorProps {
  dataType: string;
  currentValue?: string;
  onChange: (value: string) => void;
}

const noop = () => {};

export function FieldValueEditor({ dataType, currentValue, onChange }: FieldValueEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentValue ?? '');
  const dateRef = useRef<HTMLInputElement>(null);

  const commitAndClose = useCallback(() => {
    setEditing(false);
    if (draft !== (currentValue ?? '')) {
      onChange(draft);
    }
  }, [draft, currentValue, onChange]);

  const hasValue = !!currentValue;

  // ── Checkbox ──
  if (dataType === SYS_D.CHECKBOX) {
    return (
      <div
        className="flex min-h-7 items-start gap-[7.5px] py-1"
        style={{ paddingLeft: 6 }}
      >
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onToggle={noop}
          onDrillDown={noop}
          onBulletClick={noop}
        />
        <input
          type="checkbox"
          checked={currentValue === SYS_V.YES}
          onChange={(e) => onChange(e.target.checked ? SYS_V.YES : SYS_V.NO)}
          className="mt-[3px] h-3.5 w-3.5 rounded border-border/50 accent-primary cursor-pointer"
        />
      </div>
    );
  }

  // ── Date ──
  if (dataType === SYS_D.DATE) {
    const handleDateClick = () => {
      // Trigger the hidden date input's picker
      dateRef.current?.showPicker?.();
      dateRef.current?.click();
    };
    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    };
    const formattedDate = currentValue ? formatDate(currentValue) : '';

    return (
      <div
        className="flex min-h-7 items-start gap-[7.5px] py-1 cursor-pointer"
        style={{ paddingLeft: 6 }}
        onClick={handleDateClick}
      >
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onToggle={noop}
          onDrillDown={noop}
          onBulletClick={noop}
          dimmed={!hasValue}
        />
        {hasValue ? (
          <span className="text-sm leading-[21px] text-foreground">
            {formattedDate}
          </span>
        ) : (
          <span className="text-sm leading-[21px] text-muted-foreground/40 select-none">
            Add date
          </span>
        )}
        {/* Hidden date input for native picker */}
        <input
          ref={dateRef}
          type="date"
          value={currentValue ?? ''}
          onChange={handleDateChange}
          className="sr-only"
          tabIndex={-1}
        />
      </div>
    );
  }

  // ── Number / Integer ──
  if (dataType === SYS_D.NUMBER || dataType === SYS_D.INTEGER) {
    if (editing) {
      return (
        <div
          className="flex min-h-7 items-start gap-[7.5px] py-1"
          style={{ paddingLeft: 6 }}
        >
          <BulletChevron
            hasChildren={false}
            isExpanded={false}
            onToggle={noop}
            onDrillDown={noop}
            onBulletClick={noop}
          />
          <input
            autoFocus
            type="number"
            value={draft}
            step={dataType === SYS_D.INTEGER ? '1' : 'any'}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitAndClose}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAndClose(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="0"
            className={INPUT_CLASS}
          />
        </div>
      );
    }
    return (
      <div
        className="flex min-h-7 items-start gap-[7.5px] py-1 cursor-text"
        style={{ paddingLeft: 6 }}
        onClick={() => { setDraft(currentValue ?? ''); setEditing(true); }}
      >
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onToggle={noop}
          onDrillDown={noop}
          onBulletClick={noop}
          dimmed={!hasValue}
        />
        {hasValue ? (
          <span className="text-sm leading-[21px] text-foreground">{currentValue}</span>
        ) : (
          <span className="text-sm leading-[21px] text-muted-foreground/40 select-none">Empty</span>
        )}
      </div>
    );
  }

  // ── URL ──
  if (dataType === SYS_D.URL) {
    if (editing) {
      return (
        <div
          className="flex min-h-7 items-start gap-[7.5px] py-1"
          style={{ paddingLeft: 6 }}
        >
          <BulletChevron
            hasChildren={false}
            isExpanded={false}
            onToggle={noop}
            onDrillDown={noop}
            onBulletClick={noop}
          />
          <input
            autoFocus
            type="url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitAndClose}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAndClose(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="https://..."
            className={INPUT_CLASS}
          />
        </div>
      );
    }
    return (
      <div
        className="flex min-h-7 items-start gap-[7.5px] py-1 cursor-text"
        style={{ paddingLeft: 6 }}
        onClick={() => { setDraft(currentValue ?? ''); setEditing(true); }}
      >
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onToggle={noop}
          onDrillDown={noop}
          onBulletClick={noop}
          dimmed={!hasValue}
        />
        {hasValue ? (
          <span className="text-sm leading-[21px] text-primary/70 underline decoration-primary/20">{currentValue}</span>
        ) : (
          <span className="text-sm leading-[21px] text-muted-foreground/40 select-none">Empty</span>
        )}
      </div>
    );
  }

  // ── Email ──
  if (dataType === SYS_D.EMAIL) {
    if (editing) {
      return (
        <div
          className="flex min-h-7 items-start gap-[7.5px] py-1"
          style={{ paddingLeft: 6 }}
        >
          <BulletChevron
            hasChildren={false}
            isExpanded={false}
            onToggle={noop}
            onDrillDown={noop}
            onBulletClick={noop}
          />
          <input
            autoFocus
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitAndClose}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAndClose(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="email@example.com"
            className={INPUT_CLASS}
          />
        </div>
      );
    }
    return (
      <div
        className="flex min-h-7 items-start gap-[7.5px] py-1 cursor-text"
        style={{ paddingLeft: 6 }}
        onClick={() => { setDraft(currentValue ?? ''); setEditing(true); }}
      >
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onToggle={noop}
          onDrillDown={noop}
          onBulletClick={noop}
          dimmed={!hasValue}
        />
        {hasValue ? (
          <span className="text-sm leading-[21px] text-foreground">{currentValue}</span>
        ) : (
          <span className="text-sm leading-[21px] text-muted-foreground/40 select-none">Empty</span>
        )}
      </div>
    );
  }

  // ── Default: Plain text (click-to-edit) ──
  if (editing) {
    return (
      <div
        className="flex min-h-7 items-start gap-[7.5px] py-1"
        style={{ paddingLeft: 6 }}
      >
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onToggle={noop}
          onDrillDown={noop}
          onBulletClick={noop}
        />
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitAndClose}
          onKeyDown={(e) => { if (e.key === 'Enter') commitAndClose(); if (e.key === 'Escape') setEditing(false); }}
          placeholder="Empty"
          className={INPUT_CLASS}
        />
      </div>
    );
  }

  return (
    <div
      className="flex min-h-7 items-start gap-[7.5px] py-1 cursor-text"
      style={{ paddingLeft: 6 }}
      onClick={() => { setDraft(currentValue ?? ''); setEditing(true); }}
    >
      <BulletChevron
        hasChildren={false}
        isExpanded={false}
        onToggle={noop}
        onDrillDown={noop}
        onBulletClick={noop}
        dimmed={!hasValue}
      />
      {hasValue ? (
        <span className="text-sm leading-[21px] text-foreground">{currentValue}</span>
      ) : (
        <span className="text-sm leading-[21px] text-muted-foreground/40 select-none">Empty</span>
      )}
    </div>
  );
}

/** Format ISO date string as human-readable (e.g. "Tue, Feb 24") */
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return isoDate;
  }
}
