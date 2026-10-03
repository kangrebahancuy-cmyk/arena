import { HEALTH_PATH, SERVER_SERVICE_NAME } from '@project-realm/shared';
import type { HealthResponse } from '@project-realm/shared';
import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../core/clock';

export interface HealthRouteDeps {
  readonly clock: Clock;
  readonly startedAt: Date;
  readonly version: string;
  /** From the effective game config, so the handshake reports what this server really runs. */
  readonly protocolVersion: number;
}

/**
 * `GET /api/health`: liveness plus the version handshake data the client needs at boot.
 * Everything returned is measured or read by the running server at request time.
 */
export function registerHealthRoute(app: FastifyInstance, deps: HealthRouteDeps): void {
  app.get(HEALTH_PATH, (_request, reply): HealthResponse => {
    const now = deps.clock.now();
    const uptimeMs = Math.max(0, now.getTime() - deps.startedAt.getTime());

    // A cached health answer would be a lie about the present, so forbid caching.
    void reply.header('cache-control', 'no-store');

    return {
      status: 'ok',
      service: SERVER_SERVICE_NAME,
      version: deps.version,
      protocolVersion: deps.protocolVersion,
      uptimeSeconds: Math.round(uptimeMs) / 1000,
      serverTime: now.toISOString(),
    };
  });
}
