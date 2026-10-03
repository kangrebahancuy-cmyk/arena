import { z } from 'zod';
import { PROTOCOL_VERSION } from '../constants';
import { RealmError } from '../errors/RealmError';

/**
 * Game configuration: the rules that are identical on both sides of the connection.
 *
 * Why it is shared and not two configs: the client and the server MUST agree on these numbers. A
 * client stepping at 20 Hz against a server stepping at 30 Hz produces a game that feels broken and
 * cannot be debugged, and a wire-format difference is worse still. Defined once here, imported by
 * both, validated with the same schema.
 *
 * Consumption status (do not silently pretend otherwise):
 *   - `protocolVersion`  — used today: the client compares it with the server's `/api/health` answer.
 *   - `simulation.hz`, `simulation.maxCatchUpSteps` — the fixed timestep contract used by the local
 *     simulation today and the authoritative server tick in Phase 10.
 *   - `movement.playerSpeedTilesPerSecond` — deterministic player speed shared by the local
 *     controller and the future authoritative simulation.
 */
export const GameConfigSchema = z.object({
  /** Wire-compatibility version. Mirrors PROTOCOL_VERSION; see that constant before changing it. */
  protocolVersion: z.number().int().positive(),
  simulation: z.object({
    /** Fixed simulation steps per second. Logic runs on this timestep, rendering interpolates. */
    hz: z.number().int().min(1).max(120),
    /**
     * Upper bound on steps run in a single frame to catch up after a stall (a background tab, a
     * long GC pause). Without it the server would try to simulate minutes of missed time at once —
     * the classic "spiral of death".
     */
    maxCatchUpSteps: z.number().int().min(1).max(60),
  }),
  movement: z.object({
    /** Player speed in world tiles per second, shared by deterministic movement simulations. */
    playerSpeedTilesPerSecond: z.number().positive().max(20),
  }),
});

export type GameConfig = z.infer<typeof GameConfigSchema>;
export type SimulationConfig = GameConfig['simulation'];

/**
 * Defaults for a fresh install. 20 Hz is the classic choice for a tile-based 2D world: smooth
 * enough to feel real-time, slow enough that a step stays cheap on a phone.
 *
 * Nothing may mutate a config object: `createGameConfig` freezes what it returns.
 */
export const DEFAULT_GAME_CONFIG: GameConfig = Object.freeze({
  protocolVersion: PROTOCOL_VERSION,
  simulation: Object.freeze({ hz: 20, maxCatchUpSteps: 5 }),
  movement: Object.freeze({ playerSpeedTilesPerSecond: 4.2 }),
});

/** Partial overrides, e.g. from environment variables. Everything left out falls back to the defaults. */
export interface GameConfigOverrides {
  readonly protocolVersion?: number | undefined;
  readonly simulation?:
    | {
        readonly hz?: number | undefined;
        readonly maxCatchUpSteps?: number | undefined;
      }
    | undefined;
  readonly movement?:
    | {
        readonly playerSpeedTilesPerSecond?: number | undefined;
      }
    | undefined;
}

/**
 * Builds the effective game configuration: defaults, overridden by `overrides`, validated and frozen.
 *
 * Invalid input is a programmer or operator error, not a runtime condition to recover from, so it
 * throws a {@link RealmError} that names every offending field.
 */
export function createGameConfig(overrides: GameConfigOverrides = {}): GameConfig {
  const candidate = {
    protocolVersion: overrides.protocolVersion ?? DEFAULT_GAME_CONFIG.protocolVersion,
    simulation: { ...DEFAULT_GAME_CONFIG.simulation, ...overrides.simulation },
    movement: { ...DEFAULT_GAME_CONFIG.movement, ...overrides.movement },
  };

  const parsed = GameConfigSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new RealmError(
      'config_invalid',
      ['Invalid game configuration:', z.prettifyError(parsed.error)].join('\n'),
      { context: { config: 'game' } },
    );
  }

  return Object.freeze({
    protocolVersion: parsed.data.protocolVersion,
    simulation: Object.freeze({
      hz: parsed.data.simulation.hz,
      maxCatchUpSteps: parsed.data.simulation.maxCatchUpSteps,
    }),
    movement: Object.freeze({
      playerSpeedTilesPerSecond: parsed.data.movement.playerSpeedTilesPerSecond,
    }),
  });
}
