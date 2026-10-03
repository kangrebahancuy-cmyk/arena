import { isLevelEnabled } from './levels';
import type { LogLevel, LogThreshold } from './levels';

/**
 * Structured fields attached to a record. Keep the values JSON-friendly: they end up in log files
 * and, on the client, in the browser console.
 */
export type LogContext = Readonly<Record<string, unknown>>;

/** One log line, before any sink formats it. Environment-agnostic on purpose (browser and Node). */
export interface LogRecord {
  readonly level: LogLevel;
  readonly time: Date;
  /** Logger name: a dotted path such as "server.game". */
  readonly name: string;
  readonly message: string;
  readonly context: LogContext | undefined;
  /** The thrown value, if this record describes a failure. Sinks decide how to render it. */
  readonly error: unknown;
}

/** Where records go. The only place that knows the environment: console, pino, a buffer in tests. */
export type LogSink = (record: LogRecord) => void;

/**
 * The logger both applications program against.
 *
 * It is a small facade over the shared core so that game code never depends on pino or on the
 * browser console directly. The level is filtered once, here, and `isEnabled` reports that decision
 * so callers can skip expensive context building.
 */
export interface Logger {
  readonly name: string;
  isEnabled(level: LogLevel): boolean;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  /** `error` is the thrown value itself, not a stringified copy. */
  error(message: string, context?: LogContext, error?: unknown): void;
  fatal(message: string, context?: LogContext, error?: unknown): void;
  /** A logger whose name extends this one's ("server" -> "server.game"). Threshold and sink are shared. */
  child(name: string): Logger;
}

export interface CreateLoggerOptions {
  readonly name: string;
  readonly threshold: LogThreshold;
  readonly sink: LogSink;
  /** Injectable for tests. Defaults to the system clock. */
  readonly now?: () => Date;
}

/** A sink that discards everything. */
export const noopSink: LogSink = () => undefined;

/** Builds a logger from a sink. Used by each application's own logger module. */
export function createLogger(options: CreateLoggerOptions): Logger {
  const { name, sink, threshold, now = () => new Date() } = options;

  const emit = (level: LogLevel, message: string, context?: LogContext, error?: unknown): void => {
    if (!isLevelEnabled(level, threshold)) {
      return;
    }
    sink({ level, time: now(), name, message, context, error });
  };

  return {
    name,
    isEnabled: (level) => isLevelEnabled(level, threshold),
    debug: (message, context) => emit('debug', message, context),
    info: (message, context) => emit('info', message, context),
    warn: (message, context) => emit('warn', message, context),
    error: (message, context, error) => emit('error', message, context, error),
    fatal: (message, context, error) => emit('fatal', message, context, error),
    child: (childName) => createLogger({ name: `${name}.${childName}`, threshold, sink, now }),
  };
}

/**
 * Swallows every record. A safe default for code that must work without logging configured
 * (tests, tooling, and objects built before configuration is read).
 */
export const silentLogger: Logger = createLogger({
  name: 'silent',
  threshold: 'silent',
  sink: noopSink,
});
