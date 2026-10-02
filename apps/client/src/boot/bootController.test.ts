import type { HealthResponse } from '@project-realm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../net/ApiClient';
import type { HealthCheckResult } from '../net/health';
import { BootController } from './bootController';
import type { BootState } from './bootController';

const CLIENT_PROTOCOL = 1;

function health(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    service: 'project-realm-server',
    version: '0.1.0',
    protocolVersion: CLIENT_PROTOCOL,
    uptimeSeconds: 42,
    serverTime: '2026-10-02T12:00:00.000Z',
    ...overrides,
  };
}

function result(overrides: Partial<HealthResponse> = {}, latencyMs = 12): HealthCheckResult {
  return { health: health(overrides), latencyMs };
}

type FetchHealth = (signal: AbortSignal) => Promise<HealthCheckResult>;

function setup(fetchHealth: FetchHealth) {
  const controller = new BootController({ fetchHealth, clientProtocolVersion: CLIENT_PROTOCOL });
  const states: BootState[] = [];
  controller.subscribe((state) => states.push(state));
  return { controller, states };
}

const phases = (states: readonly BootState[]): string[] => states.map((state) => state.phase);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('BootController', () => {
  it('starts in "checking" and reports the first state to new subscribers immediately', () => {
    const { states } = setup(() => new Promise<HealthCheckResult>(() => undefined));

    expect(states).toEqual([{ phase: 'checking', attempt: 1 }]);
  });

  it('goes online with the data the server actually returned', async () => {
    const fetchHealth = vi.fn<FetchHealth>(() => Promise.resolve(result({ version: '3.1.4' }, 25)));
    const { controller, states } = setup(fetchHealth);

    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(phases(states)).toEqual(['checking', 'checking', 'online']);
    expect(controller.getState()).toMatchObject({
      phase: 'online',
      latencyMs: 25,
      health: { version: '3.1.4' },
    });
  });

  it('reports "incompatible" without retrying when the protocol versions differ', async () => {
    const fetchHealth = vi.fn<FetchHealth>(() => Promise.resolve(result({ protocolVersion: 2 })));
    const { controller } = setup(fetchHealth);

    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState()).toMatchObject({
      phase: 'incompatible',
      clientProtocolVersion: 1,
      health: { protocolVersion: 2 },
    });
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
  });

  it('retries with growing delays while the server is unreachable, then recovers', async () => {
    const fetchHealth = vi
      .fn<FetchHealth>()
      .mockRejectedValueOnce(new ApiError('network', 'Could not reach the server'))
      .mockRejectedValueOnce(
        new ApiError('http', 'The server answered with HTTP 502', { status: 502 }),
      )
      .mockResolvedValue(result());
    const { controller } = setup(fetchHealth);

    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toMatchObject({
      phase: 'offline',
      attempt: 1,
      retryInMs: 1_000,
      reason: { kind: 'network' },
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchHealth).toHaveBeenCalledTimes(2);
    expect(controller.getState()).toMatchObject({
      phase: 'offline',
      attempt: 2,
      retryInMs: 2_000,
      reason: { kind: 'http', status: 502 },
    });

    await vi.advanceTimersByTimeAsync(2_000);
    expect(controller.getState().phase).toBe('online');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts the backoff over after a successful check', async () => {
    const fetchHealth = vi
      .fn<FetchHealth>()
      .mockRejectedValueOnce(new ApiError('network', 'down'))
      .mockResolvedValueOnce(result())
      .mockRejectedValueOnce(new ApiError('network', 'down again'));
    const { controller } = setup(fetchHealth);

    controller.start();
    await vi.advanceTimersByTimeAsync(1_000); // failure, wait 1 s, success
    expect(controller.getState().phase).toBe('online');

    controller.retryNow(); // fails again
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState()).toMatchObject({ phase: 'offline', attempt: 1, retryInMs: 1_000 });
  });

  it('retryNow() skips the wait', async () => {
    const fetchHealth = vi
      .fn<FetchHealth>()
      .mockRejectedValueOnce(new ApiError('network', 'down'))
      .mockResolvedValue(result());
    const { controller } = setup(fetchHealth);

    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getState().phase).toBe('offline');

    controller.retryNow();
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState().phase).toBe('online');
    expect(fetchHealth).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0); // the pending automatic retry was cancelled
  });

  it('maps errors that are not ApiErrors to an "unexpected" reason', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { controller } = setup(() => Promise.reject(new Error('bug')));

    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(controller.getState()).toMatchObject({
      phase: 'offline',
      reason: { kind: 'unexpected' },
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('stop() silences everything: no late state, no retry timers, request aborted', async () => {
    let seenSignal: AbortSignal | undefined;
    let resolveRequest: ((value: HealthCheckResult) => void) | undefined;
    const { controller, states } = setup((signal) => {
      seenSignal = signal;
      return new Promise<HealthCheckResult>((resolve) => {
        resolveRequest = resolve;
      });
    });

    controller.start();
    controller.stop();
    resolveRequest?.(result()); // the answer arrives too late
    await vi.advanceTimersByTimeAsync(0);

    expect(seenSignal?.aborted).toBe(true);
    expect(phases(states)).toEqual(['checking', 'checking']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stop() also cancels a scheduled retry', async () => {
    const fetchHealth = vi.fn<FetchHealth>().mockRejectedValue(new ApiError('network', 'down'));
    const { controller } = setup(fetchHealth);

    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    controller.stop();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchHealth).toHaveBeenCalledTimes(1);
  });

  it('start() is idempotent', async () => {
    const fetchHealth = vi.fn<FetchHealth>(() => Promise.resolve(result()));
    const { controller } = setup(fetchHealth);

    controller.start();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchHealth).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops notifications for that listener only', async () => {
    const { controller } = setup(() => Promise.resolve(result()));
    const late = vi.fn();
    const unsubscribe = controller.subscribe(late);
    late.mockClear();

    unsubscribe();
    controller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(late).not.toHaveBeenCalled();
  });
});
