import { getModel } from '@mariozechner/pi-ai';
import { streamProxyWithApiKey } from '../../src/lib/ai-proxy.js';

const DONE_EVENT = 'data: {"type":"done","reason":"stop","usage":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"totalTokens":0,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}}}\n\n';

describe('streamProxyWithApiKey', () => {
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
      temperature: 0.2,
    });
  });
});
