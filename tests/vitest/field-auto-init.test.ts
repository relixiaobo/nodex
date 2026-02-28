/**
 * Tests for field auto-initialization strategies.
 * Verifies that applyTag() auto-fills fields when autoInitialize is configured.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { AUTO_INIT_STRATEGY } from '../../src/types/index.js';
import { resolveAutoInitValue } from '../../src/lib/field-auto-init.js';
import { resetAndSeed } from './helpers/test-state.js';

function findFieldEntry(nodeId: string, fieldDefId: string): string | null {
  const children = loroDoc.getChildren(nodeId);
  for (const cid of children) {
    const c = loroDoc.toNodexNode(cid);
    if (c?.type === 'fieldEntry' && c.fieldDefId === fieldDefId) return cid;
  }
  return null;
}

describe('resolveAutoInitValue — pure strategy functions', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('current_date returns today in ISO format', () => {
    const result = resolveAutoInitValue('task_1', 'attrDef_due', AUTO_INIT_STRATEGY.CURRENT_DATE);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Should be today's date
    const today = new Date().toISOString().slice(0, 10);
    expect(result).toBe(today);
  });

  it('ancestor_day_node returns null when no day node in ancestry', () => {
    const result = resolveAutoInitValue('task_1', 'attrDef_due', AUTO_INIT_STRATEGY.ANCESTOR_DAY_NODE);
    // task_1 is under proj_1 which is a regular node, no day node ancestor
    expect(result).toBeNull();
  });

  it('ancestor_day_node returns date from day node ancestor', () => {
    const store = useNodeStore.getState();
    // Create a day node and put a child under it
    const dayNode = store.createChild('proj_1', undefined, { name: '2026-03-01' });
    loroDoc.addTag(dayNode.id, 'sys:day');
    loroDoc.commitDoc();

    const childNode = store.createChild(dayNode.id, undefined, { name: 'Meeting notes' });

    const result = resolveAutoInitValue(childNode.id, 'attrDef_due', AUTO_INIT_STRATEGY.ANCESTOR_DAY_NODE);
    expect(result).toBe('2026-03-01');
  });

  it('ancestor_field_value returns value from ancestor field', () => {
    const store = useNodeStore.getState();

    // Create a parent with a Status field value
    const parent = store.createChild('proj_1', undefined, { name: 'Parent' });
    store.applyTag(parent.id, 'tagDef_task');

    // Set Status field value on parent
    store.setFieldValue(parent.id, 'attrDef_status', ['opt_in_progress']);

    // Create a child
    const child = store.createChild(parent.id, undefined, { name: 'Child' });

    // Resolve: child should inherit parent's Status
    const result = resolveAutoInitValue(child.id, 'attrDef_status', AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE);
    expect(result).toBe('opt_in_progress');
  });

  it('ancestor_field_value returns null when no ancestor has the field', () => {
    const store = useNodeStore.getState();
    const node = store.createChild('proj_1', undefined, { name: 'Orphan' });
    const result = resolveAutoInitValue(node.id, 'attrDef_status', AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE);
    expect(result).toBeNull();
  });
});

describe('applyTag with autoInitialize — integration', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('auto-fills date field with current_date strategy', () => {
    const store = useNodeStore.getState();

    // Create a tag with a Date field that has autoInitialize = current_date
    const tagDef = store.createTagDef('AutoTag', { color: 'green' });
    const fieldDef = store.createFieldDef('Created', 'date', tagDef.id);
    loroDoc.setNodeData(fieldDef.id, 'autoInitialize', AUTO_INIT_STRATEGY.CURRENT_DATE);
    loroDoc.commitDoc();

    // Apply tag to a fresh node
    const node = store.createChild('proj_1', undefined, { name: 'Auto test' });
    store.applyTag(node.id, tagDef.id);

    // Find the fieldEntry and check for auto-filled value
    const feId = findFieldEntry(node.id, fieldDef.id);
    expect(feId).toBeTruthy();

    const feChildren = loroDoc.getChildren(feId!);
    expect(feChildren.length).toBe(1);

    const valueNode = loroDoc.toNodexNode(feChildren[0]);
    expect(valueNode?.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('auto-fills from ancestor field value', () => {
    const store = useNodeStore.getState();

    // Create tag with a field that has autoInitialize = ancestor_field_value
    const tagDef = store.createTagDef('InheritTag', { color: 'blue' });
    const fieldDef = store.createFieldDef('Priority', 'plain', tagDef.id);
    loroDoc.setNodeData(fieldDef.id, 'autoInitialize', AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE);
    loroDoc.commitDoc();

    // Create parent with the same field set to a value
    const parent = store.createChild('proj_1', undefined, { name: 'Parent' });
    store.applyTag(parent.id, tagDef.id);
    store.setFieldValue(parent.id, fieldDef.id, ['high']);

    // Create child and apply same tag — should inherit 'high'
    const child = store.createChild(parent.id, undefined, { name: 'Child' });
    store.applyTag(child.id, tagDef.id);

    const feId = findFieldEntry(child.id, fieldDef.id);
    expect(feId).toBeTruthy();

    const feChildren = loroDoc.getChildren(feId!);
    expect(feChildren.length).toBe(1);
    expect(loroDoc.toNodexNode(feChildren[0])?.name).toBe('high');
  });

  it('does not auto-fill when field already has a value from template defaults', () => {
    const store = useNodeStore.getState();

    // Create tag with a fieldEntry template that has default value AND autoInitialize
    const tagDef = store.createTagDef('MixedTag', { color: 'red' });
    const { fieldEntryId, fieldDefId } = store.addUnnamedFieldToNode(tagDef.id);
    store.renameFieldDef(fieldDefId, 'Status');

    // Set a template default value
    store.createChild(fieldEntryId, undefined, { name: 'todo' });

    // Configure autoInitialize
    loroDoc.setNodeData(fieldDefId, 'autoInitialize', AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE);
    loroDoc.commitDoc();

    // Create parent with the field set to 'done'
    const parent = store.createChild('proj_1', undefined, { name: 'Parent' });
    store.applyTag(parent.id, tagDef.id);
    store.setFieldValue(parent.id, fieldDefId, ['done']);

    // Create child and apply tag — should use template default 'todo', not auto-init 'done'
    const child = store.createChild(parent.id, undefined, { name: 'Child' });
    store.applyTag(child.id, tagDef.id);

    const feId = findFieldEntry(child.id, fieldDefId);
    const feChildren = loroDoc.getChildren(feId!);
    expect(feChildren.length).toBe(1);
    // Template default takes precedence over auto-init (field is not empty after template clone)
    expect(loroDoc.toNodexNode(feChildren[0])?.name).toBe('todo');
  });

  it('does not auto-fill when no strategy configured', () => {
    const store = useNodeStore.getState();

    // Create tag with a date field but NO autoInitialize
    const tagDef = store.createTagDef('NoAutoTag', { color: 'orange' });
    store.createFieldDef('Due', 'date', tagDef.id);

    const node = store.createChild('proj_1', undefined, { name: 'No auto' });
    store.applyTag(node.id, tagDef.id);

    // Field should exist but be empty
    const children = loroDoc.getChildren(node.id);
    const fe = children.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry';
    });
    expect(fe).toBeTruthy();
    expect(loroDoc.getChildren(fe!).length).toBe(0);
  });
});
