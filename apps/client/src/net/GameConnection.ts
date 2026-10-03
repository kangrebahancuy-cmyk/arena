import type { MessageOf, MessageRegistry } from '@project-realm/shared';

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * Realtime transport between this browser and the authoritative game server.
 *
 * TODO(phase-10): implement `WebSocketGameConnection` on the browser WebSocket API with
 *   - a protocol-version handshake (`PROTOCOL_VERSION` from @project-realm/shared),
 *   - validation of EVERY inbound frame with `decodeMessageFrame` (shared) before it touches game
 *     state, and prompt closing on a frame that does not belong to a known registry,
 *   - heartbeat / latency measurement,
 *   - reconnect using `nextBackoffDelay` from core/backoff, with jitter,
 *   - authentication through the session cookie from Phase 11 (never a token in the URL).
 *
 * The message types come from `@project-realm/shared` as registries (kind -> payload schema), so the
 * client and the server never write down the same contract twice. The registries themselves do not
 * exist yet — Phase 10 defines them; inventing placeholder messages here would have to be undone.
 *
 * Until an implementation exists NOTHING in the client may fabricate server messages: no timers that
 * "simulate" the world, no canned snapshots. If the connection is not open, the UI says so.
 */
export interface GameConnection<
  IntentRegistry extends MessageRegistry,
  EventRegistry extends MessageRegistry,
> {
  readonly state: ConnectionState;
  connect(): void;
  close(): void;
  /**
   * Sends an INTENT ("move east", "attack target 42"). The server decides the outcome; the client
   * must never apply the result locally as if it were already true (movement prediction is the only
   * exception, and it is always reconciled with the server's answer).
   */
  send(intent: MessageOf<IntentRegistry>): void;
  /** Returns an unsubscribe function. */
  onMessage(listener: (message: MessageOf<EventRegistry>) => void): () => void;
  onStateChange(listener: (state: ConnectionState) => void): () => void;
}
