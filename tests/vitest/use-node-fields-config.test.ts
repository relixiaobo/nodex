import { beforeEach, describe, expect, it } from 'vitest';
import { computeNodeFields } from '../../src/hooks/use-node-fields.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import { FIELD_TYPES, SYS_A } from '../../src/types/index.js';

describe('computeNodeFields config controls', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('exposes configControl for virtual tagDef config entries', () => {
    const store = useNodeStore.getState();
    store.setConfigValue('tagDef_task', 'showCheckbox', true);
    store.setConfigValue('tagDef_task', 'doneStateEnabled', true);

    const fields = computeNodeFields(store.getNode, store.getChildren, 'tagDef_task');
    const byKey = new Map(fields.map((f) => [f.fieldDefId, f]));

    expect(byKey.get(SYS_A.EXTENDS)?.configControl).toBe('tag_picker');
    expect(byKey.get(SYS_A.CHILD_SUPERTAG)?.configControl).toBe('tag_picker');
    expect(byKey.get(SYS_A.DONE_MAP_CHECKED)?.configControl).toBe('done_map_entries');
    expect(byKey.get(SYS_A.DONE_MAP_UNCHECKED)?.configControl).toBe('done_map_entries');
  });

  it('exposes configControl for virtual fieldDef config entries', () => {
    const store = useNodeStore.getState();
    const fields = computeNodeFields(store.getNode, store.getChildren, 'attrDef_status');
    const byKey = new Map(fields.map((f) => [f.fieldDefId, f]));

    expect(byKey.get(SYS_A.TYPE_CHOICE)?.configControl).toBe('type_choice');
    expect(byKey.get(SYS_A.AUTOCOLLECT_OPTIONS)?.configControl).toBe('toggle');
    expect(byKey.get(SYS_A.HIDE_FIELD)?.configControl).toBe('select');
  });

  it('resolves options valueName from target option node name', () => {
    const store = useNodeStore.getState();
    store.setOptionsFieldValue('task_1', 'attrDef_status', 'opt_in_progress');

    const fields = computeNodeFields(store.getNode, store.getChildren, 'task_1');
    const status = fields.find((f) => f.fieldDefId === 'attrDef_status');

    expect(status?.valueName).toBe('In Progress');
  });

  it('exposes number_input virtual config fields as NUMBER data type', () => {
    const store = useNodeStore.getState();
    const fields = computeNodeFields(store.getNode, store.getChildren, 'attrDef_age');
    const byKey = new Map(fields.map((f) => [f.fieldDefId, f]));

    expect(byKey.get(SYS_A.MIN_VALUE)?.configControl).toBe('number_input');
    expect(byKey.get(SYS_A.MIN_VALUE)?.dataType).toBe(FIELD_TYPES.NUMBER);
    expect(byKey.get(SYS_A.MAX_VALUE)?.configControl).toBe('number_input');
    expect(byKey.get(SYS_A.MAX_VALUE)?.dataType).toBe(FIELD_TYPES.NUMBER);
  });
});

describe('computeNodeFields dedup', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('deduplicates fieldEntry nodes with the same fieldDefId, keeping the first', () => {
    const store = useNodeStore.getState();

    store.addFieldToNode('task_1', 'attrDef_status');
    const dupe = store.createChild('task_1', undefined, { type: 'fieldEntry', fieldDefId: 'attrDef_status' } as never);

    const fields = computeNodeFields(store.getNode, store.getChildren, 'task_1');
    const statusEntries = fields.filter(f => f.fieldDefId === 'attrDef_status');
    expect(statusEntries.length).toBe(1);
    expect(statusEntries[0].fieldEntryId).not.toBe(dupe.id);
  });
});
