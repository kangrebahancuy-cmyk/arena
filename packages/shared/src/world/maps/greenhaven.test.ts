import { describe, expect, it } from 'vitest';
import { createGreenhavenMap } from './greenhaven';

describe('Greenhaven map data', () => {
  const map = createGreenhavenMap();

  it('loads as an original, prototype-sized named map', () => {
    expect(map).toMatchObject({
      id: 'greenhaven',
      name: 'Greenhaven',
      columns: 72,
      rows: 48,
      bounds: { x: 0, y: 0, width: 72, height: 48 },
    });
  });

  it('contains separate ground, decoration, collision and object layers', () => {
    expect(map.layers.map((layer) => layer.kind)).toEqual(['tile', 'tile', 'collision', 'objects']);
    expect(map.layers.filter((layer) => layer.kind === 'tile').map((layer) => layer.role)).toEqual([
      'ground',
      'decoration',
    ]);
  });

  it('names several distinct regions and provides more than one spawn point', () => {
    expect(map.areas.map((area) => area.name)).toEqual([
      'Heartwood Grove',
      'Bracken Meadow',
      'Old Quarry',
      'Moonmere Shore',
      'Greenhaven Village',
      'South Fields',
    ]);
    expect(map.spawnPoints.filter((spawn) => spawn.kind === 'player')).toHaveLength(1);
    expect(map.spawnPoints.length).toBeGreaterThan(1);
  });

  it('defines water, walls, rocks and buildings as explicit collision-capable data', () => {
    expect(map.tileData.find((tile) => tile.id === 'water')?.blocksMovement).toBe(true);
    expect(map.tileData.find((tile) => tile.id === 'stone_wall')?.blocksMovement).toBe(true);
    const objects = map.layers.find((layer) => layer.kind === 'objects');
    expect(objects?.kind).toBe('objects');
    if (objects?.kind !== 'objects') {
      throw new Error('Greenhaven is missing its object layer');
    }
    expect(
      objects.objects.some((object) => object.kind === 'rock' && object.collision.length > 0),
    ).toBe(true);
    expect(
      objects.objects.some((object) => object.kind === 'building' && object.collision.length > 0),
    ).toBe(true);
  });
});
