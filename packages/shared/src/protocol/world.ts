import { z } from 'zod';
import { RealmError } from '../errors/RealmError';
import { PositionSchema } from '../world/position';
import type { Position } from '../world/position';

/** IDs are stable map-data references, not renderer frame indices. */
export const WorldDataIdSchema = z.string().regex(/^[a-z][a-z0-9_-]*$/);
export type WorldDataId = z.infer<typeof WorldDataIdSchema>;

export const ZoneIdSchema = z.string().regex(/^[a-z][a-z0-9_]*$/);
export type ZoneId = z.infer<typeof ZoneIdSchema>;

export const MapRectangleSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().finite(),
  height: z.number().positive().finite(),
});
export type MapRectangle = z.infer<typeof MapRectangleSchema>;

/** Explicit playable boundary, in tile coordinates. The right and bottom edges are exclusive. */
export const MapBoundarySchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type MapBoundary = z.infer<typeof MapBoundarySchema>;

/** Semantic tile definition. Renderers map `id` to art; collision never depends on atlas order. */
export const TileDataSchema = z.object({
  id: WorldDataIdSchema,
  blocksMovement: z.boolean(),
});
export type TileData = z.infer<typeof TileDataSchema>;
export const TileIdSchema = WorldDataIdSchema;
export type TileId = z.infer<typeof TileIdSchema>;

/** A row-major visual tilemap layer. Null is transparent; ground cells must name a tile. */
export const TileLayerSchema = z.object({
  id: WorldDataIdSchema,
  kind: z.literal('tile'),
  role: z.enum(['ground', 'decoration']),
  /** `row * columns + column`; entries are stable tile IDs, not tileset indices. */
  tiles: z.array(TileIdSchema.nullable()),
});
export type TileLayer = z.infer<typeof TileLayerSchema>;

/** Explicit tile collision mask. `solid[index]` blocks movement at that grid cell. */
export const CollisionDataSchema = z.object({
  id: WorldDataIdSchema,
  kind: z.literal('collision'),
  /** Row-major collision layer, the same dimensions as the map. */
  solid: z.array(z.boolean()),
});
export type CollisionData = z.infer<typeof CollisionDataSchema>;

/** Axis-aligned object collider in map tile coordinates, relative to its visual anchor. */
export const ObjectColliderSchema = MapRectangleSchema;
export type ObjectCollider = z.infer<typeof ObjectColliderSchema>;

/** Data for a static world object; colliders are relative to its bottom-centre tile anchor. */
export const ObjectDataSchema = z.object({
  id: WorldDataIdSchema,
  kind: WorldDataIdSchema,
  sprite: WorldDataIdSchema,
  position: PositionSchema,
  collision: z.array(ObjectColliderSchema).max(16),
});
export type ObjectData = z.infer<typeof ObjectDataSchema>;

/** Object layer is world data; renderers turn its entries into sprites. */
export const ObjectLayerSchema = z.object({
  id: WorldDataIdSchema,
  kind: z.literal('objects'),
  objects: z.array(ObjectDataSchema),
});
export type ObjectLayer = z.infer<typeof ObjectLayerSchema>;

export const WorldLayerSchema = z.discriminatedUnion('kind', [
  TileLayerSchema,
  CollisionDataSchema,
  ObjectLayerSchema,
]);
export type WorldLayer = z.infer<typeof WorldLayerSchema>;

/** Named spawn location. Positions are tile-space player origins, not pixels. */
export const SpawnPointSchema = z.object({
  id: WorldDataIdSchema,
  name: z.string().min(1).max(64),
  kind: z.enum(['player', 'npc', 'transition']),
  position: PositionSchema,
  direction: z.enum(['north', 'east', 'south', 'west']),
  areaId: WorldDataIdSchema,
});
export type SpawnPoint = z.infer<typeof SpawnPointSchema>;

/** Named region within a map; areas may overlap for nested landmarks. */
export const WorldAreaSchema = z.object({
  id: WorldDataIdSchema,
  name: z.string().min(1).max(64),
  bounds: MapRectangleSchema,
});
export type WorldArea = z.infer<typeof WorldAreaSchema>;

