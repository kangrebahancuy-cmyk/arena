export interface BackoffOptions {
  /** Delay before the first retry, in milliseconds. */
  readonly baseMs: number;
  /** No delay ever exceeds this, in milliseconds. */
  readonly maxMs: number;
  /** Growth factor per consecutive failure. */
  readonly factor: number;
}

export const DEFAULT_BACKOFF: BackoffOptions = { baseMs: 1_000, maxMs: 15_000, factor: 2 };

/**
 * Exponential backoff: how long to wait before retry number `retryIndex` (0 = first retry).
 * Pure and deterministic. Used for the boot health check now and for WebSocket reconnects in Phase 10.
 */
export function nextBackoffDelay(
  retryIndex: number,
  options: BackoffOptions = DEFAULT_BACKOFF,
): number {
  const exponent = Math.max(0, Math.floor(retryIndex));
  return Math.min(options.maxMs, options.baseMs * options.factor ** exponent);
}
