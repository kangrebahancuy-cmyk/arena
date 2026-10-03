import { createLogger } from '@project-realm/shared';
import type { LogLevel, LogSink, Logger, LogThreshold } from '@project-realm/shared';

/** A function that writes to one browser console channel. */
type ConsoleWriter = (...args: readonly unknown[]) => void;

/**
 * Shared levels mapped onto the browser console. `fatal` has no dedicated channel; it belongs in the
 * error stream, which is where a developer looks first.
 */
const CONSOLE_WRITERS: Readonly<Record<LogLevel, ConsoleWriter>> = {
  trace: (...args) => console.debug(...args),
  debug: (...args) => console.debug(...args),
  info: (...args) => console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
  fatal: (...args) => console.error(...args),
};

export interface ClientLoggerOptions {
  /** Dotted module path, e.g. "client" or "client.boot". */
  readonly name: string;
  readonly threshold: LogThreshold;
}

/**
 * The browser's logger: the shared core from `@project-realm/shared` with a console sink.
 *
 * Records are shaped for the developer console rather than for a log shipper: a prefixed line, the
 * structured context as an inspectable object, and the real thrown Error (clickable stack) instead
 * of a stringified copy.
 *
 * This module is the ONLY place in the client allowed to touch `console` (enforced by
 * eslint.config.js), so every message goes through one channel that configuration can silence.
 */
export function createClientLogger(options: ClientLoggerOptions): Logger {
  const sink: LogSink = (record) => {
    const args: unknown[] = [`[${record.name}] ${record.message}`];
    if (record.context !== undefined) {
      args.push(record.context);
    }
    if (record.error !== undefined) {
      args.push(record.error);
    }
    CONSOLE_WRITERS[record.level](...args);
  };

  return createLogger({ name: options.name, threshold: options.threshold, sink });
}
