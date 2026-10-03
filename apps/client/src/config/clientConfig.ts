import { LogThresholdSchema, RealmError, createGameConfig } from '@project-realm/shared';
import type { GameConfig, LogThreshold } from '@project-realm/shared';
import { z } from 'zod';

/**
 * Configuration visible to the browser.
 *
 * By definition PUBLIC: everything here is bundled into the JavaScript that every player downloads,
 * so it never holds a secret. Values come from three places:
 *
 *   1. build metadata injected by vite.config.ts (`__APP_VERSION__`),
 *   2. Vite's environment (`import.meta.env`) — ONLY `VITE_`-prefixed variables reach browser code,
 *      and each one is validated below before it is used,
 *   3. the shared game rules in `@project-realm/shared` (GameConfig), identical on both sides.
 *
 * The server address is deliberately absent: the client always calls its own origin ("/api/...") and
 * a dev proxy or reverse proxy routes the request to the game server (see vite.config.ts).
 */
export interface ClientConfig {
  readonly appVersion: string;
  readonly isDevelopmentBuild: boolean;
  readonly logLevel: LogThreshold;
  readonly game: GameConfig;
}

/** Server address is never a client setting; a typo in an env var must not be able to change it. */
export interface ClientEnv {
  /** Injected by Vite: true for `vite dev`, false for a production build. */
  readonly DEV: boolean;
  /** `VITE_LOG_LEVEL`: trace | debug | info | warn | error | fatal | silent. Optional. */
  readonly VITE_LOG_LEVEL?: string | undefined;
}

/** The only environment variables this app reads. Anything else is ignored. */
const ClientEnvSchema = z.object({
  DEV: z.boolean(),
  VITE_LOG_LEVEL: LogThresholdSchema.optional(),
});

/** Development logs every internal step; a player's browser should stay quiet unless asked. */
const DEVELOPMENT_LOG_LEVEL: LogThreshold = 'debug';
const PRODUCTION_LOG_LEVEL: LogThreshold = 'info';

/**
 * Reads and validates the effective client configuration.
 *
 * Invalid input is a build/configuration mistake, not something to recover from at runtime, so it
 * throws a {@link RealmError} naming the offending variable; main.ts turns that into a visible error
 * screen and a console entry.
 */
export function readClientConfig(
  env: ClientEnv = import.meta.env,
  appVersion: string = __APP_VERSION__,
): ClientConfig {
  const parsed = ClientEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new RealmError(
      'config_invalid',
      [
        'Invalid client configuration:',
        z.prettifyError(parsed.error),
        '',
        'Fix the variables in apps/client/.env (template: apps/client/.env.example).',
      ].join('\n'),
      { context: { source: 'import.meta.env' } },
    );
  }

  const isDevelopmentBuild = parsed.data.DEV;

  return {
    appVersion,
    isDevelopmentBuild,
    logLevel:
      parsed.data.VITE_LOG_LEVEL ??
      (isDevelopmentBuild ? DEVELOPMENT_LOG_LEVEL : PRODUCTION_LOG_LEVEL),
    game: createGameConfig(),
  };
}
