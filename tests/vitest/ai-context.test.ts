import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { afterEach, beforeEach } from 'vitest';
import {
  buildSystemReminder,
  buildViewContext,
  formatLocalTimestamp,
  injectReminder,
  stripOldImages,
  transformAgentContext,
} from '../../src/lib/ai-context.js';
import { IMAGE_PLACEHOLDER } from '../../src/lib/ai-message-images.js';
import { buildExpandedNodeKey } from '../../src/lib/expanded-node-key.js';
import { createNode, initLoroDocForTest, setNodeDataBatch } from '../../src/lib/loro-doc.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetStores } from './helpers/test-state.js';

function createImageToolResult(timestamp: number, label: string): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId: `call_${timestamp}`,
    toolName: 'browser',
    content: [
      { type: 'image', data: `base64-${label}`, mimeType: 'image/png' },
      { type: 'text', text: `details-${label}` },
    ],
    isError: false,
    timestamp,
  };
}

function createTextToolResult(timestamp: number, label: string): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId: `text_${timestamp}`,
    toolName: 'browser',
    content: [{ type: 'text', text: label }],
    isError: false,
    timestamp,
  };
}

function createNamedNode(
  id: string,
  parentId: string | null,
  data: Record<string, unknown> = {},
): void {
  createNode(id, parentId);
  setNodeDataBatch(id, data);
}

function extractViewContextPayload(viewContext: string): Record<string, unknown> {
  const payload = viewContext
    .replace(/^<view-context>\n/, '')
    .replace(/\n<\/view-context>$/, '');

  return JSON.parse(payload) as Record<string, unknown>;
}

function setupViewFixture(): void {
  resetStores();
  initLoroDocForTest('ws_test');

  createNamedNode('ws_test', null, { name: 'Workspace' });
  createNamedNode('tag_day', 'ws_test', { name: 'day', type: 'tagDef' });
  createNamedNode('tag_project', 'ws_test', { name: 'project', type: 'tagDef' });
  createNamedNode('tag_focus', 'ws_test', { name: 'focus', type: 'tagDef' });
  createNamedNode('tag_deep', 'ws_test', { name: 'deep', type: 'tagDef' });
  createNamedNode('tag_shared', 'ws_test', { name: 'shared', type: 'tagDef' });

  createNamedNode('journal', 'ws_test', { name: 'Journal' });
  createNamedNode('year_2026', 'journal', { name: '2026' });
  createNamedNode('week_13', 'year_2026', { name: 'Week 13' });
  createNamedNode('today', 'week_13', { name: 'Today' });

  createNamedNode('project', 'today', { name: 'Project Alpha', completedAt: 0 });
  createNamedNode('collapsed_parent', 'today', { name: 'Collapsed parent' });
  createNamedNode('collapsed_child', 'collapsed_parent', { name: 'Collapsed child' });
  createNamedNode('ref_to_shared', 'today', { type: 'reference', targetId: 'shared_target' });
  createNamedNode('task_04', 'today', { name: 'Task 04' });
  createNamedNode('task_05', 'today', { name: 'Task 05' });
  createNamedNode('task_06', 'today', { name: 'Task 06' });
  createNamedNode('task_07', 'today', { name: 'Task 07' });
  createNamedNode('task_08', 'today', { name: 'Task 08' });
  createNamedNode('task_09', 'today', { name: 'Task 09' });
  createNamedNode('task_10', 'today', { name: 'Task 10' });
  createNamedNode('task_11', 'today', { name: 'Task 11' });
  createNamedNode('task_12', 'today', { name: 'Task 12' });

  createNamedNode('milestone', 'project', { name: 'Milestone 1' });
  createNamedNode('project_leaf', 'project', { name: 'Project leaf' });
  createNamedNode('week_one', 'milestone', { name: 'Week one' });
  createNamedNode('detail', 'week_one', { name: 'Detail' });
  createNamedNode('too_deep', 'detail', { name: 'Too deep child' });

  createNamedNode('shared_target', 'ws_test', { name: 'Shared target' });
  createNamedNode('shared_child', 'shared_target', { name: 'Shared child' });

  useNodeStore.getState().applyTag('today', 'tag_day');
  useNodeStore.getState().applyTag('project', 'tag_project');
  useNodeStore.getState().applyTag('milestone', 'tag_focus');
  useNodeStore.getState().applyTag('week_one', 'tag_deep');
  useNodeStore.getState().applyTag('detail', 'tag_deep');
  useNodeStore.getState().applyTag('too_deep', 'tag_deep');
  useNodeStore.getState().applyTag('shared_target', 'tag_shared');

  useUIStore.setState({
    currentNodeId: 'today',
    focusedNodeId: 'detail',
    expandedNodes: new Set([
      buildExpandedNodeKey('node-main', 'today', 'project'),
      buildExpandedNodeKey('node-main', 'project', 'milestone'),
      buildExpandedNodeKey('node-main', 'milestone', 'week_one'),
      buildExpandedNodeKey('node-main', 'today', 'ref_to_shared'),
    ]),
  });
}

