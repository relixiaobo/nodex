import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatInput } from '../../src/components/chat/ChatInput.js';
import { ChatMessage } from '../../src/components/chat/ChatMessage.js';
import { ChatPanel, shouldStickChatScroll } from '../../src/components/chat/ChatPanel.js';
import { DeskLayout } from '../../src/components/layout/DeskLayout.js';
import { GlobalTools } from '../../src/components/toolbar/TopToolbar.js';
import { resetChatPersistenceForTests } from '../../src/lib/ai-persistence.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { NDX_F, SYS_V } from '../../src/types/index.js';
import { resetAndSeed, resetStores } from './helpers/test-state.js';

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

describe('chat ui', () => {
  const originalInnerWidth = window.innerWidth;
  const originalResizeObserver = globalThis.ResizeObserver;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    resetStores();
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

  it('uses text-base typography for chat body and composer', () => {
    const messageHtml = renderToStaticMarkup(
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
    const inputHtml = renderToStaticMarkup(
      React.createElement(ChatInput, {
        disabled: false,
        onSend: async () => {},
        onStop: () => {},
      }),
    );

    expect(messageHtml).toContain('text-base leading-6 text-foreground');
    expect(inputHtml).toContain('text-base leading-6 text-foreground');
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

    expect(html).toContain('placeholder="Working…"');
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
        },
        availableModels: [
          {
            id: 'claude-sonnet-4-5',
            name: 'Sonnet 4.5',
            provider: 'anthropic',
          },
          {
            id: 'gpt-4o',
            name: 'GPT-4o',
            provider: 'openai',
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

  it('shows an explicit AI Debug action in the composer menu', async () => {
    const onToggleDebug = vi.fn();

    flushSync(() => {
      root.render(React.createElement(ChatInput, {
        disabled: false,
        onSend: async () => {},
        onStop: () => {},
        onToggleDebug,
      }));
    });

    const menuButton = container.querySelector('button[aria-label="More options"]');
    expect(menuButton).not.toBeNull();

    flushSync(() => {
      menuButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Enable AI Debug');
    });

    const debugButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Enable AI Debug'),
    );
    expect(debugButton).not.toBeUndefined();

    flushSync(() => {
      debugButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onToggleDebug).toHaveBeenCalledTimes(1);
  });

  it('renders an empty state when no enabled provider is configured', async () => {
    resetAndSeed();

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { panelId: 'chat-panel', sessionId: 'session-empty' }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Configure an AI provider to start chatting');
      expect(container.textContent).toContain('Open Settings');
      expect(container.textContent).toContain('Enable AI Debug');
    });
  });

  it('can open AI Debug directly from the empty state', async () => {
    resetAndSeed();

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { panelId: 'chat-panel', sessionId: 'session-debug-empty' }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Enable AI Debug');
    });

    const debugButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Enable AI Debug'),
    );
    expect(debugButton).not.toBeUndefined();

    flushSync(() => {
      debugButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Chat Debug');
    });
  });

  it('keeps the chat composer visible when a provider is enabled without an API key', async () => {
    resetAndSeed();
    useNodeStore.getState().setFieldValue(
      SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE,
      NDX_F.PROVIDER_ENABLED,
      [SYS_V.YES],
    );
    useNodeStore.getState().setFieldValue(
      SYSTEM_SCHEMA_NODE_IDS.DEFAULT_AI_PROVIDER_NODE,
      NDX_F.PROVIDER_API_KEY,
      [],
    );

    flushSync(() => {
      root.render(React.createElement(ChatPanel, { panelId: 'chat-panel', sessionId: 'session-keyless-enabled' }));
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Ask about your notes, clips, or the page you\'re reading.');
    });

    expect(container.textContent).not.toContain('Configure an AI provider to start chatting');
  });

  it('renders the global chat trigger as a non-toggle button', () => {
    flushSync(() => {
      root.render(React.createElement(GlobalTools));
    });

    const trigger = container.querySelector('button[aria-label="Open chat"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute('aria-pressed')).toBeNull();
  });

  it('alt-click on the global chat trigger always opens a new chat panel', async () => {
    flushSync(() => {
      root.render(React.createElement(GlobalTools));
    });

    const trigger = container.querySelector('button[aria-label="Open chat"]');
    expect(trigger).not.toBeNull();

    flushSync(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    });
    await vi.waitFor(() => {
      expect(useUIStore.getState().panels).toHaveLength(1);
    });

    const firstPanelId = useUIStore.getState().activePanelId;

    flushSync(() => {
      trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    });
    await vi.waitFor(() => {
      expect(useUIStore.getState().panels).toHaveLength(2);
    });

    const state = useUIStore.getState();
    expect(state.activePanelId).not.toBe(firstPanelId);
    expect(state.panels.every((panel) => panel.nodeId.startsWith('chat:'))).toBe(true);
  });

  it('keeps the panel layout visible on narrow screens instead of swapping to a chat-only view', () => {
    window.innerWidth = 480;

    flushSync(() => {
      root.render(React.createElement(DeskLayout));
    });

    // Empty desk state renders DeskLanding with a search input (placeholder is an attribute, not text)
    expect(container.querySelector('input[placeholder]')).not.toBeNull();
    expect(container.textContent).not.toContain('Loading chat…');
  });
});
