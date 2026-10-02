import { HEALTH_PATH, HealthResponseSchema } from '@project-realm/shared';
import type { HealthResponse } from '@project-realm/shared';
import type { ApiClient } from './ApiClient';

export interface HealthCheckResult {
  readonly health: HealthResponse;
  /** Wall-clock round trip of the request as measured in this browser. */
  readonly latencyMs: number;
}

/** Asks the server who it is. The result is validated against the shared contract. */
export async function fetchServerHealth(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<HealthCheckResult> {
  const startedAt = performance.now();
  const health = await api.get(HEALTH_PATH, HealthResponseSchema, signal ? { signal } : {});
  return { health, latencyMs: Math.round(performance.now() - startedAt) };
}
