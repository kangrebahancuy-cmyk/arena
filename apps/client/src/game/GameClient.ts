import { silentLogger } from '@project-realm/shared';
import type { Logger } from '@project-realm/shared';
import { BootController } from '../boot/bootController';
import type { ClientState } from '../boot/clientState';
import type { ClientConfig } from '../config/clientConfig';
import { ApiClient } from '../net/ApiClient';
import { fetchServerHealth } from '../net/health';

export interface GameClientOptions {
  readonly config: ClientConfig;
  /** Defaults to a logger that discards everything; main.ts passes the real one. */
  readonly logger?: Logger;
  /** Injectable for tests: an ApiClient whose `fetch` is a double. Defaults to this origin. */
  readonly api?: ApiClient;
}

export type ClientStateListener = (state: ClientState) => void;

/**
 * GameClient — the entry point of the game on the browser side and the composition root of the
 * client.
 *
 * It owns the client configuration, logger and handshake with the HTTP server. `main.ts` composes it
 * with the world bootstrap, which owns the renderer, input, local player controller and world session.
 * The modules remain replaceable and testable: they never need to know about each other.
 *
 * What it does: performs the boot handshake against `GET /api/health`, verifies that the running
 * server speaks this build's protocol, and reports the result to its subscribers. After that succeeds,
 * `main.ts` enters the separately bootstrapped prototype world.
 *
 * What it deliberately does NOT do: simulate a server-owned world or connect players to each other.
 * The Phase 3 player is local/offline; realtime movement authority and multiplayer remain Phase 10.
 */
export class GameClient {
  private readonly config: ClientConfig;
  private readonly logger: Logger;
  private readonly boot: BootController;
  private readonly listeners = new Set<ClientStateListener>();
  private state: ClientState = { phase: 'starting' };
  private unsubscribeBoot: (() => void) | undefined;
  private started = false;
  private stopped = false;

  constructor(options: GameClientOptions) {
    this.config = options.config;
    this.logger = options.logger ?? silentLogger;
    const api = options.api ?? new ApiClient();

    this.boot = new BootController({
      fetchHealth: (signal) => fetchServerHealth(api, signal),
      clientProtocolVersion: this.config.game.protocolVersion,
    });
  }

  getState(): ClientState {
    return this.state;
  }

  /** Reports the current state immediately, then on every change. Returns an unsubscribe function. */
  subscribe(listener: ClientStateListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Starts the client. Idempotent: calling it again while running (or after {@link stop}) does
   * nothing. A stopped client is stopped for good; reloading the page is the way back.
   */
  start(): void {
    if (this.started || this.stopped) {
      return;
    }
    this.started = true;

    this.logger.info('client starting', {
      version: this.config.appVersion,
      developmentBuild: this.config.isDevelopmentBuild,
      protocolVersion: this.config.game.protocolVersion,
      simulationHz: this.config.game.simulation.hz,
      playerSpeedTilesPerSecond: this.config.game.movement.playerSpeedTilesPerSecond,
    });

    // Start first, then subscribe. BootController replays the current state to every new subscriber,
    // and the state at this moment is exactly the one this first check produced, so subscribing first
    // would report "checking" twice. (The handshake is asynchronous; it cannot finish in between.)
    this.boot.start();
    this.unsubscribeBoot = this.boot.subscribe((bootState) => {
      this.setState(bootState);
    });
  }

  /** Stops everything the client owns and ends its life. Safe to call twice. */
  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.started = false;
    this.unsubscribeBoot?.();
    this.unsubscribeBoot = undefined;
    this.boot.stop();
    this.logger.info('client stopped');
    this.setState({ phase: 'stopped' });
  }

  /** Skips the wait before the next automatic retry (the "Retry now" button). */
  retryNow(): void {
    this.boot.retryNow();
  }

  private setState(next: ClientState): void {
    this.state = next;
    this.logTransition(next);
    for (const listener of [...this.listeners]) {
      listener(next);
    }
  }

  private logTransition(state: ClientState): void {
    switch (state.phase) {
      case 'starting':
      case 'stopped':
        return;
      case 'checking':
        this.logger.debug('checking the server', { attempt: state.attempt });
        return;
      case 'online':
        this.logger.info('server online', {
          serverVersion: state.health.version,
          protocolVersion: state.health.protocolVersion,
          latencyMs: state.latencyMs,
        });
        return;
      case 'incompatible':
        this.logger.error('protocol mismatch: this page must be reloaded', {
          clientProtocolVersion: state.clientProtocolVersion,
          serverProtocolVersion: state.health.protocolVersion,
        });
        return;
      case 'offline':
        this.logger.warn('server unreachable', {
          kind: state.reason.kind,
          status: state.reason.status,
          attempt: state.attempt,
          retryInMs: state.retryInMs,
        });
        return;
    }
  }
}
