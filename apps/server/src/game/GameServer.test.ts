import { HEALTH_PATH, HealthResponseSchema, RealmError } from '@project-realm/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../config/env';
import type { AppConfig } from '../config/env';
import { GameServer } from './GameServer';

/** Port 0 lets the OS pick a free port, so the suite never collides with a running dev server. */
function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }), port: 0, ...overrides };
}

const started: GameServer[] = [];

async function startServer(overrides: Partial<AppConfig> = {}): Promise<GameServer> {
  const server = new GameServer({ config: testConfig(overrides), version: '9.9.9-test' });
  started.push(server);
  await server.start();
  return server;
}

/** Runs a promise that is expected to fail and hands back what it threw (unknown, as in a real catch). */
async function catchError(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

function portOf(server: GameServer): number {
  const address = server.getAddress();
  if (address === undefined) {
    throw new Error('the server is not listening');
  }
  return address.port;
}

function urlOf(server: GameServer, path: string): string {
  return `http://127.0.0.1:${portOf(server)}${path}`;
}

afterEach(async () => {
  for (const server of started.splice(0)) {
    await server.stop();
  }
});

describe('GameServer', () => {
  it('loads the shared validated world before opening its HTTP listener', () => {
    const server = new GameServer({ config: testConfig(), version: '9.9.9-test' });
    const world = server.getWorldMap();
    const playerSpawn = world.map.spawnPoints.find((spawn) => spawn.kind === 'player');

    expect(world.map.id).toBe('greenhaven');
    expect(playerSpawn).toBeDefined();
    expect(playerSpawn && world.canOccupy(playerSpawn.position)).toBe(true);
  });

  it('starts with the documented lifecycle and binds a real socket', async () => {
    const server = new GameServer({ config: testConfig(), version: '9.9.9-test' });

    expect(server.getState()).toBe('created');
    expect(server.getAddress()).toBeUndefined();

    await server.start();

    expect(server.getState()).toBe('running');
    expect(server.getAddress()?.port).toBeGreaterThan(0);
    started.push(server);
  });

  it('serves /api/health over HTTP with the data this server actually runs with', async () => {
    const server = await startServer();
    const config = loadConfig({ NODE_ENV: 'test' });

    const response = await fetch(urlOf(server, HEALTH_PATH));
    const health = HealthResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(health.service).toBe('project-realm-server');
    expect(health.version).toBe('9.9.9-test');
    expect(health.protocolVersion).toBe(config.game.protocolVersion);
    expect(health.serverTime).toBe(new Date(health.serverTime).toISOString());
  });

  it('reports a taken port with an actionable message instead of starting half-way', async () => {
    const first = await startServer();
    const port = portOf(first);
    const second = new GameServer({ config: testConfig({ port }), version: '9.9.9-test' });
    started.push(second);

    const failure = await catchError(second.start());

    expect(failure).toBeInstanceOf(RealmError);
    expect(failure).toMatchObject({ code: 'port_unavailable' });
    expect((failure as RealmError).message).toContain(`Port ${port} is already in use`);
    expect(second.getState()).toBe('stopped');
  });

  it('refuses a second start() instead of pretending the server is running', async () => {
    const server = await startServer();

    const failure = await catchError(server.start());

    expect(failure).toMatchObject({ code: 'invalid_state' });
    expect((failure as RealmError).message).toContain('running');
    expect(server.getState()).toBe('running'); // the rejected call did not disturb the running server
  });

  it('stops accepting connections after stop(), and stop() is idempotent', async () => {
    const server = await startServer();
    const url = urlOf(server, HEALTH_PATH);

    await server.stop();

    expect(server.getState()).toBe('stopped');
    expect(server.getAddress()).toBeUndefined();
    await expect(fetch(url)).rejects.toThrow();

    await expect(server.stop()).resolves.toBeUndefined();
  });

  it('can be stopped before it ever started', async () => {
    const server = new GameServer({ config: testConfig(), version: '9.9.9-test' });

    await server.stop();

    expect(server.getState()).toBe('stopped');
    expect(server.getAddress()).toBeUndefined();
  });

  it('exposes one logger that is usable before, during and after startup', async () => {
    const server = new GameServer({ config: testConfig(), version: '9.9.9-test' });

    expect(server.logger.name).toBe('server'); // process-stream logger until the app exists
    await server.start();
    expect(server.logger.name).toBe('server'); // pino through the HTTP app afterwards

    await server.stop();
    expect(() => {
      server.logger.info('after stop');
    }).not.toThrow();
  });
});
