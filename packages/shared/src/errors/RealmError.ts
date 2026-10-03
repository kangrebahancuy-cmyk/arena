import type { LogContext } from '../logging/logger';

/**
 * Stable, machine-readable codes for errors the project raises on purpose.
 *
 * These describe problems with the *application*: bad configuration, a lifecycle call in the wrong
 * order, a port that cannot be bound. Failures of a single request are a different hierarchy (the
 * client's `ApiError`): a dropped HTTP call is not the same kind of problem as a broken config, and
 * callers branch on different things.
 *
 * Codes are part of the contract: add new ones, never repurpose an existing one.
 */
export const REALM_ERROR_CODES = ['config_invalid', 'invalid_state', 'port_unavailable'] as const;

export type RealmErrorCode = (typeof REALM_ERROR_CODES)[number];

export interface RealmErrorOptions {
  /** Class name to report. Subclasses pass their own so `error.name` stays useful in logs. */
  readonly name?: string | undefined;
  readonly cause?: unknown;
  readonly context?: LogContext | undefined;
}

/**
 * Base class for those errors. Everything it carries survives structured logging: the code for
 * machines, the message for humans, the context for debugging, and the cause chain (`error.cause`).
 */
export class RealmError extends Error {
  readonly code: RealmErrorCode;
  readonly context: LogContext | undefined;

  constructor(code: RealmErrorCode, message: string, options: RealmErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = options.name ?? 'RealmError';
    this.code = code;
    this.context = options.context;
  }
}

/** Narrows an unknown thrown value to {@link RealmError}. */
export function isRealmError(value: unknown): value is RealmError {
  return value instanceof RealmError;
}
