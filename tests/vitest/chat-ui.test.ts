import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatInput } from '../../src/components/chat/ChatInput.js';
import { ChatMessage } from '../../src/components/chat/ChatMessage.js';
import { shouldStickChatScroll } from '../../src/components/chat/ChatDrawer.js';
import { DeskLayout } from '../../src/components/layout/DeskLayout.js';
import { GlobalTools } from '../../src/components/toolbar/TopToolbar.js';
import { useUIStore } from '../../src/stores/ui-store.js';
import { resetStores } from './helpers/test-state.js';

describe('chat ui', () => {
  const originalInnerWidth = window.innerWidth;
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetStores();
    window.innerWidth = originalInnerWidth;
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

  it('renders the global chat toggle with the current open state', () => {
    useUIStore.getState().openChat();

    flushSync(() => {
      root.render(React.createElement(GlobalTools));
    });

    const toggle = container.querySelector('button[aria-label="Close chat"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows only the chat fallback on narrow screens when chat is open', () => {
    window.innerWidth = 480;
    useUIStore.getState().openChat();

    flushSync(() => {
      root.render(React.createElement(DeskLayout));
    });

    expect(container.textContent).toContain('Loading chat…');
    expect(container.textContent).not.toContain('Press ⌘K to search');
    expect(container.querySelector('button[aria-label="Open chat"]')).toBeNull();
  });
});
