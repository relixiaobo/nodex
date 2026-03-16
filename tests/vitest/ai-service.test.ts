import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { appendMessage, editMessage, getLinearPath, linearToTree, type ChatSession } from '../../src/lib/ai-chat-tree.js';
import { findProviderOptionNodeId, getProviderConfigs } from '../../src/lib/ai-provider-config.js';
import { ensureSystemNodes } from '../../src/lib/bootstrap-system-nodes.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';
import { useNodeStore } from '../../src/stores/node-store.js';
import { NDX_F, SYS_V } from '../../src/types/index.js';

const streamProxyMock = vi.hoisted(() => vi.fn(() => ({ mocked: true })));
const getStoredTokenMock = vi.hoisted(() => vi.fn(async () => 'auth-token'));
const prepareAgentContextMock = vi.hoisted(() => vi.fn(async (
  messages: import('@mariozechner/pi-agent-core').AgentMessage[],
) => ({
  reminder: '<system-reminder>ctx</system-reminder>',
  messages,
})));
const DB_NAME = 'soma-ai-chat';

function createUserMessage(content: string, timestamp: number): import('@mariozechner/pi-agent-core').AgentMessage {
  return {
    role: 'user',
    content,
    timestamp,
  };
}

function createAssistantMessage(text: string, timestamp: number): import('@mariozechner/pi-agent-core').AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
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
    timestamp,
  };
}

type DynamicTestAgent = import('@mariozechner/pi-agent-core').Agent & {
  subscribe: ReturnType<typeof vi.fn>;
  setTools: ReturnType<typeof vi.fn>;
  setSystemPrompt: ReturnType<typeof vi.fn>;
  setModel: ReturnType<typeof vi.fn>;
  replaceMessages: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  waitForIdle: ReturnType<typeof vi.fn>;
  continue: ReturnType<typeof vi.fn>;
};