let originalChrome: typeof globalThis.chrome | undefined;

beforeEach(() => {
  originalChrome = globalThis.chrome;
});

afterEach(() => {
  globalThis.chrome = originalChrome;
});

describe('ai context', () => {
  it('formats time context timestamps with a local offset instead of UTC Zulu time', () => {
    const timestamp = formatLocalTimestamp(new Date(2026, 2, 12, 15, 4, 5));

    expect(timestamp).toMatch(/^2026-03-12T15:04:05[+-]\d{2}:\d{2}$/);
    expect(timestamp.endsWith('Z')).toBe(false);
  });
});

describe('buildViewContext', () => {
  it('returns null when there is no current node or the current panel is an app panel', () => {
    resetStores();
    expect(buildViewContext()).toBeNull();

    useUIStore.setState({ currentNodeId: 'app:about' });
    expect(buildViewContext()).toBeNull();
  });

  it('builds a visible-tree snapshot matching the current outliner view', () => {
    setupViewFixture();

    const viewContext = buildViewContext();

    expect(viewContext).toContain('<view-context>');
    expect(viewContext).toContain('</view-context>');

    const payload = extractViewContextPayload(viewContext!);
    const children = payload.children as { total: number; items: Array<Record<string, unknown>> };

    expect(payload).toMatchObject({
      id: 'today',
      name: 'Today',
      tags: ['day'],
      breadcrumb: ['Journal', '2026', 'Week 13'],
      focusedNodeId: 'detail',
    });
    expect(children.total).toBe(12);
    expect(children.items).toHaveLength(10);

    const project = children.items.find((item) => item.id === 'project');
    expect(project).toMatchObject({
      id: 'project',
      name: 'Project Alpha',
      hasChildren: true,
      childCount: 2,
      tags: ['project'],
      checked: false,
    });

    const projectChildren = project?.children as { total: number; items: Array<Record<string, unknown>> } | undefined;
    expect(projectChildren).toBeDefined();
    expect(projectChildren?.total).toBe(2);

    const milestone = projectChildren?.items.find((item) => item.id === 'milestone');
    expect(milestone).toMatchObject({
      id: 'milestone',
      name: 'Milestone 1',
      hasChildren: true,
      childCount: 1,
      tags: ['focus'],
      checked: null,
    });

    const weekOne = (milestone?.children as { items: Array<Record<string, unknown>> }).items[0];
    expect(weekOne).toMatchObject({
      id: 'week_one',
      name: 'Week one',
      hasChildren: true,
      childCount: 1,
      tags: [],
      checked: null,
    });

    const detail = (weekOne.children as { items: Array<Record<string, unknown>> }).items[0];
    expect(detail).toMatchObject({
      id: 'detail',
      name: 'Detail',
      hasChildren: true,
      childCount: 1,
      tags: [],
      checked: null,
    });
    expect(detail).not.toHaveProperty('children');

    const collapsed = children.items.find((item) => item.id === 'collapsed_parent');
    expect(collapsed).toMatchObject({
      id: 'collapsed_parent',
      name: 'Collapsed parent',
      hasChildren: true,
      childCount: 1,
      tags: [],
      checked: null,
    });
    expect(collapsed).not.toHaveProperty('children');

    const reference = children.items.find((item) => item.id === 'ref_to_shared');
    expect(reference).toMatchObject({
      id: 'ref_to_shared',
      name: 'Shared target',
      hasChildren: true,
      childCount: 1,
      tags: ['shared'],
      checked: null,
      isReference: true,
      targetId: 'shared_target',
    });
    expect(reference).toHaveProperty('children.items.0.id', 'shared_child');
  });
});

describe('buildSystemReminder', () => {
  it('injects the new view-context section and never emits the old panel-context block', async () => {
    setupViewFixture();
    globalThis.chrome = undefined;

    const reminder = await buildSystemReminder();

    expect(reminder).toContain('<system-reminder>');
    expect(reminder).toContain('<view-context>');
    expect(reminder).toContain('<time-context>');
    expect(reminder).not.toContain('<panel-context>');
  });
});

