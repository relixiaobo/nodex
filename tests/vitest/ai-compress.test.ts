import type { Agent, AgentMessage } from '@mariozechner/pi-agent-core';
import { describe, expect, it, vi } from 'vitest';
import {
  BRIDGE_TEMPLATE,
  COMPACT_PROMPT,
  bridgeToUserMessage,
  compactIfNeeded,
  findLatestApplicableBridge,
  getCompressedPath,
  getLastKnownInputTokens,
} from '../../src/lib/ai-compress.js';
import {
  appendMessage,
  createSession,
  editMessage,
  getLinearPath,
  switchBranch,
  type ChatSession,
} from '../../src/lib/ai-chat-tree.js';

function createUserMessage(content: string, timestamp: number): AgentMessage {
  return {
    role: 'user',
    content,
    timestamp,
  };
}

function createAssistantMessage(
  text: string,
  timestamp: number,
  inputTokens = 0,
): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    usage: {
      input: inputTokens,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: inputTokens,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: 'stop',
    timestamp,
  };
}

function createLinearSession(): ChatSession {
  const session = createSession();
  appendMessage(session, createUserMessage('user-1', 1));
  appendMessage(session, createAssistantMessage('assistant-1', 2, 100));
  appendMessage(session, createUserMessage('user-2', 3));
  appendMessage(session, createAssistantMessage('assistant-2', 4, 700));
  return session;
}

function createStubAgent(messages: AgentMessage[], contextWindow = 1000): Agent {
  const state = {
    messages: messages.slice(),
    model: {
      id: 'claude-sonnet-4-5',
      provider: 'anthropic',
      contextWindow,
    },
    systemPrompt: 'system prompt',
    tools: [],
  };

  return {
    state,
    streamFn: vi.fn(),
    sessionId: 'session_1',
    replaceMessages: vi.fn((nextMessages: AgentMessage[]) => {
      state.messages = nextMessages;
    }),
  } as unknown as Agent;
}

describe('ai-compress', () => {
  it('extracts the latest known input tokens from assistant messages', () => {
    const messages = [
      createUserMessage('hello', 1),
      createAssistantMessage('first', 2, 120),
      createUserMessage('follow-up', 3),
      {
        ...createAssistantMessage('second', 4, 320),
        usage: {
          input: 300,
          output: 0,
          cacheRead: 20,
          cacheWrite: 0,
          totalTokens: 320,
          cost: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            total: 0,
          },
        },
      },
    ];

    expect(getLastKnownInputTokens(messages)).toBe(320);
  });

  it('returns 0 when no assistant message has usage metadata', () => {
    expect(getLastKnownInputTokens([
      createUserMessage('hello', 1),
      createUserMessage('still hello', 2),
    ])).toBe(0);
  });

  it('returns the full active path when no bridge applies', () => {
    const session = createLinearSession();

    expect(getCompressedPath(session)).toEqual([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2, 100),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4, 700),
    ]);
  });

  it('replaces older messages with the latest applicable bridge', () => {
    const session = createLinearSession();
    const path = getLinearPath(session);
    const bridgeAfterNode = path[1];

    session.bridges = [{
      afterNodeId: bridgeAfterNode.id,
      content: 'handoff memo',
      timestamp: 10,
    }];

    expect(getCompressedPath(session)).toEqual([
      bridgeToUserMessage(session.bridges[0]),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4, 700),
    ]);
  });

  it('ignores bridges that do not belong to the current branch', () => {
    const session = createSession();
    const user1 = appendMessage(session, createUserMessage('user-1', 1));
    const assistant1 = appendMessage(session, createAssistantMessage('assistant-1', 2, 100));
    const user2 = appendMessage(session, createUserMessage('user-2', 3));
    const assistant2 = appendMessage(session, createAssistantMessage('assistant-2', 4, 200));
    const altUser = editMessage(session, user2.id, createUserMessage('alt-user', 5));
    appendMessage(session, createAssistantMessage('alt-assistant', 6, 250));

    session.bridges = [{
      afterNodeId: assistant2.id,
      content: 'branch memo',
      timestamp: 20,
    }];

    switchBranch(session, altUser.id);

    expect(getCompressedPath(session)).toEqual([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2, 100),
      createUserMessage('alt-user', 5),
      createAssistantMessage('alt-assistant', 6, 250),
    ]);

    expect(findLatestApplicableBridge(session.bridges, [
      user1,
      assistant1,
      altUser,
      session.mapping[session.currentNode],
    ])).toBeNull();
  });

  it('uses only the newest applicable bridge when multiple bridges exist', () => {
    const session = createLinearSession();
    const path = getLinearPath(session);

    session.bridges = [
      {
        afterNodeId: path[1].id,
        content: 'older memo',
        timestamp: 10,
      },
      {
        afterNodeId: path[3].id,
        content: 'newer memo',
        timestamp: 20,
      },
    ];

    expect(getCompressedPath(session)).toEqual([
      bridgeToUserMessage(session.bridges[1]),
    ]);
  });

  it('skips compaction when token usage is below the threshold', async () => {
    const session = createLinearSession();
    const agent = createStubAgent([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2, 100),
    ]);
    const createCompactAgent = vi.fn();
    const saveSession = vi.fn();

    await expect(compactIfNeeded(session, agent, {
      createCompactAgent,
      saveSession,
    })).resolves.toBe(false);

    expect(session.bridges).toEqual([]);
    expect(createCompactAgent).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
  });

  it('creates a bridge and replaces agent messages when token usage exceeds the threshold', async () => {
    const session = createLinearSession();
    const agent = createStubAgent([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2, 100),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4, 800),
    ]);

    const compactState = { messages: [] as AgentMessage[] };
    const compactAgent = {
      state: compactState,
      replaceMessages: vi.fn((messages: AgentMessage[]) => {
        compactState.messages = messages.slice();
      }),
      prompt: vi.fn(async (input: string) => {
        expect(input).toBe(COMPACT_PROMPT);
        compactState.messages = [
          ...compactState.messages,
          createAssistantMessage('memo for next assistant', 99, 10),
        ];
      }),
    };
    const saveSession = vi.fn(async (nextSession: ChatSession) => ({
      ...nextSession,
      updatedAt: 1234,
    }));

    await expect(compactIfNeeded(session, agent, {
      createCompactAgent: () => compactAgent,
      saveSession,
      now: () => 77,
    })).resolves.toBe(true);

    expect(session.bridges).toEqual([
      {
        afterNodeId: getLinearPath(session).at(-1)!.id,
        content: 'memo for next assistant',
        timestamp: 77,
      },
    ]);
    expect(saveSession).toHaveBeenCalledOnce();
    expect(agent.state.messages).toEqual([
      bridgeToUserMessage(session.bridges[0]),
    ]);
  });

  it('wraps bridge content in the handoff template as a user message', () => {
    const bridgeMessage = bridgeToUserMessage({
      afterNodeId: 'node_1',
      content: 'handoff memo',
      timestamp: 42,
    });

    expect(bridgeMessage).toEqual({
      role: 'user',
      content: BRIDGE_TEMPLATE.replace('{{ handoff_memo }}', 'handoff memo'),
      timestamp: 42,
    });
  });
});
