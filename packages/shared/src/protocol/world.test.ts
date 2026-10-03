import { describe, expect, it } from 'vitest';
import { RealmError } from '../errors/RealmError';
import { buildTileLayer, createGameMap, tileIndexAt } from './world';

const VALID_MAP = {
  id: 'greenfield',
  name: 'Greenfield',
  columns: 3,
  rows: 2,
  spawn: { x: 1.5, y: 0.5 },
  layers: [{ name: 'ground', tiles: [0, 0, 0, 1, 1, 1] }],
};

describe('createGameMap', () => {
  it('accepts a well-formed map', () => {
    expect(createGameMap(VALID_MAP)).toEqual(VALID_MAP);
  });

  it('rejects a layer whose tile count does not match the map size', () => {
    const broken = { ...VALID_MAP, layers: [{ name: 'ground', tiles: [0, 0, 0] }] };

    expect(() => createGameMap(broken)).toThrow(RealmError);
    expect(() => createGameMap(broken)).toThrow(/expected 6 tiles/);
  });

  it('rejects a spawn point outside the map', () => {
    const broken = { ...VALID_MAP, spawn: { x: 9, y: 0 } };

    expect(() => createGameMap(broken)).toThrow(/outside the 3x2 map/);
  });

  it.each([
    ['a bad zone id', { id: 'Green Field' }],
    ['no name', { name: '' }],
    ['a zero-column map', { columns: 0 }],
    ['a fractional row count', { rows: 2.5 }],
    ['a huge map', { columns: 10_000 }],
    ['no layers', { layers: [] }],
    ['a fractional tile index', { layers: [{ name: 'ground', tiles: [0.5, 0, 0, 1, 1, 1] }] }],
    ['a tile index below -1', { layers: [{ name: 'ground', tiles: [-2, 0, 0, 1, 1, 1] }] }],
  ])('rejects %s', (_label, override) => {
    expect(() => createGameMap({ ...VALID_MAP, ...override })).toThrow(RealmError);
  });

  it('reports a stable code for logging', () => {
    try {
      createGameMap(null);
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toMatchObject({ code: 'config_invalid', name: 'RealmError' });
    }
  });
});

describe('tileIndexAt', () => {
  const map = createGameMap(VALID_MAP);

  it('reads row-major tiles', () => {
    expect(tileIndexAt(map, 'ground', 0, 0)).toBe(0);
    expect(tileIndexAt(map, 'ground', 2, 0)).toBe(0);
    expect(tileIndexAt(map, 'ground', 0, 1)).toBe(1);
    expect(tileIndexAt(map, 'ground', 2, 1)).toBe(1);
  });

  it('returns -1 outside the map or for an unknown layer, without throwing', () => {
    expect(tileIndexAt(map, 'ground', -1, 0)).toBe(-1);
    expect(tileIndexAt(map, 'ground', 3, 0)).toBe(-1);
    expect(tileIndexAt(map, 'ground', 0, 2)).toBe(-1);
    expect(tileIndexAt(map, 'nope', 0, 0)).toBe(-1);
  });
});

describe('buildTileLayer', () => {
  it('builds a row-major array through the picker', () => {
    const layer = buildTileLayer('ground', 3, 2, (column, row) => column + row * 10);

    expect(layer.name).toBe('ground');
    expect(layer.tiles).toEqual([0, 1, 2, 10, 11, 12]);
  });

  it('produces data the map schema accepts', () => {
    const layer = buildTileLayer('ground', 2, 2, () => 0);

    expect(() =>
      createGameMap({ ...VALID_MAP, columns: 2, rows: 2, spawn: { x: 0, y: 0 }, layers: [layer] }),
    ).not.toThrow();
  });
});
