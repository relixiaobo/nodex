/**
 * field-utils — Loro model.
 * All resolver functions read directly from LoroDoc (no _entities arg).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { FIELD_TYPES, SYS_D, SYS_V } from '../../src/types/system-nodes.js';
import {
  getExtendsChain,
  getFieldTypeIcon,
  getFieldTypeLabel,
  isCheckboxFieldType,
  isDateFieldType,
  isEmailFieldType,
  isNumberLikeFieldType,
  isOptionsFieldType,
  isOptionsFromSupertagFieldType,
  isPlainFieldType,
  isSingleValueFieldType,
  isUrlFieldType,
  resolveDataType,
  resolveFieldOptions,
  resolveHideField,
  resolveMaxValue,
  resolveMinValue,
  resolveRequired,
  resolveSourceSupertag,
  resolveTaggedNodes,
} from '../../src/lib/field-utils.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('resolveDataType', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns fieldType stored in LoroDoc for attrDef_status (OPTIONS)', () => {
    expect(resolveDataType('attrDef_status')).toBe(FIELD_TYPES.OPTIONS);
  });

  it('returns fieldType for attrDef_due (DATE)', () => {
    expect(resolveDataType('attrDef_due')).toBe(FIELD_TYPES.DATE);
  });

  it('returns fieldType for attrDef_company (PLAIN)', () => {
    expect(resolveDataType('attrDef_company')).toBe(FIELD_TYPES.PLAIN);
  });

  it('returns FIELD_TYPES.PLAIN for missing node', () => {
    expect(resolveDataType('nonexistent_field')).toBe(FIELD_TYPES.PLAIN);
  });

  it('returns FIELD_TYPES.PLAIN when fieldType not set', () => {
    // Create a fieldDef without setting fieldType
    const id = 'test_fd_no_type';
    loroDoc.createNode(id, 'tagDef_task');
    loroDoc.setNodeData(id, 'type', 'fieldDef');
    // No fieldType set → should return PLAIN
    expect(resolveDataType(id)).toBe(FIELD_TYPES.PLAIN);
  });
});

describe('resolveSourceSupertag', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns undefined for fieldDef without sourceSupertag', () => {
    expect(resolveSourceSupertag('attrDef_status')).toBeUndefined();
  });

  it('returns configured sourceSupertag', () => {
    loroDoc.setNodeData('attrDef_status', 'sourceSupertag', 'tagDef_task');
    expect(resolveSourceSupertag('attrDef_status')).toBe('tagDef_task');
  });
});

describe('resolveHideField', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns SYS_V.NEVER by default', () => {
    expect(resolveHideField('attrDef_status')).toBe(SYS_V.NEVER);
  });
});

describe('resolveRequired', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns false by default (nullable not set)', () => {
    expect(resolveRequired('attrDef_status')).toBe(false);
  });

  it('returns true when nullable=false', () => {
    loroDoc.setNodeData('attrDef_status', 'nullable', false);
    expect(resolveRequired('attrDef_status')).toBe(true);
  });

  it('returns false when nullable=true', () => {
    loroDoc.setNodeData('attrDef_status', 'nullable', true);
    expect(resolveRequired('attrDef_status')).toBe(false);
  });
});

describe('resolveMinValue / resolveMaxValue', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns configured min/max for attrDef_age (0/150)', () => {
    expect(resolveMinValue('attrDef_age')).toBe(0);
    expect(resolveMaxValue('attrDef_age')).toBe(150);
  });

  it('returns undefined when not configured', () => {
    expect(resolveMinValue('attrDef_status')).toBeUndefined();
    expect(resolveMaxValue('attrDef_status')).toBeUndefined();
  });

  it('returns undefined when min/max are non-numeric strings', () => {
    loroDoc.setNodeData('attrDef_age', 'minValue', 'abc');
    loroDoc.setNodeData('attrDef_age', 'maxValue', 'xyz');
    expect(resolveMinValue('attrDef_age')).toBeUndefined();
    expect(resolveMaxValue('attrDef_age')).toBeUndefined();
  });
});

describe('resolveFieldOptions', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns option node IDs for attrDef_status', () => {
    // resolveFieldOptions returns string[] (IDs), not NodexNode[]
    const options = resolveFieldOptions('attrDef_status');
    expect(options.length).toBe(3);
    expect(options).toContain('opt_todo');
    expect(options).toContain('opt_in_progress');
    expect(options).toContain('opt_done');
  });

  it('returns options for attrDef_priority', () => {
    const options = resolveFieldOptions('attrDef_priority');
    expect(options.length).toBe(3);
  });

  it('returns empty for fieldDef with no options', () => {
    const options = resolveFieldOptions('attrDef_due');
    expect(options).toEqual([]);
  });
});

describe('getExtendsChain', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns empty array for tagDef with no extends (tagDef_task)', () => {
    expect(getExtendsChain('tagDef_task')).toEqual([]);
  });

  it('returns parent tagDef for single-level extends (tagDef_dev_task extends tagDef_task)', () => {
    expect(getExtendsChain('tagDef_dev_task')).toEqual(['tagDef_task']);
  });

  it('returns ancestors in ancestor-first order for multi-level extends', () => {
    // Create grandchild tagDef in LoroDoc directly
    const grandId = 'tagDef_grand_test';
    loroDoc.createNode(grandId, 'SCHEMA');
    loroDoc.setNodeDataBatch(grandId, { type: 'tagDef', name: 'Grand Task', extends: 'tagDef_dev_task' });

    const chain = getExtendsChain(grandId);
    // Should be: grandparent (task) first, then parent (dev_task)
    expect(chain).toEqual(['tagDef_task', 'tagDef_dev_task']);
  });

  it('handles circular references without infinite loop', () => {
    // tagDef_task extends tagDef_dev_task (circular)
    loroDoc.setNodeData('tagDef_task', 'extends', 'tagDef_dev_task');
    // Should not throw; result won't be infinite
    const chain = getExtendsChain('tagDef_dev_task');
    expect(Array.isArray(chain)).toBe(true);
  });
});

describe('resolveTaggedNodes', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns node IDs tagged with tagDef_task', () => {
    // resolveTaggedNodes returns string[] (IDs), not NodexNode[]
    // Only task_1 has tagDef_task applied in seed data
    const nodes = resolveTaggedNodes('tagDef_task');
    expect(nodes).toContain('task_1');
  });

  it('does not return untagged nodes', () => {
    const nodes = resolveTaggedNodes('tagDef_task');
    expect(nodes).not.toContain('idea_1');
    expect(nodes).not.toContain('note_2');
    // task_2 and task_3 are NOT tagged with tagDef_task in seed data
    expect(nodes).not.toContain('task_2');
    expect(nodes).not.toContain('task_3');
  });

  it('returns empty for unknown tagDefId', () => {
    const nodes = resolveTaggedNodes('nonexistent_tag');
    expect(nodes).toEqual([]);
  });
});

describe('getFieldTypeLabel / getFieldTypeIcon / isPlainFieldType', () => {
  it('getFieldTypeLabel returns label for known types', () => {
    expect(getFieldTypeLabel(FIELD_TYPES.PLAIN)).toBeTruthy();
    expect(getFieldTypeLabel(FIELD_TYPES.OPTIONS)).toBeTruthy();
    expect(getFieldTypeLabel(FIELD_TYPES.DATE)).toBeTruthy();
  });

  it('getFieldTypeIcon returns an icon component for known types', () => {
    expect(getFieldTypeIcon(FIELD_TYPES.PLAIN)).toBeTruthy();
    expect(getFieldTypeIcon(FIELD_TYPES.OPTIONS)).toBeTruthy();
  });

  it('isPlainFieldType returns true for plain fields', () => {
    expect(isPlainFieldType(FIELD_TYPES.PLAIN)).toBe(true);
  });

  it('isPlainFieldType returns false for non-plain fields', () => {
    expect(isPlainFieldType(FIELD_TYPES.OPTIONS)).toBe(false);
    expect(isPlainFieldType(FIELD_TYPES.DATE)).toBe(false);
  });

  it('isOptionsFieldType supports both FIELD_TYPES and SYS_D constants', () => {
    expect(isOptionsFieldType(FIELD_TYPES.OPTIONS)).toBe(true);
    expect(isOptionsFieldType(FIELD_TYPES.OPTIONS_FROM_SUPERTAG)).toBe(true);
    expect(isOptionsFieldType(SYS_D.OPTIONS)).toBe(true);
    expect(isOptionsFieldType(SYS_D.OPTIONS_FROM_SUPERTAG)).toBe(true);
    expect(isOptionsFieldType(FIELD_TYPES.PLAIN)).toBe(false);
  });

  it('type predicate helpers support both FIELD_TYPES and SYS_D constants', () => {
    expect(isOptionsFromSupertagFieldType(FIELD_TYPES.OPTIONS_FROM_SUPERTAG)).toBe(true);
    expect(isOptionsFromSupertagFieldType(SYS_D.OPTIONS_FROM_SUPERTAG)).toBe(true);
    expect(isCheckboxFieldType(FIELD_TYPES.CHECKBOX)).toBe(true);
    expect(isCheckboxFieldType(SYS_D.CHECKBOX)).toBe(true);
    expect(isDateFieldType(FIELD_TYPES.DATE)).toBe(true);
    expect(isDateFieldType(SYS_D.DATE)).toBe(true);
    expect(isNumberLikeFieldType(FIELD_TYPES.NUMBER)).toBe(true);
    expect(isNumberLikeFieldType(SYS_D.INTEGER)).toBe(true);
    expect(isUrlFieldType(FIELD_TYPES.URL)).toBe(true);
    expect(isUrlFieldType(SYS_D.URL)).toBe(true);
    expect(isEmailFieldType(FIELD_TYPES.EMAIL)).toBe(true);
    expect(isEmailFieldType(SYS_D.EMAIL)).toBe(true);
    expect(isSingleValueFieldType(FIELD_TYPES.NUMBER)).toBe(true);
    expect(isSingleValueFieldType(FIELD_TYPES.URL)).toBe(true);
    expect(isSingleValueFieldType(FIELD_TYPES.EMAIL)).toBe(true);
    expect(isSingleValueFieldType(FIELD_TYPES.PLAIN)).toBe(false);
  });
});
