import { getModel } from '@mariozechner/pi-ai';
import { streamProxyWithApiKey } from '../../src/lib/ai-proxy.js';

const DONE_EVENT = 'data: {"type":"done","reason":"stop","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}}}\n\n';
const STREAM_STALL_TIMEOUT_MS = 60_000;

function createHangingResponse(): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start() {
      // Keep the reader pending forever until the caller aborts or the stall watchdog fires.
    },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

describe('streamProxyWithApiKey', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends apiKey in request options instead of mutating context', async () => {
    const fetchMock = vi.fn(async () => new Response(DONE_EVENT, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const model = getModel('anthropic', 'claude-sonnet-4-5');
    const stream = streamProxyWithApiKey(
      model,
      {
        messages: [],
      },
      {
        authToken: 'auth-token',
        proxyUrl: 'https://sync.example.com',
        apiKey: 'sk-ant-test-123',
        temperature: 0.2,
        maxTokens: 4000,
      },
    );

    await expect(stream.result()).resolves.toMatchObject({
      role: 'assistant',
      stopReason: 'stop',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://sync.example.com/api/stream',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer auth-token',
          'Content-Type': 'application/json',
        },
      }),
    );

    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(body.context).toEqual({ messages: [] });
    expect(body.options).toEqual({
      apiKey: 'sk-ant-test-123',
      maxTokens: 4000,
      reasoning: undefined,
      temperature: 0.2,
    });
  });

  it('fails closed when the proxy stream ends without a terminal event', async () => {
    const fetchMock = vi.fn(async () => new Response('data: {"type":"text_start","contentIndex":0}\n\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const model = getModel('anthropic', 'claude-sonnet-4-5');
    const stream = streamProxyWithApiKey(
      model,
      { messages: [] },
      {
        authToken: 'auth-token',
        proxyUrl: 'https://sync.example.com',
        apiKey: 'sk-ant-test-123',
      },
    );

    await expect(stream.result()).resolves.toMatchObject({
      role: 'assistant',
      stopReason: 'error',
      errorMessage: 'Proxy stream ended before a terminal event was received',
    });
  });

  it('stops promptly when the user aborts during a pending read', async () => {
    const fetchMock = vi.fn(async () => createHangingResponse());
    vi.stubGlobal('fetch', fetchMock);

    const model = getModel('anthropic', 'claude-sonnet-4-5');
    const controller = new AbortController();
    const stream = streamProxyWithApiKey(
      model,
      { messages: [] },
      {
        authToken: 'auth-token',
        proxyUrl: 'https://sync.example.com',
        apiKey: 'sk-ant-test-123',
        signal: controller.signal,
      },
    );

    controller.abort();

    await expect(stream.result()).resolves.toMatchObject({
      role: 'assistant',
      stopReason: 'aborted',
      errorMessage: 'Request aborted by user',
    });
  });

  it('times out stalled reads instead of hanging forever', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => createHangingResponse());
    vi.stubGlobal('fetch', fetchMock);

    const model = getModel('anthropic', 'claude-sonnet-4-5');
    const stream = streamProxyWithApiKey(
      model,
      { messages: [] },
      {
        authToken: 'auth-token',
        proxyUrl: 'https://sync.example.com',
        apiKey: 'sk-ant-test-123',
      },
    );

    const resultPromise = stream.result();
    await vi.advanceTimersByTimeAsync(STREAM_STALL_TIMEOUT_MS);

    await expect(resultPromise).resolves.toMatchObject({
      role: 'assistant',
      stopReason: 'error',
      errorMessage: 'Stream stalled: no data for 60s',
    });
  });
});
