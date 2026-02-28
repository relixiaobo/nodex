import { FIELD_TYPES, SYS_D } from '../../src/types/index.js';
import {
  VALIDATED_FIELD_TYPES,
  validateFieldValue,
  ValidationWarning,
} from '../../src/components/fields/field-validation.js';

describe('field-validation', () => {
  it('exposes validated field type set', () => {
    expect(VALIDATED_FIELD_TYPES.has(SYS_D.NUMBER)).toBe(true);
    expect(VALIDATED_FIELD_TYPES.has(SYS_D.INTEGER)).toBe(true); // legacy Tana import
    expect(VALIDATED_FIELD_TYPES.has(SYS_D.URL)).toBe(true);
    expect(VALIDATED_FIELD_TYPES.has(SYS_D.EMAIL)).toBe(true);
    expect(VALIDATED_FIELD_TYPES.has(FIELD_TYPES.NUMBER)).toBe(true);
    expect(VALIDATED_FIELD_TYPES.has(FIELD_TYPES.URL)).toBe(true);
    expect(VALIDATED_FIELD_TYPES.has(FIELD_TYPES.EMAIL)).toBe(true);
    expect(VALIDATED_FIELD_TYPES.has(SYS_D.PLAIN)).toBe(false);
  });

  it('validates number with min/max bounds', () => {
    expect(validateFieldValue(SYS_D.NUMBER, '')).toBeNull();
    expect(validateFieldValue(SYS_D.NUMBER, 'abc')).toBe('Value should be a number');
    expect(validateFieldValue(SYS_D.NUMBER, '12')).toBeNull();
    expect(validateFieldValue(SYS_D.INTEGER, '12.5')).toBeNull(); // legacy Tana import still works

    expect(validateFieldValue(SYS_D.NUMBER, '2', { min: 3 })).toBe('Value should be ≥ 3');
    expect(validateFieldValue(SYS_D.NUMBER, '9', { max: 8 })).toBe('Value should be ≤ 8');
    expect(validateFieldValue(SYS_D.NUMBER, '5', { min: 3, max: 8 })).toBeNull();
    expect(validateFieldValue(FIELD_TYPES.NUMBER, '5', { min: 3, max: 8 })).toBeNull();
  });

  it('validates URL and email formats', () => {
    expect(validateFieldValue(SYS_D.URL, 'example.com')).toBe('Value should be a URL');
    expect(validateFieldValue(SYS_D.URL, 'https://example.com')).toBeNull();
    expect(validateFieldValue(FIELD_TYPES.URL, 'https://example.com')).toBeNull();

    expect(validateFieldValue(SYS_D.EMAIL, 'hello.example.com')).toBe('Value should be an email address');
    expect(validateFieldValue(SYS_D.EMAIL, 'hello@example.com')).toBeNull();
    expect(validateFieldValue(FIELD_TYPES.EMAIL, 'hello@example.com')).toBeNull();
  });

  it('returns null for unsupported field types', () => {
    expect(validateFieldValue(SYS_D.PLAIN, 'anything')).toBeNull();
    expect(validateFieldValue('UNKNOWN_TYPE', 'anything')).toBeNull();
  });

  it('ValidationWarning span includes flex items-center for vertical centering', () => {
    const result = ValidationWarning({ message: 'test warning' });
    expect(result).toBeTruthy();
    expect(result.props.className).toContain('flex');
    expect(result.props.className).toContain('items-center');
    expect(result.props.title).toBe('test warning');
  });
});
