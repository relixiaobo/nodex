import { SYS_A } from '../../src/types/index.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('node-store trash semantics', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('trashing a tagDef keeps existing tag bindings and template field instances', async () => {
    const taskNode = useNodeStore.getState().entities.task_1;
    const taskMetaId = taskNode.props._metaNodeId;
    expect(taskMetaId).toBeTruthy();
    if (!taskMetaId) return;

    await useNodeStore.getState().trashNode('tagDef_task', 'ws_default', 'user_default');

    const state = useNodeStore.getState();
    expect(state.entities.tagDef_task.props._ownerId).toBe('ws_default_TRASH');
    expect(state.entities.ws_default_TRASH.children ?? []).toContain('tagDef_task');

    const stillHasTagBinding = (state.entities[taskMetaId].children ?? []).some((cid) => {
      const t = state.entities[cid];
      return t?.props._docType === 'tuple' &&
        t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
        t.children?.[1] === 'tagDef_task';
    });
    expect(stillHasTagBinding).toBe(true);

    // Pre-seeded template field tuple on task_1 should remain.
    expect(state.entities.task_1.children ?? []).toContain('task1_fld_status');
    expect(state.entities.task_1.associationMap?.task1_fld_status).toBe('task1_assoc_status');
    expect(state.entities.task1_fld_status.props._sourceId).toBe('taskField_status');

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('trashing an attrDef preserves existing field instances but detaches template tuple key', async () => {
    expect(useNodeStore.getState().entities.task1_fld_status.children?.[0]).toBe('attrDef_status');
    expect(useNodeStore.getState().entities.taskField_status.children?.[0]).toBe('attrDef_status');

    await useNodeStore.getState().trashNode('attrDef_status', 'ws_default', 'user_default');

    const state = useNodeStore.getState();
    expect(state.entities.attrDef_status.props._ownerId).toBe('ws_default_TRASH');
    expect(state.entities.ws_default_TRASH.children ?? []).toContain('attrDef_status');

    // Existing instantiated content field still references trashed attrDef.
    expect(state.entities.task1_fld_status.children?.[0]).toBe('attrDef_status');
    // Template tuple no longer points to attrDef (owner-child unlink during trash).
    expect(state.entities.taskField_status.children?.[0]).toBeUndefined();

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('removeTag still cleans template-sourced tuples even after tagDef is trashed', async () => {
    await useNodeStore.getState().applyTag('note_2', 'tagDef_task', 'ws_default', 'user_default');

    const appliedTupleIds = (useNodeStore.getState().entities.note_2.children ?? []).filter((cid) => {
      const child = useNodeStore.getState().entities[cid];
      return child?.props._docType === 'tuple' &&
        ['taskField_status', 'taskField_priority', 'taskField_due', 'taskField_done'].includes(child.props._sourceId ?? '');
    });
    expect(appliedTupleIds.length).toBe(4);

    await useNodeStore.getState().trashNode('tagDef_task', 'ws_default', 'user_default');
    await useNodeStore.getState().removeTag('note_2', 'tagDef_task', 'user_default');

    const state = useNodeStore.getState();
    for (const tupleId of appliedTupleIds) {
      expect(state.entities.note_2.children ?? []).not.toContain(tupleId);
      expect(state.entities[tupleId]).toBeUndefined();
    }

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });
});
