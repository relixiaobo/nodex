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

interface UpstreamWatchdogOptions {
  intervalMs?: number;
  stallMs?: number;
  now?: () => number;
  onHeartbeat: () => void;
  onStall: () => void;
}

interface UpstreamWatchdog {
  markUpstreamEvent(): void;
  stop(): void;
}

export function mergeAbortSignals(signals: AbortSignal[]): AbortSignal {
  const activeSignals = signals.filter((signal) => !!signal);
  if (activeSignals.length === 0) {
    return new AbortController().signal;
  }
  if (activeSignals.length === 1) {
    return activeSignals[0]!;
  }
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(activeSignals);
  }

  const controller = new AbortController();
  const cleanup = () => {
    for (const signal of activeSignals) {
      signal.removeEventListener('abort', onAbort);
    }
  };
  const onAbort = (event: Event) => {
    cleanup();
    const signal = event.target as AbortSignal | null;
    controller.abort(signal?.reason ?? new Error('Aborted'));
  };

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort(signal.reason ?? new Error('Aborted'));
      return controller.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  return controller.signal;
}

export function startUpstreamWatchdog(options: UpstreamWatchdogOptions): UpstreamWatchdog {
  const intervalMs = options.intervalMs ?? 10_000;
  const stallMs = options.stallMs ?? 45_000;
  const now = options.now ?? Date.now;

  let lastUpstreamEventAt = now();
  const timer = setInterval(() => {
    const silentMs = now() - lastUpstreamEventAt;
    if (silentMs >= stallMs) {
      clearInterval(timer);
      options.onStall();
      return;
    }
    options.onHeartbeat();
  }, intervalMs);

  return {
    markUpstreamEvent() {
      lastUpstreamEventAt = now();
    },
    stop() {
      clearInterval(timer);
    },
  };
}

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

  // Watchdog: checks every 10s whether the upstream API is still producing
  // events. If no upstream event for UPSTREAM_STALL_MS, we send an error
  // and close — the stream is dead, no point keeping the client waiting.
  // While the upstream IS active, we send a heartbeat comment so the
  // client's stall timer doesn't misfire during long thinking phases.
  const WATCHDOG_INTERVAL_MS = 10_000;
  const UPSTREAM_STALL_MS = 45_000;

  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let abortUpstream: (() => void) | null = null;
      let terminalSent = false;

      const enqueueChunk = (chunk: string): void => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Client went away or controller already closed.
        }
      };

      const sendTerminalEvent = (event: ProxyAssistantMessageEvent): void => {
        if (terminalSent) return;
        terminalSent = true;
        enqueueChunk(`data: ${JSON.stringify(event)}\n\n`);
      };

      const watchdog = startUpstreamWatchdog({
        intervalMs: WATCHDOG_INTERVAL_MS,
        stallMs: UPSTREAM_STALL_MS,
        onHeartbeat: () => {
          enqueueChunk(': heartbeat\n\n');
        },
        onStall: () => {
          sendTerminalEvent({
            type: 'error',
            reason: 'error',
            errorMessage: 'Upstream API stopped responding',
            usage: EMPTY_USAGE,
          });
          abortUpstream?.();
        },
      });

      try {
        const upstreamAbort = new AbortController();
        abortUpstream = () => upstreamAbort.abort();

        // Combine client abort + upstream stall abort
        const combinedSignal = mergeAbortSignals([c.req.raw.signal, upstreamAbort.signal]);

        const eventStream = piStream(model, context, {
          ...streamOptions,
          apiKey,
          signal: combinedSignal,
        });

        for await (const event of eventStream) {
          watchdog.markUpstreamEvent();
          const proxyEvent = convertToProxyEvent(event);
          if (proxyEvent.type === 'done' || proxyEvent.type === 'error') {
            terminalSent = true;
          }
          enqueueChunk(`data: ${JSON.stringify(proxyEvent)}\n\n`);
        }
      } catch (error) {
        sendTerminalEvent(createProxyErrorEvent(error, c.req.raw.signal.aborted));
      } finally {
        watchdog.stop();
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
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
