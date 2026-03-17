import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type { AgentDebugState } from '../../src/hooks/use-agent.js';
import type { AgentDebugSnapshot } from '../../src/lib/ai-debug.js';

const useChatDebugSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/hooks/use-chat-debug-snapshot.js', () => ({
  useChatDebugSnapshot: useChatDebugSnapshotMock,
}));

import { ChatDebugPanel } from '../../src/components/chat/ChatDebugPanel.js';

const LONG_SYSTEM_PROMPT = `You are soma. ${'focus on the exact conversation context. '.repeat(4)}hidden-tail-marker`;

function createSnapshot(): AgentDebugSnapshot {
  return {
    systemPrompt: LONG_SYSTEM_PROMPT,
    reminder: {
      full: '<system-reminder />',
      panelContext: null,
      pageContext: null,
      timeContext: null,
    },
    messages: [
      {
        role: 'user',
        content: 'Find Tana notes',
        timestamp: 1,
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Searching workspace' },
          {
            type: 'toolCall',
            id: 'call_1',
            name: 'node_search',
            arguments: { query: 'Tana' },
          },
        ],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        usage: {
          input: 120,
          output: 24,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 144,
          cost: {
            input: 0.001,
            output: 0.002,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0.003,
          },
        },
        stopReason: 'toolUse',
        timestamp: 2,
      },
      {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'node_search',
        content: [{ type: 'text', text: '0 results' }],
        isError: false,
        timestamp: 3,
      },
    ],
    messageInspectors: [
      {
        id: 'user-1',
        role: 'user',
        kind: 'message',
        summary: 'Find Tana notes',
        json: '{\n  "role": "user"\n}',
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        kind: 'tool_use',
        summary: 'node_search · Searching workspace',
        json: '{\n  "role": "assistant"\n}',
      },
      {
        id: 'tool-3',
        role: 'toolResult',
        kind: 'tool_result',
        summary: 'node_search 0 results',
        json: '{\n  "role": "toolResult"\n}',
      },
    ],
    tools: [
      {
        id: 'node_search-0',
        name: 'node_search',
        description: 'Search nodes in the workspace',
        schema: '{\n  "type": "object"\n}',
      },
    ],
    tokenEstimate: {
      systemPrompt: 80,
      messages: 40,
      tools: 20,
      total: 140,
      contextWindow: 200000,
      usagePercent: 0.07,
    },
    modelId: 'claude-sonnet-4-5',
    provider: 'anthropic',
  };
}

function createDebugState(): AgentDebugState {
  return {
    revision: 1,
    systemPrompt: LONG_SYSTEM_PROMPT,
    messages: [],
    tools: [],
    modelId: 'claude-sonnet-4-5',
    provider: 'anthropic',
    reasoning: false,
    thinkingLevel: null,
    turns: [
      {
        id: 'turn_1',
        startedAt: 1000,
        finishedAt: 2200,
        durationMs: 1200,
        modelId: 'claude-sonnet-4-5',
        provider: 'anthropic',
        status: 'completed',
        requestSummary: 'Find Tana notes',
        responseSummary: 'Searching workspace',
        request: {
          json: '{\n  "temperature": 0.2\n}',
          messageCount: 3,
          toolCount: 1,
          tokenEstimate: {
            systemPrompt: 80,
            messages: 40,
            tools: 20,
            total: 140,
            contextWindow: 200000,
            usagePercent: 0.07,
          },
        },
        response: {
          json: '{\n  "stopReason": "toolUse"\n}',
          stopReason: 'toolUse',
          usage: {
            input: 120,
            output: 24,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 144,
            cost: {
              input: 0.001,
              output: 0.002,
              cacheRead: 0,
              cacheWrite: 0,
              total: 0.003,
            },
          },
          toolResultCount: 1,
          errorMessage: null,
        },
      },
    ],
  };
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(text));
}

describe('ChatDebugPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useChatDebugSnapshotMock.mockReturnValue({
      snapshot: createSnapshot(),
      error: null,
      loading: false,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('renders a conversation-log-first layout and removes the old debug sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatDebugPanel, { debug: createDebugState() }),
    );

    expect(html).toContain('Chat Debug');
    expect(html).toContain('Context');
    expect(html).toContain('SYSTEM');
    expect(html).toContain('USER');
    expect(html).toContain('ASST');
    expect(html).toContain('TOOL');
    expect(html).toContain('node_search({query: &quot;Tana&quot;})');
    expect(html).toContain('0 results');
    expect(html).toContain('Turn 1');
    expect(html).toContain('Tools');

    expect(html).not.toContain('Live Snapshot');
    expect(html).not.toContain('System Prompt');
    expect(html).not.toContain('Dynamic Context');
    expect(html).not.toContain('Messages Inspector');
    expect(html).not.toContain('Token Estimate');
  });

  it('renders a flat top-level message flow including tool results', () => {
    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const rows = Array.from(container.querySelectorAll('[data-testid="chat-debug-message-row"]'));
    expect(rows).toHaveLength(4);
    expect(rows[0]?.textContent).toContain('SYSTEM');
    expect(rows[1]?.textContent).toContain('USER');
    expect(rows[2]?.textContent).toContain('ASST');
    expect(rows[3]?.textContent).toContain('TOOL');
    expect(rows[3]?.textContent).toContain('0 results');
  });

  it('reveals message details and raw turn JSON progressively', () => {
    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    expect(container.textContent).not.toContain('hidden-tail-marker');
    expect(container.textContent).not.toContain('"temperature": 0.2');

    const systemRow = findButton(container, 'SYSTEM');
    expect(systemRow).toBeDefined();

    flushSync(() => {
      systemRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('hidden-tail-marker');
    expect(container.textContent).not.toContain('"temperature": 0.2');

    const turnRow = findButton(container, 'Turn 1');
    expect(turnRow).toBeDefined();

    flushSync(() => {
      turnRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Request');
    expect(container.textContent).toContain('Response');
    expect(container.textContent).not.toContain('"temperature": 0.2');

    const rawJsonButton = findButton(container, 'Raw JSON');
    expect(rawJsonButton).toBeDefined();

    flushSync(() => {
      rawJsonButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('"temperature": 0.2');
  });
});
