import { RealmError } from '@project-realm/shared';
import type { Logger } from '@project-realm/shared';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/env';
import { systemClock } from '../core/clock';
import type { Clock } from '../core/clock';
import { createStartupLogger, loggerFromPino } from '../core/logger';
import { buildApp } from '../http/buildApp';
import { ServerWorldMap } from './WorldMap';

/**
 * Lifecycle of the game server.
 *
 * `created -> starting -> running -> stopping -> stopped`. A failed start ends in `stopped`: the
 * server never sits in a half-built state pretending to be usable.
 */
export type ServerState = 'created' | 'starting' | 'running' | 'stopping' | 'stopped';

/** The address actually bound, which is not always the configured one (port 0 = pick a free port). */
export interface GameServerAddress {
  readonly host: string;
  readonly port: number;
}

export interface GameServerOptions {
  readonly config: AppConfig;
  /** Build version reported by `/api/health` (apps/server/package.json). */
  readonly version: string;
  /** Injectable for tests so time-dependent behaviour stays deterministic. Defaults to system time. */
  readonly clock?: Clock;
}

/**
 * GameServer — the entry point of the game on the machine side and the composition root of the
 * server.
 *
 * It owns configuration, logging, the HTTP application and its lifecycle (build, listen, shut down),
 * plus the validated Greenhaven map and its collision-aware movement validator. The game loop, player
 * entities and WebSocket gateway arrive in Phase 10. HTTP details live in `http/`, rules in `config/`,
 * and external-system seams in `ports/`.
 *
 * Today it is authoritative about `/api/health` (version, uptime, clock and protocol version), and
 * it can validate a candidate position or resolve a displacement against the shared map. It does not
 * accept gameplay intents or run a world tick yet; those arrive with the multiplayer phase.
 */
export class GameServer {
  private readonly config: AppConfig;
  private readonly version: string;
  private readonly clock: Clock;
  private readonly startupLog: Logger;
  private readonly world: ServerWorldMap;
  private app: FastifyInstance | undefined;
  private pinoLog: Logger | undefined;
  private appClosed = false;
  private state: ServerState = 'created';

  constructor(options: GameServerOptions) {
    this.config = options.config;
    this.version = options.version;
    this.clock = options.clock ?? systemClock;
    this.startupLog = createStartupLogger(this.config.log.level);
    this.world = new ServerWorldMap();
  }

  /**
   * The best logger available: pino through the HTTP app once it exists, process streams before
   * that. Both are the same facade, so callers never branch on which one is active.
   */
  get logger(): Logger {
    return this.pinoLog ?? this.startupLog;
  }

  getState(): ServerState {
    return this.state;
  }

  /** The validated shared map and collision validator loaded by this server instance. */
  getWorldMap(): ServerWorldMap {
    return this.world;
  }

  /** Where the server is reachable, or `undefined` while it is not listening. */
  getAddress(): GameServerAddress | undefined {
    const address = this.app?.server.address();
    if (address === null || address === undefined || typeof address === 'string') {
      return undefined;
    }
    return { host: address.address, port: address.port };
  }

  /**
   * Builds the HTTP app and starts listening.
   *
   * Throws a {@link RealmError} when the port cannot be bound (the caller logs and exits — a game
   * server that is not listening is of no use), or when the lifecycle is misused.
   */
  async start(): Promise<void> {
    if (this.state !== 'created') {
      throw new RealmError('invalid_state', `GameServer.start() called while "${this.state}"`, {
        context: { state: this.state },
      });
    }
    this.state = 'starting';

    const app = await buildApp({
      config: this.config,
      version: this.version,
      clock: this.clock,
    });
    this.app = app;
    this.pinoLog = loggerFromPino(app.log, {
      name: 'server',
      threshold: this.config.log.level,
    });

    try {
      await app.listen({ host: this.config.host, port: this.config.port });
    } catch (error) {
      // The app exists but is not listening. A failed start is terminal: the server must never sit in
      // "starting" as if it might still come up. `stop()` still closes the app (main.ts calls it
      // before exiting) so the logger is flushed.
      this.state = 'stopped';
      throw describeListenFailure(error, this.config);
    }

    this.state = 'running';

    const address = this.getAddress();
    // The effective configuration is logged once, in full: it is the first question asked when a
    // server behaves differently from the developer's machine.
    this.logger.info('game server ready', {
      env: this.config.env,
      host: address?.host ?? this.config.host,
      port: address?.port ?? this.config.port,
      protocolVersion: this.config.game.protocolVersion,
      simulationHz: this.config.game.simulation.hz,
      worldMapId: this.world.map.id,
    });
  }

  /**
   * Closes the HTTP app (which also drains its plugins) and marks the server stopped.
   * Idempotent: signal handlers may race, and a forced exit may follow a normal one.
   */
  async stop(): Promise<void> {
    if (this.state === 'stopping' || this.appClosed) {
      return;
    }

    const wasRunning = this.state === 'running';
    this.state = 'stopping';
    if (wasRunning) {
      this.logger.info('stopping the game server');
    }

    if (this.app !== undefined) {
      // Fastify onClose hooks (game loop, persistence, database) are registered here in later phases.
      await this.app.close();
      this.appClosed = true;
    }

    this.state = 'stopped';
    if (wasRunning) {
      this.logger.info('game server stopped');
    }
  }
}

/**
 * Turns a bind failure into an error with a message an operator can act on, using only the facts of
 * this machine (the code the OS returned) plus what the project documents.
 */
function describeListenFailure(error: unknown, config: AppConfig): RealmError {
  const code = errorCode(error);

  if (code === 'EADDRINUSE') {
    return new RealmError(
      'port_unavailable',
      `Port ${config.port} is already in use. Stop the other process or set PORT in apps/server/.env.`,
      { cause: error, context: { host: config.host, port: config.port, code } },
    );
  }

  if (code === 'EACCES') {
    return new RealmError(
      'port_unavailable',
      `Not allowed to listen on ${config.host}:${config.port}. On Windows the port may be reserved by the system: choose another PORT (see docs/SETUP-WINDOWS.md).`,
      { cause: error, context: { host: config.host, port: config.port, code } },
    );
  }

  return new RealmError('port_unavailable', 'The server could not start listening.', {
    cause: error,
    context: { host: config.host, port: config.port, code },
  });
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}
