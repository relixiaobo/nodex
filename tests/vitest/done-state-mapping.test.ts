/**
 * Done State Mapping — checkbox ↔ Options field bidirectional sync.
 *
 * Tests:
 * - Pure functions: getDoneStateMappings, resolveForwardDoneMapping, resolveReverseDoneMapping
 * - Store integration: toggleNodeDone → field update, setOptionsFieldValue → checkbox update
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDoneStateMappings,
  resolveForwardDoneMapping,
  resolveReverseDoneMapping,
} from '../../src/lib/checkbox-utils.js';
import type { NodexNode, DocType } from '../../src/types/node.js';
import { SYS_A, SYS_V } from '../../src/types/index.js';
import { useNodeStore } from '../../src/stores/node-store.js';

const WS = 'ws';
const USER = 'u';

function makeNode(id: string, overrides: Partial<NodexNode> = {}): NodexNode {
  return {
    id,
    props: { created: 1 },
    children: [],
    workspaceId: WS,
    version: 1,
    updatedAt: 1,
    createdBy: USER,
    updatedBy: USER,
    ...overrides,
  };
}

/**
 * Build a full entity graph with:
 * - node n1 tagged with tagDef1
 * - tagDef1 has SYS_A55=YES (checkbox) + NDX_A06 done-state mapping
 * - attrDef_status with options opt_done / opt_todo
 * - n1 has field tuple for attrDef_status + associatedData
 */
function buildDoneStateMappingEntities(opts?: {
  uncheckedOptionId?: string;
  skipMapping?: boolean;
}): Record<string, NodexNode> {
  const entities: Record<string, NodexNode> = {};

  // AttrDef options
  entities['opt_done'] = makeNode('opt_done', { props: { created: 1, name: 'Done', _ownerId: 'attrDef_status' } });
  entities['opt_todo'] = makeNode('opt_todo', { props: { created: 1, name: 'To Do', _ownerId: 'attrDef_status' } });
  entities['opt_in_progress'] = makeNode('opt_in_progress', { props: { created: 1, name: 'In Progress', _ownerId: 'attrDef_status' } });

  // AttrDef
  entities['attrDef_status'] = makeNode('attrDef_status', {
    props: { created: 1, _docType: 'attrDef' as DocType },
    children: ['attrDef_status_type', 'opt_done', 'opt_todo', 'opt_in_progress'],
  });
  entities['attrDef_status_type'] = makeNode('attrDef_status_type', {
    props: { created: 1, _docType: 'tuple' as DocType },
    children: [SYS_A.TYPE_CHOICE, 'SYS_D12'],
  });

  // TagDef with done-state mapping
  const tagDefChildren = ['cfg_cb', 'tpl_status'];
  if (!opts?.skipMapping) tagDefChildren.push('cfg_done_mapping');

  entities['tagDef1'] = makeNode('tagDef1', {
    props: { created: 1, _docType: 'tagDef' as DocType },
    children: tagDefChildren,
  });
  entities['cfg_cb'] = makeNode('cfg_cb', {
    props: { created: 1, _docType: 'tuple' as DocType },
    children: [SYS_A.SHOW_CHECKBOX, SYS_V.YES],
  });
  entities['tpl_status'] = makeNode('tpl_status', {
    props: { created: 1, _docType: 'tuple' as DocType },
    children: ['attrDef_status'],
  });

  if (!opts?.skipMapping) {
    const mappingChildren = [SYS_A.DONE_STATE_MAPPING, 'attrDef_status', 'opt_done'];
    if (opts?.uncheckedOptionId) mappingChildren.push(opts.uncheckedOptionId);
    entities['cfg_done_mapping'] = makeNode('cfg_done_mapping', {
      props: { created: 1, _docType: 'tuple' as DocType },
      children: mappingChildren,
    });
  }

  // Node n1 tagged with tagDef1
  entities['n1'] = makeNode('n1', {
    props: { created: 1, _metaNodeId: 'meta1' },
    children: ['fld_status'],
    associationMap: { fld_status: 'assoc_status' },
  });
  entities['meta1'] = makeNode('meta1', {
    props: { created: 1, _docType: 'metanode' as DocType },
    children: ['tuple_tag'],
  });
  entities['tuple_tag'] = makeNode('tuple_tag', {
    props: { created: 1, _docType: 'tuple' as DocType },
    children: [SYS_A.NODE_SUPERTAGS, 'tagDef1'],
  });
  entities['fld_status'] = makeNode('fld_status', {
    props: { created: 1, _docType: 'tuple' as DocType, _ownerId: 'n1' },
    children: ['attrDef_status'],
  });
  entities['assoc_status'] = makeNode('assoc_status', {
    props: { created: 1, _docType: 'associatedData' as DocType, _ownerId: 'n1' },
    children: [],
  });

  return entities;
}

