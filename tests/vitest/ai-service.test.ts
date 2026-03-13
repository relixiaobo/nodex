import { ensureSystemNodes } from '../../src/lib/bootstrap-system-nodes.js';
import * as loroDoc from '../../src/lib/loro-doc.js';
import { SYSTEM_SCHEMA_NODE_IDS } from '../../src/lib/system-schema-presets.js';

const streamProxyMock = vi.hoisted(() => vi.fn(() => ({ mocked: true })));
const getStoredTokenMock = vi.hoisted(() => vi.fn(async () => 'auth-token'));
const buildSystemReminderMock = vi.hoisted(() => vi.fn(async () => '<system-reminder>ctx</system-reminder>'));

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
    buildSystemReminder: buildSystemReminderMock,
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
    streamProxyMock.mockReturnValue({ mocked: true });
    getStoredTokenMock.mockReset();
    getStoredTokenMock.mockResolvedValue('auth-token');
    buildSystemReminderMock.mockReset();
    buildSystemReminderMock.mockResolvedValue('<system-reminder>ctx</system-reminder>');

    const { resetAIAgentForTests } = await import('../../src/lib/ai-service.js');
    resetAIAgentForTests();
  });

  it('stores and clears Anthropic API keys', async () => {
    const { setApiKey, getApiKey, hasApiKey, clearApiKey } = await import('../../src/lib/ai-service.js');

    expect(await hasApiKey()).toBe(false);
    expect(await getApiKey()).toBeNull();

    await setApiKey('sk-ant-test-123');
    expect(await hasApiKey()).toBe(true);
    expect(await getApiKey()).toBe('sk-ant-test-123');

    await clearApiKey();
    expect(await hasApiKey()).toBe(false);
    expect(await getApiKey()).toBeNull();
  });

  it('rejects malformed API keys', async () => {
    const { setApiKey } = await import('../../src/lib/ai-service.js');
    await expect(setApiKey('bad-key')).rejects.toThrow('sk-ant-');
  });

  it('creates an agent whose getApiKey hook resolves the stored API key', async () => {
    const { createAgent, setApiKey } = await import('../../src/lib/ai-service.js');
    await setApiKey('sk-ant-test-456');

    const agent = createAgent();
    const internalAgent = agent as unknown as {
      getApiKey: (provider: string) => Promise<string | undefined>;
    };

    await expect(internalAgent.getApiKey('anthropic')).resolves.toBe('sk-ant-test-456');
  });

  it('creates an agent whose streamFn forwards auth and API key through proxy options', async () => {
    const { createAgent, setApiKey } = await import('../../src/lib/ai-service.js');
    await setApiKey('sk-ant-test-456');

    const agent = createAgent();
    expect(agent.state.model.provider).toBe('anthropic');
    expect(agent.state.model.id).toContain('claude-sonnet');

    const internalAgent = agent as unknown as {
      getApiKey: (provider: string) => Promise<string | undefined>;
    };
    const apiKey = await internalAgent.getApiKey('anthropic');

    const result = await agent.streamFn(
      agent.state.model,
      { messages: [] },
      { temperature: 0.2, apiKey },
    );

    expect(result).toEqual({ mocked: true });
    expect(streamProxyMock).toHaveBeenCalledTimes(1);
    expect(streamProxyMock).toHaveBeenCalledWith(
      agent.state.model,
      expect.objectContaining({
        messages: [],
      }),
      expect.objectContaining({
        apiKey: 'sk-ant-test-456',
        authToken: 'auth-token',
        proxyUrl: expect.any(String),
        temperature: expect.any(Number),
        maxTokens: expect.any(Number),
      }),
    );
  });

  it('registers transformContext that injects the system reminder into the last user message', async () => {
    const { createAgent } = await import('../../src/lib/ai-service.js');
    const agent = createAgent();
    const internalAgent = agent as unknown as {
      transformContext: (messages: import('@mariozechner/pi-agent-core').AgentMessage[]) => Promise<import('@mariozechner/pi-agent-core').AgentMessage[]>;
    };

    const transformed = await internalAgent.transformContext([
      {
        role: 'user',
        content: 'hello',
        timestamp: 1,
      },
    ]);

    expect(buildSystemReminderMock).toHaveBeenCalledTimes(1);
    expect(transformed).toEqual([
      {
        role: 'user',
        content: 'hello\n\n<system-reminder>ctx</system-reminder>',
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

  it('streamChat trims input and stopStreaming aborts the agent', async () => {
    const { streamChat, stopStreaming } = await import('../../src/lib/ai-service.js');

    const agent = {
      prompt: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    } as unknown as import('@mariozechner/pi-agent-core').Agent;

    await streamChat('  hello world  ', agent);
    await streamChat('   ', agent);
    stopStreaming(agent);

    expect(agent.prompt).toHaveBeenCalledTimes(1);
    expect(agent.prompt).toHaveBeenCalledWith('hello world');
    expect(agent.abort).toHaveBeenCalledTimes(1);
  });

  it('writes API keys into Settings field entries when system nodes exist', async () => {
    loroDoc.initLoroDocForTest('ws_ai_settings');
    ensureSystemNodes('ws_ai_settings');

    const { setApiKey, getAISettings } = await import('../../src/lib/ai-service.js');

    await setApiKey('sk-ant-node-123');

    expect(await getAISettings()).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-ant-node-123',
    });

    const valueNodeId = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_API_KEY_FIELD_ENTRY)?.children?.[0];
    expect(valueNodeId).toBeTruthy();
    expect(valueNodeId ? loroDoc.toNodexNode(valueNodeId)?.name : null).toBe('sk-ant-node-123');
  });

  it('migrates legacy chrome storage AI settings into Settings node fields', async () => {
    storage['soma-ai-settings'] = {
      provider: 'anthropic',
      apiKey: 'sk-ant-migrate-123',
    };

    loroDoc.initLoroDocForTest('ws_ai_migrate');
    ensureSystemNodes('ws_ai_migrate');

    const { getApiKey } = await import('../../src/lib/ai-service.js');

    expect(await getApiKey()).toBe('sk-ant-migrate-123');
    expect(storage['soma-ai-settings']).toBeUndefined();

    const valueNodeId = loroDoc.toNodexNode(SYSTEM_SCHEMA_NODE_IDS.SETTINGS_AI_API_KEY_FIELD_ENTRY)?.children?.[0];
    expect(valueNodeId ? loroDoc.toNodexNode(valueNodeId)?.name : null).toBe('sk-ant-migrate-123');
  });
});
