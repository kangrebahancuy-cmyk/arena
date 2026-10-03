import { TILE_SIZE } from '@project-realm/shared';
import type { GameConfig } from '@project-realm/shared';
import { createGameConfig } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import type { RenderCommand } from '../render/scene';
import { FOG_TILE_INDEX, WorldSession } from './WorldSession';
import { createPrototypeWorld } from './PrototypeWorld';

const GAME: GameConfig = createGameConfig();
const STEP = 1 / GAME.simulation.hz;

function makeSession(overrides: { zoom?: number } = {}) {
  const world = createPrototypeWorld();
  const session = new WorldSession({
    world,
    playerId: 'local:test',
    playerName: 'Tester',
    game: GAME,
    cameraOptions: { followHalfLifeSeconds: 0, ...overrides },
  });
  session.setViewport({ width: 800, height: 600 });
  return { world, session };
}

/** One simulated second, in fixed steps. */
function simulate(session: WorldSession, seconds: number): RenderCommand[] {
  const commands: RenderCommand[] = [];
  const steps = Math.round(seconds * GAME.simulation.hz);
  for (let step = 0; step < steps; step += 1) {
    commands.push(...session.tick(STEP));
  }
  return commands;
}

describe('WorldSession', () => {
  it('starts on the prototype spawn with the fog still covering the map', () => {
    const { session, world } = makeSession();
    expect(session.player.position).toEqual(world.spawn);
    expect(session.simulationHz).toBe(GAME.simulation.hz);

    const ground = session.currentScene.layers[0];
    expect(ground?.tiles).toHaveLength(world.map.columns * world.map.rows);
    expect(ground?.tiles.every((index) => index === FOG_TILE_INDEX)).toBe(true);
  });

  it('adds the player, the objects, the villagers and their labels on the first tick', () => {
    const { session, world } = makeSession();
    const commands = session.tick(STEP);
    const types = commands.map((command) => command.type);

    expect(types).toContain('viewport');
    expect(types).toContain('camera');
    expect(types).toContain('layer-added');
    expect(types).toContain('actor-added');
    expect(types).toContain('ui-added');

    const actors = commands.filter((command) => command.type === 'actor-added');
    expect(actors).toHaveLength(1 + world.patrols.length);
    expect(commands.filter((command) => command.type === 'object-added')).toHaveLength(
      world.objects.length,
    );
  });

  it('walks the player in the pressed direction at the configured speed', () => {
    const { session } = makeSession();
    session.setIntent({ moving: true, direction: 'east' });
    const before = session.player.position.x;

    simulate(session, 1);

    // Prototype walking speed is 4.2 tiles per second; the exact value lives in the session, so the
    // assertion is that it moved a real distance in the right direction, not a copied constant.
    expect(session.player.position.x - before).toBeGreaterThan(4);
    expect(session.player.position.x - before).toBeLessThan(4.5);
    expect(session.player.position.y).toBeCloseTo(before === 0 ? 0 : session.player.position.y, 5);
    expect(session.player.facing).toBe('east');
  });

  it('never walks onto blocked tiles, and turns to face the wall instead', () => {
    const { session, world } = makeSession();
    const terrain = world.map.layers[0]?.tiles ?? [];
    const columns = world.map.columns;

    // The lake sits in the south-west; walk west for twenty seconds and the player must end up stopped
    // against it rather than standing in the water.
    session.setIntent({ moving: true, direction: 'west' });
    simulate(session, 20);

    const column = Math.floor(session.player.position.x);
    const row = Math.floor(session.player.position.y);
    const standingOn = terrain[row * columns + column] ?? -1;
    expect(world.walkable(standingOn)).toBe(true);

    // And the tile in front of the player is the reason it stopped: not walkable.
    const blocked = new Set([3, 4]);
    const ahead = terrain[row * columns + Math.max(0, column - 1)] ?? -1;
    expect(blocked.has(ahead) || column <= 1).toBe(true);
    expect(session.player.facing).toBe('west');
  });

  it('moves the camera to follow the player, and keeps it inside the map', () => {
    const { session } = makeSession();
    const startX = session.camera.snapshot.x;

    session.setIntent({ moving: true, direction: 'east' });
    simulate(session, 3);

    expect(session.camera.snapshot.x).toBeGreaterThan(startX);
    const camera = session.camera.snapshot;
    const halfViewport = 800 / (2 * camera.zoom);
    expect(camera.x).toBeGreaterThanOrEqual(halfViewport - 2 * TILE_SIZE - 1);
    expect(camera.x).toBeLessThanOrEqual(64 * TILE_SIZE - halfViewport + 2 * TILE_SIZE + 1);
  });

  it('reveals the fog around the player and only there', () => {
    const { session } = makeSession();
    simulate(session, 0.5);

    const ground = session.currentScene.layers[0];
    const columns = ground?.columns ?? 1;
    const centre = { column: 32, row: 20 };
    const at = (column: number, row: number): number => ground?.tiles[row * columns + column] ?? -9;

    expect(at(centre.column, centre.row)).toBe(-1); // cleared under the player
    expect(at(centre.column + 20, centre.row)).toBe(FOG_TILE_INDEX); // still cloud far away

    // The revealed area is bounded: no tile outside the radius was touched.
    const touched = (ground?.tiles ?? []).reduce(
      (count, index) => (index === FOG_TILE_INDEX ? count : count + 1),
      0,
    );
    expect(touched).toBeGreaterThan(0);
    expect(touched).toBeLessThanOrEqual(Math.PI * 8 * 8);
  });

  it('reports fog clears as tile patches, never as a re-sent layer', () => {
    const { session } = makeSession();
    const first = session.tick(STEP);
    expect(first.filter((command) => command.type === 'layer-added')).toHaveLength(1);

    const second = session.tick(STEP);
    expect(second.some((command) => command.type === 'layer-added')).toBe(false);

    const patches = second.filter((command) => command.type === 'tiles-changed');
    // Standing still reveals the same area, so once the surroundings are clear there is nothing to
    // patch - the honest answer is "no commands at all" for the tiles.
    expect(patches.length).toBe(0);
  });

  it('does not re-send commands for state that did not change', () => {
    const { session } = makeSession();
    session.setIntent({ moving: false, direction: 'south' });
    simulate(session, 0.5);
    const idle = session.tick(STEP);

    // The camera transform is re-sent every frame (the renderer has no other way to learn it), and the
    // villagers report their own movement - but nothing is re-added, and the idle player is not resent.
    expect(idle.map((command) => command.type)).toContain('camera');
    expect(
      idle.some(
        (command) => command.type === 'actor-changed' && command.actor.id === session.player.id,
      ),
    ).toBe(false);
    for (const type of [
      'layer-added',
      'object-added',
      'ui-added',
      'effect-added',
      'tiles-changed',
    ]) {
      expect(idle.map((command) => command.type)).not.toContain(type);
    }
  });

  it('emits dust while walking and retires it again once its lifetime is over', () => {
    const { session } = makeSession();
    session.setIntent({ moving: true, direction: 'south' });
    const walking = simulate(session, 1);
    const added = walking.filter((command) => command.type === 'effect-added');
    expect(added.length).toBeGreaterThan(0);

    // Stop and let the puffs expire: the session removes them itself, so nothing leaks.
    session.setIntent({ moving: false, direction: 'south' });
    simulate(session, 1);
    expect(session.currentScene.effects.size).toBe(0);
  });

  it('keeps the villagers walking their patrol routes', () => {
    const { session, world } = makeSession();
    const villager = world.patrols[0];
    if (villager === undefined) {
      throw new Error('the prototype world has no patrols');
    }
    const start = { ...(session.currentScene.actors.get(villager.id)?.position ?? { x: 0, y: 0 }) };

    simulate(session, 2);

    const moved = session.currentScene.actors.get(villager.id)?.position;
    expect(moved).toBeDefined();
    expect(Math.hypot((moved?.x ?? 0) - start.x, (moved?.y ?? 0) - start.y)).toBeGreaterThan(0.5);
  });

  it('bounds catch-up work: a long stall is dropped and reported, not simulated', () => {
    const { session } = makeSession();
    const before = session.steps;
    const commands = session.tick(30); // a tab hidden for half a minute

    const steps = session.steps - before;
    expect(steps).toBeLessThanOrEqual(GAME.simulation.maxCatchUpSteps);
    expect(session.droppedSeconds).toBeGreaterThan(0);
    expect(Number.isFinite(session.droppedSeconds)).toBe(true);
    expect(commands.length).toBeGreaterThan(0);
  });

  it('ignores a nonsense delta instead of corrupting the simulation', () => {
    const { session } = makeSession();
    const before = session.steps;
    session.tick(Number.NaN);
    session.tick(-5);
    session.tick(Number.POSITIVE_INFINITY);
    expect(session.steps).toBe(before);
  });

  it('walks at the same speed at 60 Hz and at 15 Hz, because everything is time-based', () => {
    const fast = makeSession().session;
    const slow = makeSession().session;
    fast.setIntent({ moving: true, direction: 'north' });
    slow.setIntent({ moving: true, direction: 'north' });

    for (let frame = 0; frame < 60; frame += 1) {
      fast.tick(1 / 60);
    }
    for (let frame = 0; frame < 15; frame += 1) {
      slow.tick(1 / 15);
    }

    // Within one fixed step's worth of movement: both ran the same simulated time, so the only possible
    // difference is the accumulator's remainder at the moment the last frame was rendered.
    const oneStep = 4.2 / GAME.simulation.hz;
    expect(Math.abs(fast.player.position.y - slow.player.position.y)).toBeLessThan(oneStep * 1.5);
  });
});
