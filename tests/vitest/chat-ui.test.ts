import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatInput } from '../../src/components/chat/ChatInput.js';
import { ChatPanelHeader } from '../../src/components/chat/ChatPanelHeader.js';
import { ChatMessage } from '../../src/components/chat/ChatMessage.js';
import { ChatPanel, shouldStickChatScroll } from '../../src/components/chat/ChatPanel.js';
import { extractInlineMarkup, splitMarkdownBlocks } from '../../src/components/chat/MarkdownRenderer.js';
import { DrawerLayout } from '../../src/components/layout/DrawerLayout.js';
import { appendMessage, createSession, editMessage, getLinearPath, linearToTree, switchBranch as switchChatBranch } from '../../src/lib/ai-chat-tree.js';
import { resetChatPersistenceForTests, saveChatSession } from '../../src/lib/ai-persistence.js';
import { resetAIAgentForTests } from '../../src/lib/ai-service.js';
import { findProviderOptionNodeId, getApiKeyForProvider } from '../../src/lib/ai-provider-config.js';
import { ensureTodayNode } from '../../src/lib/journal.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { getStartupPagePreference, STARTUP_PAGE } from '../../src/lib/settings-service.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { NDX_F, SYS_V } from '../../src/types/index.js';
import { resetAndSeed, resetStores } from './helpers/test-state.js';

/**
 * Seed a provider config node under the Settings AI Providers field entry.
 * Returns the created node ID.
 */
function seedProviderConfig({
  provider,
  enabled,
  apiKey,
  name,
}: {
  provider: string;
  enabled: boolean;
  apiKey?: string;
  name: string;
}): string {
  const store = useNodeStore.getState();
  const node = store.createChild(
    SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_PROVIDERS_FIELD_ENTRY,
    undefined,
    { name },
    { commit: false },
  );

  const providerOptionNodeId = findProviderOptionNodeId(provider);
  if (providerOptionNodeId) {
    store.setOptionsFieldValue(node.id, NDX_F.PROVIDER_ID, providerOptionNodeId);
  }

  store.setFieldValue(node.id, NDX_F.PROVIDER_ENABLED, [enabled ? SYS_V.YES : SYS_V.NO]);
  if (apiKey !== undefined) {
    store.setFieldValue(node.id, NDX_F.PROVIDER_API_KEY, apiKey ? [apiKey] : []);
  }

  return node.id;
}

const DB_NAME = 'soma-ai-chat';

class MockResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    this.callback(
      [
        {
          target,
          contentRect: {
            width: 480,
            height: 640,
          } as DOMRectReadOnly,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }

  disconnect() {}

  unobserve() {}

  takeRecords(): ResizeObserverEntry[] {
    return [];
  }
}

function createUserMessage(content: string, timestamp: number) {
  return {
    role: 'user' as const,
    content,
    timestamp,
  };
}

function createAssistantMessage(text: string, timestamp: number) {
  return {
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text }],
    api: 'anthropic-messages' as const,
    provider: 'anthropic' as const,
    model: 'test',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop' as const,
    timestamp,
  };
}

function createToolCall(id: string, name: string, args: Record<string, unknown> = {}) {
  return { type: 'toolCall' as const, id, name, arguments: args };
}

function createThinkingBlock(thinking: string, redacted = false) {
  return {
    type: 'thinking' as const,
    thinking,
    redacted,
  };
}

function createAssistantBlocksMessage(
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }
    | { type: 'thinking'; thinking: string; redacted: boolean }
  >,
  timestamp: number,
) {
  return {
    role: 'assistant' as const,
    content,
    api: 'anthropic-messages' as const,
    provider: 'anthropic' as const,
    model: 'test',
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop' as const,
    timestamp,
  };
}

function createToolResultMessage(toolCallId: string, timestamp: number, text: string) {
  return {
    role: 'toolResult' as const,
    toolCallId,
    toolName: 'browser',
    content: [{ type: 'text' as const, text }],
    isError: false,
    timestamp,
  };
}