// ─── Pure function tests ───

describe('getDoneStateMappings', () => {
  it('returns empty for node without tags', () => {
    const entities = { n1: makeNode('n1') };
    expect(getDoneStateMappings('n1', entities)).toEqual([]);
  });

  it('returns empty for node with tag but no NDX_A06 config', () => {
    const entities = buildDoneStateMappingEntities({ skipMapping: true });
    expect(getDoneStateMappings('n1', entities)).toEqual([]);
  });

  it('returns mapping when tag has NDX_A06 config (checked only)', () => {
    const entities = buildDoneStateMappingEntities();
    const mappings = getDoneStateMappings('n1', entities);
    expect(mappings).toHaveLength(1);
    expect(mappings[0]).toEqual({
      tagDefId: 'tagDef1',
      attrDefId: 'attrDef_status',
      checkedOptionId: 'opt_done',
      uncheckedOptionId: undefined,
    });
  });

  it('returns mapping with uncheckedOptionId when configured', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    const mappings = getDoneStateMappings('n1', entities);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].uncheckedOptionId).toBe('opt_todo');
  });

  it('inherits mapping from Extend chain', () => {
    const entities = buildDoneStateMappingEntities();
    // Create child tag that extends tagDef1
    entities['childTag'] = makeNode('childTag', {
      props: { created: 1, _docType: 'tagDef' as DocType },
      children: ['childTag_extends'],
    });
    entities['childTag_extends'] = makeNode('childTag_extends', {
      props: { created: 1, _docType: 'tuple' as DocType },
      children: [SYS_A.EXTENDS, 'tagDef1'],
    });
    // Re-tag n1 with childTag instead of tagDef1
    entities['tuple_tag'].children = [SYS_A.NODE_SUPERTAGS, 'childTag'];

    const mappings = getDoneStateMappings('n1', entities);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].tagDefId).toBe('tagDef1'); // inherited from parent
    expect(mappings[0].attrDefId).toBe('attrDef_status');
  });

  it('returns empty for nonexistent node', () => {
    expect(getDoneStateMappings('missing', {})).toEqual([]);
  });
});

describe('resolveForwardDoneMapping', () => {
  it('returns checkedOptionId when isDone=true', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    const result = resolveForwardDoneMapping('n1', true, entities);
    expect(result).toEqual([{ attrDefId: 'attrDef_status', optionNodeId: 'opt_done' }]);
  });

  it('returns uncheckedOptionId when isDone=false and unchecked configured', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    const result = resolveForwardDoneMapping('n1', false, entities);
    expect(result).toEqual([{ attrDefId: 'attrDef_status', optionNodeId: 'opt_todo' }]);
  });

  it('returns empty when isDone=false and no unchecked configured', () => {
    const entities = buildDoneStateMappingEntities();
    const result = resolveForwardDoneMapping('n1', false, entities);
    expect(result).toEqual([]);
  });

  it('returns empty when no mappings exist', () => {
    const entities = buildDoneStateMappingEntities({ skipMapping: true });
    const result = resolveForwardDoneMapping('n1', true, entities);
    expect(result).toEqual([]);
  });
});

describe('resolveReverseDoneMapping', () => {
  it('returns { newDone: true } when option matches checkedOptionId', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    const result = resolveReverseDoneMapping('n1', 'attrDef_status', 'opt_done', entities);
    expect(result).toEqual({ newDone: true });
  });

  it('returns { newDone: false } when option matches uncheckedOptionId', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    const result = resolveReverseDoneMapping('n1', 'attrDef_status', 'opt_todo', entities);
    expect(result).toEqual({ newDone: false });
  });

  it('returns null when option is unrelated', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    const result = resolveReverseDoneMapping('n1', 'attrDef_status', 'opt_in_progress', entities);
    expect(result).toBeNull();
  });

  it('returns null when attrDefId does not match any mapping', () => {
    const entities = buildDoneStateMappingEntities();
    const result = resolveReverseDoneMapping('n1', 'attrDef_other', 'opt_done', entities);
    expect(result).toBeNull();
  });

  it('returns null when no unchecked configured and option is not checked', () => {
    const entities = buildDoneStateMappingEntities(); // no uncheckedOptionId
    const result = resolveReverseDoneMapping('n1', 'attrDef_status', 'opt_todo', entities);
    expect(result).toBeNull();
  });
});

