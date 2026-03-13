import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { formatLocalTimestamp, injectReminder } from '../../src/lib/ai-context.js';

describe('ai context', () => {
  it('formats time context timestamps with a local offset instead of UTC Zulu time', () => {
    const timestamp = formatLocalTimestamp(new Date(2026, 2, 12, 15, 4, 5));

    expect(timestamp).toMatch(/^2026-03-12T15:04:05[+-]\d{2}:\d{2}$/);
    expect(timestamp.endsWith('Z')).toBe(false);
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
