import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ToolCall, ToolResultMessage } from '@mariozechner/pi-ai';
import { ChatMessage } from '../../src/components/chat/ChatMessage.js';
import { ToolCallGroup } from '../../src/components/chat/ToolCallGroup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolCall(id: string, name: string, args: Record<string, unknown> = {}): ToolCall {
  return { type: 'toolCall', id, name, arguments: args };
}

function makeResult(toolCallId: string, toolName: string, opts: { isError?: boolean } = {}): ToolResultMessage {
  return {
    role: 'toolResult',
    toolCallId,
    toolName,
    content: [{ type: 'text', text: 'ok' }],
    isError: opts.isError ?? false,
    timestamp: Date.now(),
  };
}

function makeAssistantEntry(content: (ToolCall | { type: 'text'; text: string })[], nodeId = 'msg_1') {
  return {
    entry: {
      kind: 'message' as const,
      nodeId,
      message: {
        role: 'assistant' as const,
        content,
        api: 'anthropic-messages' as const,
        provider: 'anthropic' as const,
        model: 'test',
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: 'stop' as const,
        timestamp: 1,
      },
      branches: null,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ToolCallGroup', () => {
  it('renders collapsed with stable progress copy while executing', () => {
    const toolCalls = [
      makeToolCall('tc1', 'browser', { action: 'navigate', url: 'https://google.com' }),
      makeToolCall('tc2', 'browser', { action: 'click', elementDescription: 'Search' }),
      makeToolCall('tc3', 'browser', { action: 'get_text' }),
    ];

    // First two done, third pending
    const results = new Map<string, ToolResultMessage>();
    results.set('tc1', makeResult('tc1', 'browser'));
    results.set('tc2', makeResult('tc2', 'browser'));

    const html = renderToStaticMarkup(
      React.createElement(ToolCallGroup, { toolCalls, results }),
    );

    expect(html).toContain('Working through 3 steps');
    expect(html).not.toContain('Read page text');
    expect(html).not.toContain('Navigated to');
  });

  it('renders completed title when all have results', () => {
    const toolCalls = [
      makeToolCall('tc1', 'node_create', { name: 'Note 1' }),
      makeToolCall('tc2', 'node_create', { name: 'Note 2' }),
    ];

    const results = new Map<string, ToolResultMessage>();
    results.set('tc1', makeResult('tc1', 'node_create'));
    results.set('tc2', makeResult('tc2', 'node_create'));

    const html = renderToStaticMarkup(
      React.createElement(ToolCallGroup, { toolCalls, results }),
    );

    expect(html).toContain('Completed 2 steps');
  });

  it('shows failed count when some results have errors', () => {
    const toolCalls = [
      makeToolCall('tc1', 'browser', { action: 'navigate', url: 'https://a.com' }),
      makeToolCall('tc2', 'browser', { action: 'navigate', url: 'https://b.com' }),
      makeToolCall('tc3', 'browser', { action: 'navigate', url: 'https://c.com' }),
    ];

    const results = new Map<string, ToolResultMessage>();
    results.set('tc1', makeResult('tc1', 'browser'));
    results.set('tc2', makeResult('tc2', 'browser', { isError: true }));
    results.set('tc3', makeResult('tc3', 'browser', { isError: true }));

    const html = renderToStaticMarkup(
      React.createElement(ToolCallGroup, { toolCalls, results }),
    );

    expect(html).toContain('Completed 3 steps');
    expect(html).toContain('2 failed');
  });

  it('renders overlayed hover interaction without layout-swapping display rules', () => {
    const toolCalls = [
      makeToolCall('tc1', 'node_read'),
      makeToolCall('tc2', 'node_read'),
    ];
    const results = new Map<string, ToolResultMessage>();
    results.set('tc1', makeResult('tc1', 'node_read'));
    results.set('tc2', makeResult('tc2', 'node_read'));

    const html = renderToStaticMarkup(
      React.createElement(ToolCallGroup, { toolCalls, results }),
    );

    expect(html).toContain('group-hover/toolgroup:opacity-0');
    expect(html).toContain('group-hover/toolgroup:opacity-100');
  });
});

describe('ChatMessage tool call grouping', () => {
  it('groups 2+ consecutive toolCalls into a single ToolCallGroup', () => {
    const { entry } = makeAssistantEntry([
      makeToolCall('tc1', 'browser', { action: 'navigate', url: 'https://google.com' }),
      makeToolCall('tc2', 'browser', { action: 'click', elementDescription: 'Button' }),
      makeToolCall('tc3', 'browser', { action: 'get_text' }),
    ]);

    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, { entry }),
    );

    expect(html).toContain('Working through 3 steps');
    // Individual steps should NOT be visible (collapsed)
    expect(html).not.toContain('Navigating to');
  });

  it('does not group a single toolCall', () => {
    const tc = makeToolCall('tc1', 'browser', { action: 'navigate', url: 'https://google.com' });
    const { entry } = makeAssistantEntry([tc]);

    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, { entry }),
    );

    // Single tool call renders directly (not grouped)
    expect(html).toContain('Navigating to');
    expect(html).not.toContain('step');
  });

  it('breaks group when a text block appears between toolCalls', () => {
    const { entry } = makeAssistantEntry([
      makeToolCall('tc1', 'browser', { action: 'navigate', url: 'https://a.com' }),
      makeToolCall('tc2', 'browser', { action: 'get_text' }),
      { type: 'text', text: 'Found some info.' },
      makeToolCall('tc3', 'browser', { action: 'navigate', url: 'https://b.com' }),
      makeToolCall('tc4', 'browser', { action: 'get_text' }),
    ]);

    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, { entry }),
    );

    // Text block should break groups — two groups of 2
    expect(html).toContain('Found some info.');
    const groupMatches = html.match(/Working through 2 steps/g);
    expect(groupMatches).not.toBeNull();
    expect(groupMatches!.length).toBe(2);
  });

  it('renders single toolCall normally when text breaks would leave it alone', () => {
    const { entry } = makeAssistantEntry([
      { type: 'text', text: 'Let me check.' },
      makeToolCall('tc1', 'browser', { action: 'navigate', url: 'https://google.com' }),
      { type: 'text', text: 'Done!' },
    ]);

    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, { entry }),
    );

    // Single tool call between text blocks — no grouping
    expect(html).toContain('Navigating to');
    expect(html).not.toContain('step');
  });
});
