import type { LogContext } from '../logging/logger';
import { RealmError } from './RealmError';
import type { RealmErrorCode } from './RealmError';

/**
 * Plain, JSON-friendly description of a thrown value.
 *
 * Logging must never fail because of what it logs: anything can be thrown in JavaScript (a string,
 * `null`, an object that cannot be stringified), and pino or the browser console should not have to
 * guess. `toErrorDetails` normalises all of it, including the cause chain.
 */
export interface ErrorDetails {
  readonly name: string;
  readonly message: string;
  readonly stack: string | undefined;
  /** Set when the thrown value is a RealmError. */
  readonly code: RealmErrorCode | undefined;
  /** Structured fields the error carries (RealmError only). */
  readonly context: LogContext | undefined;
  /** The wrapped cause, described the same way. Depth is bounded. */
  readonly cause: ErrorDetails | undefined;
}

/** Deep enough for real chains, shallow enough to keep a log line readable. */
const MAX_CAUSE_DEPTH = 3;

export function toErrorDetails(value: unknown, depth = 0): ErrorDetails {
  if (value instanceof RealmError) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: value.code,
      context: value.context,
      cause: describeCause(value.cause, depth),
    };
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: undefined,
      context: undefined,
      cause: describeCause(value.cause, depth),
    };
  }

  return {
    name: 'UnknownError',
    message: describeValue(value),
    stack: undefined,
    code: undefined,
    context: undefined,
    cause: undefined,
  };
}

function describeCause(cause: unknown, depth: number): ErrorDetails | undefined {
  return cause === undefined || depth >= MAX_CAUSE_DEPTH
    ? undefined
    : toErrorDetails(cause, depth + 1);
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    // `undefined` and functions have no JSON form; fall back to their string representation.
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value); // circular structures, throwing toJSON, ...
  }
}
