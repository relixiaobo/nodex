import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach } from 'vitest';
import { mergeAbortSignals, startUpstreamWatchdog } from '../../server/src/routes/ai.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('server ai route source', () => {
  it('uses streamSimple so unified reasoning options reach provider adapters', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'server/src/routes/ai.ts'),
      'utf8',
    );

    expect(source).toContain(
      "import { streamSimple as piStream } from '@mariozechner/pi-ai';",
    );
    expect(source).not.toContain(
      "import { stream as piStream } from '@mariozechner/pi-ai';",
    );
    expect(source).toContain('const eventStream = piStream(model, context, {');
    expect(source).toContain('...streamOptions,');
  });

  it('sends heartbeats while the upstream remains active', async () => {
    vi.useFakeTimers();
    let now = 0;
    const onHeartbeat = vi.fn();
    const onStall = vi.fn();

    const watchdog = startUpstreamWatchdog({
      intervalMs: 10_000,
      stallMs: 45_000,
      now: () => now,
      onHeartbeat,
      onStall,
    });

    now = 10_000;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onHeartbeat).toHaveBeenCalledTimes(1);
    expect(onStall).not.toHaveBeenCalled();

    watchdog.markUpstreamEvent();
    now = 20_000;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onHeartbeat).toHaveBeenCalledTimes(2);
    expect(onStall).not.toHaveBeenCalled();

    watchdog.stop();
  });

  it('detects upstream stalls and fires the watchdog once', async () => {
    vi.useFakeTimers();
    let now = 0;
    const onHeartbeat = vi.fn();
    const onStall = vi.fn();

    const watchdog = startUpstreamWatchdog({
      intervalMs: 10_000,
      stallMs: 45_000,
      now: () => now,
      onHeartbeat,
      onStall,
    });

    now = 50_000;
    await vi.advanceTimersByTimeAsync(50_000);

    expect(onStall).toHaveBeenCalledTimes(1);
    watchdog.stop();
  });

  it('falls back when AbortSignal.any is unavailable', () => {
    const originalAny = AbortSignal.any;
    const controllerA = new AbortController();
    const controllerB = new AbortController();

    try {
      Object.defineProperty(AbortSignal, 'any', {
        configurable: true,
        value: undefined,
      });

      const merged = mergeAbortSignals([controllerA.signal, controllerB.signal]);
      controllerB.abort(new Error('secondary aborted'));

      expect(merged.aborted).toBe(true);
      expect(merged.reason).toBeInstanceOf(Error);
      expect((merged.reason as Error).message).toBe('secondary aborted');
    } finally {
      Object.defineProperty(AbortSignal, 'any', {
        configurable: true,
        value: originalAny,
      });
    }
  });
});
