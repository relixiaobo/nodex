import 'fake-indexeddb/auto';
import type { AgentMessage } from '@mariozechner/pi-agent-core';
import { deleteDB } from 'idb';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { linearToTree, type ChatSession } from '../../src/lib/ai-chat-tree.js';
import { resetChatPersistenceForTests } from '../../src/lib/ai-persistence.js';
import { createPastChatsTool } from '../../src/lib/ai-tools/past-chats-tool.js';

const DB_NAME = 'soma-ai-chat';

function createUserMessage(content: string, timestamp: number): AgentMessage {
  return {
    role: 'user',
    content,
    timestamp,
  };
}

function createAssistantMessage(
  content: Array<{ type: 'text'; text: string } | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }>,
  timestamp: number,
  stopReason: 'stop' | 'toolUse' = 'stop',
): AgentMessage {
  return {
    role: 'assistant',
    content,
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
    stopReason,
    timestamp,
  };
}

function createToolResultMessage(text: string, timestamp: number, toolCallId = 'call_1'): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId,
    toolName: 'browser',
    content: [{ type: 'text', text }],
    isError: false,
    timestamp,
  };
}

function buildSession(
  id: string,
  title: string,
  messages: AgentMessage[],
  updatedAt: number,
): ChatSession {
  const session = linearToTree(messages);
  session.id = id;
  session.title = title;
  session.updatedAt = updatedAt;
  return session;
}

async function resetPersistence(): Promise<void> {
  resetChatPersistenceForTests();
  await deleteDB(DB_NAME);
  resetChatPersistenceForTests();
}

async function seedSessions(sessions: ChatSession[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);

    request.onupgradeneeded = () => {
      const db = request.result;
      const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
      sessionStore.createIndex('updatedAt', 'updatedAt');
      const metaStore = db.createObjectStore('session-metas', { keyPath: 'id' });
      metaStore.createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('session-debug-turns', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['sessions', 'session-metas'], 'readwrite');
      const sessionStore = tx.objectStore('sessions');
      const metaStore = tx.objectStore('session-metas');

      for (const session of sessions) {
        sessionStore.put(session);
        metaStore.put({
          id: session.id,
          title: session.title,
          updatedAt: session.updatedAt,
        });
      }

      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  });
}

