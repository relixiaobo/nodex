import { SYS_A, SYS_D, SYS_V, SYS_T } from '../../src/types/index.js';
import type { NodexNode, DocType } from '../../src/types/index.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { getExtendsChain } from '../../src/lib/field-utils.js';
import { resetAndSeed } from './helpers/test-state.js';

// ─── Helpers ───

function getState() {
  return useNodeStore.getState();
}

function findFieldTupleIds(nodeId: string, attrDefId: string): string[] {
  const state = getState();
  const node = state.entities[nodeId];
  if (!node?.children) return [];
  return node.children.filter((cid) => {
    const child = state.entities[cid];
    return child?.props._docType === 'tuple' && child.children?.[0] === attrDefId;
  });
}

// ─── Tests ───

describe('Supertag Extend (Inheritance)', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  describe('getExtendsChain', () => {
    it('returns empty array for tagDef with no extends', () => {
      const { entities } = getState();
      const chain = getExtendsChain(entities, 'tagDef_task');
      expect(chain).toEqual([]);
    });

    it('returns parent tagDef for single-level extends', () => {
      const { entities } = getState();
      const chain = getExtendsChain(entities, 'tagDef_dev_task');
      expect(chain).toEqual(['tagDef_task']);
    });

    it('returns ancestors in ancestor-first order for multi-level extends', () => {
      // Create a grandchild tagDef that extends dev_task
      const state = getState();
      const now = Date.now();

      // grandchild tagDef
      const grandchildMeta: NodexNode = {
        id: 'meta_tagDef_grand',
        workspaceId: 'ws_default',
        props: { created: now, name: '', _ownerId: 'tagDef_grand', _docType: 'metanode' as DocType },
        children: ['meta_tagDef_grand_tag', 'meta_tagDef_grand_extends'],
        version: 1, updatedAt: now, createdBy: 'user_default', updatedBy: 'user_default',
      };
      const grandchildMetaTag: NodexNode = {
        id: 'meta_tagDef_grand_tag',
        workspaceId: 'ws_default',
        props: { created: now, name: '', _ownerId: 'meta_tagDef_grand', _docType: 'tuple' as DocType },
        children: [SYS_A.NODE_SUPERTAGS, SYS_T.SUPERTAG],
        version: 1, updatedAt: now, createdBy: 'user_default', updatedBy: 'user_default',
      };
      const grandchildMetaExtends: NodexNode = {
        id: 'meta_tagDef_grand_extends',
        workspaceId: 'ws_default',
        props: { created: now, name: '', _ownerId: 'meta_tagDef_grand', _docType: 'tuple' as DocType },
        children: [SYS_A.EXTENDS, 'tagDef_dev_task'],
        version: 1, updatedAt: now, createdBy: 'user_default', updatedBy: 'user_default',
      };
      const grandchildTagDef: NodexNode = {
        id: 'tagDef_grand',
        workspaceId: 'ws_default',
        props: { created: now, name: 'Grand Task', _ownerId: 'ws_default_SCHEMA', _docType: 'tagDef' as DocType, _metaNodeId: 'meta_tagDef_grand' },
        children: [],
        version: 1, updatedAt: now, createdBy: 'user_default', updatedBy: 'user_default',
      };

      useNodeStore.setState((s) => {
        s.entities['tagDef_grand'] = grandchildTagDef;
        s.entities['meta_tagDef_grand'] = grandchildMeta;
        s.entities['meta_tagDef_grand_tag'] = grandchildMetaTag;
        s.entities['meta_tagDef_grand_extends'] = grandchildMetaExtends;
      });

      const chain = getExtendsChain(useNodeStore.getState().entities, 'tagDef_grand');
      // Should be: grandparent (task) first, then parent (dev_task)
      expect(chain).toEqual(['tagDef_task', 'tagDef_dev_task']);
    });

    it('handles circular references without infinite loop', () => {
      // Make tagDef_task extend tagDef_dev_task (circular: task ↔ dev_task)
      const state = getState();
      const meta = state.entities['meta_tagDef_task'];

      const now = Date.now();
      const circularTuple: NodexNode = {
        id: 'meta_tagDef_task_extends_circular',
        workspaceId: 'ws_default',
        props: { created: now, name: '', _ownerId: 'meta_tagDef_task', _docType: 'tuple' as DocType },
        children: [SYS_A.EXTENDS, 'tagDef_dev_task'],
        version: 1, updatedAt: now, createdBy: 'user_default', updatedBy: 'user_default',
      };

      useNodeStore.setState((s) => {
        s.entities['meta_tagDef_task_extends_circular'] = circularTuple;
        s.entities['meta_tagDef_task'].children = [
          ...(s.entities['meta_tagDef_task'].children ?? []),
          'meta_tagDef_task_extends_circular',
        ];
      });

      // Should not hang — just returns whatever it finds without cycles
      const chain = getExtendsChain(useNodeStore.getState().entities, 'tagDef_dev_task');
      expect(chain).toContain('tagDef_task');
      // dev_task won't appear in its own chain (self is excluded)
      expect(chain).not.toContain('tagDef_dev_task');
    });

    it('returns empty for non-existent tagDef', () => {
      const chain = getExtendsChain(getState().entities, 'nonexistent');
      expect(chain).toEqual([]);
    });
  });

  describe('applyTag with Extend', () => {
    it('instantiates parent + own fields when applying child tag', async () => {
      const nodeId = 'note_2'; // simple node with no tags
      const tagDefId = 'tagDef_dev_task';

      await getState().applyTag(nodeId, tagDefId, 'ws_default', 'user_default');

      const node = getState().entities[nodeId];

      // Should have inherited fields from parent (tagDef_task): status, priority, due, done
      const statusFields = findFieldTupleIds(nodeId, 'attrDef_status');
      const priorityFields = findFieldTupleIds(nodeId, 'attrDef_priority');
      const dueFields = findFieldTupleIds(nodeId, 'attrDef_due');
      const doneFields = findFieldTupleIds(nodeId, 'attrDef_done');

      expect(statusFields.length).toBe(1);
      expect(priorityFields.length).toBe(1);
      expect(dueFields.length).toBe(1);
      expect(doneFields.length).toBe(1);

      // Should have own field: branch
      const branchFields = findFieldTupleIds(nodeId, 'attrDef_branch');
      expect(branchFields.length).toBe(1);

      // Each field should have associatedData
      for (const fid of [...statusFields, ...priorityFields, ...dueFields, ...doneFields, ...branchFields]) {
        expect(node.associationMap?.[fid]).toBeTruthy();
      }
    });

    it('deduplicates fields by attrDef ID across inheritance chain', async () => {
      // If both parent and child have the same attrDef field, only one instance
      // Add attrDef_status as a field on dev_task (same as parent task)
      const state = getState();
      const devTaskFieldDupId = 'devTaskField_status_dup';
      const now = Date.now();
      const dupTuple: NodexNode = {
        id: devTaskFieldDupId,
        workspaceId: 'ws_default',
        props: { created: now, name: '', _ownerId: 'tagDef_dev_task', _docType: 'tuple' as DocType },
        children: ['attrDef_status'], // same attrDef as parent
        version: 1, updatedAt: now, createdBy: 'user_default', updatedBy: 'user_default',
      };

      useNodeStore.setState((s) => {
        s.entities[devTaskFieldDupId] = dupTuple;
        s.entities['tagDef_dev_task'].children = [
          ...(s.entities['tagDef_dev_task'].children ?? []),
          devTaskFieldDupId,
        ];
      });

      const nodeId = 'note_2';
      await getState().applyTag(nodeId, 'tagDef_dev_task', 'ws_default', 'user_default');

      // Should only have ONE status field instance, not two
      const statusFields = findFieldTupleIds(nodeId, 'attrDef_status');
      expect(statusFields.length).toBe(1);
    });

    it('applying parent tag directly still works normally', async () => {
      const nodeId = 'note_2';
      await getState().applyTag(nodeId, 'tagDef_task', 'ws_default', 'user_default');

      const statusFields = findFieldTupleIds(nodeId, 'attrDef_status');
      const priorityFields = findFieldTupleIds(nodeId, 'attrDef_priority');
      expect(statusFields.length).toBe(1);
      expect(priorityFields.length).toBe(1);

      // Should NOT have branch field (that belongs to dev_task only)
      const branchFields = findFieldTupleIds(nodeId, 'attrDef_branch');
      expect(branchFields.length).toBe(0);
    });
  });

  describe('removeTag with Extend', () => {
    it('cleans up inherited fields when removing child tag', async () => {
      const nodeId = 'note_2';
      const tagDefId = 'tagDef_dev_task';

      const originalChildren = [...(getState().entities[nodeId].children ?? [])];

      await getState().applyTag(nodeId, tagDefId, 'ws_default', 'user_default');

      // Verify fields are there
      expect(findFieldTupleIds(nodeId, 'attrDef_status').length).toBe(1);
      expect(findFieldTupleIds(nodeId, 'attrDef_branch').length).toBe(1);

      await getState().removeTag(nodeId, tagDefId, 'user_default');

      // All inherited + own fields should be removed
      expect(findFieldTupleIds(nodeId, 'attrDef_status').length).toBe(0);
      expect(findFieldTupleIds(nodeId, 'attrDef_priority').length).toBe(0);
      expect(findFieldTupleIds(nodeId, 'attrDef_due').length).toBe(0);
      expect(findFieldTupleIds(nodeId, 'attrDef_done').length).toBe(0);
      expect(findFieldTupleIds(nodeId, 'attrDef_branch').length).toBe(0);

      // Original children preserved
      const node = getState().entities[nodeId];
      for (const id of originalChildren) {
        expect(node.children ?? []).toContain(id);
      }
    });

    it('removeTag tag binding is removed from metanode', async () => {
      const nodeId = 'note_2';
      const tagDefId = 'tagDef_dev_task';

      await getState().applyTag(nodeId, tagDefId, 'ws_default', 'user_default');
      const metanodeId = getState().entities[nodeId].props._metaNodeId!;

      await getState().removeTag(nodeId, tagDefId, 'user_default');

      const metanode = getState().entities[metanodeId];
      const stillHasTag = (metanode?.children ?? []).some((cid) => {
        const t = getState().entities[cid];
        return t?.props._docType === 'tuple' &&
          t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
          t.children?.[1] === tagDefId;
      });
      expect(stillHasTag).toBe(false);
    });
  });
});
