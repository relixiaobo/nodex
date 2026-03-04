/**
 * Tests for field auto-initialization strategies.
 * Verifies that applyTag() auto-fills fields when autoInitialize is configured.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { AUTO_INIT_STRATEGY, FIELD_TYPES, SYS_T } from '../../src/types/index.js';
import { resolveAutoInitValue, parseAutoInitStrategies, serializeAutoInitStrategies, resolveAutoInit } from '../../src/lib/field-auto-init.js';
import type { AutoInitResult } from '../../src/lib/field-auto-init.js';
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

  it('current_date returns text result with today in ISO format', () => {
    const result = resolveAutoInitValue('task_1', 'attrDef_due', AUTO_INIT_STRATEGY.CURRENT_DATE);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('text');
    const today = new Date().toISOString().slice(0, 10);
    expect((result as Extract<AutoInitResult, { kind: 'text' }>).value).toBe(today);
  });

  it('ancestor_day_node returns null when no day node in ancestry', () => {
    const result = resolveAutoInitValue('task_1', 'attrDef_due', AUTO_INIT_STRATEGY.ANCESTOR_DAY_NODE);
    // task_1 is under proj_1 which is a regular node, no day node ancestor
    expect(result).toBeNull();
  });

  it('ancestor_day_node returns text result with date from day node ancestor', () => {
    const store = useNodeStore.getState();
    // Create a day node and put a child under it
    const dayNode = store.createChild('proj_1', undefined, { name: '2026-03-01' });
    loroDoc.addTag(dayNode.id, 'sys:day');
    loroDoc.commitDoc();

    const childNode = store.createChild(dayNode.id, undefined, { name: 'Meeting notes' });

    const result = resolveAutoInitValue(childNode.id, 'attrDef_due', AUTO_INIT_STRATEGY.ANCESTOR_DAY_NODE);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('text');
    expect((result as Extract<AutoInitResult, { kind: 'text' }>).value).toBe('2026-03-01');
  });

  it('ancestor_field_value returns text result with value from ancestor field', () => {
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
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('text');
    expect((result as Extract<AutoInitResult, { kind: 'text' }>).value).toBe('opt_in_progress');
  });

  it('ancestor_field_value returns null when no ancestor has the field', () => {
    const store = useNodeStore.getState();
    const node = store.createChild('proj_1', undefined, { name: 'Orphan' });
    const result = resolveAutoInitValue(node.id, 'attrDef_status', AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE);
    expect(result).toBeNull();
  });

  it('ancestor_supertag_ref returns reference result when tagged ancestor exists', () => {
    const store = useNodeStore.getState();

    // Create a fieldDef with sourceSupertag pointing to tagDef_source
    const tagDef = store.createTagDef('RefTag', { color: 'green' });
    const fieldDef = store.createFieldDef('Source', FIELD_TYPES.OPTIONS_FROM_SUPERTAG, tagDef.id);
    loroDoc.setNodeDataBatch(fieldDef.id, { sourceSupertag: SYS_T.SOURCE });
    loroDoc.commitDoc();

    // webclip_1 is already tagged with #source in seed data
    // Create a child node under webclip_1
    const child = store.createChild('webclip_1', undefined, { name: 'child node' });

    const result = resolveAutoInitValue(child.id, fieldDef.id, AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('reference');
    expect((result as Extract<AutoInitResult, { kind: 'reference' }>).targetId).toBe('webclip_1');
  });

  it('ancestor_supertag_ref returns null when no tagged ancestor exists', () => {
    const store = useNodeStore.getState();

    const tagDef = store.createTagDef('RefTag2', { color: 'blue' });
    const fieldDef = store.createFieldDef('Source', FIELD_TYPES.OPTIONS_FROM_SUPERTAG, tagDef.id);
    loroDoc.setNodeDataBatch(fieldDef.id, { sourceSupertag: SYS_T.SOURCE });
    loroDoc.commitDoc();

    // proj_1 is NOT tagged with #source
    const child = store.createChild('proj_1', undefined, { name: 'orphan' });

    const result = resolveAutoInitValue(child.id, fieldDef.id, AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF);
    expect(result).toBeNull();
  });

  it('ancestor_supertag_ref returns null when fieldDef has no sourceSupertag', () => {
    const store = useNodeStore.getState();

    const tagDef = store.createTagDef('NoSrcTag', { color: 'red' });
    const fieldDef = store.createFieldDef('Ref', FIELD_TYPES.PLAIN, tagDef.id);
    // No sourceSupertag set

    const child = store.createChild('webclip_1', undefined, { name: 'test' });

    const result = resolveAutoInitValue(child.id, fieldDef.id, AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF);
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

  it('auto-fills reference from ancestor_supertag_ref strategy', () => {
    const store = useNodeStore.getState();

    // Create tag with options_from_supertag field + ancestor_supertag_ref
    const tagDef = store.createTagDef('RefAutoTag', { color: 'amber' });
    const fieldDef = store.createFieldDef('Source', FIELD_TYPES.OPTIONS_FROM_SUPERTAG, tagDef.id);
    loroDoc.setNodeDataBatch(fieldDef.id, {
      sourceSupertag: SYS_T.SOURCE,
      autoInitialize: AUTO_INIT_STRATEGY.ANCESTOR_SUPERTAG_REF,
    });
    loroDoc.commitDoc();

    // Create node under webclip_1 (tagged with #source) and apply tag
    const child = store.createChild('webclip_1', undefined, { name: 'Ref test' });
    store.applyTag(child.id, tagDef.id);

    const feId = findFieldEntry(child.id, fieldDef.id);
    expect(feId).toBeTruthy();

    const feChildren = loroDoc.getChildren(feId!);
    expect(feChildren.length).toBe(1);

    const valueNode = loroDoc.toNodexNode(feChildren[0]);
    // Should be a reference (targetId), not text (name)
    expect(valueNode?.targetId).toBe('webclip_1');
    expect(valueNode?.name).toBeFalsy();
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

  it('auto-fills with comma-separated multiple strategies (first match wins)', () => {
    const store = useNodeStore.getState();

    // Create a tag with a Date field, enable both current_date and ancestor_field_value
    const tagDef = store.createTagDef('MultiTag', { color: 'purple' });
    const fieldDef = store.createFieldDef('Date', 'date', tagDef.id);
    loroDoc.setNodeData(
      fieldDef.id,
      'autoInitialize',
      `${AUTO_INIT_STRATEGY.CURRENT_DATE},${AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE}`,
    );
    loroDoc.commitDoc();

    // Apply tag — current_date has higher priority, so it should win
    const node = store.createChild('proj_1', undefined, { name: 'Multi test' });
    store.applyTag(node.id, tagDef.id);

    const feId = findFieldEntry(node.id, fieldDef.id);
    expect(feId).toBeTruthy();

    const feChildren = loroDoc.getChildren(feId!);
    expect(feChildren.length).toBe(1);

    const valueNode = loroDoc.toNodexNode(feChildren[0]);
    // current_date wins — should be today's ISO date
    expect(valueNode?.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseAutoInitStrategies', () => {
  it('returns empty array for undefined/empty', () => {
    expect(parseAutoInitStrategies(undefined)).toEqual([]);
    expect(parseAutoInitStrategies('')).toEqual([]);
  });

  it('parses single strategy (backward compat)', () => {
    expect(parseAutoInitStrategies('current_date')).toEqual(['current_date']);
  });

  it('parses comma-separated strategies', () => {
    expect(parseAutoInitStrategies('current_date,ancestor_field_value')).toEqual([
      'current_date',
      'ancestor_field_value',
    ]);
  });

  it('filters out invalid strategy names', () => {
    expect(parseAutoInitStrategies('current_date,invalid_strategy')).toEqual(['current_date']);
  });

  it('handles whitespace around commas', () => {
    expect(parseAutoInitStrategies('current_date , ancestor_day_node')).toEqual([
      'current_date',
      'ancestor_day_node',
    ]);
  });
});

describe('serializeAutoInitStrategies', () => {
  it('returns undefined for empty array', () => {
    expect(serializeAutoInitStrategies([])).toBeUndefined();
  });

  it('joins strategies with comma', () => {
    expect(serializeAutoInitStrategies(['current_date', 'ancestor_field_value'])).toBe(
      'current_date,ancestor_field_value',
    );
  });
});

describe('resolveAutoInit — multi-strategy', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('returns null for undefined/empty raw string', () => {
    expect(resolveAutoInit('task_1', 'attrDef_due', undefined)).toBeNull();
    expect(resolveAutoInit('task_1', 'attrDef_due', '')).toBeNull();
  });

  it('resolves single strategy (backward compat)', () => {
    const result = resolveAutoInit('task_1', 'attrDef_due', AUTO_INIT_STRATEGY.CURRENT_DATE);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('text');
  });

  it('tries strategies in priority order, not string order', () => {
    // ancestor_field_value listed first in string, but current_date has higher priority
    const result = resolveAutoInit(
      'task_1',
      'attrDef_due',
      `${AUTO_INIT_STRATEGY.ANCESTOR_FIELD_VALUE},${AUTO_INIT_STRATEGY.CURRENT_DATE}`,
    );
    expect(result).not.toBeNull();
    // current_date has higher priority → should return today's date
    const today = new Date().toISOString().slice(0, 10);
    expect((result as Extract<AutoInitResult, { kind: 'text' }>).value).toBe(today);
  });
});
