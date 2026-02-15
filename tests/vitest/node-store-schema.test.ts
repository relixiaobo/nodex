import { useNodeStore } from '../../src/stores/node-store.js';
import { SYS_A, SYS_D, SYS_T, SYS_V } from '../../src/types/index.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import { resetAndSeed } from './helpers/test-state.js';

function findTupleByKey(nodeId: string, keyId: string): string | undefined {
  const state = useNodeStore.getState();
  const node = state.entities[nodeId];
  if (!node?.children) return undefined;

  return node.children.find((cid) => {
    const child = state.entities[cid];
    return child?.props._docType === 'tuple' && child.children?.[0] === keyId;
  });
}

describe('node-store schema flows', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('createTagDef puts node under SCHEMA and auto-applies SYS_T01 config chain', async () => {
    const created = await useNodeStore.getState().createTagDef('My New Tag', 'ws_default', 'user_default');
    const state = useNodeStore.getState();
    const tagDef = state.entities[created.id];
    expect(tagDef?.props._docType).toBe('tagDef');
    expect(tagDef?.props._ownerId).toBe('ws_default_SCHEMA');
    expect(state.entities.ws_default_SCHEMA.children ?? []).toContain(created.id);

    const metanodeId = tagDef?.props._metaNodeId;
    expect(metanodeId).toBeTruthy();
    if (!metanodeId) return;

    const hasSupertagBinding = (state.entities[metanodeId].children ?? []).some((cid) => {
      const tuple = state.entities[cid];
      return tuple?.props._docType === 'tuple' &&
        tuple.children?.[0] === SYS_A.NODE_SUPERTAGS &&
        tuple.children?.[1] === SYS_T.SUPERTAG;
    });
    expect(hasSupertagBinding).toBe(true);

    // Direct config tuples: 5 (NDX_A07/A08 are now nested under NDX_A06)
    const configTupleIds = (tagDef?.children ?? []).filter((cid) => {
      const child = state.entities[cid];
      return child?.props._docType === 'tuple' && (child.props._sourceId ?? '').startsWith('sysT01_tpl_');
    });
    expect(configTupleIds.length).toBe(5);

    const configKeys = new Set(configTupleIds.map((cid) => state.entities[cid].children?.[0]));
    expect(configKeys.has(SYS_A.SHOW_CHECKBOX)).toBe(true);
    expect(configKeys.has(SYS_A.CHILD_SUPERTAG)).toBe(true);
    expect(configKeys.has(SYS_A.COLOR)).toBe(true);
    expect(configKeys.has(SYS_A.EXTENDS)).toBe(true);
    expect(configKeys.has(SYS_A.DONE_STATE_MAPPING)).toBe(true);

    // NDX_A07/A08 should be nested children of the NDX_A06 instance
    const doneMappingTupleId = configTupleIds.find(
      (cid) => state.entities[cid].children?.[0] === SYS_A.DONE_STATE_MAPPING,
    );
    expect(doneMappingTupleId).toBeTruthy();
    if (doneMappingTupleId) {
      const doneMappingTuple = state.entities[doneMappingTupleId];
      // children: [NDX_A06, defaultValue, nestedChecked, nestedUnchecked]
      expect(doneMappingTuple.children!.length).toBeGreaterThanOrEqual(4);
      const nestedKeys = doneMappingTuple.children!.slice(2).map(
        (nid) => state.entities[nid]?.children?.[0],
      );
      expect(nestedKeys).toContain(SYS_A.DONE_MAP_CHECKED);
      expect(nestedKeys).toContain(SYS_A.DONE_MAP_UNCHECKED);
      // Nested instances should have _ownerId = parent instance
      for (const nid of doneMappingTuple.children!.slice(2)) {
        expect(state.entities[nid]?.props._ownerId).toBe(doneMappingTupleId);
      }
    }

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('createAttrDef wires template tuple + type tuple and auto-applies SYS_T02 config', async () => {
    const created = await useNodeStore.getState().createAttrDef(
      'Estimate',
      'tagDef_task',
      SYS_D.NUMBER,
      'ws_default',
      'user_default',
    );

    const state = useNodeStore.getState();
    const attrDef = state.entities[created.id];
    expect(attrDef?.props._docType).toBe('attrDef');

    const templateTupleId = (state.entities.tagDef_task.children ?? []).find((cid) => {
      const child = state.entities[cid];
      return child?.props._docType === 'tuple' && child.children?.[0] === created.id;
    });
    expect(templateTupleId).toBeTruthy();
    if (!templateTupleId) return;
    expect(attrDef?.props._ownerId).toBe(templateTupleId);

    const typeTupleIds = (attrDef?.children ?? []).filter((cid) => {
      const tuple = state.entities[cid];
      return tuple?.props._docType === 'tuple' && tuple.children?.[0] === SYS_A.TYPE_CHOICE;
    });
    expect(typeTupleIds.length).toBe(1);
    expect(state.entities[typeTupleIds[0]]?.children?.[1]).toBe(SYS_D.NUMBER);

    const metanodeId = attrDef?.props._metaNodeId;
    expect(metanodeId).toBeTruthy();
    if (!metanodeId) return;

    const hasFieldDefinitionBinding = (state.entities[metanodeId].children ?? []).some((cid) => {
      const tuple = state.entities[cid];
      return tuple?.props._docType === 'tuple' &&
        tuple.children?.[0] === SYS_A.NODE_SUPERTAGS &&
        tuple.children?.[1] === SYS_T.FIELD_DEFINITION;
    });
    expect(hasFieldDefinitionBinding).toBe(true);

    const autoCollectTupleId = findTupleByKey(created.id, SYS_A.AUTOCOLLECT_OPTIONS);
    const autoInitTupleId = findTupleByKey(created.id, SYS_A.AUTO_INITIALIZE);
    const requiredTupleId = findTupleByKey(created.id, SYS_A.NULLABLE);
    const hideTupleId = findTupleByKey(created.id, SYS_A.HIDE_FIELD);
    expect(autoCollectTupleId).toBeTruthy();
    expect(autoInitTupleId).toBeTruthy();
    expect(requiredTupleId).toBeTruthy();
    expect(hideTupleId).toBeTruthy();
    if (!autoCollectTupleId || !autoInitTupleId || !requiredTupleId || !hideTupleId) return;

    expect(state.entities[autoCollectTupleId].children?.[1]).toBe(SYS_V.YES);
    expect(state.entities[autoInitTupleId].children?.[1]).toBe(SYS_V.NO);
    expect(state.entities[requiredTupleId].children?.[1]).toBe(SYS_V.NO);
    expect(state.entities[hideTupleId].children?.[1]).toBe(SYS_V.NEVER);

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });

  it('newly created attrDef template is instantiated when tag is applied to a content node', async () => {
    const created = await useNodeStore.getState().createAttrDef(
      'Estimate',
      'tagDef_task',
      SYS_D.NUMBER,
      'ws_default',
      'user_default',
    );

    const stateBeforeApply = useNodeStore.getState();
    const templateTupleId = (stateBeforeApply.entities.tagDef_task.children ?? []).find((cid) => {
      const child = stateBeforeApply.entities[cid];
      return child?.props._docType === 'tuple' && child.children?.[0] === created.id;
    });
    expect(templateTupleId).toBeTruthy();
    if (!templateTupleId) return;

    await useNodeStore.getState().applyTag('note_2', 'tagDef_task', 'ws_default', 'user_default');

    const state = useNodeStore.getState();
    const instanceTupleId = (state.entities.note_2.children ?? []).find((cid) => {
      const child = state.entities[cid];
      return child?.props._docType === 'tuple' &&
        child.props._sourceId === templateTupleId &&
        child.children?.[0] === created.id;
    });
    expect(instanceTupleId).toBeTruthy();
    if (!instanceTupleId) return;

    const assocId = state.entities.note_2.associationMap?.[instanceTupleId];
    expect(assocId).toBeTruthy();
    if (!assocId) return;
    expect(state.entities[assocId]?.props._docType).toBe('associatedData');

    expect(collectNodeGraphErrors(useNodeStore.getState().entities)).toEqual([]);
  });
});
