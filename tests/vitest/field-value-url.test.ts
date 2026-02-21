/**
 * field-value-url — URL/Email field type detection and rendering logic.
 *
 * Covers:
 * - isUrlFieldType recognises both FIELD_TYPES.URL and SYS_D.URL
 * - isEmailFieldType recognises both FIELD_TYPES.EMAIL and SYS_D.EMAIL
 * - Seed data: Source URL fieldDef has fieldType = 'url'
 * - Seed data: Email fieldDef has fieldType = 'email'
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resetAndSeed } from './helpers/test-state.js';
import { isUrlFieldType, isEmailFieldType } from '../../src/lib/field-utils.js';
import { FIELD_TYPES, SYS_D } from '../../src/types/index.js';
import * as loroDoc from '../../src/lib/loro-doc.js';

describe('isUrlFieldType', () => {
  it('returns true for FIELD_TYPES.URL', () => {
    expect(isUrlFieldType(FIELD_TYPES.URL)).toBe(true);
  });

  it('returns true for SYS_D.URL', () => {
    expect(isUrlFieldType(SYS_D.URL)).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isUrlFieldType(FIELD_TYPES.PLAIN)).toBe(false);
    expect(isUrlFieldType(FIELD_TYPES.DATE)).toBe(false);
    expect(isUrlFieldType(undefined)).toBe(false);
  });
});

describe('isEmailFieldType', () => {
  it('returns true for FIELD_TYPES.EMAIL', () => {
    expect(isEmailFieldType(FIELD_TYPES.EMAIL)).toBe(true);
  });

  it('returns true for SYS_D.EMAIL', () => {
    expect(isEmailFieldType(SYS_D.EMAIL)).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isEmailFieldType(FIELD_TYPES.PLAIN)).toBe(false);
    expect(isEmailFieldType(FIELD_TYPES.URL)).toBe(false);
    expect(isEmailFieldType(undefined)).toBe(false);
  });
});

describe('Seed data URL/Email fieldDef types', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('Source URL fieldDef has fieldType = url', () => {
    const node = loroDoc.toNodexNode('attrDef_source_url');
    expect(node).toBeDefined();
    expect(node!.fieldType).toBe(FIELD_TYPES.URL);
  });

  it('Email fieldDef has fieldType = email', () => {
    const node = loroDoc.toNodexNode('attrDef_email');
    expect(node).toBeDefined();
    expect(node!.fieldType).toBe(FIELD_TYPES.EMAIL);
  });

  it('Website fieldDef has fieldType = url', () => {
    const node = loroDoc.toNodexNode('attrDef_website');
    expect(node).toBeDefined();
    expect(node!.fieldType).toBe(FIELD_TYPES.URL);
  });
});
