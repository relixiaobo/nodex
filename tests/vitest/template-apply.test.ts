/**
 * Template application tests — verifies that applyTag() creates fieldEntries
 * for template fieldDefs AND clones template content nodes, and that
 * computeNodeFields() returns those fieldEntries correctly.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { computeNodeFields } from '../../src/hooks/use-node-fields.js';
import { buildVisibleChildrenRows, buildFieldOwnerColors } from '../../src/components/outliner/OutlinerItem.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resolveTagColor } from '../../src/lib/tag-colors.js';
import { resetAndSeed } from './helpers/test-state.js';

function getNode(id: string) {
  return loroDoc.toNodexNode(id);
}
function getChildren(parentId: string) {
  return loroDoc.getChildren(parentId)
    .map(id => loroDoc.toNodexNode(id))
    .filter((n): n is NonNullable<typeof n> => n !== null);
}

describe('template application — applyTag creates fieldEntries', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('task_1 has fieldEntries for all tagDef_task fieldDefs after applyTag', () => {
    // tagDef_task has: attrDef_status, attrDef_priority, attrDef_due, attrDef_done_chk
    const task1 = getNode('task_1');
    expect(task1).toBeTruthy();

    const children = loroDoc.getChildren('task_1');
    const fieldEntries = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry';
    });

    // Should have fieldEntries for all 4 fieldDefs
    const fieldDefIds = fieldEntries.map(feId => {
      return loroDoc.toNodexNode(feId)?.fieldDefId;
    });

    expect(fieldDefIds).toContain('attrDef_status');
    expect(fieldDefIds).toContain('attrDef_priority');
    expect(fieldDefIds).toContain('attrDef_due');
    expect(fieldDefIds).toContain('attrDef_done_chk');
  });

  it('computeNodeFields returns template fieldEntries', () => {
    const fields = computeNodeFields(getNode, getChildren, 'task_1');

    const fieldDefIds = fields.map(f => f.fieldDefId);
    expect(fieldDefIds).toContain('attrDef_status');
    expect(fieldDefIds).toContain('attrDef_priority');
    expect(fieldDefIds).toContain('attrDef_due');
    expect(fieldDefIds).toContain('attrDef_done_chk');
  });

  it('buildVisibleChildrenRows classifies template fieldEntries as "field"', () => {
    const task1 = getNode('task_1')!;
    const allChildIds = task1.children;
    const fields = computeNodeFields(getNode, getChildren, 'task_1');

    const fieldMap = new Map(
      fields.map(f => [f.fieldEntryId, {
        fieldDefId: f.fieldDefId,
        templateId: f.templateId,
        hideMode: f.hideMode,
        isEmpty: f.isEmpty,
      }]),
    );

    const rows = buildVisibleChildrenRows({
      allChildIds,
      fieldMap,
      tagIds: task1.tags,
      getFieldDefOwnerId: (fieldDefId) => loroDoc.getParentId(fieldDefId),
      getNodeType: (id) => getNode(id)?.type,
      getChildNodeType: (id) => getNode(id)?.type,
      isOutlinerContentType: (nodeType) => !nodeType || nodeType === 'reference',
    });

    const fieldRows = rows.filter(r => r.type === 'field');
    const contentRows = rows.filter(r => r.type === 'content');

    // Should have field rows for template fields
    expect(fieldRows.length).toBeGreaterThanOrEqual(4);

    // Content children (subtask_1a, subtask_1b) should appear as content
    expect(contentRows.length).toBeGreaterThanOrEqual(2);
  });

  it('applying tag to fresh node creates fieldEntries + content clones', () => {
    // Create a fresh node and apply tag
    const freshNode = useNodeStore.getState().createChild('proj_1', undefined, { name: 'Fresh node' });
    const freshId = freshNode.id;

    useNodeStore.getState().applyTag(freshId, 'tagDef_task');

    const children = loroDoc.getChildren(freshId);
    const fieldEntries = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry';
    });

    const fieldDefIds = fieldEntries.map(feId => {
      return loroDoc.toNodexNode(feId)?.fieldDefId;
    });

    expect(fieldDefIds).toContain('attrDef_status');
    expect(fieldDefIds).toContain('attrDef_priority');
    expect(fieldDefIds).toContain('attrDef_due');
    expect(fieldDefIds).toContain('attrDef_done_chk');

    // computeNodeFields should also return them
    const fields = computeNodeFields(getNode, getChildren, freshId);
    expect(fields.some(f => f.fieldDefId === 'attrDef_status')).toBe(true);
    expect(fields.some(f => f.fieldDefId === 'attrDef_priority')).toBe(true);
  });

  it('meeting tag clones content AND creates fieldEntries', () => {
    // tagDef_meeting has: attrDef_attendees (fieldDef) + 3 content nodes
    const freshNode = useNodeStore.getState().createChild('proj_1', undefined, { name: 'Sprint Review' });
    const freshId = freshNode.id;
    useNodeStore.getState().applyTag(freshId, 'tagDef_meeting');

    const children = loroDoc.getChildren(freshId);
    const childNodes = children.map(cid => loroDoc.toNodexNode(cid)!).filter(Boolean);

    // Should have 1 fieldEntry (Attendees)
    const fieldEntries = childNodes.filter(n => n.type === 'fieldEntry');
    expect(fieldEntries.length).toBe(1);
    expect(fieldEntries[0].fieldDefId).toBe('attrDef_attendees');

    // Should have 3 content clones (Agenda, Notes, Action Items)
    const contentClones = childNodes.filter(n => !n.type && n.templateId);
    expect(contentClones.length).toBe(3);
    const names = contentClones.map(n => n.name);
    expect(names).toContain('Agenda');
    expect(names).toContain('Notes');
    expect(names).toContain('Action Items');

    // computeNodeFields should return the fieldEntry
    const fields = computeNodeFields(getNode, getChildren, freshId);
    expect(fields.some(f => f.fieldDefId === 'attrDef_attendees')).toBe(true);
  });

  it('UI-created fields (addUnnamedFieldToNode on tagDef) are applied by applyTag', () => {
    // Simulate UI path: user creates a field in tagDef's Default content via ">"
    // This creates fieldDef in SCHEMA + fieldEntry under tagDef (not a direct fieldDef child)
    const store = useNodeStore.getState();
    const tagDef = store.createTagDef('Invoice', { color: 'green' });

    // addUnnamedFieldToNode puts fieldDef in SCHEMA, fieldEntry under tagDef
    const { fieldEntryId: tagFieldEntryId, fieldDefId } = store.addUnnamedFieldToNode(tagDef.id);
    store.renameFieldDef(fieldDefId, 'Amount');

    // Verify tagDef has a fieldEntry child (not a fieldDef child)
    const tagChildren = loroDoc.getChildren(tagDef.id);
    const childTypes = tagChildren.map(cid => loroDoc.toNodexNode(cid)?.type);
    expect(childTypes).toContain('fieldEntry');

    // Now apply tag to a fresh node — the field should be propagated
    const node = store.createChild('proj_1', undefined, { name: 'INV-001' });
    store.applyTag(node.id, tagDef.id);

    const nodeChildren = loroDoc.getChildren(node.id);
    const nodeFieldEntries = nodeChildren.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });

    expect(nodeFieldEntries.length).toBe(1);

    // templateId should point to the tagDef's fieldEntry (not the fieldDef in SCHEMA),
    // so that getParentId(templateId) → tagDef (for icon color resolution).
    const fe = loroDoc.toNodexNode(nodeFieldEntries[0])!;
    expect(fe.templateId).toBe(tagFieldEntryId);
    expect(loroDoc.getParentId(fe.templateId!)).toBe(tagDef.id);

    // computeNodeFields should also return it
    const fields = computeNodeFields(getNode, getChildren, node.id);
    expect(fields.some(f => f.fieldDefId === fieldDefId)).toBe(true);
  });

  it('syncTemplateFields picks up UI-created fields added after tagging', () => {
    const store = useNodeStore.getState();
    const tagDef = store.createTagDef('Receipt', { color: 'orange' });

    // Tag a node first (no template fields yet)
    const node = store.createChild('proj_1', undefined, { name: 'REC-001' });
    store.applyTag(node.id, tagDef.id);

    // Now add a field via UI path (after tag was already applied)
    const { fieldDefId } = store.addUnnamedFieldToNode(tagDef.id);
    store.renameFieldDef(fieldDefId, 'Vendor');

    // Field not yet on the node
    let children = loroDoc.getChildren(node.id);
    let hasField = children.some(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    expect(hasField).toBe(false);

    // syncTemplateFields should detect the missing field and add it
    store.syncTemplateFields(node.id);

    children = loroDoc.getChildren(node.id);
    hasField = children.some(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    expect(hasField).toBe(true);
  });

  it('buildFieldOwnerColors resolves tagDef color for UI-created template fields', () => {
    const store = useNodeStore.getState();
    const tagDef = store.createTagDef('Bug', { color: 'red' });

    // Add field via UI path
    store.addUnnamedFieldToNode(tagDef.id);

    // Tag a node
    const node = store.createChild('proj_1', undefined, { name: 'BUG-001' });
    store.applyTag(node.id, tagDef.id);

    // Build fieldMap from node's fields
    const fields = computeNodeFields(getNode, getChildren, node.id);
    const fieldMap = new Map(
      fields.map(f => [f.fieldEntryId, { fieldDefId: f.fieldDefId, templateId: f.templateId }]),
    );

    // buildFieldOwnerColors should find the tagDef as owner via templateId → parent
    const colors = buildFieldOwnerColors(
      fieldMap,
      (id) => loroDoc.getParentId(id),
      (id) => getNode(id)?.type,
      (ownerId) => resolveTagColor(ownerId).text,
    );

    // Every field entry should have a color (= tagDef's color)
    for (const [entryId] of fieldMap) {
      expect(colors.has(entryId), `fieldEntry ${entryId} should have owner color`).toBe(true);
    }
  });
});

describe('syncTemplateFields — retroactive template sync', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('adds fieldEntries for fieldDefs added after tag was applied', () => {
    // 1. Create a fresh tag without any fieldDefs
    const tagDef = useNodeStore.getState().createTagDef('Review', { color: 'blue' });

    // 2. Apply tag to a node (no template content yet)
    const node = useNodeStore.getState().createChild('proj_1', undefined, { name: 'PR Review' });
    useNodeStore.getState().applyTag(node.id, tagDef.id);

    // Verify: no fieldEntries (tag has no template)
    let children = loroDoc.getChildren(node.id);
    let fieldEntries = children.filter(cid => loroDoc.toNodexNode(cid)?.type === 'fieldEntry');
    expect(fieldEntries.length).toBe(0);

    // 3. NOW add a fieldDef to the tagDef (simulating user adding Default content later)
    useNodeStore.getState().createFieldDef('Reviewer', 'plain', tagDef.id);

    // 4. fieldEntry still doesn't exist (no sync yet)
    children = loroDoc.getChildren(node.id);
    fieldEntries = children.filter(cid => loroDoc.toNodexNode(cid)?.type === 'fieldEntry');
    expect(fieldEntries.length).toBe(0);

    // 5. syncTemplateFields creates the missing fieldEntry
    useNodeStore.getState().syncTemplateFields(node.id);

    children = loroDoc.getChildren(node.id);
    fieldEntries = children.filter(cid => loroDoc.toNodexNode(cid)?.type === 'fieldEntry');
    expect(fieldEntries.length).toBe(1);

    // computeNodeFields should return the synced fieldEntry
    const fields = computeNodeFields(getNode, getChildren, node.id);
    expect(fields.some(f => f.attrDefName === 'Reviewer')).toBe(true);
  });

  it('also creates missing content clones', () => {
    // 1. Create a tag and apply it
    const tagDef = useNodeStore.getState().createTagDef('Note', { color: 'yellow' });
    const node = useNodeStore.getState().createChild('proj_1', undefined, { name: 'My Note' });
    useNodeStore.getState().applyTag(node.id, tagDef.id);

    // 2. Add template content AFTER tag was applied
    const contentNode = useNodeStore.getState().createChild(tagDef.id, undefined, { name: 'Summary' });

    // 3. syncTemplateFields creates the content clone
    useNodeStore.getState().syncTemplateFields(node.id);

    const children = loroDoc.getChildren(node.id);
    const clones = children.filter(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === contentNode.id;
    });
    expect(clones.length).toBe(1);
    expect(loroDoc.toNodexNode(clones[0])?.name).toBe('Summary');
  });

  it('is idempotent (no duplicates on repeated calls)', () => {
    const node = useNodeStore.getState().createChild('proj_1', undefined, { name: 'Idempotent test' });
    useNodeStore.getState().applyTag(node.id, 'tagDef_task');

    const initialChildren = loroDoc.getChildren(node.id);
    const initialCount = initialChildren.length;

    // Sync should be no-op (template already applied)
    useNodeStore.getState().syncTemplateFields(node.id);
    useNodeStore.getState().syncTemplateFields(node.id);
    useNodeStore.getState().syncTemplateFields(node.id);

    const afterChildren = loroDoc.getChildren(node.id);
    expect(afterChildren.length).toBe(initialCount);
  });
});

describe('template field default values — cloneTemplateFieldValues', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('applyTag clones default field values from template fieldEntry', () => {
    const store = useNodeStore.getState();

    // Create a tagDef with a fieldEntry that has a default value child
    const tagDef = store.createTagDef('Project', { color: 'green' });
    const { fieldEntryId, fieldDefId } = store.addUnnamedFieldToNode(tagDef.id);
    store.renameFieldDef(fieldDefId, 'Status');

    // Add a default value node under the template fieldEntry
    const defaultValue = store.createChild(fieldEntryId, undefined, { name: 'todo' });

    // Verify template fieldEntry has the value child
    const templateChildren = loroDoc.getChildren(fieldEntryId);
    expect(templateChildren).toContain(defaultValue.id);

    // Apply tag to a fresh node
    const node = store.createChild('proj_1', undefined, { name: 'My Project' });
    store.applyTag(node.id, tagDef.id);

    // Find the new fieldEntry on the node
    const nodeChildren = loroDoc.getChildren(node.id);
    const nodeFieldEntry = nodeChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    expect(nodeFieldEntry).toBeTruthy();

    // The new fieldEntry should have a cloned value child
    const feChildren = loroDoc.getChildren(nodeFieldEntry!);
    expect(feChildren.length).toBe(1);
    const clonedValue = loroDoc.toNodexNode(feChildren[0]);
    expect(clonedValue).toBeTruthy();
    expect(clonedValue!.name).toBe('todo');
    // Cloned value should be a NEW node (different ID from template)
    expect(feChildren[0]).not.toBe(defaultValue.id);
  });

  it('applyTag skips value cloning for fieldDef templates', () => {
    // fieldDef-style templates (seed data) have option definitions as children, not values
    const store = useNodeStore.getState();
    const node = store.createChild('proj_1', undefined, { name: 'Task Node' });
    store.applyTag(node.id, 'tagDef_task');

    // attrDef_status is a fieldDef under tagDef_task with options as children (opt_todo, etc.)
    // Those should NOT be cloned as field values
    const nodeChildren = loroDoc.getChildren(node.id);
    const statusEntry = nodeChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(statusEntry).toBeTruthy();

    // The fieldEntry should have NO children (fieldDef children = option defs, not cloned)
    const feChildren = loroDoc.getChildren(statusEntry!);
    expect(feChildren.length).toBe(0);
  });

  it('syncTemplateFields does NOT clone default values (only applyTag does)', () => {
    const store = useNodeStore.getState();

    // Create tagDef and tag a node first (no fields yet)
    const tagDef = store.createTagDef('Ticket', { color: 'blue' });
    const node = store.createChild('proj_1', undefined, { name: 'TKT-001' });
    store.applyTag(node.id, tagDef.id);

    // Now add a field with a default value to the tagDef
    const { fieldEntryId, fieldDefId } = store.addUnnamedFieldToNode(tagDef.id);
    store.renameFieldDef(fieldDefId, 'Priority');
    store.createChild(fieldEntryId, undefined, { name: 'medium' });

    // Field not yet on the node
    let nodeChildren = loroDoc.getChildren(node.id);
    let hasField = nodeChildren.some(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    expect(hasField).toBe(false);

    // syncTemplateFields should create the fieldEntry but WITHOUT cloning default values
    store.syncTemplateFields(node.id);

    nodeChildren = loroDoc.getChildren(node.id);
    const fieldEntry = nodeChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    expect(fieldEntry).toBeTruthy();

    // The fieldEntry should be empty — default values only apply at applyTag time
    const feChildren = loroDoc.getChildren(fieldEntry!);
    expect(feChildren.length).toBe(0);
  });

  it('merges default value into existing empty field when applying second tag', () => {
    const store = useNodeStore.getState();

    // Create two tags sharing the same fieldDef (via fieldEntry templates)
    const tagA = store.createTagDef('TagA', { color: 'red' });
    const tagB = store.createTagDef('TagB', { color: 'blue' });
    const fieldDef = store.createFieldDef('Shared Field', 'plain', tagA.id);

    // TagA has a fieldEntry pointing to the fieldDef (but no default value)
    const { fieldEntryId: feA } = store.addUnnamedFieldToNode(tagA.id);
    // Redirect feA to point to the existing fieldDef
    loroDoc.setNodeData(feA, 'fieldDefId', fieldDef.id);
    loroDoc.commitDoc();

    // TagB also has a fieldEntry for the same fieldDef, but WITH a default value
    const feB = loroDoc.createNode(undefined as unknown as string, tagB.id);
    const feBId = (() => {
      const children = loroDoc.getChildren(tagB.id);
      return children[children.length - 1];
    })();
    loroDoc.setNodeDataBatch(feBId, { type: 'fieldEntry', fieldDefId: fieldDef.id });
    const defaultVal = store.createChild(feBId, undefined, { name: 'default-from-B' });
    loroDoc.commitDoc();

    // Apply TagA first (field created but empty)
    const node = store.createChild('proj_1', undefined, { name: 'Merge test' });
    store.applyTag(node.id, tagA.id);

    // Verify field exists but is empty
    const nodeChildren1 = loroDoc.getChildren(node.id);
    const feNode1 = nodeChildren1.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDef.id;
    });
    expect(feNode1).toBeTruthy();
    expect(loroDoc.getChildren(feNode1!).length).toBe(0);

    // Apply TagB — should merge default value into existing empty field
    store.applyTag(node.id, tagB.id);

    // Now the field should have the merged default value
    const feChildren = loroDoc.getChildren(feNode1!);
    expect(feChildren.length).toBe(1);
    expect(loroDoc.toNodexNode(feChildren[0])?.name).toBe('default-from-B');
  });

  it('does NOT overwrite existing field value when applying second tag', () => {
    const store = useNodeStore.getState();

    // Create tagDef with a shared fieldDef that has a default value
    const tagA = store.createTagDef('TagA2', { color: 'red' });
    const { fieldEntryId: feA, fieldDefId } = store.addUnnamedFieldToNode(tagA.id);
    store.renameFieldDef(fieldDefId, 'Priority');

    // Set default value on TagA's template
    store.createChild(feA, undefined, { name: 'high' });

    // Apply TagA — creates field with default 'high'
    const node = store.createChild('proj_1', undefined, { name: 'Keep value test' });
    store.applyTag(node.id, tagA.id);

    // Find fieldEntry and verify it has the value
    const nodeChildren = loroDoc.getChildren(node.id);
    const feNode = nodeChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    expect(feNode).toBeTruthy();
    const feValsBefore = loroDoc.getChildren(feNode!);
    expect(feValsBefore.length).toBe(1);
    expect(loroDoc.toNodexNode(feValsBefore[0])?.name).toBe('high');

    // Create TagB with a different default for the same field
    const tagB = store.createTagDef('TagB2', { color: 'blue' });
    const feBId = (() => {
      const id = store.createChild(tagB.id).id;
      loroDoc.setNodeDataBatch(id, { type: 'fieldEntry', fieldDefId });
      store.createChild(id, undefined, { name: 'low' });
      loroDoc.commitDoc();
      return id;
    })();

    // Apply TagB — should NOT overwrite existing 'high' value
    store.applyTag(node.id, tagB.id);

    const feValsAfter = loroDoc.getChildren(feNode!);
    expect(feValsAfter.length).toBe(1);
    expect(loroDoc.toNodexNode(feValsAfter[0])?.name).toBe('high');
  });

  it('clones targetId for option-type default values', () => {
    const store = useNodeStore.getState();

    const tagDef = store.createTagDef('Status Tag', { color: 'orange' });
    const { fieldEntryId, fieldDefId } = store.addUnnamedFieldToNode(tagDef.id);
    store.renameFieldDef(fieldDefId, 'State');

    // Add a default value with targetId (like an options reference)
    const defaultRef = store.createChild(fieldEntryId, undefined, {});
    loroDoc.setNodeData(defaultRef.id, 'targetId', 'opt_todo');
    loroDoc.commitDoc();

    // Apply tag
    const node = store.createChild('proj_1', undefined, { name: 'Test' });
    store.applyTag(node.id, tagDef.id);

    // Find cloned value
    const nodeChildren = loroDoc.getChildren(node.id);
    const fe = nodeChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    const feChildren = loroDoc.getChildren(fe!);
    expect(feChildren.length).toBe(1);
    const cloned = loroDoc.toNodexNode(feChildren[0]);
    expect(cloned?.targetId).toBe('opt_todo');
  });
});
