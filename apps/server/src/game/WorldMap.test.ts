import { createGreenhavenMap } from '@project-realm/shared';
import type { ObjectData } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { ServerWorldMap } from './WorldMap';

function overlappingOrigin(object: ObjectData): { x: number; y: number } {
  const collider = object.collision[0];
  if (collider === undefined) {
    throw new Error(`${object.id} has no collider`);
  }
  return {
    x: object.position.x + collider.x + collider.width / 2 - 0.5,
    y: object.position.y + collider.y + collider.height / 2 - 0.5,
  };
}

describe('ServerWorldMap', () => {
  it('loads and validates the same shared Greenhaven map as the client', () => {
    const world = new ServerWorldMap();

    expect(world.map).toMatchObject({
      id: 'greenhaven',
      name: 'Greenhaven',
      columns: 72,
      rows: 48,
    });
    expect(world.map).toEqual(createGreenhavenMap());
    expect(world.map.layers.map((layer) => layer.kind)).toEqual([
      'tile',
      'tile',
      'collision',
      'objects',
    ]);
  });

  it('rejects invalid map data before it can be used for movement validation', () => {
    const map = createGreenhavenMap();

    expect(() => new ServerWorldMap({ ...map, rows: map.rows - 1 })).toThrow();
  });

  it('validates spawn, water, walls, object colliders and map boundaries', () => {
    const world = new ServerWorldMap();
    const playerSpawn = world.map.spawnPoints.find((spawn) => spawn.kind === 'player');
    const objectLayer = world.map.layers.find((layer) => layer.kind === 'objects');
    if (playerSpawn === undefined || objectLayer?.kind !== 'objects') {
      throw new Error('Greenhaven must provide a player spawn and object layer');
    }
    const rock = objectLayer.objects.find((object) => object.kind === 'rock');
    const cottage = objectLayer.objects.find((object) => object.kind === 'building');
    if (rock === undefined || cottage === undefined) {
      throw new Error('Greenhaven must provide colliding rock and cottage objects');
    }

    expect(world.canOccupy(playerSpawn.position)).toBe(true);
    expect(world.canOccupy({ x: 16, y: 33 })).toBe(false); // Moonmere water
    expect(world.canOccupy({ x: 53, y: 4 })).toBe(false); // quarry wall
    expect(world.canOccupy(overlappingOrigin(rock))).toBe(false);
    expect(world.canOccupy(overlappingOrigin(cottage))).toBe(false);
    expect(world.canOccupy({ x: -0.2, y: 10 })).toBe(false); // map edge
  });

  it('sweeps a requested movement and returns the last safe position', () => {
    const world = new ServerWorldMap();
    const current = { x: 1, y: 33 };
    const result = world.validateMovement(current, { x: 24, y: 33 });

    expect(result.x).toBeGreaterThan(current.x);
    expect(result.x).toBeLessThan(2.2);
    expect(result.y).toBe(current.y);
    expect(world.canOccupy(result)).toBe(true);
  });
});
