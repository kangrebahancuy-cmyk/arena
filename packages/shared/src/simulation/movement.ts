import type { Direction } from '../world/direction';
import type { Position } from '../world/position';

/** Cardinal movement intent produced by input and consumed by the player controller. */
export interface MoveIntent {
  readonly moving: boolean;
  /** Last active direction is retained while idle so the player keeps facing that way. */
  readonly direction: Direction;
}

/** World-space displacement per unit of simulated time, in tile coordinates. */
const DIRECTION_VECTOR: Readonly<Record<Direction, Position>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

/**
 * Integrates one deterministic movement step in world tile units.
 *
 * Acceleration is intentionally omitted: a held direction moves at a constant configured speed and
 * releasing input produces zero displacement on the next simulation step. The caller supplies the
 * fixed step length, so the same input and configuration produce the same result on every machine.
 * Collision is not handled here; a physics/collision resolver owns that separate concern.
 */
export function movePosition(
  position: Position,
  intent: MoveIntent,
  speedTilesPerSecond: number,
  deltaSeconds: number,
): Position {
  if (
    !intent.moving ||
    !Number.isFinite(speedTilesPerSecond) ||
    speedTilesPerSecond <= 0 ||
    !Number.isFinite(deltaSeconds) ||
    deltaSeconds <= 0
  ) {
    return position;
  }

  const direction = DIRECTION_VECTOR[intent.direction];
  const distance = speedTilesPerSecond * deltaSeconds;
  return {
    x: position.x + direction.x * distance,
    y: position.y + direction.y * distance,
  };
}