function createDynamicTestAgent() {
  const listeners = new Set<(event: import('@mariozechner/pi-agent-core').AgentEvent) => void>();
  const state = {
    messages: [] as import('@mariozechner/pi-agent-core').AgentMessage[],
    streamMessage: undefined as import('@mariozechner/pi-agent-core').AgentMessage | undefined,
    isStreaming: false,
    error: undefined,
    systemPrompt: '',
    tools: [] as import('@mariozechner/pi-agent-core').AgentTool<any>[],
    model: {
      id: 'claude-sonnet-4-5',
      provider: 'anthropic',
      contextWindow: 200000,
    },
  };

  const agent = {
    state,
    sessionId: undefined as string | undefined,
    subscribe: vi.fn((fn: (event: import('@mariozechner/pi-agent-core').AgentEvent) => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    }),
    setTools: vi.fn((tools: import('@mariozechner/pi-agent-core').AgentTool<any>[]) => {
      state.tools = tools;
    }),
    setSystemPrompt: vi.fn((prompt: string) => {
      state.systemPrompt = prompt;
    }),
    setModel: vi.fn((model: { id: string; provider: string; contextWindow?: number }) => {
      state.model = {
        ...state.model,
        ...model,
      };
    }),
    replaceMessages: vi.fn((messages: import('@mariozechner/pi-agent-core').AgentMessage[]) => {
      state.messages = messages;
    }),
    prompt: vi.fn(async () => undefined),
    abort: vi.fn(),
    reset: vi.fn(() => {
      state.messages = [];
      state.streamMessage = undefined;
      state.isStreaming = false;
      state.error = undefined;
    }),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    continue: vi.fn().mockResolvedValue(undefined),
  } as unknown as DynamicTestAgent;

  return {
    agent,
    state,
    emit(event: import('@mariozechner/pi-agent-core').AgentEvent) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

async function seedCurrentSession(
  agent: import('@mariozechner/pi-agent-core').Agent,
  session: ChatSession,
): Promise<ChatSession> {
  const { getCurrentSession } = await import('../../src/lib/ai-service.js');
  const currentSession = getCurrentSession(agent);
  if (!currentSession) {
    throw new Error('expected current session');
  }

  Object.assign(currentSession, session);
  agent.sessionId = currentSession.id;
  return currentSession;
}

function seedProviderConfig({
  provider,
  enabled,
  apiKey,
  baseUrl,
  name,
}: {
  provider: string;
  enabled: boolean;
  apiKey?: string;
  baseUrl?: string;
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
  if (baseUrl !== undefined) {
    store.setFieldValue(node.id, NDX_F.PROVIDER_BASE_URL, baseUrl ? [baseUrl] : []);
  }

  return node.id;
}

vi.mock('../../src/lib/ai-proxy.js', () => ({
  streamProxyWithApiKey: streamProxyMock,
}));

vi.mock('@mariozechner/pi-agent-core', async () => {
  const actual = await vi.importActual<typeof import('@mariozechner/pi-agent-core')>('@mariozechner/pi-agent-core');
  return actual;
});

vi.mock('../../src/lib/auth.js', () => ({
  getStoredToken: getStoredTokenMock,
}));

vi.mock('../../src/lib/ai-context.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/ai-context.js')>('../../src/lib/ai-context.js');
  return {
    ...actual,
    prepareAgentContext: prepareAgentContextMock,
  };
});

describe('ai-service', () => {
  let storage: Record<string, unknown>;

  beforeEach(async () => {
    storage = {};
    loroDoc.resetLoroDoc();

    globalThis.chrome = {
      ...globalThis.chrome,
      storage: {
        ...globalThis.chrome?.storage,
        local: {
          get: vi.fn(async (key: string) => ({ [key]: storage[key] })),
          set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(storage, items);
          }),
          remove: vi.fn(async (key: string) => {
            delete storage[key];
          }),
        },
      },
    } as unknown as typeof chrome;

    streamProxyMock.mockReset();
    streamProxyMock.mockImplementation((model, context, options = {}) => {
      options.onRequestBody?.({
        model,
        context,
        options: {
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          reasoning: options.reasoning,
          apiKey: options.apiKey,
        },
      });
      return { mocked: true };
    });
    getStoredTokenMock.mockReset();
    getStoredTokenMock.mockResolvedValue('auth-token');
    prepareAgentContextMock.mockReset();
    prepareAgentContextMock.mockImplementation(async (
      messages: import('@mariozechner/pi-agent-core').AgentMessage[],
    ) => ({
      reminder: '<system-reminder>ctx</system-reminder>',
      messages,
    }));

    const { resetChatPersistenceForTests } = await import('../../src/lib/ai-persistence.js');
    resetChatPersistenceForTests();
    await deleteDB(DB_NAME);
    resetChatPersistenceForTests();

    const { resetAIAgentForTests } = await import('../../src/lib/ai-service.js');
    resetAIAgentForTests();
  });

  it('reads Anthropic API keys from enabled provider configs', async () => {
    loroDoc.initLoroDocForTest('ws_ai_settings');
    ensureSystemNodes('ws_ai_settings');
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-test-123',
      name: 'Primary Anthropic',
    });

    const { getApiKey, hasApiKey } = await import('../../src/lib/ai-service.js');

    expect(await hasApiKey()).toBe(true);
    expect(await getApiKey()).toBe('sk-ant-test-123');
  });

  it('returns null when Anthropic is disabled or missing a key', async () => {
    loroDoc.initLoroDocForTest('ws_ai_settings_missing');
    ensureSystemNodes('ws_ai_settings_missing');
    seedProviderConfig({
      provider: 'anthropic',
      enabled: false,
      apiKey: 'sk-ant-disabled',
      name: 'Disabled Anthropic',
    });

    const { getApiKey, hasApiKey } = await import('../../src/lib/ai-service.js');

    expect(await hasApiKey()).toBe(false);
    expect(await getApiKey()).toBeNull();
  });

  it('creates an agent whose getApiKey hook resolves provider-specific keys', async () => {
    loroDoc.initLoroDocForTest('ws_ai_agent');
    ensureSystemNodes('ws_ai_agent');
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-test-456',
      name: 'Anthropic',
    });
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-test-456',
      name: 'OpenAI',
    });

    const { createAgent } = await import('../../src/lib/ai-service.js');

    const agent = createAgent();
    const internalAgent = agent as unknown as {
      getApiKey: (provider: string) => Promise<string | undefined>;
    };

    await expect(internalAgent.getApiKey('anthropic')).resolves.toBe('sk-ant-test-456');
    await expect(internalAgent.getApiKey('openai')).resolves.toBe('sk-openai-test-456');
  });

  it('creates an agent whose streamFn routes auth and API key by active model provider', async () => {
    loroDoc.initLoroDocForTest('ws_ai_stream');
    ensureSystemNodes('ws_ai_stream');
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-test-456',
      name: 'OpenAI',
    });

    const { getModel } = await import('@mariozechner/pi-ai');
    const { createAgent } = await import('../../src/lib/ai-service.js');
    const openAiModel = getModel('openai', 'gpt-4o');
    const agent = createAgent(openAiModel);
    expect(agent.state.model.provider).toBe('openai');
    expect(agent.state.model.id).toBe('gpt-4o');

    const result = await agent.streamFn(agent.state.model, { messages: [] }, { temperature: 0.2 });

    expect(result).toEqual({ mocked: true });
    expect(streamProxyMock).toHaveBeenCalledTimes(1);
    expect(streamProxyMock).toHaveBeenCalledWith(
      agent.state.model,
      expect.objectContaining({
        messages: [],
      }),
      expect.objectContaining({
        apiKey: 'sk-openai-test-456',
        authToken: 'auth-token',
        proxyUrl: expect.any(String),
        temperature: expect.any(Number),
        maxTokens: expect.any(Number),
      }),
    );
  });

  it('captures the actual proxy request body in turn logs when AI Debug is enabled', async () => {
    storage['soma-chat-debug-enabled'] = true;
    storage['soma-ai-settings'] = {
      provider: 'anthropic',
      apiKey: 'sk-ant-debug',
    };

    const { createAgent, createNewChatSession, getCurrentDebugTurns } = await import('../../src/lib/ai-service.js');
    const agent = createAgent();

    await createNewChatSession(agent);
    await agent.streamFn(
      agent.state.model,
      {
        systemPrompt: 'Turn prompt',
        messages: [
          {
            role: 'user',
            content: 'Inspect the page',
            timestamp: 1,
          },
        ],
      },
      {
        temperature: 0.3,
        headers: { 'x-debug': '1' },
      },
    );

    const turns = getCurrentDebugTurns(agent);
    const requestPayload = JSON.parse(turns[0]?.request.json ?? '{}') as {
      model?: Record<string, unknown>;
      options?: Record<string, unknown>;
    };

    expect(turns).toHaveLength(1);
    expect(turns[0]?.request.json).toContain('"systemPrompt": "Turn prompt"');
    expect(turns[0]?.request.json).toContain('"temperature": 0.3');
    expect(requestPayload.model).toMatchObject({
      id: 'claude-sonnet-4-5',
      provider: 'anthropic',
      api: 'anthropic-messages',
      baseUrl: 'https://api.anthropic.com',
    });
    expect(requestPayload.options?.apiKey).toBe('[redacted]');
    expect(turns[0]?.request.json).not.toContain('"headers"');
    expect(turns[0]?.request.json).not.toContain('sk-ant-debug');
    expect(turns[0]?.request.json).not.toContain('auth-token');
  });

  it('marks stale running debug turns as interrupted when restoring a session', async () => {
    const { saveChatDebugTurns } = await import('../../src/lib/ai-persistence.js');
    const { createAgent, createNewChatSession, getCurrentDebugTurns, restoreChatSessionById } = await import('../../src/lib/ai-service.js');

    const agent = createAgent();
    await createNewChatSession(agent);
    const sessionId = agent.sessionId!;

    await saveChatDebugTurns(sessionId, [
      {
        id: 'turn_running',
        startedAt: 100,
        finishedAt: null,
        durationMs: null,
        modelId: 'claude-sonnet-4-5',
        provider: 'anthropic',
        status: 'running',
        requestSummary: 'Inspect the page',
        responseSummary: 'Waiting for response…',
        request: {
          json: '{"context":{"messages":[]}}',
          messageCount: 1,
          toolCount: 0,
          tokenEstimate: {
            systemPrompt: 1,
            messages: 2,
            tools: 0,
            total: 3,
            contextWindow: 200000,
            usagePercent: 0.0015,
          },
        },
        response: {
          json: '{"assistantMessage":null}',
          stopReason: null,
          usage: null,
          toolResultCount: 0,
          errorMessage: null,
        },
      },
    ]);

    const restoredAgent = createAgent();
    await restoreChatSessionById(sessionId, restoredAgent);

    const restoredTurns = getCurrentDebugTurns(restoredAgent);

    expect(restoredTurns).toHaveLength(1);
    expect(restoredTurns[0]?.status).toBe('interrupted');
    expect(restoredTurns[0]?.finishedAt).not.toBeNull();
    expect(restoredTurns[0]?.response.errorMessage).toBe('Session reloaded before this turn completed.');
  });

  it('registers transformContext that delegates to the shared context preparation helper', async () => {
    const { createAgent } = await import('../../src/lib/ai-service.js');
    const agent = createAgent();
    const internalAgent = agent as unknown as {
      transformContext: (messages: import('@mariozechner/pi-agent-core').AgentMessage[]) => Promise<import('@mariozechner/pi-agent-core').AgentMessage[]>;
    };
    prepareAgentContextMock.mockResolvedValueOnce({
      reminder: '<system-reminder>ctx</system-reminder>',
      messages: [
        {
          role: 'user',
          content: 'prepared',
          timestamp: 1,
        },
      ],
    });

    const sourceMessages = [
      {
        role: 'user',
        content: 'hello',
        timestamp: 1,
      },
    ];

    const transformed = await internalAgent.transformContext(sourceMessages);

    expect(prepareAgentContextMock).toHaveBeenCalledTimes(1);
    expect(prepareAgentContextMock).toHaveBeenCalledWith(sourceMessages);
    expect(transformed).toEqual([
      {
        role: 'user',
        content: 'prepared',
        timestamp: 1,
      },
    ]);
  });

  it('registers convertToLlm that filters out non-LLM message types', async () => {
    const { createAgent } = await import('../../src/lib/ai-service.js');
    const agent = createAgent();
    const internalAgent = agent as unknown as {
      convertToLlm: (messages: import('@mariozechner/pi-agent-core').AgentMessage[]) => import('@mariozechner/pi-ai').Message[];
    };

    const messages = internalAgent.convertToLlm([
      {
        role: 'user',
        content: 'hello',
        timestamp: 1,
      },
      {
        role: 'notification',
        text: 'skip me',
        timestamp: 2,
      } as unknown as import('@mariozechner/pi-agent-core').AgentMessage,
    ]);

    expect(messages).toEqual([
      {
        role: 'user',
        content: 'hello',
        timestamp: 1,
      },
    ]);
  });

  it('restoreLatestChatSession hydrates prompt and tools for debug inspection', async () => {
    const { createAgent, restoreLatestChatSession } = await import('../../src/lib/ai-service.js');
    const agent = createAgent();

    await restoreLatestChatSession(agent);

    expect(agent.state.systemPrompt).toContain('You are soma');
    expect(agent.state.tools.map((tool) => tool.name)).toEqual([
      'node_create',
      'node_read',
      'node_edit',
      'node_delete',
      'node_search',
      'undo',
      'browser',
    ]);
  });

  it('keeps the session-selected model when configureAgent reapplies runtime config', async () => {
    loroDoc.initLoroDocForTest('ws_ai_selected_model');
    ensureSystemNodes('ws_ai_selected_model');
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-selected',
      name: 'Anthropic',
    });
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-selected',
      name: 'OpenAI',
    });

    const { agent } = createDynamicTestAgent();
    const {
      configureAgent,
      createNewChatSession,
      getCurrentSession,
      selectChatModel,
    } = await import('../../src/lib/ai-service.js');

    await createNewChatSession(agent);
    await selectChatModel('gpt-4o', 'openai', agent);

    agent.setModel.mockClear();
    await configureAgent(agent);

    expect(agent.state.model.provider).toBe('openai');
    expect(agent.state.model.id).toBe('gpt-4o');
    expect(getCurrentSession(agent)?.selectedProvider).toBe('openai');
    expect(getCurrentSession(agent)?.selectedModelId).toBe('gpt-4o');
    expect(agent.setModel).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai',
        id: 'gpt-4o',
      }),
    );
  });

  it('restoreLatestChatSession trims incomplete persisted tails before hydrating the agent', async () => {
    const { saveChatSession } = await import('../../src/lib/ai-persistence.js');
    const { createAgent, getCurrentSession, restoreLatestChatSession } = await import('../../src/lib/ai-service.js');

    const session = linearToTree([
      { role: 'user', content: 'recover me', timestamp: 1 },
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
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: 2,
      },
    ]);
    session.id = 'session_trim';
    session.createdAt = 1;
    session.updatedAt = 2;

    await saveChatSession(session);

    const agent = createAgent();
    await restoreLatestChatSession(agent);

    expect(agent.state.messages).toEqual([
      { role: 'user', content: 'recover me', timestamp: 1 },
    ]);
    expect(getLinearPath(getCurrentSession(agent)!).map((node) => node.message)).toEqual([
      { role: 'user', content: 'recover me', timestamp: 1 },
    ]);
  });

  it('restoreLatestChatSession hydrates compressed paths when a bridge exists', async () => {
    const { saveChatSession } = await import('../../src/lib/ai-persistence.js');
    const { createAgent, restoreLatestChatSession } = await import('../../src/lib/ai-service.js');

    const session = linearToTree([
      { role: 'user', content: 'user-1', timestamp: 1 },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'assistant-1' }],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        usage: {
          input: 100,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 100,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: 2,
      },
      { role: 'user', content: 'user-2', timestamp: 3 },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'assistant-2' }],
        api: 'anthropic-messages',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        usage: {
          input: 200,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 200,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: 4,
      },
    ]);
    const path = getLinearPath(session);
    session.bridges = [{
      afterNodeId: path[1].id,
      content: 'memo for the next assistant',
      timestamp: 50,
    }];

    await saveChatSession(session);

    const agent = createAgent();
    await restoreLatestChatSession(agent);

    expect(agent.state.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('memo for the next assistant'),
        timestamp: 50,
      }),
      { role: 'user', content: 'user-2', timestamp: 3 },
      expect.objectContaining({
        role: 'assistant',
        timestamp: 4,
      }),
    ]);
  });

  it('getAgentForSession reuses the same agent per session id', async () => {
    const { getAgentForSession } = await import('../../src/lib/ai-service.js');

    const first = getAgentForSession('session_a');
    const second = getAgentForSession('session_a');
    const third = getAgentForSession('session_b');

    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it('restoreChatSessionById hydrates the requested session instead of the latest one', async () => {
    const { saveChatSession } = await import('../../src/lib/ai-persistence.js');
    const { getAgentForSession, getCurrentSession, restoreChatSessionById } = await import('../../src/lib/ai-service.js');

    loroDoc.initLoroDocForTest('ws_ai_restore_by_id');
    ensureSystemNodes('ws_ai_restore_by_id');
    seedProviderConfig({
      provider: 'anthropic',
      enabled: true,
      apiKey: 'sk-ant-restore',
      name: 'Anthropic',
    });
    seedProviderConfig({
      provider: 'openai',
      enabled: true,
      apiKey: 'sk-openai-restore',
      name: 'OpenAI',
    });

    const olderSession = linearToTree([
      createUserMessage('older-session', 1),
      createAssistantMessage('older-reply', 2),
    ]);
    olderSession.id = 'session_older';
    olderSession.createdAt = 1;
    olderSession.updatedAt = 2;

    const targetSession = linearToTree([
      createUserMessage('target-session', 3),
      createAssistantMessage('target-reply', 4),
    ]);
    targetSession.id = 'session_target';
    targetSession.createdAt = 3;
    targetSession.updatedAt = 4;
    targetSession.selectedProvider = 'openai';
    targetSession.selectedModelId = 'gpt-4o';

    await saveChatSession(olderSession);
    await saveChatSession(targetSession);

    const agent = getAgentForSession('session_target');
    await restoreChatSessionById('session_target', agent);

    expect(agent.sessionId).toBe('session_target');
    expect(getCurrentSession(agent)?.id).toBe('session_target');
    expect(agent.state.messages).toEqual([
      createUserMessage('target-session', 3),
      createAssistantMessage('target-reply', 4),
    ]);
    expect(agent.state.model.provider).toBe('openai');
    expect(agent.state.model.id).toBe('gpt-4o');
  });

  it('keeps chat sessions isolated per agent instance', async () => {
    const { createAgent, createNewChatSession, getCurrentSession } = await import('../../src/lib/ai-service.js');

    const agentA = createAgent();
    const agentB = createAgent();

    await createNewChatSession(agentA);
    await createNewChatSession(agentB);

    const sessionA = getCurrentSession(agentA);
    const sessionB = getCurrentSession(agentB);

    expect(sessionA).not.toBeNull();
    expect(sessionB).not.toBeNull();
    expect(sessionA?.id).not.toBe(sessionB?.id);
    expect(agentA.sessionId).toBe(sessionA?.id);
    expect(agentB.sessionId).toBe(sessionB?.id);
  });

  it('streamChat trims input and stopStreaming aborts the agent', async () => {
    const { streamChat, stopStreaming } = await import('../../src/lib/ai-service.js');

    const state = {
      messages: [] as import('@mariozechner/pi-agent-core').AgentMessage[],
      systemPrompt: '',
      tools: [] as import('@mariozechner/pi-agent-core').AgentTool<any>[],
      model: {
        id: 'claude-sonnet-4-5',
        provider: 'anthropic',
        contextWindow: 200000,
      },
    };
    const agent = {
      state,
      prompt: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(() => () => {}),
      waitForIdle: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
      replaceMessages: vi.fn((messages: import('@mariozechner/pi-agent-core').AgentMessage[]) => {
        state.messages = messages;
      }),
      abort: vi.fn(),
    } as unknown as import('@mariozechner/pi-agent-core').Agent;

    await streamChat('  hello world  ', agent);
    await streamChat('   ', agent);
    stopStreaming(agent);

    expect(agent.prompt).toHaveBeenCalledTimes(1);
    expect(agent.prompt).toHaveBeenCalledWith('hello world');
    expect(agent.abort).toHaveBeenCalledTimes(1);
  });

  it('editAndResend creates a new user branch and streams the replacement reply', async () => {
    const { createNewChatSession, editAndResend } = await import('../../src/lib/ai-service.js');
    const { agent, state, emit } = createDynamicTestAgent();

    await createNewChatSession(agent);

    const session = await seedCurrentSession(agent, linearToTree([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4),
    ]));
    const originalUser = getLinearPath(session)[2];
    const replacementReply = createAssistantMessage('assistant-edited', 6);

    agent.replaceMessages.mockClear();
    agent.prompt.mockImplementation(async () => {
      state.messages = [...state.messages, replacementReply];
      emit({
        type: 'turn_end',
        message: replacementReply,
        toolResults: [],
      } as import('@mariozechner/pi-agent-core').AgentEvent);
    });

    await editAndResend(originalUser!.id, 'edited user', agent);

    expect(agent.replaceMessages).toHaveBeenCalledTimes(1);
    expect(agent.replaceMessages.mock.calls[0][0]).toEqual([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      expect.objectContaining({
        role: 'user',
        content: 'edited user',
      }),
    ]);
    expect(agent.prompt).toHaveBeenCalledWith('edited user');
    expect(getLinearPath(session).map((node) => node.message)).toEqual([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      expect.objectContaining({
        role: 'user',
        content: 'edited user',
      }),
      replacementReply,
    ]);
  });

  it('regenerateResponse replaces the assistant branch using the preceding user prompt', async () => {
    const { createNewChatSession, regenerateResponse } = await import('../../src/lib/ai-service.js');
    const { agent, state, emit } = createDynamicTestAgent();

    await createNewChatSession(agent);

    const session = await seedCurrentSession(agent, linearToTree([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4),
    ]));
    const targetAssistant = getLinearPath(session)[3];
    const regeneratedReply = createAssistantMessage('assistant-regenerated', 5);

    agent.replaceMessages.mockClear();
    agent.prompt.mockImplementation(async () => {
      state.messages = [...state.messages, regeneratedReply];
      emit({
        type: 'turn_end',
        message: regeneratedReply,
        toolResults: [],
      } as import('@mariozechner/pi-agent-core').AgentEvent);
    });

    await regenerateResponse(targetAssistant!.id, agent);

    expect(agent.replaceMessages).toHaveBeenCalledTimes(1);
    expect(agent.replaceMessages.mock.calls[0][0]).toEqual([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
    ]);
    expect(agent.prompt).toHaveBeenCalledWith('user-2');
    expect(getLinearPath(session).map((node) => node.message)).toEqual([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
      regeneratedReply,
    ]);
  });

  it('switchMessageBranch swaps the active branch without prompting the agent', async () => {
    const { createNewChatSession, switchMessageBranch } = await import('../../src/lib/ai-service.js');
    const { agent } = createDynamicTestAgent();

    await createNewChatSession(agent);

    const seededSession = linearToTree([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4),
    ]);
    const originalPath = getLinearPath(seededSession);
    editMessage(seededSession, originalPath[2]!.id, createUserMessage('alt-user', 5));
    appendMessage(seededSession, createAssistantMessage('alt-assistant', 6));

    const session = await seedCurrentSession(agent, seededSession);

    agent.replaceMessages.mockClear();

    switchMessageBranch(originalPath[2]!.id, agent);

    expect(agent.replaceMessages).toHaveBeenCalledTimes(1);
    expect(agent.replaceMessages.mock.calls[0][0]).toEqual([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4),
    ]);
    expect(getLinearPath(session).map((node) => node.message)).toEqual([
      createUserMessage('user-1', 1),
      createAssistantMessage('assistant-1', 2),
      createUserMessage('user-2', 3),
      createAssistantMessage('assistant-2', 4),
    ]);
  });

  it('streamChat persists sessions from turn_end and agent_end events', async () => {
    const { getChatSession } = await import('../../src/lib/ai-persistence.js');
    const { getCurrentSession, streamChat } = await import('../../src/lib/ai-service.js');

    const assistantMessage = {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'hi there' }],
      api: 'anthropic-messages' as const,
      provider: 'anthropic' as const,
      model: 'claude-sonnet-4-5',
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop' as const,
      timestamp: 2,
    };

    const state = {
      messages: [] as import('@mariozechner/pi-agent-core').AgentMessage[],
      isStreaming: false,
      error: undefined,
      systemPrompt: '',
      tools: [] as import('@mariozechner/pi-agent-core').AgentTool<any>[],
      model: {
        id: 'claude-sonnet-4-5',
        provider: 'anthropic',
        contextWindow: 200000,
      },
    };

    let listener: ((event: import('@mariozechner/pi-agent-core').AgentEvent) => void) | null = null;

    const agent = {
      state,
      sessionId: undefined as string | undefined,
      subscribe: vi.fn((fn: (event: import('@mariozechner/pi-agent-core').AgentEvent) => void) => {
        listener = fn;
        return () => {
          listener = null;
        };
      }),
      setTools: vi.fn((tools: import('@mariozechner/pi-agent-core').AgentTool<any>[]) => {
        state.tools = tools;
      }),
      setSystemPrompt: vi.fn((prompt: string) => {
        state.systemPrompt = prompt;
      }),
      setModel: vi.fn((model: { id: string; provider: string }) => {
        state.model = model;
      }),
      replaceMessages: vi.fn((messages: import('@mariozechner/pi-agent-core').AgentMessage[]) => {
        state.messages = messages;
      }),
      waitForIdle: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
      prompt: vi.fn(async (input: string) => {
        state.messages = [
          { role: 'user', content: input, timestamp: 1 },
          assistantMessage,
        ];
        listener?.({ type: 'turn_end', message: assistantMessage, toolResults: [] });
        listener?.({ type: 'agent_end', messages: state.messages });
      }),
      abort: vi.fn(),
    } as unknown as import('@mariozechner/pi-agent-core').Agent;

    await streamChat('  first question  ', agent);

    await vi.waitFor(async () => {
      const persisted = agent.sessionId ? await getChatSession(agent.sessionId) : null;
      expect(persisted).not.toBeNull();
      expect(getLinearPath(persisted!).map((node) => node.message)).toEqual([
        { role: 'user', content: 'first question', timestamp: 1 },
        assistantMessage,
      ]);
    });

    expect(getCurrentSession(agent)?.title).toBe('first question');
  });

  it('migrates legacy chrome storage AI settings into provider config nodes', async () => {
    storage['soma-ai-settings'] = {
      provider: 'anthropic',
      apiKey: 'sk-ant-migrate-123',
    };

    loroDoc.initLoroDocForTest('ws_ai_migrate');
    ensureSystemNodes('ws_ai_migrate');

    const { getApiKey } = await import('../../src/lib/ai-service.js');

    expect(await getApiKey()).toBe('sk-ant-migrate-123');
    expect(storage['soma-ai-settings']).toBeUndefined();

    const migratedConfig = getProviderConfigs().find((config) => config.provider === 'anthropic');
    expect(migratedConfig?.enabled).toBe(true);
    expect(migratedConfig?.apiKey).toBe('sk-ant-migrate-123');
  });
});
