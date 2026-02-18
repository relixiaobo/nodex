import { SYS_A, SYS_V } from '../../src/types/index.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resolveChildSupertags } from '../../src/lib/field-utils.js';
import { resetAndSeed } from './helpers/test-state.js';

/** Check if a node has a specific tag via its node.meta SYS_A13 tuples. */
function hasTag(nodeId: string, tagDefId: string): boolean {
  const state = useNodeStore.getState();
  const node = state.entities[nodeId];
  if (!node?.meta || node.meta.length === 0) return false;
  return node.meta.some((cid) => {
    const t = state.entities[cid];
    return t?.props._docType === 'tuple' &&
      t.children?.[0] === SYS_A.NODE_SUPERTAGS &&
      t.children?.[1] === tagDefId;
  });
}

/** Set the SYS_A14 (CHILD_SUPERTAG) config value on a tagDef's AssociatedData. */
function setChildSupertag(tagDefId: string, childTagDefId: string) {
  const state = useNodeStore.getState();
  const tagDef = state.entities[tagDefId];
  if (!tagDef?.children) throw new Error(`tagDef ${tagDefId} not found`);

  // Find the SYS_A14 config tuple
  for (const cid of tagDef.children) {
    const child = state.entities[cid];
    if (
      child?.props._docType === 'tuple' &&
      child.children?.[0] === SYS_A.CHILD_SUPERTAG
    ) {
      // Write value into its AssociatedData
      const assocId = tagDef.associationMap?.[cid];
      if (assocId) {
        useNodeStore.setState((prev) => {
          const assoc = prev.entities[assocId];
          if (assoc) {
            assoc.children = [childTagDefId];
          }
        });
        return;
      }
    }
  }
  throw new Error(`SYS_A14 config tuple not found on ${tagDefId}`);
}

describe('Default Child Supertag (SYS_A14)', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  describe('resolveChildSupertags', () => {
    it('returns empty for parent without tags', () => {
      const entities = useNodeStore.getState().entities;
      const result = resolveChildSupertags(entities, 'note_2');
      expect(result).toEqual([]);
    });

    it('returns empty for parent with tag but no SYS_A14 configured', () => {
      const entities = useNodeStore.getState().entities;
      // task_1 is tagged with tagDef_task, which has no child supertag set
      const result = resolveChildSupertags(entities, 'task_1');
      expect(result).toEqual([]);
    });

    it('returns child tag ID when SYS_A14 is configured', () => {
      // Configure tagDef_task to have default child = tagDef_dev_task
      setChildSupertag('tagDef_task', 'tagDef_dev_task');

      const entities = useNodeStore.getState().entities;
      const result = resolveChildSupertags(entities, 'task_1');
      expect(result).toEqual(['tagDef_dev_task']);
    });

    it('returns empty for nonexistent parent', () => {
      const entities = useNodeStore.getState().entities;
      const result = resolveChildSupertags(entities, 'nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('createChild auto-tag', () => {
    it('auto-applies tag when parent has SYS_A14 configured', async () => {
      // Configure tagDef_task default child = tagDef_dev_task
      setChildSupertag('tagDef_task', 'tagDef_dev_task');

      // task_1 is already tagged with tagDef_task
      const child = await useNodeStore.getState().createChild(
        'task_1', 'ws_default', 'user_default', 'New subtask',
      );

      expect(hasTag(child.id, 'tagDef_dev_task')).toBe(true);
    });

    it('does not auto-apply when parent has no SYS_A14', async () => {
      // task_1 is tagged with tagDef_task but no SYS_A14 configured
      const child = await useNodeStore.getState().createChild(
        'task_1', 'ws_default', 'user_default', 'New subtask',
      );

      expect(hasTag(child.id, 'tagDef_dev_task')).toBe(false);
      expect(child.meta).toBeUndefined();
    });

    it('does not auto-apply when parent has no tags', async () => {
      const child = await useNodeStore.getState().createChild(
        'note_2', 'ws_default', 'user_default', 'New idea',
      );

      expect(child.meta).toBeUndefined();
    });

    it('handles multiple tags with different SYS_A14 values', async () => {
      // Configure tagDef_task → child = tagDef_person
      setChildSupertag('tagDef_task', 'tagDef_person');

      // Apply a second tag (tagDef_dev_task) to task_1 with its own child supertag
      await useNodeStore.getState().applyTag('task_1', 'tagDef_dev_task', 'ws_default', 'user_default');
      setChildSupertag('tagDef_dev_task', 'tagDef_web_clip');

      const child = await useNodeStore.getState().createChild(
        'task_1', 'ws_default', 'user_default', 'Multi-tag child',
      );

      expect(hasTag(child.id, 'tagDef_person')).toBe(true);
      expect(hasTag(child.id, 'tagDef_web_clip')).toBe(true);
    });
  });

  describe('createSibling auto-tag', () => {
    it('auto-applies tag when sibling parent has SYS_A14 configured', async () => {
      // Configure tagDef_task default child = tagDef_dev_task
      setChildSupertag('tagDef_task', 'tagDef_dev_task');

      // subtask_1a's parent is task_1 (tagged with tagDef_task)
      const sibling = await useNodeStore.getState().createSibling(
        'subtask_1a', 'ws_default', 'user_default', 'New sibling',
      );

      expect(hasTag(sibling.id, 'tagDef_dev_task')).toBe(true);
    });

    it('does not auto-apply for sibling when parent has no SYS_A14', async () => {
      // subtask_1a's parent is task_1 (tagged but no SYS_A14)
      const sibling = await useNodeStore.getState().createSibling(
        'subtask_1a', 'ws_default', 'user_default', 'New sibling',
      );

      expect(sibling.meta).toBeUndefined();
    });
  });
});
