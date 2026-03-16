import { Hono } from 'hono';
import { streamSimple as piStream } from '@mariozechner/pi-ai';
import type {
  AssistantMessageEvent,
  Context,
  Model,
  SimpleStreamOptions,
  TextContent,
  ThinkingContent,
  ToolCall,
  Usage,
} from '@mariozechner/pi-ai';
import type { Env } from '../types.js';
import type { AuthVariables } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';

type ProxyAssistantMessageEvent =
  | { type: 'start' }
  | { type: 'text_start'; contentIndex: number }
  | { type: 'text_delta'; contentIndex: number; delta: string }
  | { type: 'text_end'; contentIndex: number; contentSignature?: string }
  | { type: 'thinking_start'; contentIndex: number }
  | { type: 'thinking_delta'; contentIndex: number; delta: string }
  | { type: 'thinking_end'; contentIndex: number; contentSignature?: string }
  | { type: 'toolcall_start'; contentIndex: number; id: string; toolName: string }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string }
  | { type: 'toolcall_end'; contentIndex: number }
  | {
      type: 'done';
      reason: 'stop' | 'length' | 'toolUse';
      usage: Usage;
    }
  | {
      type: 'error';
      reason: 'aborted' | 'error';
      errorMessage?: string;
      usage: Usage;
    };

interface ProxyStreamRequest {
  model?: Model<any>;
  context?: Context;
  options?: Pick<SimpleStreamOptions, 'temperature' | 'maxTokens' | 'reasoning' | 'apiKey'>;
}

const EMPTY_USAGE: Usage = {
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
};

const ai = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

ai.use('*', requireAuth);

ai.post('/stream', async (c) => {
  let body: ProxyStreamRequest;
  try {
    body = await c.req.json<ProxyStreamRequest>();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { model, context, options } = body;
  if (!model || !context) {
    return c.json({ error: 'model and context required' }, 400);
  }

  const { apiKey: rawApiKey, ...streamOptions } = options ?? {};
  const apiKey = rawApiKey?.trim();

  if (!apiKey) {
    return c.json({ error: 'API key required' }, 400);
  }

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const eventStream = piStream(model, context, {
          ...streamOptions,
          apiKey,
          signal: c.req.raw.signal,
        });

        for await (const event of eventStream) {
          const proxyEvent = convertToProxyEvent(event);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(proxyEvent)}\n\n`),
          );
        }
      } catch (error) {
        const proxyError = createProxyErrorEvent(error, c.req.raw.signal.aborted);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(proxyError)}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
});

function convertToProxyEvent(event: AssistantMessageEvent): ProxyAssistantMessageEvent {
  switch (event.type) {
    case 'start':
      return { type: 'start' };
    case 'text_start':
      return { type: 'text_start', contentIndex: event.contentIndex };
    case 'text_delta':
      return {
        type: 'text_delta',
        contentIndex: event.contentIndex,
        delta: event.delta,
      };
    case 'text_end':
      return {
        type: 'text_end',
        contentIndex: event.contentIndex,
        contentSignature: getTextContent(event, event.contentIndex)?.textSignature,
      };
    case 'thinking_start':
      return { type: 'thinking_start', contentIndex: event.contentIndex };
    case 'thinking_delta':
      return {
        type: 'thinking_delta',
        contentIndex: event.contentIndex,
        delta: event.delta,
      };
    case 'thinking_end':
      return {
        type: 'thinking_end',
        contentIndex: event.contentIndex,
        contentSignature: getThinkingContent(event, event.contentIndex)?.thinkingSignature,
      };
    case 'toolcall_start': {
      const toolCall = getToolCallContent(event, event.contentIndex);
      return {
        type: 'toolcall_start',
        contentIndex: event.contentIndex,
        id: toolCall.id,
        toolName: toolCall.name,
      };
    }
    case 'toolcall_delta':
      return {
        type: 'toolcall_delta',
        contentIndex: event.contentIndex,
        delta: event.delta,
      };
    case 'toolcall_end':
      return { type: 'toolcall_end', contentIndex: event.contentIndex };
    case 'done':
      return {
        type: 'done',
        reason: event.reason,
        usage: event.message.usage,
      };
    case 'error':
      return {
        type: 'error',
        reason: event.reason,
        errorMessage: normalizeErrorMessage(event.error.errorMessage),
        usage: event.error.usage,
      };
  }
}

function createProxyErrorEvent(error: unknown, aborted: boolean): ProxyAssistantMessageEvent {
  return {
    type: 'error',
    reason: aborted ? 'aborted' : 'error',
    errorMessage: normalizeErrorMessage(error),
    usage: EMPTY_USAGE,
  };
}

function normalizeErrorMessage(error: unknown): string {
  const message = typeof error === 'string'
    ? error
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  const lower = message.toLowerCase();
  if (
    lower.includes('invalid x-api-key')
    || lower.includes('api key')
    || lower.includes('authentication_error')
    || lower.includes('unauthorized')
  ) {
    return 'Invalid API key';
  }
  return message;
}

function getTextContent(event: Extract<AssistantMessageEvent, { type: 'text_end' }>, contentIndex: number): TextContent | null {
  const content = event.partial.content[contentIndex];
  return content?.type === 'text' ? content : null;
}

function getThinkingContent(
  event: Extract<AssistantMessageEvent, { type: 'thinking_end' }>,
  contentIndex: number,
): ThinkingContent | null {
  const content = event.partial.content[contentIndex];
  return content?.type === 'thinking' ? content : null;
}

function getToolCallContent(
  event: Extract<AssistantMessageEvent, { type: 'toolcall_start' }>,
  contentIndex: number,
): ToolCall {
  const content = event.partial.content[contentIndex];
  if (content?.type !== 'toolCall') {
    throw new Error(`Expected toolCall content at index ${contentIndex}`);
  }
  return content;
}

export default ai;
