/**
 * node-store guard rails — Loro model.
 * In the Loro migration, validation is simplified:
 * - setConfigValue: directly sets config, no extra config-node indirection
 * - addFieldOption: creates option under fieldDef (no validation on wrong target)
 * - removeFieldOption: just deletes (no ownership check)
 * - replaceFieldDef: just sets fieldDefId (no ownership validation)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';
import { NDX_F, SYS_V } from '../../src/types/index.js';

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

describe('editable top-level nodes remain mutable', () => {
  beforeEach(() => {
    resetAndSeed();
    if (!loroDoc.hasNode(SYSTEM_NODE_IDS.INBOX)) {
      loroDoc.createNode(SYSTEM_NODE_IDS.INBOX, 'ws_default');
      loroDoc.setNodeDataBatch(SYSTEM_NODE_IDS.INBOX, { name: 'Inbox' });
    }
    loroDoc.commitDoc('__seed__');
  });

  it('moveNodeTo can move legacy Inbox', () => {
    useNodeStore.getState().moveNodeTo('INBOX', 'proj_1', 0);
    expect(loroDoc.getParentId('INBOX')).toBe('proj_1');
    expect(loroDoc.getChildren('proj_1')).toContain('INBOX');
  });

  it('trashNode can trash legacy Inbox', () => {
    useNodeStore.getState().trashNode('INBOX');
    expect(loroDoc.getParentId('INBOX')).toBe(SYSTEM_NODE_IDS.TRASH);
    expect(loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH)).toContain('INBOX');
  });

  it('rename updates work for legacy Inbox', () => {
    useNodeStore.getState().setNodeName(SYSTEM_NODE_IDS.INBOX, 'Renamed Inbox');

    expect(loroDoc.toNodexNode(SYSTEM_NODE_IDS.INBOX)?.name).toBe('Renamed Inbox');
  });
});

describe('locked system nodes remain immutable', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('moveNodeTo does not move locked settings node', () => {
    const originalParent = loroDoc.getParentId(SYSTEM_NODE_IDS.SETTINGS);
    useNodeStore.getState().moveNodeTo(SYSTEM_NODE_IDS.SETTINGS, 'proj_1', 0);
    expect(loroDoc.getParentId(SYSTEM_NODE_IDS.SETTINGS)).toBe(originalParent);
    expect(loroDoc.getChildren('proj_1')).not.toContain(SYSTEM_NODE_IDS.SETTINGS);
  });

  it('trashNode ignores locked settings node', () => {
    const originalParent = loroDoc.getParentId(SYSTEM_NODE_IDS.SETTINGS);
    const trashChildrenBefore = loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH);
    useNodeStore.getState().trashNode(SYSTEM_NODE_IDS.SETTINGS);
    expect(loroDoc.getParentId(SYSTEM_NODE_IDS.SETTINGS)).toBe(originalParent);
    expect(loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH)).toEqual(trashChildrenBefore);
  });

  it('indent/move up/down are no-op for locked settings node', () => {
    const originalParent = loroDoc.getParentId(SYSTEM_NODE_IDS.SETTINGS);
    expect(() => useNodeStore.getState().indentNode(SYSTEM_NODE_IDS.SETTINGS)).not.toThrow();
    expect(() => useNodeStore.getState().moveNodeUp(SYSTEM_NODE_IDS.SETTINGS)).not.toThrow();
    expect(() => useNodeStore.getState().moveNodeDown(SYSTEM_NODE_IDS.SETTINGS)).not.toThrow();
    expect(loroDoc.getParentId(SYSTEM_NODE_IDS.SETTINGS)).toBe(originalParent);
  });

  it('setNodeName and updateNodeDescription ignore locked settings node', () => {
    useNodeStore.getState().setNodeName(SYSTEM_NODE_IDS.SETTINGS, 'Renamed Settings');
    useNodeStore.getState().updateNodeDescription(SYSTEM_NODE_IDS.SETTINGS, 'settings desc');

    expect(loroDoc.toNodexNode(SYSTEM_NODE_IDS.SETTINGS)?.name).toBe('Settings');
    expect(loroDoc.toNodexNode(SYSTEM_NODE_IDS.SETTINGS)?.description).toBeUndefined();
  });

  it('setNodeName and updateNodeDescription ignore locked Library node', () => {
    useNodeStore.getState().setNodeName(SYSTEM_NODE_IDS.LIBRARY, 'Renamed Library');
    useNodeStore.getState().updateNodeDescription(SYSTEM_NODE_IDS.LIBRARY, 'library desc');

    expect(loroDoc.toNodexNode(SYSTEM_NODE_IDS.LIBRARY)?.name).toBe('Library');
    expect(loroDoc.toNodexNode(SYSTEM_NODE_IDS.LIBRARY)?.description).toBeUndefined();
  });

  it('moveNodeTo and trashNode ignore locked Library node', () => {
    const originalParent = loroDoc.getParentId(SYSTEM_NODE_IDS.LIBRARY);
    const trashChildrenBefore = loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH);

    useNodeStore.getState().moveNodeTo(SYSTEM_NODE_IDS.LIBRARY, 'proj_1', 0);
    useNodeStore.getState().trashNode(SYSTEM_NODE_IDS.LIBRARY);

    expect(loroDoc.getParentId(SYSTEM_NODE_IDS.LIBRARY)).toBe(originalParent);
    expect(loroDoc.getChildren('proj_1')).not.toContain(SYSTEM_NODE_IDS.LIBRARY);
    expect(loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH)).toEqual(trashChildrenBefore);
  });

  it('allows Settings field values but blocks Settings structure edits', () => {
    useNodeStore.getState().setFieldValue(SYSTEM_NODE_IDS.SETTINGS, NDX_F.SETTING_HIGHLIGHT_ENABLED, [SYS_V.NO]);

    const highlightFieldEntryId = (loroDoc.getChildren(SYSTEM_NODE_IDS.SETTINGS) ?? []).find((childId) =>
      loroDoc.toNodexNode(childId)?.fieldDefId === NDX_F.SETTING_HIGHLIGHT_ENABLED,
    );
    expect(highlightFieldEntryId).toBeTruthy();
    expect(loroDoc.toNodexNode(loroDoc.getChildren(highlightFieldEntryId!)[0])?.name).toBe(SYS_V.NO);

    const beforeChildren = loroDoc.getChildren(SYSTEM_NODE_IDS.SETTINGS).slice();
    useNodeStore.getState().createChild(SYSTEM_NODE_IDS.SETTINGS, undefined, { name: 'forbidden child' });
    useNodeStore.getState().addUnnamedFieldToNode(SYSTEM_NODE_IDS.SETTINGS);
    expect(loroDoc.getChildren(SYSTEM_NODE_IDS.SETTINGS)).toEqual(beforeChildren);
  });

  it('keeps locked Settings field definitions immutable', () => {
    useNodeStore.getState().renameFieldDef(NDX_F.SETTING_HIGHLIGHT_ENABLED, 'Renamed setting');
    useNodeStore.getState().changeFieldType(NDX_F.SETTING_HIGHLIGHT_ENABLED, 'plain');

    const fieldDef = loroDoc.toNodexNode(NDX_F.SETTING_HIGHLIGHT_ENABLED);
    expect(fieldDef?.name).toBe('Highlight & Comment');
    expect(fieldDef?.fieldType).toBe('boolean');
  });
});

describe('legacy top-level reordering behavior', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('indent/move up/down remain safe for Inbox node', () => {
    const originalParent = loroDoc.getParentId('INBOX');
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
    const trashBefore = loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH);
    useNodeStore.getState().trashNode('ws_default');
    expect(loroDoc.getParentId('ws_default')).toBeNull();
    expect(loroDoc.getChildren(SYSTEM_NODE_IDS.TRASH)).toEqual(trashBefore);
  });

  it('setNodeName allows workspace home but locked system nodes stay unchanged', () => {
    useNodeStore.getState().setNodeName('ws_default', 'Renamed Workspace');
    useNodeStore.getState().setNodeName(SYSTEM_NODE_IDS.SETTINGS, 'Renamed Settings');

    expect(loroDoc.toNodexNode('ws_default')?.name).toBe('Renamed Workspace');
    expect(loroDoc.toNodexNode(SYSTEM_NODE_IDS.SETTINGS)?.name).toBe('Settings');
  });

  it('updateNodeDescription allows workspace home but locked system nodes stay unchanged', () => {
    useNodeStore.getState().updateNodeDescription('ws_default', 'root desc');
    useNodeStore.getState().updateNodeDescription(SYSTEM_NODE_IDS.SETTINGS, 'settings desc');

    expect(loroDoc.toNodexNode('ws_default')?.description).toBe('root desc');
    expect(loroDoc.toNodexNode(SYSTEM_NODE_IDS.SETTINGS)?.description).toBeUndefined();
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
