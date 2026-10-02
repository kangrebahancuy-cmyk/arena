import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];
export type NodeEnvironment = 'development' | 'test' | 'production';

/**
 * Every environment variable the server reads, with validation and safe defaults.
 * Anything not listed here is ignored, so a typo can never silently change behaviour of another setting.
 *
 * SECRETS (database URL, session keys, ...) will be added here in later phases. They are read by the
 * server only and must never be exposed to the browser (the client has its own, public-only config).
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // 127.0.0.1 = reachable from this machine only. Containers/servers set HOST=0.0.0.0 explicitly.
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  // Trust X-Forwarded-* headers. Enable ONLY behind a reverse proxy you control, otherwise clients
  // could spoof their IP and dodge rate limits.
  TRUST_PROXY: z.stringbool().default(false),
  HTTP_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  HTTP_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
});

/** Normalised, immutable configuration consumed by the rest of the server. */
export interface AppConfig {
  readonly env: NodeEnvironment;
  readonly host: string;
  readonly port: number;
  readonly log: {
    readonly level: LogLevel;
    /** Human-readable logs for local development; JSON lines everywhere else. */
    readonly pretty: boolean;
  };
  readonly trustProxy: boolean;
  /** Global HTTP limit per client IP. Game-action limits are per connection and arrive with the WebSocket gateway. */
  readonly rateLimit: {
    readonly max: number;
    readonly windowMs: number;
  };
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Parses and validates the environment. Throws {@link ConfigError} listing every invalid variable. */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      [
        'Invalid server configuration:',
        z.prettifyError(result.error),
        '',
        'Fix the variables above in your environment or in apps/server/.env (template: apps/server/.env.example).',
      ].join('\n'),
    );
  }

  const parsed = result.data;
  return {
    env: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    log: { level: parsed.LOG_LEVEL, pretty: parsed.NODE_ENV === 'development' },
    trustProxy: parsed.TRUST_PROXY,
    rateLimit: { max: parsed.HTTP_RATE_LIMIT_MAX, windowMs: parsed.HTTP_RATE_LIMIT_WINDOW_MS },
  };
}