/** A complete, version-independent world map that can be validated by client and server alike. */
export const MapDataSchema = z
  .object({
    id: ZoneIdSchema,
    name: z.string().min(1).max(64),
    columns: z.number().int().min(1).max(512),
    rows: z.number().int().min(1).max(512),
    bounds: MapBoundarySchema,
    tileData: z.array(TileDataSchema).min(1),
    layers: z.array(WorldLayerSchema).min(2),
    areas: z.array(WorldAreaSchema).min(1),
    spawnPoints: z.array(SpawnPointSchema).min(1),
  })
  .superRefine((map, context) => {
    const expected = map.columns * map.rows;
    const idSets = [
      { path: ['tileData'] as const, ids: map.tileData.map((tile) => tile.id) },
      { path: ['layers'] as const, ids: map.layers.map((layer) => layer.id) },
      { path: ['areas'] as const, ids: map.areas.map((area) => area.id) },
      { path: ['spawnPoints'] as const, ids: map.spawnPoints.map((spawn) => spawn.id) },
    ];
    for (const { path, ids } of idSets) {
      const seen = new Set<string>();
      ids.forEach((id, index) => {
        if (seen.has(id)) {
          context.addIssue({
            code: 'custom',
            path: [...path, index, 'id'],
            message: `duplicate id "${id}"`,
          });
        }
        seen.add(id);
      });
    }

    const tileDefinitions = new Set(map.tileData.map((tile) => tile.id));
    const tileLayers = map.layers.filter((layer) => layer.kind === 'tile');
    const groundLayers = tileLayers.filter((layer) => layer.role === 'ground');
    const collisionLayers = map.layers.filter((layer) => layer.kind === 'collision');
    const objectLayers = map.layers.filter((layer) => layer.kind === 'objects');
    if (groundLayers.length !== 1) {
      context.addIssue({
        code: 'custom',
        path: ['layers'],
        message: `expected exactly one ground tile layer, got ${groundLayers.length}`,
      });
    }
    if (tileLayers.filter((layer) => layer.role === 'decoration').length > 1) {
      context.addIssue({
        code: 'custom',
        path: ['layers'],
        message: 'only one decoration tile layer is supported per map',
      });
    }
    if (collisionLayers.length > 1 || objectLayers.length > 1) {
      context.addIssue({
        code: 'custom',
        path: ['layers'],
        message: 'a map may have at most one collision layer and one object layer',
      });
    }

    for (const [layerIndex, layer] of map.layers.entries()) {
      if (layer.kind === 'tile') {
        if (layer.tiles.length !== expected) {
          context.addIssue({
            code: 'custom',
            path: ['layers', layerIndex, 'tiles'],
            message: `expected ${expected} tiles for ${map.columns}x${map.rows}, got ${layer.tiles.length}`,
          });
        }
        for (const [tileIndex, tileId] of layer.tiles.entries()) {
          if (layer.role === 'ground' && tileId === null) {
            context.addIssue({
              code: 'custom',
              path: ['layers', layerIndex, 'tiles', tileIndex],
              message: 'ground cells must contain a tile id',
            });
          } else if (tileId !== null && !tileDefinitions.has(tileId)) {
            context.addIssue({
              code: 'custom',
              path: ['layers', layerIndex, 'tiles', tileIndex],
              message: `unknown tile id "${tileId}"`,
            });
          }
        }
      } else if (layer.kind === 'collision' && layer.solid.length !== expected) {
        context.addIssue({
          code: 'custom',
          path: ['layers', layerIndex, 'solid'],
          message: `expected ${expected} collision cells for ${map.columns}x${map.rows}, got ${layer.solid.length}`,
        });
      }
    }

    const bounds = map.bounds;
    const boundsRight = bounds.x + bounds.width;
    const boundsBottom = bounds.y + bounds.height;
    if (boundsRight > map.columns || boundsBottom > map.rows) {
      context.addIssue({
        code: 'custom',
        path: ['bounds'],
        message: `map boundary must fit inside the ${map.columns}x${map.rows} tilemap`,
      });
    }

    const insideBounds = (rectangle: MapRectangle): boolean =>
      rectangle.x >= bounds.x &&
      rectangle.y >= bounds.y &&
      rectangle.x + rectangle.width <= boundsRight &&
      rectangle.y + rectangle.height <= boundsBottom;
    for (const [areaIndex, area] of map.areas.entries()) {
      if (!insideBounds(area.bounds)) {
        context.addIssue({
          code: 'custom',
          path: ['areas', areaIndex, 'bounds'],
          message: `area "${area.id}" is outside the map boundary`,
        });
      }
    }

    for (const [spawnIndex, spawn] of map.spawnPoints.entries()) {
      if (
        spawn.position.x < bounds.x ||
        spawn.position.y < bounds.y ||
        spawn.position.x + 1 > boundsRight ||
        spawn.position.y + 1 > boundsBottom
      ) {
        context.addIssue({
          code: 'custom',
          path: ['spawnPoints', spawnIndex, 'position'],
          message: `spawn "${spawn.id}" is outside the map boundary`,
        });
      }
      if (!map.areas.some((area) => area.id === spawn.areaId)) {
        context.addIssue({
          code: 'custom',
          path: ['spawnPoints', spawnIndex, 'areaId'],
          message: `unknown area id "${spawn.areaId}"`,
        });
      }
    }

    const objectIds = new Set<string>();
    for (const [layerIndex, layer] of map.layers.entries()) {
      if (layer.kind !== 'objects') {
        continue;
      }
      layer.objects.forEach((object, objectIndex) => {
        if (objectIds.has(object.id)) {
          context.addIssue({
            code: 'custom',
            path: ['layers', layerIndex, 'objects', objectIndex, 'id'],
            message: `duplicate object id "${object.id}"`,
          });
        }
        objectIds.add(object.id);
        object.collision.forEach((collider, colliderIndex) => {
          const absolute: MapRectangle = {
            x: object.position.x + collider.x,
            y: object.position.y + collider.y,
            width: collider.width,
            height: collider.height,
          };
          if (!insideBounds(absolute)) {
            context.addIssue({
              code: 'custom',
              path: ['layers', layerIndex, 'objects', objectIndex, 'collision', colliderIndex],
              message: `object "${object.id}" collider is outside the map boundary`,
            });
          }
        });
      });
    }

    if (!map.spawnPoints.some((spawn) => spawn.kind === 'player')) {
      context.addIssue({
        code: 'custom',
        path: ['spawnPoints'],
        message: 'expected at least one player spawn point',
      });
    }
  });

