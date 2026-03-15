import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatInput } from '../../src/components/chat/ChatInput.js';
import { ChatMessage } from '../../src/components/chat/ChatMessage.js';
import { shouldStickChatScroll } from '../../src/components/chat/ChatDrawer.js';

describe('chat ui', () => {
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
});
