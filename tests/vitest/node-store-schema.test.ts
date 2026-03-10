/**
 * node-store schema flows — Loro model.
 * createTagDef: creates type='tagDef' in SCHEMA with direct properties.
 * No SYS_T01 meta bindings. No config entry indirection. Just flat properties.
 * createFieldDef: creates type='fieldDef' under tagDef.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { collectNodeGraphErrors } from './helpers/invariants.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { FIELD_TYPES } from '../../src/types/system-nodes.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('createTagDef', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates node with type=tagDef in SCHEMA', () => {
    const created = useNodeStore.getState().createTagDef('My New Tag');
    const tagDef = loroDoc.toNodexNode(created.id)!;
    expect(tagDef.type).toBe('tagDef');
    expect(tagDef.name).toBe('My New Tag');
    expect(loroDoc.getParentId(created.id)).toBe(CONTAINER_IDS.SCHEMA);
    expect(loroDoc.getChildren(CONTAINER_IDS.SCHEMA)).toContain(created.id);
  });

  it('sets showCheckbox when option provided', () => {
    const created = useNodeStore.getState().createTagDef('Checkbox Tag', { showCheckbox: true });
    const tagDef = loroDoc.toNodexNode(created.id)!;
    expect(tagDef.showCheckbox).toBe(true);
  });

  it('sets color when option provided', () => {
    const created = useNodeStore.getState().createTagDef('Colored Tag', { color: 'green' });
    const tagDef = loroDoc.toNodexNode(created.id)!;
    expect(tagDef.color).toBe('green');
  });

  it('no SYS_T01 meta bindings (no meta indirection)', () => {
    const created = useNodeStore.getState().createTagDef('Clean Tag');
    const tagDef = loroDoc.toNodexNode(created.id)!;
    // New model has no meta array or config entry indirection
    expect(tagDef.tags ?? []).toHaveLength(0);
  });

  it('graph is valid after createTagDef', () => {
    useNodeStore.getState().createTagDef('Test Tag');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('createFieldDef', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('creates node with type=fieldDef under tagDef', () => {
    const created = useNodeStore.getState().createFieldDef('Estimate', FIELD_TYPES.NUMBER, 'tagDef_task');
    const fd = loroDoc.toNodexNode(created.id)!;
    expect(fd.type).toBe('fieldDef');
    expect(fd.name).toBe('Estimate');
    expect(fd.fieldType).toBe(FIELD_TYPES.NUMBER);
    expect(loroDoc.getParentId(created.id)).toBe('tagDef_task');
  });

  it('adds fieldDef to tagDef children', () => {
    const created = useNodeStore.getState().createFieldDef('Notes', FIELD_TYPES.PLAIN, 'tagDef_task');
    expect(loroDoc.getChildren('tagDef_task')).toContain(created.id);
  });

  it('graph is valid after createFieldDef', () => {
    useNodeStore.getState().createFieldDef('Score', FIELD_TYPES.NUMBER, 'tagDef_task');
    expect(collectNodeGraphErrors()).toEqual([]);
  });
});

describe('changeFieldType', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('updates fieldType on a fieldDef', () => {
    useNodeStore.getState().changeFieldType('attrDef_status', FIELD_TYPES.PLAIN);
    const fd = loroDoc.toNodexNode('attrDef_status')!;
    expect(fd.fieldType).toBe(FIELD_TYPES.PLAIN);
  });
});
