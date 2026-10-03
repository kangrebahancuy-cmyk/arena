import { createLogger } from '@project-realm/shared';
import type { HealthResponse, LogRecord } from '@project-realm/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientState } from '../boot/clientState';
import { readClientConfig } from '../config/clientConfig';
import { ApiClient } from '../net/ApiClient';
import { GameClient } from './GameClient';

const CONFIG = readClientConfig({ DEV: true }, '9.9.9-test');

function health(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    service: 'project-realm-server',
    version: '0.1.0',
    protocolVersion: CONFIG.game.protocolVersion,
    uptimeSeconds: 42,
    serverTime: '2026-10-03T12:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** An ApiClient whose transport never touches the network; the responses are still real HTTP shapes. */
function clientWith(fetchImpl: typeof fetch): ApiClient {
  return new ApiClient({ fetch: fetchImpl });
}

/** A fetch that never answers on its own and rejects when aborted, like the real one. */
function hangingFetch(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
}

function captureLogger() {
  const records: LogRecord[] = [];
  const logger = createLogger({
    name: 'client',
    threshold: 'trace',
    sink: (record) => records.push(record),
  });
  return { logger, records };
}

function setup(fetchImpl: typeof fetch) {
  const client = new GameClient({ config: CONFIG, api: clientWith(fetchImpl) });
  const states: ClientState[] = [];
  client.subscribe((state) => states.push(state));
  return { client, states, phases: (): string[] => states.map((state) => state.phase) };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GameClient', () => {
  it('starts in "starting" and reports that state to a new subscriber immediately', () => {
    const { client, states } = setup(() => Promise.resolve(jsonResponse(health())));

    expect(states).toEqual([{ phase: 'starting' }]);
    expect(client.getState()).toEqual({ phase: 'starting' });
  });

  it('uses the shared game config for the handshake, and goes online with the server data', async () => {
    const fetchSpy = vi.fn<typeof fetch>(() =>
      Promise.resolve(jsonResponse(health({ version: '3.1.4', uptimeSeconds: 60 }))),
    );
    const { client, states } = setup(fetchSpy);

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.getState()).toMatchObject({
      phase: 'online',
      health: { version: '3.1.4', protocolVersion: CONFIG.game.protocolVersion },
    });
    expect(states.map((state) => state.phase)).toEqual(['starting', 'checking', 'online']);
    // The client asked the server for its own origin, and nothing else.
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('/api/health');
  });

  it('reports "incompatible" instead of retrying when the server speaks another protocol', async () => {
    const { client } = setup(() =>
      Promise.resolve(jsonResponse(health({ protocolVersion: CONFIG.game.protocolVersion + 1 }))),
    );

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.getState()).toMatchObject({
      phase: 'incompatible',
      clientProtocolVersion: CONFIG.game.protocolVersion,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('goes offline with a real retry schedule and recovers when the server comes back', async () => {
    let failNext = true;
    const { client } = setup(() =>
      failNext
        ? Promise.reject(new TypeError('fetch failed'))
        : Promise.resolve(jsonResponse(health())),
    );

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.getState()).toMatchObject({
      phase: 'offline',
      attempt: 1,
      retryInMs: 1_000,
      reason: { kind: 'network' },
    });

    failNext = false;
    client.retryNow();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.getState().phase).toBe('online');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports a server that answers with an error status as offline, using the server message', async () => {
    const { client } = setup(() =>
      Promise.resolve(
        jsonResponse({ error: 'internal_error', message: 'Internal server error' }, 500),
      ),
    );

    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(client.getState()).toMatchObject({
      phase: 'offline',
      reason: { kind: 'http', status: 500, message: 'Internal server error' },
    });
  });

  it('stop() silences the client: no late states, no pending requests, final state "stopped"', async () => {
    const { client, states } = setup(hangingFetch());
    const abortableStates = states;

    client.start();
    await vi.advanceTimersByTimeAsync(0);
    client.stop();

    expect(client.getState()).toEqual({ phase: 'stopped' });
    await vi.advanceTimersByTimeAsync(60_000); // the AbortController cleared the request timeout
    expect(vi.getTimerCount()).toBe(0);
    expect(abortableStates.at(-1)).toEqual({ phase: 'stopped' });

    client.start(); // starting a stopped client does nothing: the page must be reloaded
    await vi.advanceTimersByTimeAsync(60_000);
    expect(abortableStates.at(-1)).toEqual({ phase: 'stopped' });
  });

  it('start() is idempotent, stop() is idempotent', async () => {
    const fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse(health())));
    const { client } = setup(fetchSpy);

    client.start();
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    client.stop();
    client.stop();

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(client.getState()).toEqual({ phase: 'stopped' });
  });

  it('retryNow() before start() is harmless', () => {
    const { client } = setup(() => Promise.resolve(jsonResponse(health())));

    expect(() => {
      client.retryNow();
    }).not.toThrow();
    expect(client.getState()).toEqual({ phase: 'starting' });
  });

  it('unsubscribe stops notifications for that listener only', async () => {
    const { client } = setup(() => Promise.resolve(jsonResponse(health())));
    const late = vi.fn();
    const unsubscribe = client.subscribe(late);
    late.mockClear();

    unsubscribe();
    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(late).not.toHaveBeenCalled();
  });

  it('logs the real lifecycle through the shared logger', async () => {
    const { logger, records } = captureLogger();
    let failNext = true;
    const client = new GameClient({
      config: CONFIG,
      logger,
      api: clientWith(() =>
        failNext
          ? Promise.reject(new TypeError('fetch failed'))
          : Promise.resolve(jsonResponse(health())),
      ),
    });

    failNext = false;
    client.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(records.map((record) => record.message)).toEqual([
      'client starting',
      'checking the server',
      'server online',
    ]);
    expect(records[2]?.context).toMatchObject({ serverVersion: '0.1.0', protocolVersion: 1 });
  });
});