describe('past_chats tool', () => {
  beforeEach(async () => {
    await resetPersistence();
  });

  afterAll(async () => {
    await resetPersistence();
  });

  it('lists sessions, excludes the current chat, and lets Level 0 query match assistant text', async () => {
    await seedSessions([
      buildSession('session_alpha', 'Pricing review', [
      createUserMessage('Kick off pricing review', 1),
      createAssistantMessage([{ type: 'text', text: 'We should segment pricing by plan.' }], 2),
      createUserMessage('What did we decide for enterprise?', 3),
      createAssistantMessage([{ type: 'text', text: 'Enterprise gets annual contracts first.' }], 4),
    ], Date.parse('2026-03-01T10:00:00Z')),
      buildSession('session_beta', 'Sync roadmap', [
      createUserMessage('Roadmap for sync', 10),
      createAssistantMessage([{ type: 'text', text: 'Need CRDT snapshot compaction.' }], 11),
    ], Date.parse('2026-03-10T10:00:00Z')),
      buildSession('session_current', 'Current chat', [
      createUserMessage('Current chat message', 20),
      createAssistantMessage([{ type: 'text', text: 'Current response' }], 21),
    ], Date.parse('2026-03-20T10:00:00Z')),
    ]);

    const tool = createPastChatsTool({
      getCurrentSessionId: () => 'session_current',
    });

    const result = await tool.execute('tool_past_chats', {
      query: 'annual contracts first',
    } as never);

    expect(result.details).toEqual({
      total: 1,
      offset: 0,
      limit: 10,
      sessions: [{
        id: 'session_alpha',
        title: 'Pricing review',
        updatedAt: '2026-03-01T10:00:00.000Z',
        userMessageCount: 2,
      }],
      next: 'Choose a session id from sessions and call past_chats(sessionId: "...") to browse its user messages.',
    });
  });

  it('filters session browsing by inclusive before/after bounds', async () => {
    await seedSessions([
      buildSession('session_1', 'One', [
      createUserMessage('One', 1),
    ], Date.parse('2026-03-01T10:00:00Z')),
      buildSession('session_2', 'Two', [
      createUserMessage('Two', 2),
    ], Date.parse('2026-03-05T10:00:00Z')),
      buildSession('session_3', 'Three', [
      createUserMessage('Three', 3),
    ], Date.parse('2026-03-10T10:00:00Z')),
    ]);

    const tool = createPastChatsTool();
    const result = await tool.execute('tool_past_chats', {
      after: '2026-03-05',
      before: '2026-03-10',
    } as never);

    expect((result.details as { sessions: Array<{ id: string }> }).sessions.map((session) => session.id)).toEqual([
      'session_3',
      'session_2',
    ]);
  });

  it('uses fuzzy matching for multi-term, mixed-language, typo, and CJK session queries', async () => {
    await seedSessions([
      buildSession('session_cn', '会议纪要', [
        createUserMessage('今天会议决定涨价', 1),
        createAssistantMessage([{ type: 'text', text: '需要同步给销售团队。' }], 2),
      ], Date.parse('2026-03-02T10:00:00Z')),
      buildSession('session_en', 'Pricing review', [
        createUserMessage('Kick off pricing review', 3),
        createAssistantMessage([{ type: 'text', text: 'We should revisit packaging.' }], 4),
      ], Date.parse('2026-03-03T10:00:00Z')),
      buildSession('session_mixed', 'Quarterly planning', [
        createUserMessage('Q3 涨价决策讨论', 5),
        createAssistantMessage([{ type: 'text', text: '先准备公告草稿。' }], 6),
      ], Date.parse('2026-03-04T10:00:00Z')),
      buildSession('session_char', '周报', [
        createUserMessage('今天的会议记录', 7),
      ], Date.parse('2026-03-05T10:00:00Z')),
    ]);

    const tool = createPastChatsTool();
    const cases = [
      { query: '会议 决定', expectedId: 'session_cn' },
      { query: 'pricing review', expectedId: 'session_en' },
      { query: 'Q3 涨价', expectedId: 'session_mixed' },
      { query: 'pricng', expectedId: 'session_en' },
      { query: '会', expectedId: 'session_char' },
    ];

    for (const { query, expectedId } of cases) {
      const result = await tool.execute('tool_past_chats', { query } as never);
      const sessionIds = (result.details as { sessions: Array<{ id: string }> }).sessions.map((session) => session.id);

      expect(sessionIds).toContain(expectedId);
    }
  });

  it('lists Level 0 session summaries from persisted metadata fields', async () => {
    await seedSessions([
      buildSession('session_meta_only', 'Strategy sync', [
        createUserMessage('Kick off pricing review', 1),
        createAssistantMessage([{ type: 'text', text: 'Need to finalize the rollout.' }], 2),
        createUserMessage('Q3 涨价决策讨论', 3),
      ], Date.parse('2026-03-07T10:00:00Z')),
    ]);

    const tool = createPastChatsTool();
    const result = await tool.execute('tool_past_chats', {
      query: 'Q3 涨价',
    } as never);

    expect(result.details).toEqual({
      total: 1,
      offset: 0,
      limit: 10,
      sessions: [{
        id: 'session_meta_only',
        title: 'Strategy sync',
        updatedAt: '2026-03-07T10:00:00.000Z',
        userMessageCount: 2,
      }],
      next: 'Choose a session id from sessions and call past_chats(sessionId: "...") to browse its user messages.',
    });
  });

  it('lists only user messages in a session and strips injected system reminders', async () => {
    await seedSessions([
      buildSession('session_alpha', 'Pricing review', [
      createUserMessage('Kick off pricing review', 1),
      createAssistantMessage([{ type: 'text', text: 'We should segment pricing by plan.' }], 2),
      createUserMessage('<system-reminder>\nctx\n</system-reminder>\n\nWhat did we decide for enterprise?', 3),
      createAssistantMessage([{ type: 'text', text: 'Enterprise gets annual contracts first.' }], 4),
    ], Date.parse('2026-03-01T10:00:00Z')),
    ]);

    const tool = createPastChatsTool();
    const result = await tool.execute('tool_past_chats', {
      sessionId: 'session_alpha',
      query: 'enterprise',
    } as never);

    expect(result.details).toEqual({
      title: 'Pricing review',
      total: 1,
      offset: 0,
      limit: 10,
      userMessages: [{
        id: expect.any(String),
        text: 'What did we decide for enterprise?',
        createdAt: '1970-01-01T00:00:00.003Z',
      }],
      next: 'Choose a message id from userMessages and call past_chats(sessionId: "...", messageId: "...") to read the full exchange.',
    });
  });

  it('uses the same fuzzy matching rules when filtering user messages within a session', async () => {
    await seedSessions([
      buildSession('session_fuzzy', 'Search playground', [
        createUserMessage('今天会议决定涨价', 1),
        createAssistantMessage([{ type: 'text', text: '需要同步给销售团队。' }], 2),
        createUserMessage('Kick off pricing review', 3),
        createAssistantMessage([{ type: 'text', text: 'We should revisit packaging.' }], 4),
        createUserMessage('Q3 涨价决策讨论', 5),
        createAssistantMessage([{ type: 'text', text: '先准备公告草稿。' }], 6),
        createUserMessage('今天的会议记录', 7),
      ], Date.parse('2026-03-06T10:00:00Z')),
    ]);

    const tool = createPastChatsTool();
    const cases = [
      { query: '会议 决定', expectedText: '今天会议决定涨价' },
      { query: 'pricing review', expectedText: 'Kick off pricing review' },
      { query: 'Q3 涨价', expectedText: 'Q3 涨价决策讨论' },
      { query: 'pricng', expectedText: 'Kick off pricing review' },
      { query: '会', expectedText: '今天的会议记录' },
    ];

    for (const { query, expectedText } of cases) {
      const result = await tool.execute('tool_past_chats', {
        sessionId: 'session_fuzzy',
        query,
      } as never);
      const messageTexts = (result.details as { userMessages: Array<{ text: string }> }).userMessages.map((message) => message.text);

      expect(messageTexts).toContain(expectedText);
    }
  });

  it('reads a user message with assistant replies, skipping tool results and paginating long text', async () => {
    const session = buildSession('session_alpha', 'Pricing review', [
      createUserMessage('What did we decide for enterprise?', 1),
      createAssistantMessage([
        { type: 'toolCall', id: 'call_1', name: 'browser', arguments: { action: 'read' } },
      ], 2, 'toolUse'),
      createToolResultMessage('Ignore this intermediate tool result', 3, 'call_1'),
      createAssistantMessage([
        { type: 'text', text: 'Enterprise gets annual contracts first. Next step is pricing validation.' },
      ], 4),
      createAssistantMessage([
        { type: 'text', text: 'Document the rollout in the Q3 plan.' },
      ], 5),
      createUserMessage('Follow-up topic', 6),
    ], Date.parse('2026-03-01T10:00:00Z'));
    await seedSessions([session]);

    const userMessageId = Object.values(session.mapping)
      .find((node) => node.message?.role === 'user' && node.message.timestamp === 1)?.id;

    expect(userMessageId).toBeTruthy();

    const tool = createPastChatsTool();
    const firstPage = await tool.execute('tool_past_chats', {
      sessionId: 'session_alpha',
      messageId: userMessageId!,
      maxChars: 60,
    } as never);

    expect(firstPage.details).toEqual({
      user: {
        id: userMessageId,
        text: 'What did we decide for enterprise?',
        createdAt: '1970-01-01T00:00:00.001Z',
      },
      assistant: {
        text: 'Enterprise gets annual contracts first. Next step is pricing',
        totalLength: 110,
        offset: 0,
        truncated: true,
        nextOffset: 60,
      },
      next: 'Use textOffset: nextOffset to continue the assistant response.',
    });

    const secondPage = await tool.execute('tool_past_chats', {
      sessionId: 'session_alpha',
      messageId: userMessageId!,
      maxChars: 60,
      textOffset: 60,
    } as never);

    expect(secondPage.details).toEqual({
      user: {
        id: userMessageId,
        text: 'What did we decide for enterprise?',
        createdAt: '1970-01-01T00:00:00.001Z',
      },
      assistant: {
        text: ' validation.\n\nDocument the rollout in the Q3 plan.',
        totalLength: 110,
        offset: 60,
      },
    });
  });

  it('rejects explicit access to the current session and invalid parameter combinations', async () => {
    await seedSessions([buildSession('session_current', 'Current chat', [
      createUserMessage('Current chat message', 20),
    ], Date.parse('2026-03-20T10:00:00Z'))]);

    const tool = createPastChatsTool({
      getCurrentSessionId: () => 'session_current',
    });

    await expect(tool.execute('tool_past_chats', {
      sessionId: 'session_current',
    } as never)).rejects.toThrow('Session session_current is the current chat. Use the existing conversation context instead of past_chats.');

    await expect(tool.execute('tool_past_chats', {
      textOffset: 0,
    } as never)).rejects.toThrow('textOffset requires messageId.');

    await expect(tool.execute('tool_past_chats', {
      maxChars: 200,
    } as never)).rejects.toThrow('maxChars requires messageId.');

    await expect(tool.execute('tool_past_chats', {
      sessionId: 'session_current',
      before: '2026-03-20',
    } as never)).rejects.toThrow('before is only valid when sessionId is omitted.');

    await expect(tool.execute('tool_past_chats', {
      sessionId: 'session_current',
      messageId: 'msg_1',
      query: 'current',
    } as never)).rejects.toThrow('query is not valid with messageId.');

    await expect(tool.execute('tool_past_chats', {
      sessionId: 'session_current',
      messageId: 'msg_1',
      limit: 1,
    } as never)).rejects.toThrow('limit is not valid with messageId.');
  });

  it('returns a boundary when the selected user message has no assistant reply', async () => {
    const session = buildSession('session_alpha', 'Pending reply', [
      createUserMessage('Question with no answer yet', 1),
    ], Date.parse('2026-03-01T10:00:00Z'));
    await seedSessions([session]);

    const userMessageId = Object.values(session.mapping)
      .find((node) => node.message?.role === 'user')?.id;

    const tool = createPastChatsTool();
    const result = await tool.execute('tool_past_chats', {
      sessionId: 'session_alpha',
      messageId: userMessageId!,
    } as never);

    expect(result.details).toEqual({
      user: {
        id: userMessageId,
        text: 'Question with no answer yet',
        createdAt: '1970-01-01T00:00:00.001Z',
      },
      assistant: null,
      boundary: 'No assistant reply exists after this user message on the active branch.',
    });
  });

  it('rejects textOffset values beyond the assistant response length', async () => {
    const session = buildSession('session_alpha', 'Pricing review', [
      createUserMessage('What did we decide for enterprise?', 1),
      createAssistantMessage([{ type: 'text', text: 'Short answer.' }], 2),
    ], Date.parse('2026-03-01T10:00:00Z'));
    await seedSessions([session]);

    const userMessageId = Object.values(session.mapping)
      .find((node) => node.message?.role === 'user')?.id;

    const tool = createPastChatsTool();

    await expect(tool.execute('tool_past_chats', {
      sessionId: 'session_alpha',
      messageId: userMessageId!,
      textOffset: 99,
    } as never)).rejects.toThrow('textOffset is past the end of the assistant response.');
  });
});
