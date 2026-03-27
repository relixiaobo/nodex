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
          cacheRead: 89,
          cacheWrite: 0,
          totalTokens: 144,
          cost: {
            input: 0.001,
            output: 0.002,
            cacheRead: 0.0012,
            cacheWrite: 0,
            total: 0.0042,
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
    turns: [],
  };
}

function findButton(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  // After refactor, role labels (SYSTEM/USER/ASST) are outside the button.
  // Find the row div containing the text, then return its nested button.
  const rows = container.querySelectorAll('[data-testid="chat-debug-message-row"]');
  for (const row of rows) {
    if (row.textContent?.includes(text)) {
      const btn = row.querySelector('button');
      if (btn) return btn;
    }
  }
  // Fallback: direct button text match
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes(text));
}

describe('ChatDebugPanel', () => {
  const clipboardWriteText = vi.fn<(_: string) => Promise<void>>();
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clipboardWriteText.mockReset();
    clipboardWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    });

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

  it('renders a conversation-log-first layout with tools entry and no turn/tools sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatDebugPanel, { debug: createDebugState() }),
    );

    expect(html).toContain('Chat Debug');
    expect(html).toContain('Context');
    expect(html).toContain('SYSTEM');
    expect(html).toContain('TOOLS');
    expect(html).toContain('USER');
    expect(html).toContain('ASST');
    expect(html).toContain('TOOL');
    expect(html).toContain('node_search({query: &quot;Tana&quot;})');
    expect(html).toContain('0 results');

    // Turn Log and standalone Tools section should not appear
    expect(html).not.toContain('Turn 1');
    expect(html).not.toContain('Live Snapshot');
    expect(html).not.toContain('System Prompt');
    expect(html).not.toContain('Dynamic Context');
    expect(html).not.toContain('Messages Inspector');
    expect(html).not.toContain('Token Estimate');
  });

  it('renders a flat top-level message flow including tools and tool results', () => {
    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const rows = Array.from(container.querySelectorAll('[data-testid="chat-debug-message-row"]'));
    // SYSTEM + TOOLS + USER + ASST + TOOL = 5 rows
    expect(rows).toHaveLength(5);
    expect(rows[0]?.textContent).toContain('SYSTEM');
    expect(rows[1]?.textContent).toContain('TOOLS');
    expect(rows[1]?.textContent).toContain('node_search');
    expect(rows[2]?.textContent).toContain('USER');
    expect(rows[3]?.textContent).toContain('ASST');
    expect(rows[4]?.textContent).toContain('TOOL');
    expect(rows[4]?.textContent).toContain('0 results');
  });

  it('shows usage metadata on ASST entries', () => {
    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const usageMetas = Array.from(container.querySelectorAll('[data-testid="chat-debug-usage-meta"]'));
    expect(usageMetas).toHaveLength(1);
    const usageText = usageMetas[0]?.textContent ?? '';
    expect(usageText).toContain('in:120');
    expect(usageText).toContain('out:24');
    expect(usageText).toContain('cr:89');
    expect(usageText).toContain('$0.0042');
    expect(usageText).toContain('toolUse');
  });

  it('shows a per-user-turn usage total aggregated across assistant rounds', () => {
    const snapshot = createSnapshot();
    snapshot.messages.splice(2, 0, {
      role: 'assistant',
      content: [{ type: 'text', text: 'Found more context' }],
      api: 'anthropic-messages',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      usage: {
        input: 30,
        output: 10,
        cacheRead: 5,
        cacheWrite: 2,
        totalTokens: 47,
        cost: {
          input: 0.0003,
          output: 0.0005,
          cacheRead: 0.0002,
          cacheWrite: 0.0001,
          total: 0.0011,
        },
      },
      stopReason: 'stop',
      timestamp: 2.5,
    });
    snapshot.messageInspectors.splice(2, 0, {
      id: 'assistant-2b',
      role: 'assistant',
      kind: 'message',
      summary: 'Found more context',
      json: '{\n  "role": "assistant",\n  "timestamp": 2.5\n}',
    });
    useChatDebugSnapshotMock.mockReturnValue({ snapshot, error: null, loading: false });

    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const turnUsage = container.querySelector('[data-testid="chat-debug-turn-usage-meta"]');
    const usageText = turnUsage?.textContent ?? '';
    expect(usageText).toContain('total in:150');
    expect(usageText).toContain('out:34');
    expect(usageText).toContain('cw:2');
    expect(usageText).toContain('cr:94');
    expect(usageText).toContain('$0.0053');
    expect(usageText).toContain('2 rounds');
  });

  it('copies debug content blocks to the clipboard', async () => {
    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const rows = Array.from(container.querySelectorAll('[data-testid="chat-debug-message-row"]'));
    const userRow = rows.find((row) => row.textContent?.includes('Find Tana notes'));
    const copyButton = userRow?.querySelector('button[aria-label="Copy debug content"]') as HTMLButtonElement | null;

    expect(copyButton).not.toBeNull();

    flushSync(() => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(clipboardWriteText).toHaveBeenCalledWith('Find Tana notes');
    });
  });

  it('reveals message details progressively', () => {
    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    // System prompt truncated — tail marker not visible
    expect(container.textContent).not.toContain('hidden-tail-marker');

    // Click system text part to expand
    const systemRow = findButton(container, 'SYSTEM');
    expect(systemRow).toBeDefined();

    flushSync(() => {
      systemRow?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('hidden-tail-marker');
  });

  it('renders multi-part user messages as separate collapsible rows', () => {
    const snapshot = createSnapshot();
    snapshot.messages[0] = {
      role: 'user',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: '<system-reminder>context here</system-reminder>' },
      ],
      timestamp: 1,
    };
    snapshot.messageInspectors[0] = {
      ...snapshot.messageInspectors[0],
      summary: 'Hello',
    };
    useChatDebugSnapshotMock.mockReturnValue({ snapshot, error: null, loading: false });

    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const userRow = container.querySelectorAll('[data-testid="chat-debug-message-row"]')[2];
    const buttons = userRow?.querySelectorAll('button') ?? [];
    // Two text parts = two collapsible buttons
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    expect(userRow?.textContent).toContain('Hello');
    expect(userRow?.textContent).toContain('system-reminder');
  });

  it('renders thinking blocks in assistant messages', () => {
    const snapshot = createSnapshot();
    snapshot.messages[1] = {
      ...snapshot.messages[1],
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Let me search...', redacted: false },
        { type: 'text', text: 'Searching workspace' },
        { type: 'toolCall', id: 'call_1', name: 'node_search', arguments: { query: 'Tana' } },
      ],
    } as any;
    useChatDebugSnapshotMock.mockReturnValue({ snapshot, error: null, loading: false });

    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const asstRow = container.querySelectorAll('[data-testid="chat-debug-message-row"]')[3];
    expect(asstRow?.textContent).toContain('thinking');
    expect(asstRow?.textContent).toContain('Let me search');
  });

  it('labels redacted thinking blocks', () => {
    const snapshot = createSnapshot();
    snapshot.messages[1] = {
      ...snapshot.messages[1],
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '', redacted: true },
        { type: 'text', text: 'Searching workspace' },
        { type: 'toolCall', id: 'call_1', name: 'node_search', arguments: { query: 'Tana' } },
      ],
    } as any;
    useChatDebugSnapshotMock.mockReturnValue({ snapshot, error: null, loading: false });

    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const asstRow = container.querySelectorAll('[data-testid="chat-debug-message-row"]')[3];
    expect(asstRow?.textContent).toContain('thinking (redacted)');
    expect(asstRow?.textContent).toContain('content redacted by provider');
  });

  it('marks failed tool results with error indicator', () => {
    const snapshot = createSnapshot();
    (snapshot.messages[2] as any).isError = true;
    (snapshot.messages[2] as any).content = [{ type: 'text', text: 'Permission denied' }];
    snapshot.messageInspectors[2] = {
      ...snapshot.messageInspectors[2],
      summary: 'node_search (error) Permission denied',
    };
    useChatDebugSnapshotMock.mockReturnValue({ snapshot, error: null, loading: false });

    flushSync(() => {
      root.render(React.createElement(ChatDebugPanel, { debug: createDebugState() }));
    });

    const toolRow = container.querySelectorAll('[data-testid="chat-debug-message-row"]')[4];
    expect(toolRow?.textContent).toContain('node_search (error)');
    expect(toolRow?.textContent).toContain('Permission denied');
  });
});
