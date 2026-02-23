/**
 * node-store guard rails — Loro model.
 * In the Loro migration, validation is simplified:
 * - setConfigValue: directly sets config, no tuple indirection
 * - addFieldOption: creates option under fieldDef (no validation on wrong target)
 * - removeFieldOption: just deletes (no ownership check)
 * - replaceFieldDef: just sets fieldDefId (no ownership validation)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('setConfigValue', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('sets a config property directly on the node', () => {
    useNodeStore.getState().setConfigValue('tagDef_task', 'color', 'violet');
    const tagDef = loroDoc.toNodexNode('tagDef_task')!;
    expect(tagDef.color).toBe('violet');
  });

  it('sets showCheckbox on tagDef', () => {
    useNodeStore.getState().setConfigValue('tagDef_task', 'showCheckbox', true);
    const tagDef = loroDoc.toNodexNode('tagDef_task')!;
    expect(tagDef.showCheckbox).toBe(true);
  });

  it('sets childSupertag on tagDef', () => {
    useNodeStore.getState().setConfigValue('tagDef_task', 'childSupertag', 'tagDef_dev_task');
    const tagDef = loroDoc.toNodexNode('tagDef_task')!;
    expect(tagDef.childSupertag).toBe('tagDef_dev_task');
  });

  it('graph is valid after setConfigValue', () => {
    useNodeStore.getState().setConfigValue('tagDef_task', 'color', 'blue');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('addFieldOption', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates option node under fieldDef and returns optionId', () => {
    const optId = useNodeStore.getState().addFieldOption('attrDef_status', 'Blocked');
    expect(optId).toBeTruthy();
    const opt = loroDoc.toNodexNode(optId)!;
    expect(opt.name).toBe('Blocked');
    expect(loroDoc.getParentId(optId)).toBe('attrDef_status');
  });

  it('adds new option to fieldDef children', () => {
    const beforeCount = loroDoc.getChildren('attrDef_status').length;
    useNodeStore.getState().addFieldOption('attrDef_status', 'Blocked');
    expect(loroDoc.getChildren('attrDef_status').length).toBe(beforeCount + 1);
  });

  it('graph is valid after addFieldOption', () => {
    useNodeStore.getState().addFieldOption('attrDef_priority', 'Critical');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('removeFieldOption', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('deletes option node from LoroDoc', () => {
    expect(loroDoc.hasNode('opt_low')).toBe(true);

    useNodeStore.getState().removeFieldOption('attrDef_priority', 'opt_low');

    expect(loroDoc.hasNode('opt_low')).toBe(false);
    expect(loroDoc.getChildren('attrDef_priority')).not.toContain('opt_low');
  });

  it('graph is valid after removeFieldOption', () => {
    useNodeStore.getState().removeFieldOption('attrDef_priority', 'opt_low');
    expect(collectNodeGraphErrors()).toEqual([]);
  });

  it('is a no-op for nonexistent option (does not throw)', () => {
    expect(() => useNodeStore.getState().removeFieldOption('attrDef_status', 'nonexistent_opt')).not.toThrow();
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

  it('placeholder fieldDef has type fieldDef and empty name', () => {
    const result = useNodeStore.getState().addUnnamedFieldToNode('note_2');
    const fd = loroDoc.toNodexNode(result.fieldDefId)!;
    expect(fd.type).toBe('fieldDef');
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

  it('sets new fieldDefId regardless of node ownership (no validation in Loro model)', () => {
    const { fieldEntryId, fieldDefId: placeholderFdId } = useNodeStore.getState().addUnnamedFieldToNode('note_2');

    // In old model this would check ownership; in Loro model it just sets
    useNodeStore.getState().replaceFieldDef('note_2', fieldEntryId, placeholderFdId, 'attrDef_status');

    const fe = loroDoc.toNodexNode(fieldEntryId)!;
    expect(fe.fieldDefId).toBe('attrDef_status');
  });

  it('graph is valid after replaceFieldDef', () => {
    const { fieldEntryId, fieldDefId: placeholderFdId } = useNodeStore.getState().addUnnamedFieldToNode('note_2');
    useNodeStore.getState().replaceFieldDef('note_2', fieldEntryId, placeholderFdId, 'attrDef_status');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('workspace container immutability', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('moveNodeTo does not move workspace containers', () => {
    const originalParent = loroDoc.getParentId('INBOX');
    useNodeStore.getState().moveNodeTo('INBOX', 'proj_1', 0);
    expect(loroDoc.getParentId('INBOX')).toBe(originalParent);
    expect(loroDoc.getChildren('proj_1')).not.toContain('INBOX');
  });

  it('trashNode ignores workspace containers', () => {
    const originalParent = loroDoc.getParentId('INBOX');
    const trashChildrenBefore = loroDoc.getChildren('TRASH');
    useNodeStore.getState().trashNode('INBOX');
    expect(loroDoc.getParentId('INBOX')).toBe(originalParent);
    expect(loroDoc.getChildren('TRASH')).toEqual(trashChildrenBefore);
  });

  it('indent/move up/down are no-op for workspace containers', () => {
    const originalParent = loroDoc.getParentId('INBOX');
    expect(() => useNodeStore.getState().indentNode('INBOX')).not.toThrow();
    expect(() => useNodeStore.getState().moveNodeUp('INBOX')).not.toThrow();
    expect(() => useNodeStore.getState().moveNodeDown('INBOX')).not.toThrow();
    expect(loroDoc.getParentId('INBOX')).toBe(originalParent);
  });
});

describe('system root immutability', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('moveNodeTo does not move workspace home node', () => {
    expect(loroDoc.getParentId('ws_default')).toBeNull();
    useNodeStore.getState().moveNodeTo('ws_default', 'proj_1', 0);
    expect(loroDoc.getParentId('ws_default')).toBeNull();
    expect(loroDoc.getChildren('proj_1')).not.toContain('ws_default');
  });

  it('trashNode ignores workspace home node', () => {
    const trashBefore = loroDoc.getChildren(CONTAINER_IDS.TRASH);
    useNodeStore.getState().trashNode('ws_default');
    expect(loroDoc.getParentId('ws_default')).toBeNull();
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH)).toEqual(trashBefore);
  });

  it('setNodeName ignores workspace home and containers', () => {
    useNodeStore.getState().setNodeName('ws_default', 'Renamed Workspace');
    useNodeStore.getState().setNodeName(CONTAINER_IDS.INBOX, 'Renamed Inbox');

    expect(loroDoc.toNodexNode('ws_default')?.name).toBe('Workspace');
    expect(loroDoc.toNodexNode(CONTAINER_IDS.INBOX)?.name).toBe('Inbox');
  });

  it('updateNodeDescription ignores workspace home and containers', () => {
    useNodeStore.getState().updateNodeDescription('ws_default', 'root desc');
    useNodeStore.getState().updateNodeDescription(CONTAINER_IDS.LIBRARY, 'library desc');

    expect(loroDoc.toNodexNode('ws_default')?.description).toBeUndefined();
    expect(loroDoc.toNodexNode(CONTAINER_IDS.LIBRARY)?.description).toBeUndefined();
  });
});

describe('detached checkout write guard', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('createChild in detached mode is no-op and does not throw', () => {
    const beforeName = loroDoc.toNodexNode('proj_1')?.name ?? '';
    loroDoc.setNodeRichTextContent('proj_1', `${beforeName}__latest`, [], []);
    loroDoc.commitDoc();
    const latestName = loroDoc.toNodexNode('proj_1')?.name;
    const frontiers = loroDoc.getCurrentFrontiers();
    loroDoc.setNodeRichTextContent('proj_1', `${beforeName}__newer`, [], []);
    loroDoc.commitDoc();
    const before = loroDoc.getChildren('proj_1').slice();

    loroDoc.checkout(frontiers);
    expect(loroDoc.isDetached()).toBe(true);
    expect(loroDoc.toNodexNode('proj_1')?.name).toBe(latestName);

    expect(() => useNodeStore.getState().createChild('proj_1')).not.toThrow();
    expect(loroDoc.getChildren('proj_1')).toEqual(before);

    loroDoc.checkoutToLatest();
  });

  it('setNodeName in detached mode is no-op', () => {
    const beforeName = loroDoc.toNodexNode('idea_1')?.name ?? '';
    loroDoc.setNodeRichTextContent('idea_1', `${beforeName}__latest`, [], []);
    loroDoc.commitDoc();
    const latestName = loroDoc.toNodexNode('idea_1')?.name;
    const frontiers = loroDoc.getCurrentFrontiers();
    loroDoc.setNodeRichTextContent('idea_1', `${beforeName}__newer`, [], []);
    loroDoc.commitDoc();

    loroDoc.checkout(frontiers);
    expect(loroDoc.isDetached()).toBe(true);
    expect(loroDoc.toNodexNode('idea_1')?.name).toBe(latestName);

    useNodeStore.getState().setNodeName('idea_1', 'changed-in-detached');
    loroDoc.commitDoc();
    expect(loroDoc.toNodexNode('idea_1')?.name).toBe(latestName);

    loroDoc.checkoutToLatest();
  });
});
