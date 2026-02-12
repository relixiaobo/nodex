/**
 * Polymorphic field value editor — switches UI by data type.
 * Tana-style: click-to-edit text for most types, minimal chrome.
 *
 * All types render with a bullet (BulletChevron) for alignment with
 * sibling field values and regular outliner nodes.
 * Checkbox: the checkbox replaces the bullet position.
 *
 * Handles: Date, Number, Integer, URL, Email, Checkbox.
 * Options are handled by OptionsPicker; Plain by FieldValueOutliner.
 */
import { useState, useCallback } from 'react';
import { SYS_D, SYS_V } from '../../types/index.js';
import { BulletChevron } from '../outliner/BulletChevron';

const INPUT_CLASS =
  'flex-1 min-w-0 bg-transparent text-sm leading-[21px] text-foreground outline-none placeholder:text-muted-foreground/40';

const noop = () => {};

interface FieldValueEditorProps {
  dataType: string;
  currentValue?: string;
  onChange: (value: string) => void;
}

export function FieldValueEditor({ dataType, currentValue, onChange }: FieldValueEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentValue ?? '');

  const commitAndClose = useCallback(() => {
    setEditing(false);
    if (draft !== (currentValue ?? '')) {
      onChange(draft);
    }
  }, [draft, currentValue, onChange]);

  const hasValue = !!currentValue;

  // Checkbox type — checkbox replaces the bullet position
  if (dataType === SYS_D.CHECKBOX) {
    return (
      <div
        className="flex min-h-7 items-start gap-[7.5px] py-1"
        style={{ paddingLeft: 6 }}
      >
        {/* Checkbox in the bullet position (same 15px width) */}
        <span className="flex h-[15px] w-[15px] items-center justify-center mt-[3px]">
          <input
            type="checkbox"
            checked={currentValue === SYS_V.YES}
            onChange={(e) => onChange(e.target.checked ? SYS_V.YES : SYS_V.NO)}
            className="h-3.5 w-3.5 rounded border-border/50 accent-primary cursor-pointer"
          />
        </span>
      </div>
    );
  }

  // Date type — click-to-reveal date input
  if (dataType === SYS_D.DATE) {
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
            type="date"
            value={currentValue ?? ''}
            onChange={(e) => { onChange(e.target.value); setEditing(false); }}
            onBlur={() => setEditing(false)}
            className={INPUT_CLASS}
          />
        </div>
      );
    }
    return (
      <div
        className="flex min-h-7 items-start gap-[7.5px] py-1 cursor-pointer"
        style={{ paddingLeft: 6 }}
        onClick={() => setEditing(true)}
      >
        <BulletChevron
          hasChildren={false}
          isExpanded={false}
          onToggle={noop}
          onDrillDown={noop}
          onBulletClick={noop}
          dimmed={!hasValue}
        />
        <span className={`text-sm leading-[21px] ${hasValue ? 'text-foreground' : 'text-muted-foreground/40 select-none'}`}>
          {currentValue || 'Add date'}
        </span>
      </div>
    );
  }

  // Number / Integer types
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
            className={`${INPUT_CLASS} w-20`}
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
        <span className={`text-sm leading-[21px] ${hasValue ? 'text-foreground' : 'text-muted-foreground/40 select-none'}`}>
          {currentValue || 'Empty'}
        </span>
      </div>
    );
  }

  // URL type
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
            className={`${INPUT_CLASS} flex-1`}
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
        <span className={`text-sm leading-[21px] ${hasValue ? 'text-primary/70 underline decoration-primary/20 hover:decoration-primary/50' : 'text-muted-foreground/40 select-none'}`}>
          {currentValue || 'Empty'}
        </span>
      </div>
    );
  }

  // Email type
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
            className={`${INPUT_CLASS} flex-1`}
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
        <span className={`text-sm leading-[21px] ${hasValue ? 'text-foreground' : 'text-muted-foreground/40 select-none'}`}>
          {currentValue || 'Empty'}
        </span>
      </div>
    );
  }

  // Default: Plain text (click-to-edit)
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
          className={`${INPUT_CLASS} flex-1`}
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
      <span className={`text-sm leading-[21px] ${hasValue ? 'text-foreground' : 'text-muted-foreground/40 select-none'}`}>
        {currentValue || 'Empty'}
      </span>
    </div>
  );
}
