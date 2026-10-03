import { createLogger, toErrorDetails } from '@project-realm/shared';
import type { LogLevel, LogSink, Logger, LogThreshold } from '@project-realm/shared';
import type { FastifyBaseLogger } from 'fastify';

/** One pino method per level. A Record keeps the mapping exhaustive at compile time. */
type PinoWriter = (fields: Record<string, unknown>, message: string) => void;

/**
 * Bridges the shared {@link Logger} facade to pino, the logger Fastify already owns.
 *
 * Game code depends on the facade, never on pino, so the logging implementation stays replaceable and
 * shared with the client. The level is filtered by the shared core first, which keeps `isEnabled`
 * honest; pino applies its own level on top.
 *
 * `err` is passed as the raw value on purpose: pino serialises Error objects better than any
 * hand-rolled conversion (stack, own properties).
 */
export function loggerFromPino(
  pino: FastifyBaseLogger,
  options: { readonly name: string; readonly threshold: LogThreshold },
): Logger {
  const writers: Readonly<Record<LogLevel, PinoWriter>> = {
    trace: (fields, message) => pino.trace(fields, message),
    debug: (fields, message) => pino.debug(fields, message),
    info: (fields, message) => pino.info(fields, message),
    warn: (fields, message) => pino.warn(fields, message),
    error: (fields, message) => pino.error(fields, message),
    fatal: (fields, message) => pino.fatal(fields, message),
  };

  const sink: LogSink = (record) => {
    const fields: Record<string, unknown> = { ...record.context, module: record.name };
    if (record.error !== undefined) {
      fields.err = record.error;
    }
    writers[record.level](fields, record.message);
  };

  return createLogger({ name: options.name, threshold: options.threshold, sink });
}

/**
 * Logger for the moments when pino does not exist yet: reading configuration, or failing while the
 * HTTP app is still being built. Writes one JSON object per line (what log shippers expect) to
 * stdout, or to stderr for `error`/`fatal`.
 */
export function createStartupLogger(threshold: LogThreshold, name = 'server'): Logger {
  const sink: LogSink = (record) => {
    const line: Record<string, unknown> = {
      level: record.level,
      time: record.time.toISOString(),
      name: record.name,
      msg: record.message,
      ...record.context,
    };
    if (record.error !== undefined) {
      line.err = toErrorDetails(record.error);
    }

    const stream =
      record.level === 'error' || record.level === 'fatal' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(line)}\n`);
  };

  return createLogger({ name, threshold, sink });
}
