/**
 * Field value validation helpers.
 *
 * Used by FieldRow to show a warning icon when the first value node
 * contains text that doesn't match the expected field data type.
 * Validation is non-blocking — any value is accepted, only a visual hint is shown.
 */
import { CircleAlert } from 'lucide-react';
import { SYS_D } from '../../types/index.js';

/** Field data types that have value validation */
export const VALIDATED_FIELD_TYPES: Set<string> = new Set([
  SYS_D.NUMBER, SYS_D.INTEGER, SYS_D.URL, SYS_D.EMAIL,
]);

export function validateFieldValue(
  fieldDataType: string,
  value: string,
  options?: { min?: number; max?: number },
): string | null {
  if (!value) return null;
  switch (fieldDataType) {
    case SYS_D.NUMBER:
    case SYS_D.INTEGER: {
      const num = Number(value);
      if (isNaN(num)) return 'Value should be a number';
      if (options?.min != null && num < options.min) return `Value should be ≥ ${options.min}`;
      if (options?.max != null && num > options.max) return `Value should be ≤ ${options.max}`;
      return null;
    }
    case SYS_D.URL:
      return !value.includes('://') ? 'Value should be a URL' : null;
    case SYS_D.EMAIL:
      return !value.includes('@') ? 'Value should be an email address' : null;
    default:
      return null;
  }
}

export function ValidationWarning({ message }: { message: string }) {
  return (
    <span className="shrink-0 cursor-default" title={message}>
      <CircleAlert size={14} className="text-warning" />
    </span>
  );
}