// ─── Store integration tests ───

describe('Store: toggleNodeDone → field update', () => {
  beforeEach(() => {
    useNodeStore.setState({ entities: {}, loading: new Set() });
  });

  it('toggleNodeDone sets Options field to checkedOptionId when done', async () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    // Start with _done = 0 (undone, checkbox visible)
    entities['n1'].props._done = 0;
    useNodeStore.setState({ entities });

    await useNodeStore.getState().toggleNodeDone('n1', USER);

    const state = useNodeStore.getState().entities;
    // Checkbox should now be done
    expect(state['n1'].props._done).toBeGreaterThan(0);
    // Status field should be set to opt_done
    expect(state['assoc_status'].children).toEqual(['opt_done']);
  });

  it('toggleNodeDone sets Options field to uncheckedOptionId when undone', async () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    // Start with _done = timestamp (done)
    entities['n1'].props._done = Date.now();
    useNodeStore.setState({ entities });

    await useNodeStore.getState().toggleNodeDone('n1', USER);

    const state = useNodeStore.getState().entities;
    // Checkbox should now be undone (tag-driven → _done=undefined)
    expect(state['n1'].props._done).toBeUndefined();
    // Status field should be set to opt_todo
    expect(state['assoc_status'].children).toEqual(['opt_todo']);
  });
});

describe('Store: setOptionsFieldValue → checkbox update', () => {
  beforeEach(() => {
    useNodeStore.setState({ entities: {}, loading: new Set() });
  });

  it('setting checkedOptionId auto-checks the checkbox', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    // Start undone
    entities['n1'].props._done = undefined;
    useNodeStore.setState({ entities });

    useNodeStore.getState().setOptionsFieldValue('n1', 'attrDef_status', 'opt_done', USER);

    const state = useNodeStore.getState().entities;
    expect(state['n1'].props._done).toBeGreaterThan(0);
    expect(state['assoc_status'].children).toEqual(['opt_done']);
  });

  it('setting uncheckedOptionId auto-unchecks the checkbox', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    // Start done
    entities['n1'].props._done = Date.now();
    useNodeStore.setState({ entities });

    useNodeStore.getState().setOptionsFieldValue('n1', 'attrDef_status', 'opt_todo', USER);

    const state = useNodeStore.getState().entities;
    expect(state['n1'].props._done).toBeUndefined();
    expect(state['assoc_status'].children).toEqual(['opt_todo']);
  });

  it('setting unrelated option does not change checkbox', () => {
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    // Start undone
    entities['n1'].props._done = undefined;
    useNodeStore.setState({ entities });

    useNodeStore.getState().setOptionsFieldValue('n1', 'attrDef_status', 'opt_in_progress', USER);

    const state = useNodeStore.getState().entities;
    expect(state['n1'].props._done).toBeUndefined();
    expect(state['assoc_status'].children).toEqual(['opt_in_progress']);
  });
});

describe('No infinite loop: atomic set() verification', () => {
  it('forward and reverse operate in separate set() calls, no recursion', () => {
    // This test verifies the architecture: forward mapping is in toggleNodeDone/cycleNodeCheckbox,
    // reverse mapping is in setOptionsFieldValue. They don't call each other.
    // The test simply ensures both work independently without triggering infinite updates.
    const entities = buildDoneStateMappingEntities({ uncheckedOptionId: 'opt_todo' });
    entities['n1'].props._done = 0;
    useNodeStore.setState({ entities });

    // Forward: toggle done → should set field, but NOT re-trigger setOptionsFieldValue
    useNodeStore.getState().toggleNodeDone('n1', USER);
    const s1 = useNodeStore.getState().entities;
    expect(s1['n1'].props._done).toBeGreaterThan(0);
    expect(s1['assoc_status'].children).toEqual(['opt_done']);

    // Reverse: set option → should set checkbox, but NOT re-trigger toggleNodeDone
    useNodeStore.getState().setOptionsFieldValue('n1', 'attrDef_status', 'opt_todo', USER);
    const s2 = useNodeStore.getState().entities;
    expect(s2['n1'].props._done).toBeUndefined();
    expect(s2['assoc_status'].children).toEqual(['opt_todo']);
  });
});
