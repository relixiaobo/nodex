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

export function streamProxyWithApiKey(
  model: Model<any>,
  context: Context,
  options: SomaProxyStreamOptions,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream();

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
      void reader?.cancel('Request aborted by user').catch(() => {});
    };

    if (options.signal) {
      options.signal.addEventListener('abort', abortHandler);
    }

    try {
      const requestBody = buildProxyStreamRequestPayload(model, context, options);
      options.onRequestBody?.(requestBody);

      const response = await fetch(`${options.proxyUrl}/api/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${options.authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: options.signal,
      });

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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (options.signal?.aborted) {
          throw new Error('Request aborted by user');
        }

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
          const event = processProxyEvent(proxyEvent, partial);
          if (event) {
            stream.push(event);
          }
        }
      }

      if (options.signal?.aborted) {
        throw new Error('Request aborted by user');
      }

      stream.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const reason = options.signal?.aborted ? 'aborted' : 'error';
      partial.stopReason = reason;
      partial.errorMessage = errorMessage;
      stream.push({
        type: 'error',
        reason,
        error: partial,
      });
      stream.end();
    } finally {
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

function parseCompletedToolCallArguments(partialJson: string): ToolCall['arguments'] | null {
  if (partialJson.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(partialJson) as ToolCall['arguments'];
  } catch {
    try {
      return JSON.parse(jsonrepair(partialJson)) as ToolCall['arguments'];
    } catch {
      return null;
    }
  }
}

function isRecoverableToolCallParseError(errorMessage?: string): boolean {
  if (!errorMessage) return false;

  return /Expected .+ in JSON at position|Unexpected token .+ is not valid JSON/i.test(errorMessage);
}

function recoverToolCallFromProxyError(
  proxyEvent: Extract<ProxyAssistantMessageEvent, { type: 'error' }>,
  partial: AssistantMessage,
): AssistantMessageEvent | null {
  if (proxyEvent.reason !== 'error' || !isRecoverableToolCallParseError(proxyEvent.errorMessage)) {
    return null;
  }

  for (let index = partial.content.length - 1; index >= 0; index -= 1) {
    const content = partial.content[index] as StreamingToolCall | undefined;
    if (content?.type !== 'toolCall' || !content.partialJson) {
      continue;
    }

    const repairedArguments = parseCompletedToolCallArguments(content.partialJson);
    if (!repairedArguments) {
      continue;
    }

    content.arguments = repairedArguments;
    delete content.partialJson;
    partial.stopReason = 'toolUse';
    partial.errorMessage = undefined;
    partial.usage = proxyEvent.usage;

    return {
      type: 'done',
      reason: 'toolUse',
      message: partial,
    };
  }

  return null;
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
      if (content.partialJson) {
        const parsedArguments = parseCompletedToolCallArguments(content.partialJson);
        if (parsedArguments) {
          content.arguments = parsedArguments;
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
    case 'error': {
      const recoveredEvent = recoverToolCallFromProxyError(proxyEvent, partial);
      if (recoveredEvent) {
        return recoveredEvent;
      }

      partial.stopReason = proxyEvent.reason;
      partial.errorMessage = proxyEvent.errorMessage;
      partial.usage = proxyEvent.usage;
      return { type: 'error', reason: proxyEvent.reason, error: partial };
    }
  }
}
