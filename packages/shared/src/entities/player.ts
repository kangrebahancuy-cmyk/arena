import { z } from 'zod';
import { DirectionSchema } from '../world/direction';
import { PositionSchema } from '../world/position';

/**
 * Public identity of a player character.
 *
 * Opaque and server-issued: a client never invents one, and this type exists so an id can never be
 * confused with another kind of id (account, zone, item) in function arguments.
 */
export const PlayerIdSchema = z.string().min(1).max(64).brand<'PlayerId'>();

export type PlayerId = z.infer<typeof PlayerIdSchema>;

/** Length limits for player names, shared by the creation form (Phase 11) and the server's validation. */
export const PLAYER_NAME_MIN_LENGTH = 3;
export const PLAYER_NAME_MAX_LENGTH = 20;

/**
 * Player name rules.
 *
 * ASCII letters, digits and underscore only. This is a security decision, not a style preference:
 * it makes names that impersonate another player with lookalike characters (Cyrillic "а" vs Latin
 * "a") or invisible characters far harder. Richer name support is a deliberate later decision.
 */
export const PlayerNameSchema = z
  .string()
  .min(PLAYER_NAME_MIN_LENGTH)
  .max(PLAYER_NAME_MAX_LENGTH)
  .regex(/^[A-Za-z0-9_]+$/);

/**
 * The authoritative state of one player character.
 *
 * Deliberately minimal: identity plus where the character is and which way it faces. Health, stats,
 * inventory, equipment and quest progress belong to their own phases (7-9) and are added here when
 * they exist, together with a PROTOCOL_VERSION bump — never guessed in advance.
 *
 * Only the game server produces a PlayerState. A client receives one, validates it with
 * PlayerStateSchema, and displays it; unknown fields are stripped so a newer server stays readable
 * by an older client.
 */
export const PlayerStateSchema = z.object({
  id: PlayerIdSchema,
  name: PlayerNameSchema,
  position: PositionSchema,
  facing: DirectionSchema,
});

export type PlayerState = z.infer<typeof PlayerStateSchema>;
