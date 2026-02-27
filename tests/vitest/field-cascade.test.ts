/**
 * Field / Default Content deletion cascade tests.
 *
 * Scenario A: Deleting supertag default content (template fields/content)
 * - No custom value → cascade delete the instantiated field/content
 * - Has custom value → detach from template (clear templateId)
 *
 * Scenario B: Deleting field definition (attrDef) itself
 * - Trashed fieldDef → field name shows "deleted" state (trashed flag)
 * - Hard-deleted fieldDef → empty fieldEntries cleaned up, non-empty kept
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { computeNodeFields } from '../../src/hooks/use-node-fields.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { CONTAINER_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

function getNode(id: string) {
  return loroDoc.toNodexNode(id);
}
function getChildren(parentId: string) {
  return loroDoc.getChildren(parentId)
    .map(id => loroDoc.toNodexNode(id))
    .filter((n): n is NonNullable<typeof n> => n !== null);
}

// ────────────────────────────────────────────────────────────
// Scenario A: Template field deletion cascade
// ────────────────────────────────────────────────────────────

describe('Scenario A: template field deletion cascade', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('trashing a direct fieldDef from tagDef removes empty fieldEntries on tagged nodes', () => {
    // task_1 has tagDef_task applied, which includes attrDef_due (DATE field)
    // attrDef_due is a direct fieldDef child of tagDef_task

    // Verify task_1 has a fieldEntry for attrDef_due (should be empty — no value set)
    const dueFe = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_due';
    });
    expect(dueFe).toBeTruthy();
    // Confirm it's empty (no value children)
    expect(loroDoc.getChildren(dueFe!).length).toBe(0);

    // Trash the template fieldDef
    useNodeStore.getState().trashNode('attrDef_due');

    // The empty fieldEntry on task_1 should be deleted
    const dueFeAfter = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_due';
    });
    expect(dueFeAfter).toBeUndefined();
  });

  it('trashing a template fieldDef preserves fieldEntries with custom values', () => {
    // Set a value on task_1's Status field first
    useNodeStore.getState().setOptionsFieldValue('task_1', 'attrDef_status', 'opt_in_progress');

    // Verify the fieldEntry has a value child
    const statusFe = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(statusFe).toBeTruthy();
    expect(loroDoc.getChildren(statusFe!).length).toBeGreaterThan(0);

    // Trash the template fieldDef
    useNodeStore.getState().trashNode('attrDef_status');

    // The fieldEntry with value should still exist (detached from template)
    const statusFeAfter = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(statusFeAfter).toBeTruthy();

    // templateId should be cleared (detached from template)
    const feNode = loroDoc.toNodexNode(statusFeAfter!);
    expect(feNode?.templateId).toBeUndefined();
  });

  it('trashing a template content node removes unmodified clones', () => {
    // meeting_1 has tagDef_meeting applied, which has 3 template content nodes
    // Verify meeting_1 has the Agenda content clone
    const agendaClone = loroDoc.getChildren('meeting_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === 'tpl_agenda';
    });
    expect(agendaClone).toBeTruthy();
    expect(loroDoc.toNodexNode(agendaClone!)?.name).toBe('Agenda');

    // Trash the template content node
    useNodeStore.getState().trashNode('tpl_agenda');

    // The unmodified clone should be deleted
    const agendaCloneAfter = loroDoc.getChildren('meeting_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === 'tpl_agenda';
    });
    expect(agendaCloneAfter).toBeUndefined();
  });

  it('trashing a template content node preserves modified clones', () => {
    // meeting_1 has an "Action Items" content clone from tpl_actions
    const actionClone = loroDoc.getChildren('meeting_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === 'tpl_actions';
    });
    expect(actionClone).toBeTruthy();

    // Modify the clone (add a child)
    useNodeStore.getState().createChild(actionClone!, undefined, { name: 'Follow up with team' });

    // Trash the template content node
    useNodeStore.getState().trashNode('tpl_actions');

    // The modified clone should still exist but be detached
    const remainingChildren = loroDoc.getChildren('meeting_1');
    const detachedClone = remainingChildren.find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.id === actionClone;
    });
    expect(detachedClone).toBeTruthy();

    // templateId should be cleared
    const cloneNode = loroDoc.toNodexNode(detachedClone!);
    expect(cloneNode?.templateId).toBeUndefined();

    // The child should still exist
    expect(loroDoc.getChildren(detachedClone!).length).toBe(1);
  });

  it('trashing a template content node preserves clones with renamed text', () => {
    // meeting_1 has a "Notes" content clone from tpl_notes
    const notesClone = loroDoc.getChildren('meeting_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === 'tpl_notes';
    });
    expect(notesClone).toBeTruthy();

    // Rename the clone
    useNodeStore.getState().setNodeName(notesClone!, 'My Custom Notes');

    // Trash the template content node
    useNodeStore.getState().trashNode('tpl_notes');

    // The renamed clone should still exist but be detached
    const cloneAfter = loroDoc.getChildren('meeting_1').find(cid => cid === notesClone);
    expect(cloneAfter).toBeTruthy();
    expect(loroDoc.toNodexNode(cloneAfter!)?.templateId).toBeUndefined();
    expect(loroDoc.toNodexNode(cloneAfter!)?.name).toBe('My Custom Notes');
  });

  it('cascade affects multiple tagged nodes', () => {
    // Apply tagDef_meeting to a second node
    const store = useNodeStore.getState();
    const meeting2 = store.createChild('proj_1', undefined, { name: 'Sprint planning' });
    store.applyTag(meeting2.id, 'tagDef_meeting');

    // Both meeting_1 and meeting2 should have Agenda clone
    const meeting1Agenda = loroDoc.getChildren('meeting_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === 'tpl_agenda';
    });
    const meeting2Agenda = loroDoc.getChildren(meeting2.id).find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === 'tpl_agenda';
    });
    expect(meeting1Agenda).toBeTruthy();
    expect(meeting2Agenda).toBeTruthy();

    // Trash the template
    store.trashNode('tpl_agenda');

    // Both should have their unmodified clones deleted
    const meeting1AgendaAfter = loroDoc.getChildren('meeting_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === 'tpl_agenda';
    });
    const meeting2AgendaAfter = loroDoc.getChildren(meeting2.id).find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.templateId === 'tpl_agenda';
    });
    expect(meeting1AgendaAfter).toBeUndefined();
    expect(meeting2AgendaAfter).toBeUndefined();
  });

  it('UI-created template field (fieldEntry under tagDef) cascades correctly', () => {
    const store = useNodeStore.getState();

    // Create a tag with a UI-created field
    const tagDef = store.createTagDef('Invoice', { color: 'amber' });
    const { fieldEntryId: tagFieldEntryId, fieldDefId } = store.addUnnamedFieldToNode(tagDef.id);
    store.renameFieldDef(fieldDefId, 'Amount');

    // Apply to two nodes
    const node1 = store.createChild('proj_1', undefined, { name: 'INV-001' });
    store.applyTag(node1.id, tagDef.id);
    const node2 = store.createChild('proj_1', undefined, { name: 'INV-002' });
    store.applyTag(node2.id, tagDef.id);

    // Set a value on node1
    store.setFieldValue(node1.id, fieldDefId, ['100.00']);

    // Verify both have the field
    expect(loroDoc.getChildren(node1.id).some(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    })).toBe(true);
    expect(loroDoc.getChildren(node2.id).some(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    })).toBe(true);

    // Trash the template fieldEntry (the one under the tagDef)
    store.trashNode(tagFieldEntryId);

    // node1 (has value): fieldEntry preserved, templateId cleared
    const node1Fe = loroDoc.getChildren(node1.id).find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    expect(node1Fe).toBeTruthy();
    expect(loroDoc.toNodexNode(node1Fe!)?.templateId).toBeUndefined();

    // node2 (no value): fieldEntry deleted
    const node2Fe = loroDoc.getChildren(node2.id).find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === fieldDefId;
    });
    expect(node2Fe).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// Scenario B: FieldDef deletion — trashed / hard delete
// ────────────────────────────────────────────────────────────

describe('Scenario B: fieldDef deletion — trashed state', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('trashed fieldDef causes field to be marked as trashed in computeNodeFields', () => {
    // Set a value on task_1's Status field so the fieldEntry survives cascade
    useNodeStore.getState().setOptionsFieldValue('task_1', 'attrDef_status', 'opt_in_progress');

    // Trash the fieldDef
    useNodeStore.getState().trashNode('attrDef_status');

    // The fieldEntry survives (has value), and should be marked as trashed
    const fields = computeNodeFields(getNode, getChildren, 'task_1');
    const statusField = fields.find(f => f.fieldDefId === 'attrDef_status');
    expect(statusField).toBeTruthy();
    expect(statusField!.trashed).toBe(true);
  });

  it('non-trashed fieldDef is not marked as trashed', () => {
    const fields = computeNodeFields(getNode, getChildren, 'task_1');
    const statusField = fields.find(f => f.fieldDefId === 'attrDef_status');
    expect(statusField).toBeTruthy();
    expect(statusField!.trashed).toBeFalsy();
  });
});

describe('Scenario B: fieldDef hard deletion — cascade cleanup', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('hard-deleting fieldDef removes empty fieldEntries on all nodes', () => {
    // task_1 has attrDef_due fieldEntry (should be empty)
    const dueFe = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_due';
    });
    expect(dueFe).toBeTruthy();
    expect(loroDoc.getChildren(dueFe!).length).toBe(0);

    // Trash then hard-delete
    useNodeStore.getState().trashNode('attrDef_due');
    useNodeStore.getState().hardDeleteNode('attrDef_due');

    // The fieldEntry should be gone (hard-delete cascade removes empty fieldEntries)
    const dueFeAfter = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_due';
    });
    expect(dueFeAfter).toBeUndefined();
  });

  it('hard-deleting fieldDef keeps fieldEntries with values', () => {
    // Set a value on attrDef_status first
    useNodeStore.getState().setOptionsFieldValue('task_1', 'attrDef_status', 'opt_done');

    const statusFe = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(statusFe).toBeTruthy();
    expect(loroDoc.getChildren(statusFe!).length).toBeGreaterThan(0);

    // Trash then hard-delete
    useNodeStore.getState().trashNode('attrDef_status');
    useNodeStore.getState().hardDeleteNode('attrDef_status');

    // The fieldEntry with value should still exist
    const statusFeAfter = loroDoc.getChildren('task_1').find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_status';
    });
    expect(statusFeAfter).toBeTruthy();
  });

  it('hard-deleting non-fieldDef node does not cascade', () => {
    // Trash and hard-delete a plain content node
    useNodeStore.getState().trashNode('idea_1');
    const beforeCount = loroDoc.getAllNodeIds().length;
    useNodeStore.getState().hardDeleteNode('idea_1');
    // Should only delete the one node (and maybe its descendants)
    expect(loroDoc.hasNode('idea_1')).toBe(false);
    // Other nodes should be unaffected
    expect(loroDoc.hasNode('idea_2')).toBe(true);
  });

  it('hard-deleting fieldDef cascades across multiple nodes', () => {
    const store = useNodeStore.getState();
    // Create a second task
    const task2 = store.createChild('proj_1', undefined, { name: 'Second task' });
    store.applyTag(task2.id, 'tagDef_task');

    // Both task_1 and task2 have empty attrDef_due entries
    const findDueFe = (nodeId: string) => loroDoc.getChildren(nodeId).find(cid => {
      const n = loroDoc.toNodexNode(cid);
      return n?.type === 'fieldEntry' && n.fieldDefId === 'attrDef_due';
    });
    expect(findDueFe('task_1')).toBeTruthy();
    expect(findDueFe(task2.id)).toBeTruthy();

    // Trash + hard-delete
    store.trashNode('attrDef_due');
    store.hardDeleteNode('attrDef_due');

    // Both should have their empty fieldEntries cleaned up
    expect(findDueFe('task_1')).toBeUndefined();
    expect(findDueFe(task2.id)).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────
// emptyTrash cascade
// ────────────────────────────────────────────────────────────

describe('emptyTrash cascade', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  it('emptyTrash with trashed fieldDef cleans up empty fieldEntries', () => {
    // Trash a fieldDef
    useNodeStore.getState().trashNode('attrDef_due');

    // Note: trashNode already cascaded the empty fieldEntries.
    // But the fieldDef is still in TRASH. Let's verify emptyTrash
    // hard-deletes via deleteNode (which doesn't go through our cascade).
    // The cascade already happened in trashNode, so emptyTrash
    // should cleanly remove the trashed fieldDef.
    useNodeStore.getState().emptyTrash();

    expect(loroDoc.hasNode('attrDef_due')).toBe(false);
    expect(loroDoc.getChildren(CONTAINER_IDS.TRASH).length).toBe(0);
  });
});
