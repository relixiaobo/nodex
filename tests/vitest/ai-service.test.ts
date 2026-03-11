const streamProxyMock = vi.hoisted(() => vi.fn(() => ({ mocked: true })));
const getStoredTokenMock = vi.hoisted(() => vi.fn(async () => 'auth-token'));

vi.mock('@mariozechner/pi-agent-core', async () => {
  const actual = await vi.importActual<typeof import('@mariozechner/pi-agent-core')>('@mariozechner/pi-agent-core');
  return {
    ...actual,
    streamProxy: streamProxyMock,
  };
});

vi.mock('../../src/lib/auth.js', () => ({
  getStoredToken: getStoredTokenMock,
}));

describe('ai-service', () => {
  let storage: Record<string, unknown>;

  beforeEach(async () => {
    storage = {};

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

  it('creates an agent whose streamFn injects auth and API key into the proxy call', async () => {
    const { createAgent, setApiKey } = await import('../../src/lib/ai-service.js');
    await setApiKey('sk-ant-test-456');

    const agent = createAgent();
    expect(agent.state.model.provider).toBe('anthropic');
    expect(agent.state.model.id).toContain('claude-sonnet');

    const result = await agent.streamFn(
      agent.state.model,
      { messages: [] },
      { temperature: 0.2 },
    );

    expect(result).toEqual({ mocked: true });
    expect(streamProxyMock).toHaveBeenCalledTimes(1);
    expect(streamProxyMock).toHaveBeenCalledWith(
      agent.state.model,
      expect.objectContaining({
        messages: [],
        _apiKey: 'sk-ant-test-456',
      }),
      expect.objectContaining({
        authToken: 'auth-token',
        proxyUrl: 'http://localhost:8787',
        temperature: 0.2,
      }),
    );
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
});
