import { beforeEach, describe, expect, it } from 'vitest';
import { computeNodeFields } from '../../src/hooks/use-node-fields.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resetAndSeed } from './helpers/test-state.js';
import { SYS_A } from '../../src/types/index.js';

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
    expect(byKey.get(SYS_A.AUTOCOLLECT_OPTIONS)?.configControl).toBe('autocollect');
    expect(byKey.get(SYS_A.HIDE_FIELD)?.configControl).toBe('select');
  });
});
