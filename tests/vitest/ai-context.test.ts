import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { formatLocalTimestamp, injectReminder, stripOldImages, transformAgentContext } from '../../src/lib/ai-context.js';
import { IMAGE_PLACEHOLDER } from '../../src/lib/ai-message-images.js';

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

describe('ai context', () => {
  it('formats time context timestamps with a local offset instead of UTC Zulu time', () => {
    const timestamp = formatLocalTimestamp(new Date(2026, 2, 12, 15, 4, 5));

    expect(timestamp).toMatch(/^2026-03-12T15:04:05[+-]\d{2}:\d{2}$/);
    expect(timestamp.endsWith('Z')).toBe(false);
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
      content: 'latest\n\n<system-reminder>ctx</system-reminder>',
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
          { type: 'text', text: `${IMAGE_PLACEHOLDER}\n\n<system-reminder>ctx</system-reminder>` },
        ],
        timestamp: 1,
      },
      createImageToolResult(2, 'keep-1'),
      createImageToolResult(3, 'keep-2'),
      createImageToolResult(4, 'keep-3'),
    ]);
  });
});
