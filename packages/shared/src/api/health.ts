import { z } from 'zod';
import { SERVER_SERVICE_NAME } from '../constants';

/** Route of the health endpoint. Used by the server to register it and by clients to call it. */
export const HEALTH_PATH = '/api/health';

/**
 * Body of `GET /api/health`.
 *
 * Every field is produced by the running server (nothing is hard-coded on the client).
 * Clients must validate with this schema instead of trusting the network.
 */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal(SERVER_SERVICE_NAME),
  /** Server build version (package.json of apps/server). */
  version: z.string().min(1),
  /** See PROTOCOL_VERSION. */
  protocolVersion: z.number().int().positive(),
  uptimeSeconds: z.number().nonnegative(),
  /** Server clock, ISO-8601 in UTC. */
  serverTime: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
