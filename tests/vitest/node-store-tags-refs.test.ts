import { SYS_A } from '../../src/types/index.js';
import { useNodeStore } from '../../src/stores/node-store.js';
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

describe('node-store tag + reference flows', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('applyTag/removeTag instantiates and cleans template-sourced fields', async () => {
    const nodeId = 'note_2';
    const tagDefId = 'tagDef_task';
    const expectedTemplateSources = ['taskField_status', 'taskField_priority', 'taskField_due', 'taskField_done'];

    const originalChildren = [...(useNodeStore.getState().entities[nodeId].children ?? [])];

    await useNodeStore.getState().applyTag(nodeId, tagDefId, 'ws_default', 'user_default');

    const nodeAfterApply = useNodeStore.getState().entities[nodeId];
    expect(nodeAfterApply.props._metaNodeId).toBeTruthy();
    const metanodeId = nodeAfterApply.props._metaNodeId!;
    const metanode = useNodeStore.getState().entities[metanodeId];
    const hasTagBinding = (metanode.children ?? []).some((cid) => {
      const t = useNodeStore.getState().entities[cid];
      return t?.props._docType === 'tuple' &&
        t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
        t.children?.[1] === tagDefId;
    });
    expect(hasTagBinding).toBe(true);

    const templatedFieldTupleIds = (nodeAfterApply.children ?? []).filter((cid) => {
      const child = useNodeStore.getState().entities[cid];
      return child?.props._docType === 'tuple' &&
        expectedTemplateSources.includes(child.props._sourceId ?? '');
    });
    expect(templatedFieldTupleIds.length).toBe(expectedTemplateSources.length);

    for (const tupleId of templatedFieldTupleIds) {
      expect(nodeAfterApply.associationMap?.[tupleId]).toBeTruthy();
    }

    await useNodeStore.getState().removeTag(nodeId, tagDefId, 'user_default');

    const nodeAfterRemove = useNodeStore.getState().entities[nodeId];
    const metanodeAfterRemove = useNodeStore.getState().entities[metanodeId];
    const stillHasTagBinding = (metanodeAfterRemove?.children ?? []).some((cid) => {
      const t = useNodeStore.getState().entities[cid];
      return t?.props._docType === 'tuple' &&
        t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
        t.children?.[1] === tagDefId;
    });
    expect(stillHasTagBinding).toBe(false);

    const stillHasTemplateField = (nodeAfterRemove.children ?? []).some((cid) => {
      const child = useNodeStore.getState().entities[cid];
      return expectedTemplateSources.includes(child?.props._sourceId ?? '');
    });
    expect(stillHasTemplateField).toBe(false);

    // Original content nodes should remain after tag removal.
    for (const id of originalChildren) {
      expect(nodeAfterRemove.children ?? []).toContain(id);
    }
  });

  it('applyTag is idempotent and removeTag keeps manually-added fields', async () => {
    const nodeId = 'note_2';
    const tagDefId = 'tagDef_task';
    const expectedTemplateSources = ['taskField_status', 'taskField_priority', 'taskField_due', 'taskField_done'];

    await useNodeStore.getState().addFieldToNode(nodeId, 'attrDef_company', 'ws_default', 'user_default');
    const manualTupleId = findFieldTupleId(nodeId, 'attrDef_company');
    expect(manualTupleId).toBeTruthy();
    if (!manualTupleId) return;
    const manualAssocId = useNodeStore.getState().entities[nodeId].associationMap?.[manualTupleId];
    expect(manualAssocId).toBeTruthy();
    if (!manualAssocId) return;

    await useNodeStore.getState().applyTag(nodeId, tagDefId, 'ws_default', 'user_default');
    await useNodeStore.getState().applyTag(nodeId, tagDefId, 'ws_default', 'user_default');

    const nodeAfterDoubleApply = useNodeStore.getState().entities[nodeId];
    const metanodeId = nodeAfterDoubleApply.props._metaNodeId;
    expect(metanodeId).toBeTruthy();
    if (!metanodeId) return;

    const tagBindingCount = (useNodeStore.getState().entities[metanodeId].children ?? []).filter((cid) => {
      const t = useNodeStore.getState().entities[cid];
      return t?.props._docType === 'tuple' &&
        t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
        t.children?.[1] === tagDefId;
    }).length;
    expect(tagBindingCount).toBe(1);

    const templatedFieldTupleCount = (nodeAfterDoubleApply.children ?? []).filter((cid) => {
      const child = useNodeStore.getState().entities[cid];
      return child?.props._docType === 'tuple' &&
        expectedTemplateSources.includes(child.props._sourceId ?? '');
    }).length;
    expect(templatedFieldTupleCount).toBe(expectedTemplateSources.length);

    await useNodeStore.getState().removeTag(nodeId, tagDefId, 'user_default');

    const nodeAfterRemove = useNodeStore.getState().entities[nodeId];
    expect(nodeAfterRemove.children ?? []).toContain(manualTupleId);
    expect(nodeAfterRemove.associationMap?.[manualTupleId]).toBe(manualAssocId);
    expect(useNodeStore.getState().entities[manualAssocId]).toBeTruthy();
  });

  it('applyTag on content node does NOT instantiate system config fields (Color, Extends, etc.)', async () => {
    const nodeId = 'note_2';
    const tagDefId = 'tagDef_person';

    await useNodeStore.getState().applyTag(nodeId, tagDefId, 'ws_default', 'user_default');

    const node = useNodeStore.getState().entities[nodeId];
    const entities = useNodeStore.getState().entities;

    // Collect all tuple keys on the content node
    const tupleKeys = (node.children ?? [])
      .map(cid => entities[cid])
      .filter(c => c?.props._docType === 'tuple')
      .map(c => c.children?.[0])
      .filter(Boolean) as string[];

    // System config fields should NOT be present on content nodes
    const systemKeys = tupleKeys.filter(k => k.startsWith('SYS_') || k.startsWith('NDX_'));
    expect(systemKeys).toEqual([]);

    // User fields should be present
    expect(tupleKeys).toContain('attrDef_email');
    expect(tupleKeys).toContain('attrDef_company');
    expect(tupleKeys).toContain('attrDef_age');
    expect(tupleKeys).toContain('attrDef_website');
  });

  it('addReference/removeReference/startRefConversion/revertRefConversion keep parent children stable', () => {
    const parentId = 'note_2';
    const refNodeId = 'task_1';

    const parentBefore = [...(useNodeStore.getState().entities[parentId].children ?? [])];

    useNodeStore.getState().addReference(parentId, refNodeId, 'user_default');
    useNodeStore.getState().addReference(parentId, refNodeId, 'user_default'); // duplicate should be ignored

    const afterAdd = useNodeStore.getState().entities[parentId].children ?? [];
    expect(afterAdd.filter((id) => id === refNodeId).length).toBe(1);

    useNodeStore.getState().removeReference(parentId, refNodeId, 'user_default');
    const afterRemove = useNodeStore.getState().entities[parentId].children ?? [];
    expect(afterRemove).toEqual(parentBefore);

    const tempId = useNodeStore.getState().startRefConversion(
      refNodeId,
      parentId,
      1,
      'ws_default',
      'user_default',
    );
    const tempNode = useNodeStore.getState().entities[tempId];
    expect(tempNode.props._ownerId).toBe(parentId);
    expect(tempNode.props.name).toBe('\uFFFC');
    expect(tempNode.props._inlineRefs).toEqual([
      expect.objectContaining({ offset: 0, targetNodeId: refNodeId }),
    ]);
    expect(useNodeStore.getState().entities[parentId].children?.[1]).toBe(tempId);

    useNodeStore.getState().revertRefConversion(tempId, refNodeId, parentId);
    const childrenAfterRevert = useNodeStore.getState().entities[parentId].children ?? [];
    expect(childrenAfterRevert[1]).toBe(refNodeId);
    expect(useNodeStore.getState().entities[tempId]).toBeUndefined();
  });
});
