import {
  buildCollisionLayer,
  buildTileLayer,
  createGreenhavenMap,
  createMapData,
} from '@project-realm/shared';
import type { MapData, ObjectData, TileId } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { TileCollision } from './Collision';

const TILE_DATA = [
  { id: 'grass', blocksMovement: false },
  { id: 'water', blocksMovement: true },
  { id: 'wall', blocksMovement: true },
] as const;

function mapData(
  options: {
    readonly columns?: number;
    readonly rows?: number;
    readonly bounds?: { x: number; y: number; width: number; height: number };
    readonly ground?: (column: number, row: number) => TileId;
    readonly decoration?: (column: number, row: number) => TileId | null;
    readonly solid?: (column: number, row: number) => boolean;
    readonly objects?: readonly ObjectData[];
  } = {},
): MapData {
  const columns = options.columns ?? 8;
  const rows = options.rows ?? 8;
  const bounds = options.bounds ?? { x: 0, y: 0, width: columns, height: rows };
  return createMapData({
    id: 'test_map',
    name: 'Test Map',
    columns,
    rows,
    bounds,
    tileData: TILE_DATA,
    layers: [
      buildTileLayer('ground', 'ground', columns, rows, options.ground ?? (() => 'grass')),
      buildTileLayer('decoration', 'decoration', columns, rows, options.decoration ?? (() => null)),
      buildCollisionLayer('collision', columns, rows, options.solid ?? (() => false)),
      { id: 'objects', kind: 'objects', objects: [...(options.objects ?? [])] },
    ],
    areas: [{ id: 'test_area', name: 'Test Area', bounds }],
    spawnPoints: [
      {
        id: 'test_spawn',
        name: 'Test Spawn',
        kind: 'player',
        position: { x: 1, y: 1 },
        direction: 'south',
        areaId: 'test_area',
      },
    ],
  });
}

describe('TileCollision', () => {
  it('blocks water from semantic tile data without consulting renderer indices', () => {
    const map = mapData({
      ground: (column, row) => (column === 4 && row === 4 ? 'water' : 'grass'),
    });
    const collision = new TileCollision({ map });

    expect(collision.canOccupy({ x: 1, y: 1 })).toBe(true);
    expect(collision.canOccupy({ x: 3.2, y: 3.2 })).toBe(false);
  });

  it('blocks solid cells in the explicit collision layer', () => {
    const map = mapData({ solid: (column, row) => column === 4 && row === 4 });
    const collision = new TileCollision({ map });

    expect(collision.canOccupy({ x: 1, y: 1 })).toBe(true);
    expect(collision.canOccupy({ x: 3.2, y: 3.2 })).toBe(false);
  });

  it('blocks a solid tile placed on the decoration layer, such as a wall', () => {
    const map = mapData({
      decoration: (column, row) => (column === 4 && row === 4 ? 'wall' : null),
    });
    const collision = new TileCollision({ map });

    expect(collision.canOccupy({ x: 3.2, y: 3.2 })).toBe(false);
  });

  it('stops a movement sweep before a blocked tile', () => {
    const map = mapData({ solid: (column, row) => column === 3 && row === 2 });
    const collision = new TileCollision({ map });
    const current = { x: 1, y: 2 };
    const resolved = collision.resolveMovement(current, { x: 5, y: 2 });

    expect(resolved.x).toBeGreaterThan(2);
    expect(resolved.x).toBeLessThan(2.2);
    expect(resolved.y).toBe(current.y);
    expect(collision.canOccupy(resolved)).toBe(true);
  });

  it('does not tunnel through a blocked tile during a large requested displacement', () => {
    const map = mapData({
      columns: 32,
      rows: 4,
      solid: (column, row) => column === 15 && row === 1,
    });
    const collision = new TileCollision({ map });
    const resolved = collision.resolveMovement({ x: 1, y: 1 }, { x: 30, y: 1 });

    expect(resolved.x).toBeLessThan(14.2);
    expect(collision.canOccupy(resolved)).toBe(true);
  });

  it('sweeps against relative object collider data for rocks and buildings', () => {
    const objects: ObjectData[] = [
      {
        id: 'test-building',
        kind: 'building',
        sprite: 'cottage',
        position: { x: 4.5, y: 3 },
        collision: [{ x: -0.5, y: -0.5, width: 1, height: 1 }],
      },
    ];
    const collision = new TileCollision({ map: mapData({ objects }) });
    const resolved = collision.resolveMovement({ x: 1, y: 2 }, { x: 7, y: 2 });

    expect(resolved.x).toBeLessThan(3.2);
    expect(collision.canOccupy(resolved)).toBe(true);
  });

  it('keeps the complete player body inside the explicit map boundary', () => {
    const collision = new TileCollision({
      map: mapData({ bounds: { x: 1, y: 1, width: 6, height: 6 } }),
    });

    expect(collision.canOccupy({ x: 1, y: 1 })).toBe(true);
    expect(collision.canOccupy({ x: 0.8, y: 2 })).toBe(false);
    expect(collision.canOccupy({ x: 6.3, y: 2 })).toBe(false);
    expect(collision.canOccupy({ x: 2, y: 6.3 })).toBe(false);
    expect(collision.canOccupy({ x: Number.NaN, y: 2 })).toBe(false);
  });

  it('returns the current point for non-finite positions', () => {
    const collision = new TileCollision({ map: mapData() });
    const current = { x: 1, y: 1 };

    expect(collision.resolveMovement(current, { x: Number.POSITIVE_INFINITY, y: 2 })).toBe(current);
    expect(collision.resolveMovement({ x: Number.NaN, y: 1 }, { x: 2, y: 2 })).toMatchObject({
      x: Number.NaN,
      y: 1,
    });
  });

  it('blocks Greenhaven water, quarry walls, rocks, cottages and the outer map edge', () => {
    const map = createGreenhavenMap();
    const collision = new TileCollision({ map });
    const objects = map.layers.find((layer) => layer.kind === 'objects');
    if (objects?.kind !== 'objects') {
      throw new Error('Greenhaven is missing its object layer');
    }
    const rock = objects.objects.find((object) => object.kind === 'rock');
    const cottage = objects.objects.find((object) => object.kind === 'building');
    if (rock === undefined || cottage === undefined) {
      throw new Error('Greenhaven must contain a colliding rock and building');
    }
    const originOverlapping = (object: ObjectData) => {
      const collider = object.collision[0];
      if (collider === undefined) {
        throw new Error(`${object.id} has no collider`);
      }
      return {
        x: object.position.x + collider.x + collider.width / 2 - 0.5,
        y: object.position.y + collider.y + collider.height / 2 - 0.5,
      };
    };

    expect(collision.canOccupy(map.spawnPoints[0]?.position ?? { x: 0, y: 0 })).toBe(true);
    expect(collision.canOccupy({ x: 16, y: 33 })).toBe(false); // Moonmere water
    expect(collision.canOccupy({ x: 53, y: 4 })).toBe(false); // quarry wall
    expect(collision.canOccupy(originOverlapping(rock))).toBe(false);
    expect(collision.canOccupy(originOverlapping(cottage))).toBe(false);
    expect(collision.canOccupy({ x: -0.2, y: 10 })).toBe(false); // map boundary
  });

  it('validates the configured player body inset and sweep step', () => {
    const map = mapData();
    expect(() => new TileCollision({ map, bodyInset: 0.5 })).toThrow(RangeError);
    expect(() => new TileCollision({ map, maxSweepStep: 0 })).toThrow(RangeError);
  });
});
