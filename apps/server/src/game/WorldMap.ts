import { createGreenhavenMap, MapDataSchema, TileCollision } from '@project-realm/shared';
import type { MapData, Position } from '@project-realm/shared';

/**
 * Server-side view of the current world map.
 *
 * This loads and validates the same shared map as the client and exposes collision validation for
 * movement. It is not a tick loop or a network authority; gameplay intents and player state arrive
 * with the multiplayer server phase.
 */
export class ServerWorldMap {
  readonly map: MapData;
  private readonly collision: TileCollision;

  constructor(mapData: unknown = createGreenhavenMap()) {
    this.map = MapDataSchema.parse(mapData);
    this.collision = new TileCollision({ map: this.map });
  }

  /** True only when the complete player body fits in the map and touches no blocking data. */
  canOccupy(position: Position): boolean {
    return this.collision.canOccupy(position);
  }

  /**
   * Validates and resolves one requested displacement against tile, object, and boundary data.
   * Returns the last safe position, so callers never apply a destination that crosses a collider.
   */
  validateMovement(current: Position, requested: Position): Position {
    return this.collision.resolveMovement(current, requested);
  }
}
