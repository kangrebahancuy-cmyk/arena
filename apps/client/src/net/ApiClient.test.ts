import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiClient, ApiError } from './ApiClient';

const Schema = z.object({ hello: z.string() });

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

/** A fetch that never answers on its own and rejects like the real one when aborted. */
function hangingFetch(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ApiClient.get', () => {
  it('returns the validated body and asks for JSON', async () => {
    const fetchSpy = vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({ hello: 'world' })));
    const client = new ApiClient({ fetch: fetchSpy });

    await expect(client.get('/api/x', Schema)).resolves.toEqual({ hello: 'world' });

    const [path, init] = fetchSpy.mock.calls[0] ?? [];
    expect(path).toBe('/api/x');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('accept')).toBe('application/json');
    expect(init?.credentials).toBe('same-origin');
  });

  it('turns a standard error body into an ApiError carrying the status and server message', async () => {
    const client = new ApiClient({
      fetch: () =>
        Promise.resolve(
          jsonResponse({ error: 'too_many_requests', message: 'Slow down' }, { status: 429 }),
        ),
    });

    await expect(client.get('/api/x', Schema)).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'http',
      status: 429,
      message: 'Slow down',
    });
  });

  it('keeps a generic message when the error body is not JSON (e.g. a proxy error page)', async () => {
    const client = new ApiClient({
      fetch: () => Promise.resolve(new Response('Bad gateway', { status: 502 })),
    });

    await expect(client.get('/api/x', Schema)).rejects.toMatchObject({
      kind: 'http',
      status: 502,
      message: 'The server answered with HTTP 502',
    });
  });

  it('rejects a 2xx response whose body is not JSON', async () => {
    const client = new ApiClient({
      fetch: () => Promise.resolve(new Response('<html>oops</html>', { status: 200 })),
    });

    await expect(client.get('/api/x', Schema)).rejects.toMatchObject({
      kind: 'invalid-response',
      status: 200,
    });
  });

  it('rejects a 2xx response that violates the contract instead of trusting it', async () => {
    const client = new ApiClient({
      fetch: () => Promise.resolve(jsonResponse({ hello: 42 })),
    });

    await expect(client.get('/api/x', Schema)).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('classifies a failed request as a network error and keeps the cause', async () => {
    const cause = new TypeError('Failed to fetch');
    const client = new ApiClient({ fetch: () => Promise.reject(cause) });

    const error = await client.get('/api/x', Schema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'network' });
    expect((error as ApiError).cause).toBe(cause);
  });

  it('times out when the server never answers, and cleans up its timer', async () => {
    vi.useFakeTimers();
    const client = new ApiClient({ fetch: hangingFetch(), timeoutMs: 100 });

    const result = expect(client.get('/api/x', Schema)).rejects.toMatchObject({ kind: 'timeout' });
    await vi.advanceTimersByTimeAsync(100);

    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('lets a per-call timeout override the default', async () => {
    vi.useFakeTimers();
    const client = new ApiClient({ fetch: hangingFetch(), timeoutMs: 10_000 });

    const result = expect(client.get('/api/x', Schema, { timeoutMs: 50 })).rejects.toMatchObject({
      kind: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(50);

    await result;
  });

  it('reports a caller-initiated abort as "aborted", not as a network error', async () => {
    const client = new ApiClient({ fetch: hangingFetch() });
    const controller = new AbortController();

    const result = expect(
      client.get('/api/x', Schema, { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'aborted' });
    controller.abort();

    await result;
  });

  it('does not even send the request when the signal is already aborted', async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    const client = new ApiClient({ fetch: fetchSpy });
    const controller = new AbortController();
    controller.abort();

    await expect(client.get('/api/x', Schema, { signal: controller.signal })).rejects.toMatchObject(
      {
        kind: 'aborted',
      },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
