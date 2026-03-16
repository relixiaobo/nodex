import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatInput } from '../../src/components/chat/ChatInput.js';
import { ChatMessage } from '../../src/components/chat/ChatMessage.js';
import { shouldStickChatScroll } from '../../src/components/chat/ChatPanel.js';
import { DeskLayout } from '../../src/components/layout/DeskLayout.js';
import { GlobalTools } from '../../src/components/toolbar/TopToolbar.js';
import { resetChatPersistenceForTests } from '../../src/lib/ai-persistence.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetStores } from './helpers/test-state.js';

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

  it('renders message actions as an absolute overlay instead of reserving row height', () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatMessage, {
        entry: {
          nodeId: 'msg_1',
          message: {
            role: 'user',
            content: 'Tight, readable chat copy',
            timestamp: 1,
          },
          branches: { ids: ['msg_1', 'msg_2'], currentIndex: 0 },
        },
      }),
    );

    expect(html).toContain('data-testid="chat-message-toolbar"');
    expect(html).toContain('pointer-events-none absolute right-0 top-full');
    expect(html).toContain('group-hover/message:pointer-events-auto');
    expect(html).toContain('group-focus-within/message:opacity-100');
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

    expect(html).toContain('placeholder="Working…"' );
    expect(html).toContain('aria-label="Send message"');
    expect(html).toContain('disabled=""');
    expect(html).not.toContain('Stop');
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
