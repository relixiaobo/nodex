/**
 * Shared layout for single-value field rows: paddingLeft + BulletChevron + content.
 *
 * All field value types (URL, Email, Date, Boolean, Checkbox, NodePicker, etc.)
 * should use this component to guarantee consistent sizing:
 * - text-[15px] / leading-6 (24px) — design system standard
 * - min-h-6 (24px) row height
 * - FIELD_VALUE_INSET (25px) left padding
 * - gap-2 (8px) between bullet and content
 */
import type { ReactNode } from 'react';
import { BulletChevron } from '../outliner/BulletChevron';
import { FIELD_VALUE_INSET } from './field-layout.js';
import type { AppIcon } from '../../lib/icons.js';

interface FieldValueRowProps {
  children: ReactNode;
  /** Dim the bullet when value is empty */
  dimmed?: boolean;
  /** Show dashed-circle reference bullet */
  isReference?: boolean;
  /** Tag-colored bullet */
  tagDefColor?: string;
  /** Override left inset (default: FIELD_VALUE_INSET = 25px) */
  insetLeft?: number;
  /** Custom bullet icon (e.g. field type icon) */
  icon?: AppIcon | null;
}

const noop = () => {};

export function FieldValueRow({
  children,
  dimmed,
  isReference,
  tagDefColor,
  insetLeft = FIELD_VALUE_INSET,
  icon,
}: FieldValueRowProps) {
  return (
    <div
      className="flex min-h-6 items-start gap-2 py-1"
      style={{ paddingLeft: insetLeft }}
    >
      <BulletChevron
        hasChildren={false}
        isExpanded={false}
        onBulletClick={noop}
        dimmed={dimmed}
        isReference={isReference}
        tagDefColor={tagDefColor}
        icon={icon}
      />
      {children}
    </div>
  );
}