describe('chat ui', () => {
  const originalInnerWidth = window.innerWidth;
  const originalResizeObserver = globalThis.ResizeObserver;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    resetStores();
    resetAIAgentForTests();
    resetChatPersistenceForTests();
    await deleteDB(DB_NAME);
    resetChatPersistenceForTests();
    window.innerWidth = originalInnerWidth;
    globalThis.ResizeObserver = MockResizeObserver as typeof ResizeObserver;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    flushSync(() => {
      root.unmount();
    });
    container.remove();
    window.innerWidth = originalInnerWidth;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('keeps auto-scroll sticky only when the reader is already near the bottom', () => {
    expect(shouldStickChatScroll({
      scrollHeight: 1000,
      scrollTop: 560,
      clientHeight: 400,
    })).toBe(true);

    expect(shouldStickChatScroll({
      scrollHeight: 1000,
      scrollTop: 360,
      clientHeight: 400,
    })).toBe(false);
  });

  it('renders user toolbar on hover and assistant toolbar always visible', () => {
    const userHtml = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_1',
          message: {
            role: 'user',
            content: 'User message',
            timestamp: 1,
          },
          branches: { ids: ['msg_1', 'msg_2'], currentIndex: 0 },
        },
      }),
    );

    // User toolbar: hover-to-show, right-aligned
    expect(userHtml).toContain('data-testid="chat-message-toolbar"');
    expect(userHtml).toContain('group/message');
    expect(userHtml).toContain('opacity-0');
    expect(userHtml).toContain('group-hover/message:opacity-100');

    const assistantHtml = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_2',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'AI reply' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'test',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'stop',
            timestamp: 2,
          },
          branches: null,
        },
      }),
    );

    // Assistant toolbar: always visible, left-aligned (isLastInTurn defaults to true)
    expect(assistantHtml).toContain('data-testid="chat-message-toolbar"');
    expect(assistantHtml).toContain('justify-start');
    expect(assistantHtml).not.toContain('opacity-0');

    // Mid-turn assistant messages (isLastInTurn=false) hide toolbar
    const midTurnHtml = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_3',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Intermediate step' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'test',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'stop',
            timestamp: 3,
          },
          branches: null,
        },
        isLastInTurn: false,
      }),
    );
    expect(midTurnHtml).not.toContain('data-testid="chat-message-toolbar"');
  });

  it('renders a message-level streaming spinner aligned with the assistant content flow', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        turnPhase: 'waiting_for_tool',
        entry: {
          nodeId: null,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Partial answer' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'test',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'stop',
            timestamp: 2,
          },
          branches: null,
        },
      }),
    );

    expect(html).toContain('data-testid="chat-message-streaming-indicator"');
    expect(html).toContain('chat-streaming-capsule');
    expect(html).not.toContain('chat-streaming-status');
  });

  it('renders assistant messages with chat-prose markdown and user messages with text-base', () => {
    // User messages still use plain text
    const userHtml = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_1',
          message: {
            role: 'user',
            content: 'Readable body text',
            timestamp: 1,
          },
          branches: null,
        },
      }),
    );
    expect(userHtml).toContain('text-base leading-6 text-foreground');

    // Assistant messages use chat-prose (markdown renderer)
    const assistantHtml = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_2',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello **bold** and `code`' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'test',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'stop',
            timestamp: 2,
          },
          branches: null,
        },
      }),
    );
    expect(assistantHtml).toContain('chat-prose');
    expect(assistantHtml).toContain('<strong>bold</strong>');
    expect(assistantHtml).toContain('chat-inline-code');

    // Composer still uses text-base
    const inputHtml = renderToStaticMarkup(
      React.createElement(ChatInput, {
        disabled: false,
        onSend: async () => {},
        onStop: () => {},
      }),
    );
    expect(inputHtml).toContain('text-base');
    expect(inputHtml).toContain('leading-6');
    expect(inputHtml).toContain('text-foreground');
  });

  it('renders code blocks with syntax highlighting', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_code',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: '```typescript\nconst x: number = 42;\n```' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'test',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'stop',
            timestamp: 2,
          },
          branches: null,
        },
      }),
    );
    expect(html).toContain('chat-code-block');
    expect(html).toContain('code-block-pre');
    expect(html).toContain('hljs-');
  });

  it('renders error messages as inline error footer with retry button', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_err',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Something **went** wrong' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'test',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'error',
            errorMessage: 'API error',
            timestamp: 2,
          },
          branches: null,
        },
      }),
    );
    // Partial text before error is still rendered as markdown
    expect(html).toContain('chat-prose');
    expect(html).toContain('<strong>');
    // Error footer with destructive styling and retry button
    expect(html).toContain('text-destructive');
    expect(html).toContain('API error');
    expect(html).toContain('Retry');
  });

  it('skips raw JSON error blocks and shows parsed error message', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_json_err',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: '{"type":"error","error":{"type":"api_error","message":"Internal server error"},"request_id":"req_123"}' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'test',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'error',
            errorMessage: '{"type":"error","error":{"type":"api_error","message":"Internal server error"},"request_id":"req_123"}',
            timestamp: 2,
          },
          branches: null,
        },
      }),
    );
    // Raw JSON should NOT be rendered
    expect(html).not.toContain('request_id');
    expect(html).not.toContain('req_123');
    // Parsed user-friendly message should show
    expect(html).toContain('Internal server error');
    expect(html).toContain('Retry');
  });

  it('renders the message-level breathing capsule instead of the legacy inline cursor hack', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_stream',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Streaming response...' }],
            api: 'anthropic-messages',
            provider: 'anthropic',
            model: 'test',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'stop',
            timestamp: 2,
          },
          branches: null,
        },
        turnPhase: 'waiting_for_tool',
      }),
    );
    expect(html).toContain('Streaming response...');
    expect(html).toContain('chat-prose');
    expect(html).toContain('chat-message-streaming-indicator');
    expect(html).toContain('chat-streaming-capsule');
    expect(html).not.toContain('animate-spin');
  });

  it('keeps composer in working state without turning it into a stop action', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatInput, {
        disabled: false,
        busy: true,
        onSend: async () => {},
        onStop: () => {},
      }),
    );

    // Placeholder is now a CSS custom property, not a native attribute
    expect(html).toContain('Working');
    expect(html).toContain('aria-label="Send message"');
    expect(html).toContain('disabled=""');
    // Stop button only appears when disabled=true (streaming), not when busy
    expect(html).not.toContain('aria-label="Stop generating"');
  });

  it('renders a model selector in the composer footer when models are available', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatInput, {
        disabled: false,
        currentModel: {
          id: 'claude-sonnet-4-5',
          name: 'Sonnet 4.5',
          provider: 'anthropic',
          reasoning: true,
          featured: true,
        },
        availableModels: [
          {
            id: 'claude-sonnet-4-5',
            name: 'Sonnet 4.5',
            provider: 'anthropic',
            reasoning: true,
            featured: true,
            description: 'Fast and efficient',
          },
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            provider: 'openai',
            reasoning: false,
            featured: false,
          },
        ],
        onModelChange: () => {},
        onSend: async () => {},
        onStop: () => {},
      }),
    );

    expect(html).toContain('aria-label="Select model"');
    expect(html).toContain('Sonnet 4.5');
  });

  it('renders onboarding when no enabled provider with an API key is configured', async () => {
    resetAndSeed();

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { sessionId: 'session-empty' }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Connect an AI provider');
      expect(container.textContent).toContain('Save');
    });
  });

  it('shows a settings fallback when a provider is configured but no models resolve', async () => {
    resetAndSeed();
    loroDoc.createNode('NDX_PROVIDER_OPT_QWEN', NDX_F.PROVIDER_ID);
    loroDoc.setNodeRichTextContent('NDX_PROVIDER_OPT_QWEN', 'qwen', [], []);
    loroDoc.commitDoc();
    seedProviderConfig({
      provider: 'qwen',
      enabled: true,
      apiKey: 'sk-qwen-primary',
      name: 'Qwen',
    });

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { sessionId: 'session-no-models' }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('does not expose any chat models yet');
      expect(container.textContent).toContain('Open Settings');
    });
  });

  it('renders the compact chat header chrome', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatPanelHeader, {
        sessionId: 'session-empty',
        onClose: () => {},
      }),
    );

    expect(html).toContain('title="Edit title"');
    expect(html).toContain('aria-label="Close chat"');
  });

  it('saves an API key from onboarding and unlocks the normal chat empty state', async () => {
    resetAndSeed();

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { sessionId: 'session-keyless-enabled' }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Save');
    });

    const apiKeyInput = container.querySelector('input[aria-label="API key"]') as HTMLInputElement;
    const submitButton = container.querySelector('button[type="submit"]') as HTMLButtonElement;

    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(apiKeyInput, 'sk-ant-primary');
      apiKeyInput.dispatchEvent(new Event('input', { bubbles: true }));
      apiKeyInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    flushSync(() => {
      submitButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(getApiKeyForProvider('anthropic')).toBe('sk-ant-primary');
      expect(container.textContent).toContain('What are you thinking about?');
    });
  });

  // "Start with outliner" button removed — outliner is always visible in drawer layout.

  it('updates the rendered conversation when switching chat branches', async () => {
    resetAndSeed();
    // Default Anthropic provider is no longer auto-created; seed one explicitly.
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-branch-test',
      name: 'Anthropic',
    });

    const session = linearToTree([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4),
    ]);
    const originalUser = getLinearPath(session)[2];
    editMessage(session, originalUser!.id, createUserMessage('alt-user', 5));
    appendMessage(session, createAssistantMessage('alt-assistant', 6));
    switchChatBranch(session, originalUser!.id);
    await saveChatSession(session);

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { sessionId: session.id }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('user-2');
      expect(container.textContent).toContain('assistant-2');
      expect(container.textContent).toContain('1/2');
    });

    const nextBranchButton = container.querySelector('button[aria-label="Show next branch"]');
    expect(nextBranchButton).not.toBeNull();

    flushSync(() => {
      nextBranchButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('alt-user');
      expect(container.textContent).toContain('alt-assistant');
      expect(container.textContent).toContain('2/2');
      expect(container.textContent).not.toContain('assistant-2');
    });
  });

  it('groups consecutive tool-call-only assistant messages across chat messages', async () => {
    resetAndSeed();
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-tool-group',
      name: 'Anthropic',
    });

    const session = linearToTree([
      createUserMessage('Check the page', 1),
      createAssistantBlocksMessage([
        createToolCall('call_1', 'browser', { action: 'navigate', url: 'https://example.com' }),
      ], 2),
      createToolResultMessage('call_1', 3, 'Opened page'),
      createAssistantBlocksMessage([
        createThinkingBlock('Need another step'),
        createToolCall('call_2', 'browser', { action: 'click', elementDescription: 'Details' }),
      ], 4),
      createToolResultMessage('call_2', 5, 'Clicked details'),
      createAssistantBlocksMessage([
        createToolCall('call_3', 'browser', { action: 'get_text' }),
      ], 6),
    ]);
    await saveChatSession(session);

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { sessionId: session.id }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Thought');
      // Cross-message grouping: tool-call-only messages after toolResults are grouped
      expect(container.textContent).toContain('Working through 2 steps');
    });
  });

  it('breaks cross-message grouping when the next assistant message has text content', async () => {
    resetAndSeed();
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-tool-break',
      name: 'Anthropic',
    });

    const session = linearToTree([
      createUserMessage('Check the page', 1),
      createAssistantBlocksMessage([
        createToolCall('call_1', 'browser', { action: 'navigate', url: 'https://example.com' }),
      ], 2),
      createToolResultMessage('call_1', 3, 'Opened page'),
      createAssistantBlocksMessage([
        { type: 'text', text: 'Here are the results.' },
      ], 4),
    ]);
    await saveChatSession(session);

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { sessionId: session.id }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('https://example.com');
      expect(container.textContent).toContain('Here are the results.');
    });

    expect(container.textContent).not.toContain('step 1');
    expect(container.textContent).not.toContain('Opened page');
  });

  it('shows steering placeholder when onSteer is provided during streaming', () => {
    flushSync(() => {
      root.render(React.createElement(ChatInput, {
        disabled: true,
        onSend: async () => {},
        onStop: () => {},
        onSteer: () => {},
      }));
    });

    // ChatInput now uses ProseMirror with CSS custom property placeholder
    const editorMount = container.querySelector('.chat-input-editor') as HTMLElement;
    expect(editorMount).not.toBeNull();
    expect(editorMount.style.getPropertyValue('--chat-placeholder')).toContain('Steer');
    // Editor should not be disabled when steering is available
    const pm = editorMount.querySelector('.ProseMirror') as HTMLElement;
    expect(pm?.getAttribute('contenteditable')).toBe('true');
  });

  it('shows stop button when streaming with empty input', () => {
    flushSync(() => {
      root.render(React.createElement(ChatInput, {
        disabled: true,
        onSend: async () => {},
        onStop: () => {},
        onSteer: () => {},
      }));
    });

    // Empty editor — stop button
    expect(container.querySelector('button[aria-label="Stop generating"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Send message"]')).toBeNull();
  });

  it('renders ProseMirror editor with contenteditable for steering mode', () => {
    flushSync(() => {
      root.render(React.createElement(ChatInput, {
        disabled: true,
        onSend: async () => {},
        onStop: () => {},
        onSteer: () => {},
      }));
    });

    // ProseMirror editor should be present and editable (for steering)
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    expect(pm).not.toBeNull();
    expect(pm?.getAttribute('contenteditable')).toBe('true');
  });

  it('keeps the drawer layout visible on narrow screens instead of swapping to a chat-only view', async () => {
    resetAndSeed();
    window.innerWidth = 480;
    const session = createSession();
    await saveChatSession(session);
    useUIStore.setState({
      chatDrawerOpen: false,
      currentChatSessionId: session.id,
      currentNodeId: ensureTodayNode(),
      nodeHistory: [ensureTodayNode()],
      nodeHistoryIndex: 0,
    });

    flushSync(() => {
      root.render(React.createElement(DrawerLayout));
    });

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="top-bar"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="floating-chat-bar"]')).not.toBeNull();
    });
  });
});

