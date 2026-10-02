import { ErrorResponseSchema, HEALTH_PATH, HealthResponseSchema } from '@project-realm/shared';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';
import { loadConfig } from './config/env';
import type { Clock } from './core/clock';

const START = '2026-10-02T12:00:00.000Z';

function fakeClock(): { clock: Clock; advance: (ms: number) => void } {
  let current = new Date(START).getTime();
  return {
    clock: { now: () => new Date(current) },
    advance: (ms) => {
      current += ms;
    },
  };
}

let app: FastifyInstance | undefined;

async function createApp(
  env: Record<string, string> = {},
  clock?: Clock,
): Promise<FastifyInstance> {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', ...env });
  app = await buildApp({ config, version: '9.9.9-test', ...(clock ? { clock } : {}) });
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('GET /api/health', () => {
  it('returns a body that satisfies the shared contract, built from real server state', async () => {
    const { clock, advance } = fakeClock();
    const server = await createApp({}, clock);

    advance(5_000);
    const response = await server.inject({ method: 'GET', url: HEALTH_PATH });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(HealthResponseSchema.parse(response.json())).toEqual({
      status: 'ok',
      service: 'project-realm-server',
      version: '9.9.9-test',
      protocolVersion: 1,
      uptimeSeconds: 5,
      serverTime: '2026-10-02T12:00:05.000Z',
    });
  });

  it('is never cacheable', async () => {
    const server = await createApp();
    const response = await server.inject({ method: 'GET', url: HEALTH_PATH });

    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('answers HEAD requests', async () => {
    const server = await createApp();
    const response = await server.inject({ method: 'HEAD', url: HEALTH_PATH });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
  });
});

describe('security headers', () => {
  it('sends defensive headers and does not advertise the framework', async () => {
    const server = await createApp();
    const response = await server.inject({ method: 'GET', url: HEALTH_PATH });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['referrer-policy']).toBeDefined();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('answers unknown routes with the standard error body', async () => {
    const server = await createApp();
    const response = await server.inject({ method: 'GET', url: '/api/does-not-exist' });

    expect(response.statusCode).toBe(404);
    expect(ErrorResponseSchema.parse(response.json()).error).toBe('not_found');
  });

  it('never leaks internal details of a 5xx failure', async () => {
    const server = await createApp();
    server.get('/__boom', () => {
      throw new Error('database password is hunter2');
    });

    const response = await server.inject({ method: 'GET', url: '/__boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal_error', message: 'Internal server error' });
    expect(response.body).not.toContain('hunter2');
  });

  it('passes client errors through with a stable code', async () => {
    const server = await createApp();
    server.get('/__bad', () => {
      throw Object.assign(new Error('name is required'), { statusCode: 400 });
    });

    const response = await server.inject({ method: 'GET', url: '/__bad' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'bad_request', message: 'name is required' });
  });

  it('rejects oversized request bodies', async () => {
    const server = await createApp();
    server.post('/__echo', (request) => request.body);

    const response = await server.inject({
      method: 'POST',
      url: '/__echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ blob: 'x'.repeat(32 * 1024) }),
    });

    expect(response.statusCode).toBe(413);
    expect(ErrorResponseSchema.parse(response.json()).error).toBe('payload_too_large');
  });
});

describe('rate limiting', () => {
  it('answers 429 in the standard shape once the limit is exceeded', async () => {
    const server = await createApp({ HTTP_RATE_LIMIT_MAX: '3' });

    for (let i = 0; i < 3; i += 1) {
      const ok = await server.inject({ method: 'GET', url: HEALTH_PATH });
      expect(ok.statusCode).toBe(200);
    }
    const limited = await server.inject({ method: 'GET', url: HEALTH_PATH });

    expect(limited.statusCode).toBe(429);
    expect(ErrorResponseSchema.parse(limited.json()).error).toBe('too_many_requests');
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('also counts requests to unknown routes', async () => {
    const server = await createApp({ HTTP_RATE_LIMIT_MAX: '2' });

    await server.inject({ method: 'GET', url: '/probe-1' });
    await server.inject({ method: 'GET', url: '/probe-2' });
    const response = await server.inject({ method: 'GET', url: HEALTH_PATH });

    expect(response.statusCode).toBe(429);
  });

  it('ignores a spoofed X-Forwarded-For unless the proxy is explicitly trusted', async () => {
    const server = await createApp({ HTTP_RATE_LIMIT_MAX: '2', TRUST_PROXY: 'false' });

    const statuses: number[] = [];
    for (const forwarded of ['10.0.0.1', '10.0.0.2', '10.0.0.3']) {
      const response = await server.inject({
        method: 'GET',
        url: HEALTH_PATH,
        headers: { 'x-forwarded-for': forwarded },
      });
      statuses.push(response.statusCode);
    }

    // Rotating the header must not hand out fresh quotas.
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('keys the limit on the forwarded client IP when the proxy is trusted', async () => {
    const server = await createApp({ HTTP_RATE_LIMIT_MAX: '1', TRUST_PROXY: 'true' });

    const first = await server.inject({
      method: 'GET',
      url: HEALTH_PATH,
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });
    const secondClient = await server.inject({
      method: 'GET',
      url: HEALTH_PATH,
      headers: { 'x-forwarded-for': '10.0.0.2' },
    });
    const firstAgain = await server.inject({
      method: 'GET',
      url: HEALTH_PATH,
      headers: { 'x-forwarded-for': '10.0.0.1' },
    });

    expect([first.statusCode, secondClient.statusCode, firstAgain.statusCode]).toEqual([
      200, 200, 429,
    ]);
  });
});
