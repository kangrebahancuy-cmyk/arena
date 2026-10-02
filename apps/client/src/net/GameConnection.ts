export type ConnectionState = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

/**
 * Realtime transport between this browser and the authoritative game server.
 *
 * TODO(phase-10): implement `WebSocketGameConnection` on the browser WebSocket API with
 *   - a protocol-version handshake (`PROTOCOL_VERSION` from @project-realm/shared),
 *   - zod validation of EVERY inbound message before it touches game state,
 *   - heartbeat / latency measurement,
 *   - reconnect using `nextBackoffDelay` from core/backoff,
 *   - authentication through the session cookie from Phase 11 (never a token in the URL).
 *
 * The message types are generic parameters because the protocol does not exist yet (Phase 10 defines it
 * in packages/shared); inventing placeholder messages here would only have to be undone later.
 *
 * Until an implementation exists NOTHING in the client may fabricate server messages: no timers that
 * "simulate" the world, no canned snapshots. If the connection is not open, the UI says so.
 */
export interface GameConnection<TClientMessage, TServerMessage> {
  readonly state: ConnectionState;
  connect(): void;
  close(): void;
  /**
   * Sends an INTENT ("move left", "attack target 42"). The server decides the outcome; the client
   * must never apply the result locally as if it were already true (movement prediction is the only
   * exception, and it is always reconciled with the server's answer).
   */
  send(message: TClientMessage): void;
  /** Returns an unsubscribe function. */
  onMessage(listener: (message: TServerMessage) => void): () => void;
  onStateChange(listener: (state: ConnectionState) => void): () => void;
}