describe('extractInlineMarkup', () => {
  it('extracts ref and cite tags into placeholders', () => {
    const input = 'See <ref id="n1">Node 1</ref> and <cite id="n2">2</cite> here.';
    const { cleaned, placeholders } = extractInlineMarkup(input);
    expect(cleaned).toBe('See %%SOMA_0%% and %%SOMA_1%% here.');
    expect(placeholders).toHaveLength(2);
    expect(placeholders[0]).toEqual({ kind: 'ref', nodeId: 'n1', content: 'Node 1' });
    expect(placeholders[1]).toEqual({ kind: 'cite', id: 'n2', content: '2', citeType: 'node' });
  });

  it('returns unchanged text when no inline markup is present', () => {
    const input = 'Plain text with **bold** and `code`.';
    const { cleaned, placeholders } = extractInlineMarkup(input);
    expect(cleaned).toBe(input);
    expect(placeholders).toHaveLength(0);
  });
});

describe('splitMarkdownBlocks', () => {
  it('splits a multi-block markdown string', () => {
    const input = '# Title\n\nA paragraph.\n\n```js\ncode\n```\n';
    const blocks = splitMarkdownBlocks(input);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks[0]).toContain('# Title');
  });

  it('returns a single block for empty input', () => {
    expect(splitMarkdownBlocks('')).toEqual(['']);
  });
});
