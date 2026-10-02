import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../../config/env';

/**
 * Baseline HTTP hardening for every route.
 *
 * - helmet: defensive response headers (nosniff, frame protection, referrer policy, ...).
 * - rate limit: global per-IP ceiling. The default key generator masks IPv6 addresses to their /64
 *   so one client cannot dodge the limit by rotating addresses inside its own prefix.
 *
 * This is called directly (not through `app.register`) so the hooks apply to the whole application
 * instead of being encapsulated in a child scope.
 *
 * Game-level throttling (attack cadence, chat flood, ...) is a different concern: it is applied per
 * WebSocket connection and arrives together with the gateway in Phase 10 / Phase 13.
 */
export async function registerSecurity(app: FastifyInstance, config: AppConfig): Promise<void> {
  await app.register(helmet);
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
  });
}