describe('stripOldImages', () => {
  it('returns the original array when no message contains images', () => {
    const messages: AgentMessage[] = [
      {
        role: 'user',
        content: 'hello',
        timestamp: 1,
      },
      createTextToolResult(2, 'details'),
    ];

    expect(stripOldImages(messages)).toBe(messages);
  });

  it('keeps the last three image messages and strips older ones while preserving text blocks', () => {
    const messages: AgentMessage[] = [
      createImageToolResult(1, 'oldest'),
      createTextToolResult(2, 'not-counted'),
      createImageToolResult(3, 'older'),
      createImageToolResult(4, 'keep-1'),
      createImageToolResult(5, 'keep-2'),
      createImageToolResult(6, 'keep-3'),
    ];

    const result = stripOldImages(messages);

    expect(result).not.toBe(messages);
    expect((result[0] as Extract<AgentMessage, { role: 'toolResult' }>).content).toEqual([
      { type: 'text', text: IMAGE_PLACEHOLDER },
      { type: 'text', text: 'details-oldest' },
    ]);
    expect((result[2] as Extract<AgentMessage, { role: 'toolResult' }>).content).toEqual([
      { type: 'text', text: IMAGE_PLACEHOLDER },
      { type: 'text', text: 'details-older' },
    ]);
    expect((result[3] as Extract<AgentMessage, { role: 'toolResult' }>).content[0]).toEqual({
      type: 'image',
      data: 'base64-keep-1',
      mimeType: 'image/png',
    });
    expect((result[1] as Extract<AgentMessage, { role: 'toolResult' }>).content).toEqual([
      { type: 'text', text: 'not-counted' },
    ]);
  });

  it('counts user image messages in the same sliding window', () => {
    const messages: AgentMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image', data: 'base64-user-old', mimeType: 'image/jpeg' },
        ],
        timestamp: 1,
      },
      createImageToolResult(2, 'keep-1'),
      createImageToolResult(3, 'keep-2'),
      createImageToolResult(4, 'keep-3'),
    ];

    const result = stripOldImages(messages);

    expect(result).not.toBe(messages);
    expect(result[0]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'look at this' },
        { type: 'text', text: IMAGE_PLACEHOLDER },
      ],
      timestamp: 1,
    });
  });

  it('returns the original array when image count stays within the retention window', () => {
    const messages: AgentMessage[] = [
      createImageToolResult(1, 'keep-1'),
      createImageToolResult(2, 'keep-2'),
      createImageToolResult(3, 'keep-3'),
    ];

    expect(stripOldImages(messages)).toBe(messages);
  });
});

describe('injectReminder', () => {
  it('appends the reminder to the last user message', () => {
    const messages: AgentMessage[] = [
      {
        role: 'user',
        content: 'first',
        timestamp: 1,
      },
      {
        role: 'assistant',
        content: [],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
        stopReason: 'stop',
        timestamp: 2,
      },
      {
        role: 'user',
        content: 'latest',
        timestamp: 3,
      },
    ];

    const result = injectReminder(messages, '<system-reminder>ctx</system-reminder>');

    expect(result).not.toBe(messages);
    expect(result[2]).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', text: 'latest' },
        { type: 'text', text: '<system-reminder>ctx</system-reminder>' },
      ],
    });
    expect(messages[2]).toMatchObject({
      role: 'user',
      content: 'latest',
    });
  });

  it('returns the original array when the reminder is empty', () => {
    const messages: AgentMessage[] = [
      {
        role: 'user',
        content: 'hello',
        timestamp: 1,
      },
    ];

    expect(injectReminder(messages, '   ')).toBe(messages);
  });

  it('returns the original array when there is no user message', () => {
    const messages: AgentMessage[] = [
      {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'node_read',
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
        timestamp: 1,
      },
    ];

    expect(injectReminder(messages, '<system-reminder>ctx</system-reminder>')).toBe(messages);
  });
});

describe('transformAgentContext', () => {
  it('reuses the same strip-plus-reminder pipeline used by chat runtime and debug mode', () => {
    const messages: AgentMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'image', data: 'base64-user-old', mimeType: 'image/jpeg' },
        ],
        timestamp: 1,
      },
      createImageToolResult(2, 'keep-1'),
      createImageToolResult(3, 'keep-2'),
      createImageToolResult(4, 'keep-3'),
    ];

    const result = transformAgentContext(messages, '<system-reminder>ctx</system-reminder>');

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look at this' },
          { type: 'text', text: IMAGE_PLACEHOLDER },
          { type: 'text', text: '<system-reminder>ctx</system-reminder>' },
        ],
        timestamp: 1,
      },
      createImageToolResult(2, 'keep-1'),
      createImageToolResult(3, 'keep-2'),
      createImageToolResult(4, 'keep-3'),
    ]);
  });
});
