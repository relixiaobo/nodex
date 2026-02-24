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
