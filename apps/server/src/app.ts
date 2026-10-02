import Fastify from 'fastify';
import type { FastifyError, FastifyInstance, FastifyServerOptions } from 'fastify';
import type { AppConfig } from './config/env';
import { systemClock } from './core/clock';
import type { Clock } from './core/clock';
import { errorBody, errorCodeForStatus } from './http/errors';
import { registerSecurity } from './http/plugins/security';
import { registerHealthRoute } from './http/routes/health';

/** Hard cap on request bodies. Every JSON payload planned (auth, character creation) is tiny. */
const HTTP_BODY_LIMIT_BYTES = 16 * 1024;

export interface BuildAppOptions {
  readonly config: AppConfig;
  /** Server build version, reported by `/api/health`. */
  readonly version: string;
  /** Defaults to the system clock; tests inject a deterministic one. */
  readonly clock?: Clock;
}

// `logger?:` is optional in Fastify's types; with exactOptionalPropertyTypes we must hand it a defined value.
type LoggerOption = NonNullable<FastifyServerOptions['logger']>;

function buildLoggerOptions(config: AppConfig): LoggerOption {
  if (config.log.level === 'silent') {
    return false;
  }

  return {
    level: config.log.level,
    // Credentials must never reach the logs (auth cookies and headers arrive with Phase 11).
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      censor: '[redacted]',
    },
    ...(config.log.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
          },
        }
      : {}),
  };
}

/**
 * Composition root of the HTTP application.
 *
 * It only *builds* the app (no `listen()`), so tests can drive it with `app.inject()` and the real
 * entry point (`main.ts`) decides when to start accepting connections.
 *
 * New features plug in here as small, self-contained modules, e.g. `registerXxxRoutes(app, deps)`.
 * Phase 10 adds the WebSocket gateway; Phase 11 adds auth and the database adapters (see `ports/`).
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config, version } = options;
  const clock = options.clock ?? systemClock;

  const app = Fastify({
    logger: buildLoggerOptions(config),
    trustProxy: config.trustProxy,
    bodyLimit: HTTP_BODY_LIMIT_BYTES,
  });

  await registerSecurity(app, config);

  // Unknown routes are rate limited too (scanners love probing them) and answer in the standard shape.
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, (_request, reply) =>
    reply.status(404).send(errorBody('not_found', 'Route not found')),
  );

  // One place defines how failures look on the wire. 5xx details stay in the server log only.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode =
      error.statusCode !== undefined && error.statusCode >= 400 ? error.statusCode : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.status(500).send(errorBody('internal_error', 'Internal server error'));
    }

    return reply.status(statusCode).send(errorBody(errorCodeForStatus(statusCode), error.message));
  });

  registerHealthRoute(app, { clock, startedAt: clock.now(), version });

  return app;
}
