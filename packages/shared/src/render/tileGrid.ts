import { z } from 'zod';
import type { Position } from '../world/position';

/**
 * The tile grid: the bridge between tile coordinates and world pixels.
 *
 * The world is measured in TILES everywhere in game logic (see `entities/player.ts`: a position is a
 * real number in tile units). Pixels exist only inside the renderer and in the map data. Keeping the
 * two apart is what makes the same movement code work at any sprite size or zoom.
 */
export const TILE_SIZE = 16;

/** Integer tile coordinates. */
export const TileCoordinateSchema = z.object({
  column: z.number().int(),
  row: z.number().int(),
});

export type TileCoordinate = z.infer<typeof TileCoordinateSchema>;

/** Converts a position in tile units to the pixel centre of the tile it is standing on. */
export function tileCentreToWorldPixels(column: number, row: number): Position {
  return { x: column * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
}

/** Which tile a position in tile units falls on. Floors, so negative coordinates behave. */
export function worldPositionToTile(position: Position): TileCoordinate {
  return { column: Math.floor(position.x), row: Math.floor(position.y) };
}

/** Stable key for maps and sets. One format, used by both sides. */
export function tileKey(tile: TileCoordinate): string {
  return `${tile.column},${tile.row}`;
}