export type MapData = z.infer<typeof MapDataSchema>;
export type GameMap = MapData;
/** Backwards-compatible name retained for existing map consumers. */
export const GameMapSchema = MapDataSchema;

/**
 * Validates world/map data. A malformed map is a loud config failure rather than an invisible or
 * non-colliding world at runtime.
 */
export function createMapData(input: unknown): MapData {
  const parsed = MapDataSchema.safeParse(input);
  if (!parsed.success) {
    throw new RealmError(
      'config_invalid',
      ['Invalid map data:', z.prettifyError(parsed.error)].join('\n'),
      { context: { source: 'map' } },
    );
  }
  return parsed.data;
}

/** Legacy spelling retained while old callers migrate to the phase-four world format. */
export const createGameMap = createMapData;

/** Tile ID at a layer/role position, or null outside the tilemap. */
export function tileIdAt(
  map: MapData,
  layerIdOrRole: string,
  column: number,
  row: number,
): TileId | null {
  if (column < 0 || row < 0 || column >= map.columns || row >= map.rows) {
    return null;
  }
  const layer = map.layers.find(
    (candidate) =>
      candidate.kind === 'tile' &&
      (candidate.id === layerIdOrRole || candidate.role === layerIdOrRole),
  );
  if (layer?.kind !== 'tile') {
    return null;
  }
  return layer.tiles[row * map.columns + column] ?? null;
}

/** Builds a row-major visual tile layer from map data, not from renderer code. */
export function buildTileLayer(
  id: string,
  role: TileLayer['role'],
  columns: number,
  rows: number,
  pick: (column: number, row: number) => TileId | null,
): TileLayer {
  const tiles = new Array<TileId | null>(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      tiles[row * columns + column] = pick(column, row);
    }
  }
  return { id, kind: 'tile', role, tiles };
}

/** Builds a row-major collision layer. */
export function buildCollisionLayer(
  id: string,
  columns: number,
  rows: number,
  isSolid: (column: number, row: number) => boolean,
): CollisionData {
  const solid = new Array<boolean>(columns * rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      solid[row * columns + column] = isSolid(column, row);
    }
  }
  return { id, kind: 'collision', solid };
}

/** Whether a point is inside a half-open rectangle in tile coordinates. */
export function pointInMapRectangle(point: Position, rectangle: MapRectangle): boolean {
  return (
    point.x >= rectangle.x &&
    point.y >= rectangle.y &&
    point.x < rectangle.x + rectangle.width &&
    point.y < rectangle.y + rectangle.height
  );
}

/** Returns the most specific named map area containing a tile position, if any. */
export function areaAtPosition(map: MapData, position: Position): WorldArea | undefined {
  return map.areas
    .filter((area) => pointInMapRectangle(position, area.bounds))
    .sort(
      (left, right) =>
        left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height,
    )[0];
}
