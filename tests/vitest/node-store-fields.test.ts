import { useNodeStore } from '../../src/stores/node-store.js';
import { SYS_A, SYS_D, SYS_V } from '../../src/types/index.js';
import { resolveSourceSupertag, resolveTaggedNodes } from '../../src/lib/field-utils.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

function findFieldTupleId(nodeId: string, attrDefId: string): string | undefined {
  const state = useNodeStore.getState();
  const node = state.entities[nodeId];
  if (!node?.children) return undefined;

  return node.children.find((cid) => {
    const child = state.entities[cid];
    return child?.props._docType === 'tuple' && child.children?.[0] === attrDefId;
  });
}

describe('node-store field operations', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('setFieldValue updates existing tuple value and clearFieldValue resets it', async () => {
    const tupleId = findFieldTupleId('task_1', 'attrDef_due');
    expect(tupleId).toBeTruthy();
    if (!tupleId) return;

    await useNodeStore.getState().setFieldValue(
      'task_1',
      'attrDef_due',
      '2026-02-13',
      'ws_default',
      'user_default',
    );

    const firstValueId = useNodeStore.getState().entities[tupleId].children?.[1];
    expect(firstValueId).toBeTruthy();
    if (!firstValueId) return;

    expect(useNodeStore.getState().entities[firstValueId]?.props.name).toBe('2026-02-13');
    // Value node's _ownerId should be the associatedData (parent in FieldValueOutliner)
    expect(useNodeStore.getState().entities[firstValueId]?.props._ownerId).toBe('task1_assoc_due');

    await useNodeStore.getState().setFieldValue(
      'task_1',
      'attrDef_due',
      '2026-03-01',
      'ws_default',
      'user_default',
    );

    const secondValueId = useNodeStore.getState().entities[tupleId].children?.[1];
    expect(secondValueId).toBe(firstValueId);
    expect(useNodeStore.getState().entities[firstValueId]?.props.name).toBe('2026-03-01');

    await useNodeStore.getState().clearFieldValue('task_1', 'attrDef_due', 'user_default');
    expect(useNodeStore.getState().entities[firstValueId]?.props.name).toBe('');

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('setFieldValue creates tuple + value + associatedData for missing field', async () => {
    expect(findFieldTupleId('note_2', 'attrDef_status')).toBeUndefined();

    await useNodeStore.getState().setFieldValue(
      'note_2',
      'attrDef_status',
      'To Do',
      'ws_default',
      'user_default',
    );

    const tupleId = findFieldTupleId('note_2', 'attrDef_status');
    expect(tupleId).toBeTruthy();
    if (!tupleId) return;

    const state = useNodeStore.getState();
    const tuple = state.entities[tupleId];
    const valueId = tuple.children?.[1];
    const assocId = state.entities.note_2.associationMap?.[tupleId];

    expect(valueId).toBeTruthy();
    expect(assocId).toBeTruthy();
    if (!valueId || !assocId) return;

    expect(state.entities[valueId]?.props.name).toBe('To Do');
    expect(state.entities[assocId]?.props._docType).toBe('associatedData');
    expect(state.entities[assocId]?.props._ownerId).toBe('note_2');
    expect(state.entities.note_2.children ?? []).toContain(tupleId);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('addFieldToNode deduplicates existing tuples and setOptionsFieldValue writes selected option', async () => {
    const beforeExistingCount = (useNodeStore.getState().entities.task_1.children ?? []).filter((cid) => {
      const child = useNodeStore.getState().entities[cid];
      return child?.props._docType === 'tuple' && child.children?.[0] === 'attrDef_status';
    }).length;

    await useNodeStore.getState().addFieldToNode('task_1', 'attrDef_status', 'ws_default', 'user_default');

    const afterExistingCount = (useNodeStore.getState().entities.task_1.children ?? []).filter((cid) => {
      const child = useNodeStore.getState().entities[cid];
      return child?.props._docType === 'tuple' && child.children?.[0] === 'attrDef_status';
    }).length;
    expect(afterExistingCount).toBe(beforeExistingCount);

    await useNodeStore.getState().addFieldToNode('note_2', 'attrDef_status', 'ws_default', 'user_default');
    const tupleId = findFieldTupleId('note_2', 'attrDef_status');
    expect(tupleId).toBeTruthy();
    if (!tupleId) return;

    const assocId = useNodeStore.getState().entities.note_2.associationMap?.[tupleId];
    expect(assocId).toBeTruthy();
    if (!assocId) return;

    useNodeStore.getState().setOptionsFieldValue('note_2', 'attrDef_status', 'opt_done', 'user_default');
    expect(useNodeStore.getState().entities[assocId].children).toEqual(['opt_done']);

    useNodeStore.getState().setOptionsFieldValue('note_2', 'attrDef_status', 'opt_todo', 'user_default');
    expect(useNodeStore.getState().entities[assocId].children).toEqual(['opt_todo']);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('moveFieldTuple nests a field under previous field value and keeps associations aligned', async () => {
    await useNodeStore.getState().addFieldToNode('note_2', 'attrDef_status', 'ws_default', 'user_default');
    await useNodeStore.getState().addFieldToNode('note_2', 'attrDef_priority', 'ws_default', 'user_default');

    const statusTupleId = findFieldTupleId('note_2', 'attrDef_status');
    const priorityTupleId = findFieldTupleId('note_2', 'attrDef_priority');
    expect(statusTupleId).toBeTruthy();
    expect(priorityTupleId).toBeTruthy();
    if (!statusTupleId || !priorityTupleId) return;

    const before = useNodeStore.getState();
    const statusAssocId = before.entities.note_2.associationMap?.[statusTupleId];
    const priorityAssocId = before.entities.note_2.associationMap?.[priorityTupleId];
    expect(statusAssocId).toBeTruthy();
    expect(priorityAssocId).toBeTruthy();
    if (!statusAssocId || !priorityAssocId) return;

    await useNodeStore.getState().moveFieldTuple(
      'note_2',
      priorityTupleId,
      statusAssocId,
      'user_default',
    );

    const state = useNodeStore.getState();
    expect(state.entities.note_2.children ?? []).toContain(statusTupleId);
    expect(state.entities.note_2.children ?? []).not.toContain(priorityTupleId);
    expect(state.entities.note_2.associationMap?.[priorityTupleId]).toBeUndefined();

    expect(state.entities[statusAssocId].children ?? []).toContain(priorityTupleId);
    expect(state.entities[statusAssocId].associationMap?.[priorityTupleId]).toBe(priorityAssocId);
    expect(state.entities[priorityTupleId]?.props._ownerId).toBe(statusAssocId);
    expect(state.entities[priorityAssocId]?.props._ownerId).toBe(statusAssocId);

    expect(collectNodeGraphErrors(state.entities)).toEqual([]);
  });

  it('removeField moves tuple and associatedData to trash and cleans associationMap', async () => {
    await useNodeStore.getState().addFieldToNode('note_2', 'attrDef_priority', 'ws_default', 'user_default');
    const tupleId = findFieldTupleId('note_2', 'attrDef_priority');
    expect(tupleId).toBeTruthy();
    if (!tupleId) return;

    const assocId = useNodeStore.getState().entities.note_2.associationMap?.[tupleId];
    expect(assocId).toBeTruthy();
    if (!assocId) return;

    useNodeStore.getState().removeField('note_2', tupleId, 'ws_default', 'user_default');

    const state = useNodeStore.getState();
    expect(state.entities.note_2.children ?? []).not.toContain(tupleId);
    expect(state.entities.note_2.associationMap?.[tupleId]).toBeUndefined();
    expect(state.entities[tupleId]?.props._ownerId).toBe('ws_default_TRASH');
    expect(state.entities[assocId]?.props._ownerId).toBe('ws_default_TRASH');
    expect(state.entities.ws_default_TRASH.children ?? []).toContain(tupleId);
    expect(state.entities.ws_default_TRASH.children ?? []).toContain(assocId);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('toggleCheckboxField creates YES and toggles YES/NO on repeated clicks', () => {
    const assocId = 'task1_assoc_done';
    expect(useNodeStore.getState().entities[assocId].children).toEqual([]);

    useNodeStore.getState().toggleCheckboxField(assocId, 'ws_default', 'user_default');
    const valueId = useNodeStore.getState().entities[assocId].children?.[0];
    expect(valueId).toBeTruthy();
    if (!valueId) return;

    expect(useNodeStore.getState().entities[valueId]?.props.name).toBe(SYS_V.YES);

    useNodeStore.getState().toggleCheckboxField(assocId, 'ws_default', 'user_default');
    expect(useNodeStore.getState().entities[valueId]?.props.name).toBe(SYS_V.NO);

    useNodeStore.getState().toggleCheckboxField(assocId, 'ws_default', 'user_default');
    expect(useNodeStore.getState().entities[valueId]?.props.name).toBe(SYS_V.YES);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('addUnnamedFieldToNode inserts tuple in-place and creates attrDef + associatedData chain', async () => {
    const beforeChildren = [...(useNodeStore.getState().entities.note_2.children ?? [])];
    expect(beforeChildren).toEqual(['idea_1', 'idea_2']);

    const { tupleId, attrDefId } = await useNodeStore.getState().addUnnamedFieldToNode(
      'note_2',
      'ws_default',
      'user_default',
      'idea_1',
    );

    const state = useNodeStore.getState();
    const noteChildren = state.entities.note_2.children ?? [];
    expect(noteChildren[1]).toBe(tupleId);

    const tuple = state.entities[tupleId];
    expect(tuple?.props._docType).toBe('tuple');
    expect(tuple?.props._ownerId).toBe('note_2');
    expect(tuple?.children?.[0]).toBe(attrDefId);

    const assocId = state.entities.note_2.associationMap?.[tupleId];
    expect(assocId).toBeTruthy();
    if (!assocId) return;
    expect(state.entities[assocId]?.props._docType).toBe('associatedData');
    expect(state.entities[assocId]?.props._ownerId).toBe('note_2');

    const attrDef = state.entities[attrDefId];
    expect(attrDef?.props._docType).toBe('attrDef');
    expect(attrDef?.props.name).toBe('');
    expect(attrDef?.props._ownerId).toBe(tupleId);
    expect(attrDef?.meta?.length).toBeGreaterThan(0);

    const hasPlainTypeTuple = (attrDef?.children ?? []).some((cid) => {
      const child = state.entities[cid];
      return child?.props._docType === 'tuple' &&
        child.children?.[0] === SYS_A.TYPE_CHOICE &&
        child.children?.[1] === SYS_D.PLAIN;
    });
    expect(hasPlainTypeTuple).toBe(true);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('autoCollectOption updates field value and appends value ref to attrDef autocollect tuple', () => {
    const beforeAutoCollectLen = useNodeStore.getState().entities.attrDef_status_autocollect.children?.length ?? 0;

    const valueId = useNodeStore.getState().autoCollectOption(
      'task_1',
      'attrDef_status',
      'Blocked',
      'ws_default',
      'user_default',
    );

    const state = useNodeStore.getState();
    expect(state.entities[valueId]?.props.name).toBe('Blocked');
    expect(state.entities.task1_assoc_status.children).toEqual([valueId]);

    const afterChildren = state.entities.attrDef_status_autocollect.children ?? [];
    expect(afterChildren.length).toBe(beforeAutoCollectLen + 1);
    expect(afterChildren[afterChildren.length - 1]).toBe(valueId);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('removeFieldOption removes option id from attrDef children and deletes option node', () => {
    const before = [...(useNodeStore.getState().entities.attrDef_priority.children ?? [])];
    expect(before).toContain('opt_low');
    expect(useNodeStore.getState().entities.opt_low).toBeTruthy();

    useNodeStore.getState().removeFieldOption('attrDef_priority', 'opt_low', 'user_default');

    const after = useNodeStore.getState().entities.attrDef_priority.children ?? [];
    expect(after).not.toContain('opt_low');
    expect(useNodeStore.getState().entities.opt_low).toBeUndefined();
    expect(after).toContain('opt_high');
    expect(after).toContain('opt_medium');

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('replaceFieldAttrDef swaps placeholder attrDef and deletes orphaned old attrDef chain', async () => {
    const { tupleId, attrDefId: placeholderAttrDefId } = await useNodeStore.getState().addUnnamedFieldToNode(
      'note_2',
      'ws_default',
      'user_default',
    );

    const oldAttrDefChildren = [...(useNodeStore.getState().entities[placeholderAttrDefId].children ?? [])];
    expect(oldAttrDefChildren.length).toBeGreaterThan(0);

    await useNodeStore.getState().replaceFieldAttrDef(
      'note_2',
      tupleId,
      placeholderAttrDefId,
      'attrDef_status',
      'ws_default',
      'user_default',
    );

    const state = useNodeStore.getState();
    expect(state.entities[tupleId].children?.[0]).toBe('attrDef_status');
    expect(state.entities[placeholderAttrDefId]).toBeUndefined();
    for (const childId of oldAttrDefChildren) {
      expect(state.entities[childId]).toBeUndefined();
    }

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('replaceFieldAttrDef is a no-op when parent already has target attrDef tuple', async () => {
    const beforeTuple = [...(useNodeStore.getState().entities.task1_fld_priority.children ?? [])];
    const beforePriorityExists = !!useNodeStore.getState().entities.attrDef_priority;

    await useNodeStore.getState().replaceFieldAttrDef(
      'task_1',
      'task1_fld_priority',
      'attrDef_priority',
      'attrDef_status',
      'ws_default',
      'user_default',
    );

    const state = useNodeStore.getState();
    expect(state.entities.task1_fld_priority.children).toEqual(beforeTuple);
    expect(!!state.entities.attrDef_priority).toBe(beforePriorityExists);
    expect(state.entities.task1_fld_priority.children?.[0]).toBe('attrDef_priority');

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('resolveSourceSupertag reads SYS_A06 from attrDef config tuples', () => {
    const state = useNodeStore.getState();
    // Set up an attrDef with OPTIONS_FROM_SUPERTAG type + source supertag tuple
    state.setNode({
      id: 'attrDef_assignee',
      workspaceId: 'ws_default',
      props: { created: Date.now(), name: 'Assignee', _docType: 'attrDef', _ownerId: 'some_tuple' },
      children: ['attrDef_assignee_type', 'attrDef_assignee_source'],
      version: 1,
      updatedAt: Date.now(),
      createdBy: 'user_default',
      updatedBy: 'user_default',
    });
    state.setNode({
      id: 'attrDef_assignee_type',
      workspaceId: 'ws_default',
      props: { created: Date.now(), name: '', _docType: 'tuple', _ownerId: 'attrDef_assignee' },
      children: [SYS_A.TYPE_CHOICE, SYS_D.OPTIONS_FROM_SUPERTAG],
      version: 1,
      updatedAt: Date.now(),
      createdBy: 'user_default',
      updatedBy: 'user_default',
    });
    state.setNode({
      id: 'attrDef_assignee_source',
      workspaceId: 'ws_default',
      props: { created: Date.now(), name: '', _docType: 'tuple', _ownerId: 'attrDef_assignee' },
      children: [SYS_A.SOURCE_SUPERTAG, 'tagDef_person'],
      version: 1,
      updatedAt: Date.now(),
      createdBy: 'user_default',
      updatedBy: 'user_default',
    });

    const entities = useNodeStore.getState().entities;
    expect(resolveSourceSupertag(entities, 'attrDef_assignee')).toBe('tagDef_person');
    expect(resolveSourceSupertag(entities, 'attrDef_status')).toBeUndefined();
  });

  it('resolveTaggedNodes finds all content nodes tagged with a given tagDef', () => {
    // task_1 is tagged with tagDef_task (via meta_task_1 → meta_task_1_tag)
    // person_1 is tagged with tagDef_person (via meta_person_1)
    const entities = useNodeStore.getState().entities;

    const taskNodes = resolveTaggedNodes(entities, 'tagDef_task');
    expect(taskNodes).toContain('task_1');
    expect(taskNodes).not.toContain('person_1');

    const personNodes = resolveTaggedNodes(entities, 'tagDef_person');
    expect(personNodes).toContain('person_1');
    expect(personNodes).not.toContain('task_1');

    // Non-existent tag → empty
    expect(resolveTaggedNodes(entities, 'tagDef_nonexistent')).toEqual([]);
  });

  it('changeFieldType and setConfigValue update tuple values in-place', () => {
    useNodeStore.getState().changeFieldType('attrDef_due', SYS_D.PLAIN, 'user_default');
    expect(useNodeStore.getState().entities.attrDef_due_type.children?.[1]).toBe(SYS_D.PLAIN);

    useNodeStore.getState().changeFieldType('attrDef_due', SYS_D.DATE, 'user_default');
    expect(useNodeStore.getState().entities.attrDef_due_type.children?.[1]).toBe(SYS_D.DATE);

    useNodeStore.getState().setConfigValue('attrDef_due_required', SYS_V.YES, 'user_default');
    expect(useNodeStore.getState().entities.attrDef_due_required.children?.[1]).toBe(SYS_V.YES);

    useNodeStore.getState().setConfigValue('attrDef_due_required', SYS_V.NO, 'user_default');
    expect(useNodeStore.getState().entities.attrDef_due_required.children?.[1]).toBe(SYS_V.NO);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });
});
