import { beforeEach, describe, expect, it } from 'vitest';
import { createTool } from '../../src/lib/ai-tools/create-tool.js';
import { ensureTodayNode } from '../../src/lib/journal.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_NODE_IDS } from '../../src/types/index.js';
import { resetAndSeed } from './helpers/test-state.js';

async function executeCreate(params: Record<string, unknown>) {
  const result = await createTool.execute('tool_create', params as never);
  return JSON.parse(result.content[0].text as string);
}

describe('node_create tool', () => {
  beforeEach(() => {
    resetAndSeed();
  });

  describe('content nodes', () => {
    it('creates a basic content node under today by default', async () => {
      const todayId = ensureTodayNode();
      const result = await executeCreate({ text: 'hello' });

      expect(result.parentId).toBe(todayId);
      expect(loroDoc.getParentId(result.id)).toBe(todayId);
      expect(loroDoc.toNodexNode(result.id)?.name).toBe('hello');
    });

    it('creates under the specified parent', async () => {
      const result = await executeCreate({
        parentId: 'proj_1',
        text: 'child node',
      });

      expect(loroDoc.getParentId(result.id)).toBe('proj_1');
      expect(loroDoc.toNodexNode(result.id)?.name).toBe('child node');
    });

    it('inserts after a sibling node', async () => {
      const beforeChildren = loroDoc.getChildren('proj_1');
      const task1Index = beforeChildren.indexOf('task_1');

      const result = await executeCreate({
        parentId: 'proj_1',
        afterId: 'task_1',
        text: 'new sibling task',
      });

      const afterChildren = loroDoc.getChildren('proj_1');
      expect(afterChildren.indexOf(result.id)).toBe(task1Index + 1);
    });

    it('creates tags, fields, and nested children from Tana Paste text', async () => {
      const result = await executeCreate({
        parentId: 'proj_1',
        text: 'Sprint plan #task\nStatus:: To Do\nPriority:: High\n  Task A #meeting\n  Task B',
      });

      const node = loroDoc.toNodexNode(result.id);
      expect(node?.tags).toContain('tagDef_task');

      const children = loroDoc.getChildren(result.id);
      const contentChildren = children
        .map((id) => loroDoc.toNodexNode(id))
        .filter((child) => child?.type !== 'fieldEntry');
      expect(contentChildren.map((child) => child?.name)).toEqual(['Task A', 'Task B']);
      expect(contentChildren[0]?.tags).toContain('tagDef_meeting');

      const fieldEntries = children
        .map((id) => loroDoc.toNodexNode(id))
        .filter((child) => child?.type === 'fieldEntry');
      expect(fieldEntries.length).toBeGreaterThanOrEqual(2);
      expect(result.childrenCreated).toBe(2);
    });

    it('creates a reference node from an exact [[name^id]] line', async () => {
      const result = await executeCreate({
        parentId: 'proj_1',
        text: '[[Meeting notes - Team standup^note_1]]',
      });

      expect(result.isReference).toBe(true);
      expect(result.targetId).toBe('note_1');
      expect(loroDoc.toNodexNode(result.id)?.type).toBe('reference');
    });

    it('reports unresolved fields when the node has no tags', async () => {
      const result = await executeCreate({
        parentId: 'proj_1',
        text: 'Plain node\nStatus:: Todo',
      });

      expect(result.unresolvedFields).toEqual(['Status']);
      expect(loroDoc.toNodexNode(result.id)?.name).toBe('Plain node');
    });

    it('auto-creates new field definitions under the first tag', async () => {
      const result = await executeCreate({
        parentId: 'proj_1',
        text: 'Custom node #task\nCustomField:: my value',
      });

      expect(result.createdFields).toEqual(['CustomField']);
      const tagDefChildren = loroDoc.getChildren('tagDef_task');
      const newFieldDef = tagDefChildren
        .map((cid) => loroDoc.toNodexNode(cid))
        .find((child) => child?.type === 'fieldDef' && child.name === 'CustomField');
      expect(newFieldDef).toBeTruthy();
    });

    it('applies optional data properties when creating a content node', async () => {
      const result = await executeCreate({
        parentId: 'proj_1',
        text: 'Code sample',
        data: {
          type: 'codeBlock',
          codeLanguage: 'ts',
          description: 'example snippet',
        },
      });

      const node = loroDoc.toNodexNode(result.id);
      expect(node?.type).toBe('codeBlock');
      expect(node?.codeLanguage).toBe('ts');
      expect(node?.description).toBe('example snippet');
    });

    it('duplicates an existing node when duplicateId is provided', async () => {
      const result = await executeCreate({
        duplicateId: 'task_1',
      });

      expect(result.duplicatedFrom).toBe('task_1');
      expect(result.name).toBe(loroDoc.toNodexNode('task_1')?.name);
      expect(result.id).not.toBe('task_1');
      expect(loroDoc.getParentId(result.id)).toBe(loroDoc.getParentId('task_1'));
    });

    it('errors when no text is provided for content creation', async () => {
      await expect(createTool.execute('tool_create', {} as never)).rejects.toThrow('text is required');
    });
  });

  describe('search nodes', () => {
    it('creates a search node for tag rules and materializes references', async () => {
      const result = await executeCreate({
        type: 'search',
        name: 'Tasks',
        parentId: SYSTEM_NODE_IDS.SEARCHES,
        rules: { searchTags: ['task'] },
      });

      const searchNode = loroDoc.toNodexNode(result.id);
      expect(searchNode?.type).toBe('search');
      expect(searchNode?.name).toBe('Tasks');
      expect(loroDoc.getParentId(result.id)).toBe(SYSTEM_NODE_IDS.SEARCHES);

      const queryConditions = loroDoc.getChildren(result.id)
        .map((id) => loroDoc.toNodexNode(id))
        .filter((node) => node?.type === 'queryCondition');
      expect(queryConditions).toHaveLength(1);
      expect(queryConditions[0]?.queryLogic).toBe('AND');

      const refChildren = loroDoc.getChildren(result.id)
        .map((id) => loroDoc.toNodexNode(id))
        .filter((node) => node?.type === 'reference');
      expect(refChildren.length).toBeGreaterThan(0);
    });

    it('creates search rules for fields, dates, scope, and sort', async () => {
      const result = await executeCreate({
        type: 'search',
        name: 'Done tasks this month',
        rules: {
          query: 'task',
          searchTags: ['task'],
          fields: { Status: 'Done' },
          scopeId: 'proj_1',
          after: '2026-03-01',
          before: '2026-03-31',
          sortBy: 'created:desc',
        },
      });

      const searchNode = loroDoc.toNodexNode(result.id);
      expect(searchNode?.type).toBe('search');

      const rootGroup = loroDoc.getChildren(result.id)
        .map((id) => loroDoc.toNodexNode(id))
        .find((node) => node?.type === 'queryCondition' && node.queryLogic === 'AND');
      expect(rootGroup).toBeTruthy();
      const leafNodes = (rootGroup?.children ?? [])
        .map((id) => loroDoc.toNodexNode(id))
        .filter(Boolean);
      expect(leafNodes.map((leaf) => leaf?.queryOp)).toEqual(expect.arrayContaining([
        'STRING_MATCH',
        'HAS_TAG',
        'FIELD_IS',
        'PARENTS_DESCENDANTS',
        'GT',
        'LT',
      ]));
      expect(result.type).toBe('search');
      expect(result.name).toBe('Done tasks this month');
      expect(result.rulesApplied).toMatchObject({
        query: 'task',
        searchTags: ['Task'],
        fields: { Status: 'Done' },
        scopeId: 'proj_1',
        after: '2026-03-01',
        before: '2026-03-31',
        sortBy: 'created:desc',
      });

      const viewDef = loroDoc.getChildren(result.id)
        .map((id) => loroDoc.toNodexNode(id))
        .find((node) => node?.type === 'viewDef');
      expect(viewDef).toBeTruthy();
      const sortRule = (viewDef?.children ?? [])
        .map((id) => loroDoc.toNodexNode(id))
        .find((node) => node?.type === 'sortRule');
      expect(sortRule?.sortField).toBe('createdAt');
      expect(sortRule?.sortDirection).toBe('desc');
    });

    it('reports skipped search rules when tags or sort cannot be persisted', async () => {
      const result = await executeCreate({
        type: 'search',
        name: 'Unknown tags',
        rules: {
          searchTags: ['does-not-exist'],
          sortBy: 'relevance:desc',
        },
      });

      expect(result.status).toBe('created');
      expect(result.unresolvedTags).toEqual(['does-not-exist']);
      expect(result.ignoredSortBy).toBe('relevance:desc');
      expect(result.appliedRuleCount).toBe(0);
      expect(result.boundary).toBeTruthy();
      expect(result.nextStep).toBeTruthy();
      expect(result.fallback).toBeTruthy();
    });

    it('does not let data override the search node type', async () => {
      const result = await executeCreate({
        type: 'search',
        name: 'Locked search type',
        rules: {
          searchTags: ['task'],
        },
        data: {
          type: 'codeBlock',
          description: 'search metadata stays allowed',
        },
      });

      const searchNode = loroDoc.toNodexNode(result.id);
      expect(searchNode?.type).toBe('search');
      expect(searchNode?.description).toBe('search metadata stays allowed');
    });

    it('errors when required search params are missing', async () => {
      await expect(createTool.execute('tool_create', {
        type: 'search',
        rules: { searchTags: ['task'] },
      } as never)).rejects.toThrow('name is required');

      await expect(createTool.execute('tool_create', {
        type: 'search',
        name: 'Tasks',
      } as never)).rejects.toThrow('rules are required');
    });
  });
});
