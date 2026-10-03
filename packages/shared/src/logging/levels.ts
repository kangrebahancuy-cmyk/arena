import { z } from 'zod';

/**
 * Log levels, ordered from most to least verbose.
 *
 * Client and server share this one vocabulary (it is also exactly what pino, the server's logger,
 * understands), so a level means the same thing everywhere and no translation table is needed.
 */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/** A log level, or `silent` to switch logging off completely. This is what configuration holds. */
export const LOG_THRESHOLDS = [...LOG_LEVELS, 'silent'] as const;

export type LogThreshold = (typeof LOG_THRESHOLDS)[number];

/** Numeric severity. A record is emitted when its severity is >= the threshold's severity. */
const SEVERITY: Readonly<Record<LogLevel, number>> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export const LogLevelSchema = z.enum(LOG_LEVELS);
export const LogThresholdSchema = z.enum(LOG_THRESHOLDS);

/** Whether a record at `level` passes a logger configured with `threshold`. */
export function isLevelEnabled(level: LogLevel, threshold: LogThreshold): boolean {
  return threshold !== 'silent' && SEVERITY[level] >= SEVERITY[threshold];
}
