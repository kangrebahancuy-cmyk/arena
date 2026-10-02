/** Working title. The project name is temporary; keep it in one place. */
export const GAME_TITLE = 'Project Realm';

/** Service identifier reported by the game server (health endpoint, logs). */
export const SERVER_SERVICE_NAME = 'project-realm-server';

/**
 * Wire-compatibility version shared by client and server.
 *
 * Bump it on ANY breaking change to the HTTP contracts or the realtime protocol (Phase 10+).
 * The client compares it with the value reported by the server and refuses to continue on mismatch,
 * so an outdated browser tab can never talk to a newer server in an undefined way.
 */
export const PROTOCOL_VERSION = 1;
