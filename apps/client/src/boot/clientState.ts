import type { BootState } from './bootController';

/**
 * Everything the client can be in, as the user interface sees it.
 *
 * It lives in the `boot` layer (not in `game`) because the screen that renders it sits above `boot`
 * but must not import from `game` — see the dependency rules in docs/ARCHITECTURE.md.
 *
 * The union is closed: adding a state is a compile error until the UI handles it.
 *
 * No variant ever contains data that did not come from the server (or from this browser's own
 * startup), and none of them implies that a game world exists.
 */
export type ClientState =
  /** Constructed, not started yet. */
  | { readonly phase: 'starting' }
  /** Handshake with the authoritative server; also the state between automatic retries. */
  | BootState
  /** The client was stopped on purpose; it stays quiet until the page is reloaded. */
  | { readonly phase: 'stopped' };
