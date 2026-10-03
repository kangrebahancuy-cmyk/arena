import { describe, expect, it } from 'vitest';
import { RealmError } from '../errors/RealmError';
import {
  areaAtPosition,
  buildCollisionLayer,
  buildTileLayer,
  createMapData,
  tileIdAt,
} from './world';

const VALID_MAP = {
  id: 'greenfield',
  name: 'Greenfield',
  columns: 3,
  rows: 2,
  bounds: { x: 0, y: 0, width: 3, height: 2 },
  tileData: [{ id: 'grass', blocksMovement: false }],
  layers: [
    {
      id: 'ground',
      kind: 'tile',
      role: 'ground',
      tiles: ['grass', 'grass', 'grass', 'grass', 'grass', 'grass'],
    },
    {
      id: 'decoration',
      kind: 'tile',
      role: 'decoration',
      tiles: [null, null, null, null, null, null],
    },
    { id: 'collision', kind: 'collision', solid: [false, false, false, false, false, false] },
    { id: 'objects', kind: 'objects', objects: [] },
  ],
  areas: [{ id: 'meadow', name: 'Meadow', bounds: { x: 0, y: 0, width: 3, height: 2 } }],
  spawnPoints: [
    {
      id: 'player_start',
      name: 'Player Start',
      kind: 'player',
      position: { x: 1, y: 0 },
      direction: 'south',
      areaId: 'meadow',
    },
  ],
} as const;

describe('createMapData', () => {
  it('accepts a complete multi-layer map with collision, object, area and spawn data', () => {
    expect(createMapData(VALID_MAP)).toEqual(VALID_MAP);
  });

  it('rejects a tile layer whose tile count does not match the map size', () => {
    const broken = {
      ...VALID_MAP,
      layers: [
        { id: 'ground', kind: 'tile', role: 'ground', tiles: ['grass', 'grass', 'grass'] },
        ...VALID_MAP.layers.slice(1),
      ],
    };

    expect(() => createMapData(broken)).toThrow(RealmError);
    expect(() => createMapData(broken)).toThrow(/expected 6 tiles/);
  });

  it('rejects a collision layer whose mask does not match the map size', () => {
    const broken = {
      ...VALID_MAP,
      layers: VALID_MAP.layers.map((layer) =>
        layer.kind === 'collision' ? { ...layer, solid: [false, true] } : layer,
      ),
    };

    expect(() => createMapData(broken)).toThrow(/expected 6 collision cells/);
  });

  it('rejects spawn points outside map bounds and unknown areas', () => {
    const outside = {
      ...VALID_MAP,
      spawnPoints: [{ ...VALID_MAP.spawnPoints[0], position: { x: 2.5, y: 1.5 } }],
    };
    expect(() => createMapData(outside)).toThrow(/outside the map boundary/);

    const unknownArea = {
      ...VALID_MAP,
      spawnPoints: [{ ...VALID_MAP.spawnPoints[0], areaId: 'lost_place' }],
    };
    expect(() => createMapData(unknownArea)).toThrow(/unknown area id/);
  });

  it.each([
    ['a bad zone id', { id: 'Green Field' }],
    ['no name', { name: '' }],
    ['a zero-column map', { columns: 0 }],
    ['a fractional row count', { rows: 2.5 }],
    ['a huge map', { columns: 10_000 }],
    ['no ground layer', { layers: VALID_MAP.layers.filter((layer) => layer.id !== 'ground') }],
    [
      'an unknown tile id',
      {
        layers: VALID_MAP.layers.map((layer) =>
          layer.kind === 'tile' && layer.id === 'ground'
            ? { ...layer, tiles: ['missing', ...layer.tiles.slice(1)] }
            : layer,
        ),
      },
    ],
    [
      'a transparent ground cell',
      {
        layers: VALID_MAP.layers.map((layer) =>
          layer.kind === 'tile' && layer.id === 'ground'
            ? { ...layer, tiles: [null, ...layer.tiles.slice(1)] }
            : layer,
        ),
      },
    ],
    ['a boundary outside the map', { bounds: { x: 2, y: 0, width: 2, height: 2 } }],
    ['a duplicate tile definition', { tileData: [...VALID_MAP.tileData, ...VALID_MAP.tileData] }],
    ['no player spawn', { spawnPoints: [] }],
  ])('rejects %s', (_label, override) => {
    expect(() => createMapData({ ...VALID_MAP, ...override })).toThrow(RealmError);
  });

  it('reports a stable code for logging', () => {
    try {
      createMapData(null);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toMatchObject({ code: 'config_invalid', name: 'RealmError' });
    }
  });
});

describe('tileIdAt', () => {
  const map = createMapData(VALID_MAP);

  it('reads row-major cells by layer id or role', () => {
    expect(tileIdAt(map, 'ground', 0, 0)).toBe('grass');
    expect(tileIdAt(map, 'ground', 2, 0)).toBe('grass');
    expect(tileIdAt(map, 'decoration', 0, 0)).toBeNull();
  });

  it('returns null outside the map or for an unknown layer, without throwing', () => {
    expect(tileIdAt(map, 'ground', -1, 0)).toBeNull();
    expect(tileIdAt(map, 'ground', 3, 0)).toBeNull();
    expect(tileIdAt(map, 'ground', 0, 2)).toBeNull();
    expect(tileIdAt(map, 'nope', 0, 0)).toBeNull();
  });
});

describe('tile-layer builders', () => {
  it('builds a row-major tile array through the picker', () => {
    const layer = buildTileLayer(
      'ground',
      'ground',
      3,
      2,
      (column, row) => `tile-${column + row * 10}`,
    );

    expect(layer).toMatchObject({ id: 'ground', kind: 'tile', role: 'ground' });
    expect(layer.tiles).toEqual(['tile-0', 'tile-1', 'tile-2', 'tile-10', 'tile-11', 'tile-12']);
  });

  it('builds collision masks with the same row-major indexing', () => {
    const layer = buildCollisionLayer(
      'collision',
      3,
      2,
      (column, row) => column === 2 && row === 1,
    );

    expect(layer.solid).toEqual([false, false, false, false, false, true]);
  });

  it('produces tile layers accepted by the map schema', () => {
    const ground = buildTileLayer('ground', 'ground', 3, 2, () => 'grass');
    const decoration = buildTileLayer('decoration', 'decoration', 3, 2, () => null);

    expect(() =>
      createMapData({ ...VALID_MAP, layers: [ground, decoration, ...VALID_MAP.layers.slice(2)] }),
    ).not.toThrow();
  });
});

describe('areaAtPosition', () => {
  it('returns the named area containing a tile position', () => {
    const map = createMapData(VALID_MAP);
    expect(areaAtPosition(map, { x: 1.5, y: 0.5 })?.name).toBe('Meadow');
    expect(areaAtPosition(map, { x: 3, y: 1 })).toBeUndefined();
  });
});
