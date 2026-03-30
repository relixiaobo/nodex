import { jsonrepair } from 'jsonrepair';
import {
  createAssistantMessageEventStream,
  parseStreamingJson,
  type AssistantMessage,
  type AssistantMessageEvent,
  type AssistantMessageEventStream,
  type Context,
  type Model,
  type ToolCall,
} from '@mariozechner/pi-ai';
import type { ProxyAssistantMessageEvent, ProxyStreamOptions } from '@mariozechner/pi-agent-core';

type StreamingToolCall = ToolCall & { partialJson?: string };

export interface ProxyStreamRequestPayload {
  model: Model<any>;
  context: Context;
  options: {
    temperature: ProxyStreamOptions['temperature'];
    maxTokens: ProxyStreamOptions['maxTokens'];
    reasoning: ProxyStreamOptions['reasoning'];
    apiKey: ProxyStreamOptions['apiKey'];
  };
}

export interface SomaProxyStreamOptions extends ProxyStreamOptions {
  onRequestBody?: (payload: ProxyStreamRequestPayload) => void;
}

/** No-data timeout: if the stream produces nothing for this long, consider it dead. */
const STREAM_STALL_TIMEOUT_MS = 60_000;

let streamDebugId = 0;

/**
 * Race `reader.read()` against abort signal and idle timeout.
 * Ensures the stream loop can never hang indefinitely — the two failure modes
 * that cause the "stuck streaming, stop button does nothing" bug:
 *   1. Server stops sending data but keeps the connection open → stall timeout fires
 *   2. `agent.abort()` fires but `reader.cancel()` doesn't interrupt the pending read
 *      → abort listener rejects the race immediately
 */
function guardedRead(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
  stallMs: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = () => { settled = true; };

    // --- Stall timeout ---
    const timer = setTimeout(() => {
      if (settled) return;
      settle();
      console.log('[stream-debug] guardedRead: STALL TIMEOUT fired after', stallMs, 'ms');
      void reader.cancel('Stream stalled').catch(() => {});
      reject(new Error(`Stream stalled: no data for ${stallMs / 1000}s`));
    }, stallMs);

    // --- Abort signal ---
    const onAbort = () => {
      if (settled) return;
      settle();
      console.log('[stream-debug] guardedRead: ABORT signal received');
      clearTimeout(timer);
      void reader.cancel('Aborted').catch(() => {});
      reject(new Error('Request aborted by user'));
    };
    if (signal?.aborted) {
      clearTimeout(timer);
      reject(new Error('Request aborted by user'));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });

    // --- Actual read ---
    reader.read().then(
      (result) => {
        if (settled) return;
        settle();
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(result);
      },
      (err) => {
        if (settled) return;
        settle();
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(err);
      },
    );
  });
}

export function streamProxyWithApiKey(
  model: Model<any>,
  context: Context,
  options: SomaProxyStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();
  const sid = ++streamDebugId;
  const log = (msg: string, ...args: unknown[]) => console.log(`[stream-debug #${sid}] ${msg}`, ...args);

  void (async () => {
    const partial: AssistantMessage = {
      role: 'assistant',
      stopReason: 'stop',
      content: [],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      timestamp: Date.now(),
    };

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const abortHandler = () => {
      log('abortHandler fired, calling reader.cancel()');
      void reader?.cancel('Request aborted by user').catch(() => {});
    };

    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler);
      log('start, signal.aborted=', options.signal.aborted);
    } else {
      log('start, NO signal provided');
    }

    try {
      const requestBody = buildProxyStreamRequestPayload(model, context, options);
      options.onRequestBody?.(requestBody);

      log('fetching', options.proxyUrl);
      const response = await fetch(`${options.proxyUrl}/api/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: options.signal,
      });
      log('fetch response', response.status);

      if (!response.ok) {
        let errorMessage = `Proxy error: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json() as { error?: string };
          if (errorData.error) {
            errorMessage = `Proxy error: ${errorData.error}`;
          }
        } catch {
          // Ignore non-JSON error bodies.
        }
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('Proxy error: missing response body');
      }

      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let readCount = 0;
      let lastEventType = '';

      while (true) {
        const { done, value } = await guardedRead(reader, options.signal, STREAM_STALL_TIMEOUT_MS);
        if (done) {
          log('reader done after', readCount, 'reads, lastEvent:', lastEventType);
          break;
        }
        readCount++;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (!data) continue;

          let proxyEvent: ProxyAssistantMessageEvent;
          try {
            proxyEvent = JSON.parse(data) as ProxyAssistantMessageEvent;
          } catch (sseParseError) {
            console.error('[ai-proxy] SSE event JSON.parse failed:', (sseParseError as Error).message?.slice(0, 80), 'data:', data.slice(0, 100));
            continue;
          }
          lastEventType = proxyEvent.type;
          const event = processProxyEvent(proxyEvent, partial);
          if (event) {
            stream.push(event);
          }
        }
      }

      log('stream.end() — normal');
      stream.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const reason = options.signal?.aborted ? 'aborted' : 'error';
      log('catch:', reason, errorMessage);
      partial.stopReason = reason;
      partial.errorMessage = errorMessage;
      stream.push({
        type: 'error',
        reason,
        error: partial,
      });
      stream.end();
    } finally {
      log('finally — cleanup');
      if (options.signal) {
        options.signal.removeEventListener('abort', abortHandler);
      }
    }
  })();

  return stream;
}

