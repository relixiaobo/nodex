/**
 * Done State Mapping — checkbox ↔ Options field bidirectional sync.
 *
 * Loro model: mappings stored in NDX_A07/NDX_A08 fieldEntry trees.
 * DoneStateMapping uses fieldDefId (not attrDefId).
 * All functions take NodexNode directly (no entity dict).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDoneStateMappings,
  resolveForwardDoneMapping,
  resolveReverseDoneMapping,
} from '../../src/lib/checkbox-utils.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { SYS_A } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

/** Enable done-state mapping on tagDef_task and add a checked mapping. */
function setupDoneMapping(opts: {
  checkedOptionId?: string;
  uncheckedOptionId?: string;
  skipMapping?: boolean;
  toggleOff?: boolean;
} = {}) {
  const checkedOptionId = opts.checkedOptionId ?? 'opt_done';
  // Enable doneStateEnabled on tagDef_task
  if (!opts.toggleOff) {
    loroDoc.setNodeData('tagDef_task', 'doneStateEnabled', true);
    if (!opts.skipMapping) {
      useNodeStore.getState().addDoneMappingEntry('tagDef_task', true, 'attrDef_status', checkedOptionId);
      if (opts.uncheckedOptionId) {
        useNodeStore.getState().addDoneMappingEntry('tagDef_task', false, 'attrDef_status', opts.uncheckedOptionId);
      }
    }
  }
}

describe('getDoneStateMappings', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns empty for node without tags', () => {
    const node = loroDoc.toNodexNode('idea_1')!; // untagged
    expect(getDoneStateMappings(node)).toEqual([]);
  });

  it('returns empty for node with tag but doneStateEnabled not set', () => {
    // task_1 is tagged with tagDef_task, but tagDef_task has no doneStateEnabled
    const node = loroDoc.toNodexNode('task_1')!;
    expect(getDoneStateMappings(node)).toEqual([]);
  });

  it('returns mapping when doneStateEnabled=true with checked mapping', () => {
    setupDoneMapping();
    const node = loroDoc.toNodexNode('task_1')!;
    const mappings = getDoneStateMappings(node);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].tagDefId).toBe('tagDef_task');
    expect(mappings[0].fieldDefId).toBe('attrDef_status');
    expect(mappings[0].checkedOptionIds).toEqual(['opt_done']);
    expect(mappings[0].uncheckedOptionIds).toEqual([]);
  });

  it('includes uncheckedOptionIds when configured', () => {
    setupDoneMapping({ uncheckedOptionId: 'opt_todo' });
    const node = loroDoc.toNodexNode('task_1')!;
    const mappings = getDoneStateMappings(node);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].uncheckedOptionIds).toEqual(['opt_todo']);
  });

  it('returns empty when doneStateEnabled=false (toggleOff)', () => {
    setupDoneMapping({ toggleOff: true });
    const node = loroDoc.toNodexNode('task_1')!;
    expect(getDoneStateMappings(node)).toEqual([]);
  });

  it('returns empty when doneStateEnabled=true but no mapping entries', () => {
    setupDoneMapping({ skipMapping: true });
    const node = loroDoc.toNodexNode('task_1')!;
    expect(getDoneStateMappings(node)).toEqual([]);
  });
});

describe('resolveForwardDoneMapping', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns first checkedOptionId when isDone=true', () => {
    setupDoneMapping({ uncheckedOptionId: 'opt_todo' });
    const node = loroDoc.toNodexNode('task_1')!;
    const result = resolveForwardDoneMapping(node, true);
    expect(result).toEqual([{ fieldDefId: 'attrDef_status', optionId: 'opt_done' }]);
  });

  it('returns first uncheckedOptionId when isDone=false', () => {
    setupDoneMapping({ uncheckedOptionId: 'opt_todo' });
    const node = loroDoc.toNodexNode('task_1')!;
    const result = resolveForwardDoneMapping(node, false);
    expect(result).toEqual([{ fieldDefId: 'attrDef_status', optionId: 'opt_todo' }]);
  });

  it('returns empty when isDone=false and no unchecked configured', () => {
    setupDoneMapping(); // no uncheckedOptionId
    const node = loroDoc.toNodexNode('task_1')!;
    const result = resolveForwardDoneMapping(node, false);
    expect(result).toEqual([]);
  });

  it('returns empty when no mappings exist', () => {
    // no doneStateEnabled set
    const node = loroDoc.toNodexNode('task_1')!;
    const result = resolveForwardDoneMapping(node, true);
    expect(result).toEqual([]);
  });
});

describe('resolveReverseDoneMapping', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns { newDone: true } when option matches checkedOptionId', () => {
    setupDoneMapping({ uncheckedOptionId: 'opt_todo' });
    const node = loroDoc.toNodexNode('task_1')!;
    expect(resolveReverseDoneMapping(node, 'attrDef_status', 'opt_done')).toEqual({ newDone: true });
  });

  it('returns { newDone: false } when option matches uncheckedOptionId', () => {
    setupDoneMapping({ uncheckedOptionId: 'opt_todo' });
    const node = loroDoc.toNodexNode('task_1')!;
    expect(resolveReverseDoneMapping(node, 'attrDef_status', 'opt_todo')).toEqual({ newDone: false });
  });

  it('returns null when option is unrelated to any mapping', () => {
    setupDoneMapping({ uncheckedOptionId: 'opt_todo' });
    const node = loroDoc.toNodexNode('task_1')!;
    expect(resolveReverseDoneMapping(node, 'attrDef_status', 'opt_in_progress')).toBeNull();
  });

  it('returns null when fieldDefId does not match any mapping', () => {
    setupDoneMapping();
    const node = loroDoc.toNodexNode('task_1')!;
    expect(resolveReverseDoneMapping(node, 'attrDef_priority', 'opt_done')).toBeNull();
  });

  it('returns null when no mappings configured', () => {
    const node = loroDoc.toNodexNode('task_1')!;
    expect(resolveReverseDoneMapping(node, 'attrDef_status', 'opt_done')).toBeNull();
  });
});

