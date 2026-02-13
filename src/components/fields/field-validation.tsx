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

export function validateFieldValue(fieldDataType: string, value: string): string | null {
  if (!value) return null;
  switch (fieldDataType) {
    case SYS_D.NUMBER:
    case SYS_D.INTEGER:
      return isNaN(Number(value)) ? 'Value should be a number' : null;
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
