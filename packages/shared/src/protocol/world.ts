import { z } from 'zod';
import { RealmError } from '../errors/RealmError';

/**
 * The map format: what a zone looks like, defined once and validated on both sides.
 *
 * The server will load these files to decide what is walkable and what a client may see (Phase 4),
 * and the client loads the same shape to draw it. One schema, two consumers - a map that passes
 * validation here cannot draw one way on the client and collide another way on the server.
 *
 * Deliberately small for Phase 2: layers of tile indices plus a spawn point. Collision flags,
 * several zones, autotile transitions, and object/entity placement come with the phases that need
 * them (4-5), and each of those is an additive change (bump PROTOCOL_VERSION when the shape changes).
 */
export const ZoneIdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/);
export type ZoneId = z.infer<typeof ZoneIdSchema>;

/** Tile indices into a tileset. -1 means "nothing here" (transparent). */
export const TileIndexSchema = z.number().int().min(-1);

export const TileLayerSchema = z.object({
  name: z.string().min(1).max(32),
  /** Row-major, `columns * rows` entries: `tiles[row * columns + column]`. */
  tiles: z.array(TileIndexSchema),
});

export type TileLayer = z.infer<typeof TileLayerSchema>;

export const GameMapSchema = z
  .object({
    id: ZoneIdSchema,
    /** Display name. Player-facing text, so it is data, never a hard-coded string in the renderer. */
    name: z.string().min(1).max(64),
    columns: z.number().int().min(1).max(512),
    rows: z.number().int().min(1).max(512),
    /** Where a character enters the zone, in tile units (may be fractional). */
    spawn: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
    }),
    layers: z.array(TileLayerSchema).min(1),
  })
  .superRefine((map, context) => {
    const expected = map.columns * map.rows;
    map.layers.forEach((layer, index) => {
      if (layer.tiles.length !== expected) {
        context.addIssue({
          code: 'custom',
          path: ['layers', index, 'tiles'],
          message: `expected ${expected} tiles for ${map.columns}x${map.rows}, got ${layer.tiles.length}`,
        });
      }
    });

    const insideMap =
      map.spawn.x >= 0 && map.spawn.y >= 0 && map.spawn.x < map.columns && map.spawn.y < map.rows;
    if (!insideMap) {
      context.addIssue({
        code: 'custom',
        path: ['spawn'],
        message: `spawn (${map.spawn.x}, ${map.spawn.y}) is outside the ${map.columns}x${map.rows} map`,
      });
    }
  });

export type GameMap = z.infer<typeof GameMapSchema>;

/**
 * Validates map data. Throws a {@link RealmError} (`config_invalid`) naming the offending field, so a
 * broken map is a loud failure at load time instead of a flickering world at runtime.
 */
export function createGameMap(input: unknown): GameMap {
  const parsed = GameMapSchema.safeParse(input);
  if (!parsed.success) {
    throw new RealmError(
      'config_invalid',
      ['Invalid map data:', z.prettifyError(parsed.error)].join('\n'),
      { context: { source: 'map' } },
    );
  }
  return parsed.data;
}

/** Tile index at a position, or -1 when the position is outside the map. */
export function tileIndexAt(map: GameMap, layerName: string, column: number, row: number): number {
  if (column < 0 || row < 0 || column >= map.columns || row >= map.rows) {
    return -1;
  }
  const layer = map.layers.find((candidate) => candidate.name === layerName);
  return layer?.tiles[row * map.columns + column] ?? -1;
}

/** Builds a layer's tile array from a per-tile function. Used by the client's prototype map. */
export function buildTileLayer(
  name: string,
  columns: number,
  rows: number,
  pick: (column: number, row: number) => number,
): TileLayer {
  const tiles = new Array<number>(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles[row * columns + column] = pick(column, row);
    }
  }
  return { name, tiles };
}
