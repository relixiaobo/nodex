import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node-store guard rails', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('setConfigValue ignores non-tuple ids', () => {
    const beforeChildren = [...(useNodeStore.getState().entities.attrDef_due.children ?? [])];

    useNodeStore.getState().setConfigValue('attrDef_due', 'SHOULD_NOT_WRITE', 'user_default');
    useNodeStore.getState().setConfigValue('missing_tuple', 'SHOULD_NOT_WRITE', 'user_default');

    expect(useNodeStore.getState().entities.attrDef_due.children ?? []).toEqual(beforeChildren);
    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('addFieldOption validates target attrDef and returns empty id on invalid target', () => {
    const beforeEntityCount = Object.keys(useNodeStore.getState().entities).length;

    const invalidId = useNodeStore.getState().addFieldOption(
      'note_2',
      'Invalid target option',
      'ws_default',
      'user_default',
    );
    expect(invalidId).toBe('');
    expect(Object.keys(useNodeStore.getState().entities).length).toBe(beforeEntityCount);

    const optionId = useNodeStore.getState().addFieldOption(
      'attrDef_status',
      'Blocked',
      'ws_default',
      'user_default',
    );
    expect(optionId).toBeTruthy();
    expect(useNodeStore.getState().entities[optionId]).toBeTruthy();
    expect(useNodeStore.getState().entities.attrDef_status.children ?? []).toContain(optionId);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('removeFieldOption only removes options attached to the target attrDef', () => {
    expect(useNodeStore.getState().entities.opt_low).toBeTruthy();
    expect(useNodeStore.getState().entities.attrDef_priority.children ?? []).toContain('opt_low');

    // Wrong attrDef: should not delete unrelated option.
    useNodeStore.getState().removeFieldOption('attrDef_status', 'opt_low', 'user_default');
    expect(useNodeStore.getState().entities.opt_low).toBeTruthy();
    expect(useNodeStore.getState().entities.attrDef_priority.children ?? []).toContain('opt_low');

    // Missing attrDef: should also be no-op.
    useNodeStore.getState().removeFieldOption('missing_attr_def', 'opt_low', 'user_default');
    expect(useNodeStore.getState().entities.opt_low).toBeTruthy();

    // Correct attrDef: option gets removed.
    useNodeStore.getState().removeFieldOption('attrDef_priority', 'opt_low', 'user_default');
    expect(useNodeStore.getState().entities.opt_low).toBeUndefined();
    expect(useNodeStore.getState().entities.attrDef_priority.children ?? []).not.toContain('opt_low');

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('replaceFieldAttrDef enforces node ownership and old attrDef match', async () => {
    const { tupleId, attrDefId: placeholderAttrDefId } = await useNodeStore.getState().addUnnamedFieldToNode(
      'note_2',
      'ws_default',
      'user_default',
    );
    expect(useNodeStore.getState().entities[placeholderAttrDefId]).toBeTruthy();

    // Wrong node owner for tuple -> no-op.
    await useNodeStore.getState().replaceFieldAttrDef(
      'task_1',
      tupleId,
      placeholderAttrDefId,
      'attrDef_status',
      'ws_default',
      'user_default',
    );
    expect(useNodeStore.getState().entities[tupleId].children?.[0]).toBe(placeholderAttrDefId);
    expect(useNodeStore.getState().entities[placeholderAttrDefId]).toBeTruthy();

    // oldAttrDef mismatch -> no-op.
    await useNodeStore.getState().replaceFieldAttrDef(
      'note_2',
      tupleId,
      'attrDef_status',
      'attrDef_due',
      'ws_default',
      'user_default',
    );
    expect(useNodeStore.getState().entities[tupleId].children?.[0]).toBe(placeholderAttrDefId);
    expect(useNodeStore.getState().entities[placeholderAttrDefId]).toBeTruthy();

    // Valid replacement -> tuple swapped and placeholder attrDef cleaned.
    await useNodeStore.getState().replaceFieldAttrDef(
      'note_2',
      tupleId,
      placeholderAttrDefId,
      'attrDef_status',
      'ws_default',
      'user_default',
    );
    expect(useNodeStore.getState().entities[tupleId].children?.[0]).toBe('attrDef_status');
    expect(useNodeStore.getState().entities[placeholderAttrDefId]).toBeUndefined();

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });
});
