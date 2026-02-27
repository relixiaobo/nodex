/**
 * node-store field operations — Loro model.
 * setFieldValue(nodeId, fieldDefId, values[]) — sync, no userId
 * clearFieldValue(nodeId, fieldDefId) — deletes all value children
 * addFieldToNode(nodeId, fieldDefId) — idempotent
 * Field values stored as children of fieldEntry nodes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYS_V } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

/** Find a fieldEntry node ID for a given fieldDefId within a node's children. */
function findFieldEntry(nodeId: string, fieldDefId: string): string | undefined {
  return loroDoc.getChildren(nodeId).find(cid => {
    const n = loroDoc.toNodexNode(cid);
    return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
  });
}

/** Get value node names from a fieldEntry's children. */
function getFieldValues(fieldEntryId: string): string[] {
  return loroDoc.getChildren(fieldEntryId)
    .map(cid => loroDoc.toNodexNode(cid)?.name)
    .filter((n): n is string => n !== undefined);
}

describe('setFieldValue', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('updates existing fieldEntry value to new value', () => {
    // task_1 has a fieldEntry for attrDef_due (from applyTag in seed)
    const feId = findFieldEntry('task_1', 'attrDef_due');
    expect(feId).toBeTruthy();

    useNodeStore.getState().setFieldValue('task_1', 'attrDef_due', ['2026-02-13']);
    expect(getFieldValues(feId!)).toEqual(['2026-02-13']);
  });

  it('replaces old value with new value', () => {
    const feId = findFieldEntry('task_1', 'attrDef_due')!;
    useNodeStore.getState().setFieldValue('task_1', 'attrDef_due', ['2026-02-13']);
    useNodeStore.getState().setFieldValue('task_1', 'attrDef_due', ['2026-03-01']);
    expect(getFieldValues(feId)).toEqual(['2026-03-01']);
  });

  it('creates new fieldEntry when field not yet present', () => {
    expect(findFieldEntry('note_2', 'attrDef_status')).toBeUndefined();

    useNodeStore.getState().setFieldValue('note_2', 'attrDef_status', ['opt_todo']);

    const feId = findFieldEntry('note_2', 'attrDef_status');
    expect(feId).toBeTruthy();
    expect(getFieldValues(feId!)).toEqual(['opt_todo']);

    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('sets multiple values for list fields', () => {
    useNodeStore.getState().setFieldValue('note_2', 'attrDef_status', ['opt_todo', 'opt_done']);
    const feId = findFieldEntry('note_2', 'attrDef_status')!;
    expect(getFieldValues(feId)).toEqual(['opt_todo', 'opt_done']);
  });

  it('graph is valid after setFieldValue', () => {
    useNodeStore.getState().setFieldValue('note_2', 'attrDef_status', ['To Do']);
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('clearFieldValue', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('clears all value children of fieldEntry', () => {
    useNodeStore.getState().setFieldValue('task_1', 'attrDef_due', ['2026-02-13']);
    const feId = findFieldEntry('task_1', 'attrDef_due')!;
    expect(getFieldValues(feId)).toHaveLength(1);

    useNodeStore.getState().clearFieldValue('task_1', 'attrDef_due');
    expect(loroDoc.getChildren(feId)).toHaveLength(0);
  });

  it('is a no-op when field does not exist', () => {
    // idea_1 has no field entries
    expect(() => useNodeStore.getState().clearFieldValue('idea_1', 'attrDef_status')).not.toThrow();
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('addFieldToNode', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('adds a fieldEntry for a fieldDef not yet present', () => {
    expect(findFieldEntry('note_2', 'attrDef_status')).toBeUndefined();

    useNodeStore.getState().addFieldToNode('note_2', 'attrDef_status');
    expect(findFieldEntry('note_2', 'attrDef_status')).toBeTruthy();
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('is idempotent — double add does not create duplicate fieldEntry', () => {
    useNodeStore.getState().addFieldToNode('note_2', 'attrDef_status');
    useNodeStore.getState().addFieldToNode('note_2', 'attrDef_status');

    const entries = loroDoc.getChildren('note_2').filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(entries.length).toBe(1);
  });
});

describe('setOptionsFieldValue', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates fieldEntry with value node pointing to optionNodeId', () => {
    useNodeStore.getState().setOptionsFieldValue('note_2', 'attrDef_status', 'opt_done');

    const feId = findFieldEntry('note_2', 'attrDef_status')!;
    expect(feId).toBeTruthy();

    const valueIds = loroDoc.getChildren(feId);
    expect(valueIds).toHaveLength(1);
    const value = loroDoc.toNodexNode(valueIds[0])!;
    expect(value.name).toBeUndefined();
    expect(value.targetId).toBe('opt_done');
  });

  it('replaces existing option value', () => {
    useNodeStore.getState().setOptionsFieldValue('note_2', 'attrDef_status', 'opt_todo');
    useNodeStore.getState().setOptionsFieldValue('note_2', 'attrDef_status', 'opt_done');

    const feId = findFieldEntry('note_2', 'attrDef_status')!;
    const valueIds = loroDoc.getChildren(feId);
    expect(valueIds).toHaveLength(1);
    expect(loroDoc.toNodexNode(valueIds[0])?.targetId).toBe('opt_done');
  });
});

describe('selectFieldOption', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('sets selected option on fieldEntry', () => {
    useNodeStore.getState().addFieldToNode('note_2', 'attrDef_status');
    const feId = findFieldEntry('note_2', 'attrDef_status')!;

    useNodeStore.getState().selectFieldOption(feId, 'opt_done', undefined);

    const valueIds = loroDoc.getChildren(feId);
    expect(valueIds).toHaveLength(1);
    expect(loroDoc.toNodexNode(valueIds[0])?.targetId).toBe('opt_done');
  });

  it('replaces old option with new option', () => {
    useNodeStore.getState().addFieldToNode('note_2', 'attrDef_status');
    const feId = findFieldEntry('note_2', 'attrDef_status')!;
    useNodeStore.getState().selectFieldOption(feId, 'opt_todo', undefined);
    useNodeStore.getState().selectFieldOption(feId, 'opt_done', 'opt_todo');

    const valueIds = loroDoc.getChildren(feId);
    expect(valueIds).toHaveLength(1);
    expect(loroDoc.toNodexNode(valueIds[0])?.targetId).toBe('opt_done');
  });
});

describe('toggleCheckboxField', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('check (no children → creates SYS_V.YES value node)', () => {
    const feId = findFieldEntry('task_1', 'attrDef_done_chk')!;
    // Initially empty
    useNodeStore.getState().clearFieldValue('task_1', 'attrDef_done_chk');

    useNodeStore.getState().toggleCheckboxField(feId);

    const valueIds = loroDoc.getChildren(feId);
    expect(valueIds).toHaveLength(1);
    // Must store SYS_V.YES so FieldValueOutliner (which reads === SYS_V.YES) shows checked
    expect(loroDoc.toNodexNode(valueIds[0])?.name).toBe(SYS_V.YES);
  });

  it('uncheck (has children → clears all)', () => {
    const feId = findFieldEntry('task_1', 'attrDef_done_chk')!;
    useNodeStore.getState().setFieldValue('task_1', 'attrDef_done_chk', ['true']);

    useNodeStore.getState().toggleCheckboxField(feId);

    expect(loroDoc.getChildren(feId)).toHaveLength(0);
  });
});

describe('removeField', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('deletes fieldEntry from LoroDoc (not moved to trash)', () => {
    const feId = findFieldEntry('task_1', 'attrDef_due')!;
    expect(feId).toBeTruthy();

    useNodeStore.getState().removeField('task_1', feId);

    expect(loroDoc.hasNode(feId)).toBe(false);
    expect(loroDoc.getChildren('task_1')).not.toContain(feId);

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

  it('fieldEntryId is in node children', () => {
    const result = useNodeStore.getState().addUnnamedFieldToNode('note_2');
    expect(loroDoc.getChildren('note_2')).toContain(result.fieldEntryId);
  });

  it('fieldDefId is a placeholder fieldDef in SCHEMA', () => {
    const result = useNodeStore.getState().addUnnamedFieldToNode('note_2');
    const fd = loroDoc.toNodexNode(result.fieldDefId)!;
    expect(fd.type).toBe('fieldDef');
    expect(loroDoc.getParentId(result.fieldDefId)).toBe('SCHEMA');
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

  it('sets new fieldDefId on fieldEntry', () => {
    const { fieldEntryId, fieldDefId: placeholderFdId } = useNodeStore.getState().addUnnamedFieldToNode('note_2');

    useNodeStore.getState().replaceFieldDef('note_2', fieldEntryId, placeholderFdId, 'attrDef_status');

    const fe = loroDoc.toNodexNode(fieldEntryId)!;
    expect(fe.fieldDefId).toBe('attrDef_status');
  });

  it('dedup: removes placeholder when target fieldDef already exists on node', () => {
    useNodeStore.getState().addFieldToNode('note_2', 'attrDef_status');
    const existingFe = findFieldEntry('note_2', 'attrDef_status');
    expect(existingFe).toBeTruthy();

    const { fieldEntryId: placeholderFe, fieldDefId: placeholderFd } = useNodeStore.getState().addUnnamedFieldToNode('note_2');
    expect(loroDoc.getChildren('note_2')).toContain(placeholderFe);

    useNodeStore.getState().replaceFieldDef('note_2', placeholderFe, placeholderFd, 'attrDef_status');

    expect(loroDoc.hasNode(placeholderFe)).toBe(false);
    expect(findFieldEntry('note_2', 'attrDef_status')).toBe(existingFe);

    const entries = loroDoc.getChildren('note_2').filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(entries.length).toBe(1);
  });
});
