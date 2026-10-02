/**
 * Configuration visible to the browser. By definition it is PUBLIC: never put secrets here.
 * The server address is deliberately absent: the client always calls its own origin ("/api/...")
 * and a dev proxy or reverse proxy routes the request to the game server.
 */
export interface ClientConfig {
  readonly appVersion: string;
  readonly isDevelopmentBuild: boolean;
}

export function readClientConfig(): ClientConfig {
  return {
    appVersion: __APP_VERSION__,
    isDevelopmentBuild: import.meta.env.DEV,
  };
}