describe('Store: addDoneMappingEntry / removeDoneMappingEntry', () => {
  beforeEach(() => {
    resetAndSeed();
    loroDoc.setNodeData('tagDef_task', 'doneStateEnabled', true);
  });

  it('addDoneMappingEntry: entry is reflected in getDoneStateMappings', () => {
    const store = useNodeStore.getState();
    store.addDoneMappingEntry('tagDef_task', true, 'attrDef_status', 'opt_done');

    const node = loroDoc.toNodexNode('task_1')!;
    const mappings = getDoneStateMappings(node);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].checkedOptionIds).toContain('opt_done');
  });

  it('addDoneMappingEntry: persists as fieldEntry outliner tree', () => {
    const store = useNodeStore.getState();
    store.addDoneMappingEntry('tagDef_task', true, 'attrDef_status', 'opt_done');

    const checkedTupleId = loroDoc.getChildren('tagDef_task').find((cid) => {
      const node = loroDoc.toNodexNode(cid);
      return node?.type === 'fieldEntry' && node.fieldDefId === SYS_A.DONE_MAP_CHECKED;
    });
    expect(checkedTupleId).toBeTruthy();

    const mappingEntryId = loroDoc.getChildren(checkedTupleId!).find((cid) => {
      const node = loroDoc.toNodexNode(cid);
      return node?.type === 'fieldEntry' && node.fieldDefId === 'attrDef_status';
    });
    expect(mappingEntryId).toBeTruthy();

    const valueNodeId = loroDoc.getChildren(mappingEntryId!)[0];
    const valueNode = valueNodeId ? loroDoc.toNodexNode(valueNodeId) : null;
    expect(valueNode?.targetId).toBe('opt_done');
  });

  it('removeDoneMappingEntry: removes by index', () => {
    const store = useNodeStore.getState();
    store.addDoneMappingEntry('tagDef_task', true, 'attrDef_status', 'opt_done');
    store.addDoneMappingEntry('tagDef_task', true, 'attrDef_status', 'opt_in_progress');

    store.removeDoneMappingEntry('tagDef_task', true, 0);

    const node = loroDoc.toNodexNode('task_1')!;
    const mappings = getDoneStateMappings(node);
    // Only one entry remains
    expect(mappings[0].checkedOptionIds).toHaveLength(1);
    expect(mappings[0].checkedOptionIds).toContain('opt_in_progress');
  });

  it('unchecked mapping is separate from checked', () => {
    const store = useNodeStore.getState();
    store.addDoneMappingEntry('tagDef_task', true, 'attrDef_status', 'opt_done');
    store.addDoneMappingEntry('tagDef_task', false, 'attrDef_status', 'opt_todo');

    const node = loroDoc.toNodexNode('task_1')!;
    const mappings = getDoneStateMappings(node);
    expect(mappings).toHaveLength(1);
    expect(mappings[0].checkedOptionIds).toEqual(['opt_done']);
    expect(mappings[0].uncheckedOptionIds).toEqual(['opt_todo']);
  });
});

describe('Store: toggleNodeDone with done-state mapping', () => {
  beforeEach(() => {
    resetAndSeed();
    loroDoc.setNodeData('tagDef_task', 'doneStateEnabled', true);
    useNodeStore.getState().addDoneMappingEntry('tagDef_task', true, 'attrDef_status', 'opt_done');
    useNodeStore.getState().addDoneMappingEntry('tagDef_task', false, 'attrDef_status', 'opt_todo');
  });

  it('toggleNodeDone: undone → done sets field to checkedOptionId', () => {
    useNodeStore.getState().toggleNodeDone('task_1');
    const task = loroDoc.toNodexNode('task_1')!;
    expect(task.completedAt).toBeGreaterThan(0);

    // Check fieldEntry for attrDef_status has opt_done as value
    const feId = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(feId).toBeTruthy();
    const valueIds = loroDoc.getChildren(feId!);
    expect(valueIds.length).toBeGreaterThan(0);
    const value = loroDoc.toNodexNode(valueIds[0]);
    expect(value?.name).toBe('opt_done');
  });

  it('toggleNodeDone: done → undone sets field to uncheckedOptionId', () => {
    loroDoc.setNodeData('task_1', 'completedAt', Date.now());
    useNodeStore.getState().toggleNodeDone('task_1');
    const task = loroDoc.toNodexNode('task_1')!;
    expect(task.completedAt).toBeUndefined();
  });

  it('toggleNodeDone performs a single commit even with doneMappings', () => {
    const beforeVersion = useNodeStore.getState()._version;
    useNodeStore.getState().toggleNodeDone('task_1');
    const afterVersion = useNodeStore.getState()._version;
    expect(afterVersion - beforeVersion).toBe(1);
  });
});
