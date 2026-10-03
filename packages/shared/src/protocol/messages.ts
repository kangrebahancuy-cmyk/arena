import { z } from 'zod';
import { PROTOCOL_VERSION } from '../constants';

/**
 * The realtime protocol between client and server.
 *
 * Status: the protocol does NOT exist yet — it is designed together with the WebSocket gateway in
 * Phase 10, and nothing in this project opens a socket. What exists here, and is tested, is the
 * frame shape every message will have to satisfy plus the typed containers both sides will exchange,
 * so client and server never invent two versions of the same contract.
 */
export const MessageEnvelopeSchema = z.object({
  /** Protocol version of the SENDER (see PROTOCOL_VERSION). */
  v: z.number().int().positive(),
  /** Message kind, namespaced by subsystem, e.g. "world/enter". */
  kind: z.string().min(1).max(64),
  /** Message body. Its schema per kind lives in a {@link MessageRegistry}. */
  payload: z.unknown(),
});

export type MessageEnvelope = z.infer<typeof MessageEnvelopeSchema>;

/** Maps every message kind to the schema of its payload. Phase 10 defines the real registries. */
export type MessageRegistry = Readonly<Record<string, z.ZodType>>;

/** One message of a registry: `kind` discriminates, `payload` is typed by the registry. */
export interface Message<Kind extends string, Payload> {
  readonly kind: Kind;
  readonly payload: Payload;
}

/** The union of every message a registry describes. */
export type MessageOf<Registry extends MessageRegistry> = {
  [Kind in keyof Registry & string]: Message<Kind, z.output<Registry[Kind]>>;
}[keyof Registry & string];

/**
 * Client -> server: an INTENT ("walk east", "use the item in slot 3").
 *
 * An intent is a request, never a fact. The server decides what actually happens and answers with
 * authoritative state (see docs/ARCHITECTURE.md, "server-authoritative model").
 */
export type ClientIntent<Registry extends MessageRegistry> = MessageOf<Registry>;

/**
 * Server -> client: an authoritative fact or a snapshot of the world.
 *
 * The client displays these; it never derives game outcomes of its own.
 */
export type ServerMessage<Registry extends MessageRegistry> = MessageOf<Registry>;

/**
 * Validates one inbound frame against a registry and a protocol version.
 *
 * Returns `null` instead of throwing: on a public socket a malformed, unknown or outdated frame is a
 * normal event (garbage, an old client, a scanner), and the gateway decides whether to log, ignore
 * or close. Payloads are validated with their own schema, so a message that passes is safe to use.
 */
export function decodeMessageFrame<Registry extends MessageRegistry>(
  registry: Registry,
  frame: unknown,
  protocolVersion: number = PROTOCOL_VERSION,
): MessageOf<Registry> | null {
  const envelope = MessageEnvelopeSchema.safeParse(frame);
  if (!envelope.success || envelope.data.v !== protocolVersion) {
    return null;
  }

  const payloadSchema = registry[envelope.data.kind];
  if (payloadSchema === undefined) {
    return null;
  }

  const payload = payloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return null;
  }

  // Both halves were validated by their schemas just above; the cast only reattaches the registry's
  // own types (a dynamic registry cannot be expressed as a discriminated zod union without them).
  return { kind: envelope.data.kind, payload: payload.data } as unknown as MessageOf<Registry>;
}

/** Wraps a message in the wire frame. The counterpart of {@link decodeMessageFrame}. */
export function encodeMessageFrame<Registry extends MessageRegistry>(
  message: MessageOf<Registry>,
  protocolVersion: number = PROTOCOL_VERSION,
): MessageEnvelope {
  return { v: protocolVersion, kind: message.kind, payload: message.payload };
}
