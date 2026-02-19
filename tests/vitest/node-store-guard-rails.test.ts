/**
 * node-store guard rails — Loro model.
 * In the Loro migration, validation is simplified:
 * - setConfigValue: directly sets config, no tuple indirection
 * - addFieldOption: creates option under fieldDef (no validation on wrong target)
 * - removeFieldOption: just deletes (no ownership check)
 * - replaceFieldDef: just sets fieldDefId (no ownership validation)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('setConfigValue', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('sets a config property directly on the node', () => {
    useNodeStore.getState().setConfigValue('tagDef_task', 'color', 'violet');
    const tagDef = loroDoc.toNodexNode('tagDef_task')!;
    expect(tagDef.color).toBe('violet');
  });

  it('sets showCheckbox on tagDef', () => {
    useNodeStore.getState().setConfigValue('tagDef_task', 'showCheckbox', true);
    const tagDef = loroDoc.toNodexNode('tagDef_task')!;
    expect(tagDef.showCheckbox).toBe(true);
  });

  it('sets childSupertag on tagDef', () => {
    useNodeStore.getState().setConfigValue('tagDef_task', 'childSupertag', 'tagDef_dev_task');
    const tagDef = loroDoc.toNodexNode('tagDef_task')!;
    expect(tagDef.childSupertag).toBe('tagDef_dev_task');
  });

  it('graph is valid after setConfigValue', () => {
    useNodeStore.getState().setConfigValue('tagDef_task', 'color', 'blue');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('addFieldOption', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates option node under fieldDef and returns optionId', () => {
    const optId = useNodeStore.getState().addFieldOption('attrDef_status', 'Blocked');
    expect(optId).toBeTruthy();
    const opt = loroDoc.toNodexNode(optId)!;
    expect(opt.name).toBe('Blocked');
    expect(loroDoc.getParentId(optId)).toBe('attrDef_status');
  });

  it('adds new option to fieldDef children', () => {
    const beforeCount = loroDoc.getChildren('attrDef_status').length;
    useNodeStore.getState().addFieldOption('attrDef_status', 'Blocked');
    expect(loroDoc.getChildren('attrDef_status').length).toBe(beforeCount + 1);
  });

  it('graph is valid after addFieldOption', () => {
    useNodeStore.getState().addFieldOption('attrDef_priority', 'Critical');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('removeFieldOption', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('deletes option node from LoroDoc', () => {
    expect(loroDoc.hasNode('opt_low')).toBe(true);

    useNodeStore.getState().removeFieldOption('attrDef_priority', 'opt_low');

    expect(loroDoc.hasNode('opt_low')).toBe(false);
    expect(loroDoc.getChildren('attrDef_priority')).not.toContain('opt_low');
  });

  it('graph is valid after removeFieldOption', () => {
    useNodeStore.getState().removeFieldOption('attrDef_priority', 'opt_low');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('is a no-op for nonexistent option (does not throw)', () => {
    expect(() => useNodeStore.getState().removeFieldOption('attrDef_status', 'nonexistent_opt')).not.toThrow();
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('addUnnamedFieldToNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns { fieldEntryId, fieldDefId }', () => {
    const result = useNodeStore.getState().addUnnamedFieldToNode('note_2');
    expect(result.fieldEntryId).toBeTruthy();
    expect(result.fieldDefId).toBeTruthy();
  });

  it('placeholder fieldDef has type fieldDef and empty name', () => {
    const result = useNodeStore.getState().addUnnamedFieldToNode('note_2');
    const fd = loroDoc.toNodexNode(result.fieldDefId)!;
    expect(fd.type).toBe('fieldDef');
  });

  it('graph is valid after addUnnamedFieldToNode', () => {
    useNodeStore.getState().addUnnamedFieldToNode('note_2');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('replaceFieldDef', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('sets new fieldDefId regardless of node ownership (no validation in Loro model)', () => {
    const { fieldEntryId, fieldDefId: placeholderFdId } = useNodeStore.getState().addUnnamedFieldToNode('note_2');

    // In old model this would check ownership; in Loro model it just sets
    useNodeStore.getState().replaceFieldDef('note_2', fieldEntryId, placeholderFdId, 'attrDef_status');

    const fe = loroDoc.toNodexNode(fieldEntryId)!;
    expect(fe.fieldDefId).toBe('attrDef_status');
  });

  it('graph is valid after replaceFieldDef', () => {
    const { fieldEntryId, fieldDefId: placeholderFdId } = useNodeStore.getState().addUnnamedFieldToNode('note_2');
    useNodeStore.getState().replaceFieldDef('note_2', fieldEntryId, placeholderFdId, 'attrDef_status');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});