export function buildProxyStreamRequestPayload(
  model: Model<any>,
  context: Context,
  options: Pick<ProxyStreamOptions, 'temperature' | 'maxTokens' | 'reasoning' | 'apiKey'>,
): ProxyStreamRequestPayload {
  return {
    model,
    context,
    options: {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      reasoning: options.reasoning,
      apiKey: options.apiKey,
    },
  };
}

function processProxyEvent(
  proxyEvent: ProxyAssistantMessageEvent,
  partial: AssistantMessage,
): AssistantMessageEvent | undefined {
  switch (proxyEvent.type) {
    case 'start':
      return { type: 'start', partial };
    case 'text_start':
      partial.content[proxyEvent.contentIndex] = { type: 'text', text: '' };
      return { type: 'text_start', contentIndex: proxyEvent.contentIndex, partial };
    case 'text_delta': {
      const content = partial.content[proxyEvent.contentIndex];
      if (content?.type !== 'text') {
        throw new Error('Received text_delta for non-text content');
      }
      content.text += proxyEvent.delta;
      return {
        type: 'text_delta',
        contentIndex: proxyEvent.contentIndex,
        delta: proxyEvent.delta,
        partial,
      };
    }
    case 'text_end': {
      const content = partial.content[proxyEvent.contentIndex];
      if (content?.type !== 'text') {
        throw new Error('Received text_end for non-text content');
      }
      content.textSignature = proxyEvent.contentSignature;
      return {
        type: 'text_end',
        contentIndex: proxyEvent.contentIndex,
        content: content.text,
        partial,
      };
    }
    case 'thinking_start':
      partial.content[proxyEvent.contentIndex] = { type: 'thinking', thinking: '' };
      return { type: 'thinking_start', contentIndex: proxyEvent.contentIndex, partial };
    case 'thinking_delta': {
      const content = partial.content[proxyEvent.contentIndex];
      if (content?.type !== 'thinking') {
        throw new Error('Received thinking_delta for non-thinking content');
      }
      content.thinking += proxyEvent.delta;
      return {
        type: 'thinking_delta',
        contentIndex: proxyEvent.contentIndex,
        delta: proxyEvent.delta,
        partial,
      };
    }
    case 'thinking_end': {
      const content = partial.content[proxyEvent.contentIndex];
      if (content?.type !== 'thinking') {
        throw new Error('Received thinking_end for non-thinking content');
      }
      content.thinkingSignature = proxyEvent.contentSignature;
      return {
        type: 'thinking_end',
        contentIndex: proxyEvent.contentIndex,
        content: content.thinking,
        partial,
      };
    }
    case 'toolcall_start':
      partial.content[proxyEvent.contentIndex] = {
        type: 'toolCall',
        id: proxyEvent.id,
        name: proxyEvent.toolName,
        arguments: {},
        partialJson: '',
      } as StreamingToolCall;
      return { type: 'toolcall_start', contentIndex: proxyEvent.contentIndex, partial };
    case 'toolcall_delta': {
      const content = partial.content[proxyEvent.contentIndex] as StreamingToolCall | undefined;
      if (content?.type !== 'toolCall') {
        throw new Error('Received toolcall_delta for non-toolCall content');
      }
      content.partialJson += proxyEvent.delta;
      try {
        content.arguments = parseStreamingJson(content.partialJson) || {};
      } catch {
        // parseStreamingJson can throw on severely malformed JSON during streaming.
        // Keep current arguments and let toolcall_end attempt repair.
      }
      partial.content[proxyEvent.contentIndex] = { ...content };
      return {
        type: 'toolcall_delta',
        contentIndex: proxyEvent.contentIndex,
        delta: proxyEvent.delta,
        partial,
      };
    }
    case 'toolcall_end': {
      const content = partial.content[proxyEvent.contentIndex] as StreamingToolCall | undefined;
      if (content?.type !== 'toolCall') {
        return undefined;
      }
      // Models sometimes produce malformed JSON (unclosed strings, trailing commas).
      // Use jsonrepair to fix common issues before the agent processes arguments.
      if (content.partialJson) {
        try {
          content.arguments = JSON.parse(content.partialJson);
        } catch (parseError) {
          console.warn('[ai-proxy] toolcall_end JSON.parse failed, attempting jsonrepair:', (parseError as Error).message?.slice(0, 80));
          try {
            content.arguments = JSON.parse(jsonrepair(content.partialJson));
            console.log('[ai-proxy] jsonrepair succeeded for tool:', content.name);
          } catch (repairError) {
            console.error('[ai-proxy] jsonrepair also failed:', (repairError as Error).message?.slice(0, 80));
          }
        }
      }
      delete content.partialJson;
      return {
        type: 'toolcall_end',
        contentIndex: proxyEvent.contentIndex,
        toolCall: content,
        partial,
      };
    }
    case 'done':
      partial.stopReason = proxyEvent.reason;
      partial.usage = proxyEvent.usage;
      return { type: 'done', reason: proxyEvent.reason, message: partial };
    case 'error':
      partial.stopReason = proxyEvent.reason;
      partial.errorMessage = proxyEvent.errorMessage;
      partial.usage = proxyEvent.usage;
      return { type: 'error', reason: proxyEvent.reason, error: partial };
  }
}
