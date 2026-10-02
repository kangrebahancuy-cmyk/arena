import type { HealthResponse } from '@project-realm/shared';
import { DEFAULT_BACKOFF, nextBackoffDelay } from '../core/backoff';
import type { BackoffOptions } from '../core/backoff';
import { ApiError } from '../net/ApiClient';
import type { ApiErrorKind } from '../net/ApiClient';
import type { HealthCheckResult } from '../net/health';

/** Why the server could not be used. `message` is client-authored or the server's own error text. */
export interface OfflineReason {
  readonly kind: ApiErrorKind | 'unexpected';
  readonly message: string;
  readonly status: number | undefined;
}

/**
 * What the boot screen may show. Every variant is derived from a real request to the server:
 * there is no state in which data is shown that the server did not send.
 */
export type BootState =
  | { readonly phase: 'checking'; readonly attempt: number }
  | { readonly phase: 'online'; readonly health: HealthResponse; readonly latencyMs: number }
  | {
      readonly phase: 'incompatible';
      readonly health: HealthResponse;
      readonly clientProtocolVersion: number;
    }
  | {
      readonly phase: 'offline';
      readonly reason: OfflineReason;
      /** Consecutive failures so far. */
      readonly attempt: number;
      readonly retryInMs: number;
    };

export type BootListener = (state: BootState) => void;

export interface BootControllerDeps {
  readonly fetchHealth: (signal: AbortSignal) => Promise<HealthCheckResult>;
  readonly clientProtocolVersion: number;
  readonly backoff?: BackoffOptions;
}

/**
 * Boot flow: ask the server who it is, verify the client speaks its protocol, and keep retrying
 * (with exponential backoff) while the server is unreachable.
 *
 * It owns no DOM and no globals, so it is unit-tested directly. Phase 11 continues the flow after
 * `online` (login -> character select -> game).
 */
export class BootController {
  private readonly deps: BootControllerDeps;
  private readonly listeners = new Set<BootListener>();
  private state: BootState = { phase: 'checking', attempt: 1 };
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: AbortController | undefined;
  private running = false;
  private consecutiveFailures = 0;

  constructor(deps: BootControllerDeps) {
    this.deps = deps;
  }

  getState(): BootState {
    return this.state;
  }

  /** Calls the listener right away with the current state, then on every change. */
  subscribe(listener: BootListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.check();
  }

  /** Skips the wait before the next automatic retry. */
  retryNow(): void {
    if (!this.running) {
      return;
    }
    this.cancelPending();
    void this.check();
  }

  /** After `stop()` no further state is ever emitted. */
  stop(): void {
    this.running = false;
    this.cancelPending();
  }

  private cancelPending(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.inFlight?.abort();
    this.inFlight = undefined;
  }

  private async check(): Promise<void> {
    const controller = new AbortController();
    this.inFlight = controller;
    this.setState({ phase: 'checking', attempt: this.consecutiveFailures + 1 });

    try {
      const { health, latencyMs } = await this.deps.fetchHealth(controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      this.inFlight = undefined;

      if (health.protocolVersion !== this.deps.clientProtocolVersion) {
        // Retrying cannot fix this: the page itself is outdated.
        this.setState({
          phase: 'incompatible',
          health,
          clientProtocolVersion: this.deps.clientProtocolVersion,
        });
        return;
      }

      this.consecutiveFailures = 0;
      this.setState({ phase: 'online', health, latencyMs });
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      this.inFlight = undefined;

      const retryInMs = nextBackoffDelay(
        this.consecutiveFailures,
        this.deps.backoff ?? DEFAULT_BACKOFF,
      );
      this.consecutiveFailures += 1;
      this.setState({
        phase: 'offline',
        reason: toOfflineReason(error),
        attempt: this.consecutiveFailures,
        retryInMs,
      });
      this.retryTimer = setTimeout(() => {
        void this.check();
      }, retryInMs);
    }
  }

  private setState(next: BootState): void {
    this.state = next;
    for (const listener of [...this.listeners]) {
      listener(next);
    }
  }
}

function toOfflineReason(error: unknown): OfflineReason {
  if (error instanceof ApiError) {
    return { kind: error.kind, message: error.message, status: error.status };
  }
  // Not one of ours: this is a bug, so leave a trace for developers.
  console.error('[boot] unexpected error while contacting the server', error);
  return {
    kind: 'unexpected',
    message: 'Unexpected error while contacting the server',
    status: undefined,
  };
}
