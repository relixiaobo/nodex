/**
 * Default Child Supertag — auto-tagging children with parent's configured childSupertag.
 *
 * Loro model:
 * - store.setConfigValue(tagDefId, 'childSupertag', childTagDefId) sets directly
 * - resolveChildSupertags(parentId) reads tagDef.childSupertag via LoroDoc
 * - createChild/createSibling auto-applies childSupertag from parent's tags
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeStore } from '../../src/stores/node-store.js';
import { resolveChildSupertags } from '../../src/lib/field-utils.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { resetAndSeed } from './helpers/test-state.js';

describe('Default Child Supertag', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  describe('resolveChildSupertags', () => {
    it('returns empty for parent without tags (note_2)', () => {
      const result = resolveChildSupertags('note_2');
      expect(result).toEqual([]);
    });

    it('returns empty when tagged parent has no childSupertag configured', () => {
      // task_1 is tagged with tagDef_task, which has no childSupertag set
      const result = resolveChildSupertags('task_1');
      expect(result).toEqual([]);
    });

    it('returns childTagDefId when childSupertag is configured', () => {
      useNodeStore.getState().setConfigValue('tagDef_task', 'childSupertag', 'tagDef_dev_task');
      const result = resolveChildSupertags('task_1');
      expect(result).toEqual(['tagDef_dev_task']);
    });

    it('returns empty for nonexistent parent', () => {
      const result = resolveChildSupertags('nonexistent_node');
      expect(result).toEqual([]);
    });
  });

  describe('createChild auto-tag', () => {
    it('auto-applies childSupertag when parent tag has childSupertag configured', () => {
      useNodeStore.getState().setConfigValue('tagDef_task', 'childSupertag', 'tagDef_dev_task');

      // task_1 is tagged with tagDef_task
      const child = useNodeStore.getState().createChild('task_1', undefined, { name: 'New subtask' });

      const childNode = loroDoc.toNodexNode(child.id)!;
      expect(childNode.tags).toContain('tagDef_dev_task');
    });

    it('does not auto-apply when parent tag has no childSupertag', () => {
      // tagDef_task has no childSupertag configured
      const child = useNodeStore.getState().createChild('task_1', undefined, { name: 'New subtask' });

      const childNode = loroDoc.toNodexNode(child.id)!;
      expect(childNode.tags).not.toContain('tagDef_dev_task');
      expect(childNode.tags).toHaveLength(0);
    });

    it('does not auto-apply when parent has no tags', () => {
      // note_2 has no tags
      const child = useNodeStore.getState().createChild('note_2', undefined, { name: 'New idea' });

      const childNode = loroDoc.toNodexNode(child.id)!;
      expect(childNode.tags).toHaveLength(0);
    });

    it('applies multiple childSupertags when parent has multiple tags with different childSupertag values', () => {
      useNodeStore.getState().setConfigValue('tagDef_task', 'childSupertag', 'tagDef_person');
      useNodeStore.getState().applyTag('task_1', 'tagDef_dev_task');
      useNodeStore.getState().setConfigValue('tagDef_dev_task', 'childSupertag', 'tagDef_source');

      const child = useNodeStore.getState().createChild('task_1', undefined, { name: 'Multi-tag child' });

      const childNode = loroDoc.toNodexNode(child.id)!;
      // Both childSupertags from task's two tags should be applied
      expect(childNode.tags).toContain('tagDef_person');
      expect(childNode.tags).toContain('tagDef_source');
    });
  });

  describe('createSibling auto-tag', () => {
    it('auto-applies childSupertag when sibling parent has it configured', () => {
      useNodeStore.getState().setConfigValue('tagDef_task', 'childSupertag', 'tagDef_dev_task');

      // subtask_1a's parent is task_1 (tagged with tagDef_task)
      const sibling = useNodeStore.getState().createSibling('subtask_1a', { name: 'New sibling' });

      const siblingNode = loroDoc.toNodexNode(sibling.id)!;
      expect(siblingNode.tags).toContain('tagDef_dev_task');
    });

    it('does not auto-apply when parent has no childSupertag', () => {
      // subtask_1a's parent is task_1, but no childSupertag configured
      const sibling = useNodeStore.getState().createSibling('subtask_1a', { name: 'New sibling' });

      const siblingNode = loroDoc.toNodexNode(sibling.id)!;
      expect(siblingNode.tags).toHaveLength(0);
    });
  });
});
