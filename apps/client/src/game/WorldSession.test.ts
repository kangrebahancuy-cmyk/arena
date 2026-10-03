import { TILE_SIZE, createGameConfig, tileIdAt } from '@project-realm/shared';
import type { GameConfig } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { TileCollision } from '../physics/Collision';
import type { RenderCommand } from '../render/scene';
import { WorldSession } from './WorldSession';
import { createGreenhavenWorld } from './GreenhavenWorld';

const GAME: GameConfig = createGameConfig();
const STEP = 1 / GAME.simulation.hz;

function makeSession(overrides: { zoom?: number } = {}) {
  const world = createGreenhavenWorld();
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

function mapObjectCount(world: ReturnType<typeof createGreenhavenWorld>): number {
  return world.map.layers.reduce(
    (count, layer) => (layer.kind === 'objects' ? count + layer.objects.length : count),
    0,
  );
}

describe('WorldSession', () => {
  it('loads the Greenhaven player spawn and resolves its named area', () => {
    const { session, world } = makeSession();

    expect(world.map.name).toBe('Greenhaven');
    expect(session.player.position).toEqual(world.spawn.position);
    expect(session.areaName).toBe('Greenhaven Village');
    expect(session.simulationHz).toBe(GAME.simulation.hz);
  });

  it('builds ground and decoration scenes from shared map layers', () => {
    const { session, world } = makeSession();
    const groundData = world.map.layers.find(
      (layer) => layer.kind === 'tile' && layer.role === 'ground',
    );
    const decorData = world.map.layers.find(
      (layer) => layer.kind === 'tile' && layer.role === 'decoration',
    );
    if (groundData?.kind !== 'tile' || decorData?.kind !== 'tile') {
      throw new Error('Greenhaven is missing a visible tile layer');
    }
    const commands = session.tick(STEP);
    const tileLayers = session.currentScene.layers;

    expect(commands.filter((command) => command.type === 'layer-added')).toHaveLength(2);
    expect(tileLayers.map((layer) => layer.role)).toEqual(['ground', 'decoration']);
    expect(tileLayers[0]?.tiles).toEqual(groundData?.tiles);
    expect(tileLayers[1]?.tiles).toEqual(decorData?.tiles);
    expect(tileLayers[0]?.tiles).toHaveLength(world.map.columns * world.map.rows);
    expect(world.map.layers.some((layer) => layer.kind === 'collision')).toBe(true);
  });

  it('adds the player, map objects, original NPCs, monsters and their labels on the first tick', () => {
    const { session, world } = makeSession();
    const commands = session.tick(STEP);
    const types = commands.map((command) => command.type);

    expect(types).toContain('viewport');
    expect(types).toContain('camera');
    expect(types).toContain('layer-added');
    expect(types).toContain('actor-added');
    expect(types).toContain('object-added');
    expect(types).toContain('ui-added');

    const actors = commands.filter((command) => command.type === 'actor-added');
    expect(actors).toHaveLength(1 + world.npcs.length + world.monsters.length);
    expect(commands.filter((command) => command.type === 'object-added')).toHaveLength(
      mapObjectCount(world),
    );
  });

  it('walks the player in the pressed direction at configured speed', () => {
    const { session } = makeSession();
    session.setIntent({ moving: true, direction: 'east' });
    const before = { ...session.player.position };

    simulate(session, 1);

    expect(session.player.position.x - before.x).toBeGreaterThan(4);
    expect(session.player.position.x - before.x).toBeLessThan(4.5);
    expect(session.player.position.y).toBe(before.y);
    expect(session.player.direction).toBe('east');
    expect(session.player.speed).toBe(GAME.movement.playerSpeedTilesPerSecond);
    expect(session.player.movementState).toBe('moving');
    expect(session.player.animationState).toBe('walk');
  });

  it('interpolates the rendered actor and camera between fixed simulation steps', () => {
    const { session } = makeSession();
    session.setIntent({ moving: true, direction: 'east' });
    session.tick(STEP);
    const startX = session.player.position.x;
    const previousRenderX = session.currentScene.actors.get(session.player.id)?.position.x;

    session.tick(STEP / 2);

    const renderX = session.currentScene.actors.get(session.player.id)?.position.x;
    const halfStep = (GAME.movement.playerSpeedTilesPerSecond * STEP) / 2;
    expect(renderX).toBeCloseTo(startX - halfStep);
    expect(renderX).toBeGreaterThan(previousRenderX ?? 0);
    expect(session.camera.snapshot.x).toBeCloseTo(((renderX ?? 0) + 0.5) * TILE_SIZE);
  });

  it('stops moving and returns to idle animation when the input is released', () => {
    const { session } = makeSession();
    session.setIntent({ moving: true, direction: 'east' });
    simulate(session, 0.5);
    const stoppedAt = { ...session.player.position };

    session.setIntent({ moving: false, direction: 'east' });
    simulate(session, 0.5);

    expect(session.player.position).toEqual(stoppedAt);
    expect(session.player.movementState).toBe('idle');
    expect(session.player.animationState).toBe('idle');
    expect(session.currentScene.actors.get(session.player.id)).toMatchObject({
      moving: false,
      animationState: 'idle',
    });
  });

  it('stops at Moonmere water while keeping the player in the named shore area', () => {
    const { session, world } = makeSession();
    const collision = new TileCollision({ map: world.map });
    session.setIntent({ moving: true, direction: 'west' });
    simulate(session, 20);

    expect(session.player.position.x).toBeLessThan(world.spawn.position.x);
    expect(session.player.position.x).toBeGreaterThan(18);
    expect(collision.canOccupy(session.player.position)).toBe(true);
    expect(tileIdAt(world.map, 'ground', 16, 33)).toBe('water');
    expect(collision.canOccupy({ x: 16, y: 33 })).toBe(false);
    expect(session.areaName).toBe('Moonmere Shore');
    expect(session.player.direction).toBe('west');
    expect(session.player.movementState).toBe('idle');
  });

  it('moves the camera with the player and keeps it inside Greenhaven bounds', () => {
    const { session, world } = makeSession();
    const startX = session.camera.snapshot.x;
    session.setIntent({ moving: true, direction: 'east' });
    simulate(session, 3);

    expect(session.camera.snapshot.x).toBeGreaterThan(startX);
    const camera = session.camera.snapshot;
    const halfViewport = 800 / (2 * camera.zoom);
    expect(camera.x).toBeGreaterThanOrEqual(halfViewport - 1);
    expect(camera.x).toBeLessThanOrEqual(world.map.bounds.width * TILE_SIZE - halfViewport + 1);
  });

  it('does not re-send static map layers or objects after their initial scene commands', () => {
    const { session } = makeSession();
    session.tick(STEP);
    simulate(session, 0.5);
    const idle = session.tick(STEP);

    expect(idle.map((command) => command.type)).toContain('camera');
    expect(idle.some((command) => command.type === 'layer-added')).toBe(false);
    expect(idle.some((command) => command.type === 'object-added')).toBe(false);
    expect(idle.some((command) => command.type === 'tiles-changed')).toBe(false);
  });

  it('emits dust while walking and retires it again once its lifetime is over', () => {
    const { session } = makeSession();
    session.setIntent({ moving: true, direction: 'south' });
    const walking = simulate(session, 1);
    expect(walking.filter((command) => command.type === 'effect-added').length).toBeGreaterThan(0);

    session.setIntent({ moving: false, direction: 'south' });
    simulate(session, 1);
    expect(session.currentScene.effects.size).toBe(0);
  });

  it('renders original NPCs from shared data and pauses player movement for dialogue', () => {
    const { session, world } = makeSession();
    const elder = world.npcs.find((npc) => npc.id === 'npc-village-elder');
    if (elder === undefined) {
      throw new Error('Greenhaven is missing its Village Elder');
    }
    expect(session.currentScene.actors.get(elder.id)).toMatchObject({
      appearance: 'elder',
      layer: 'npcs',
      name: 'Village Elder',
      position: elder.position,
    });
    expect(session.nearbyNpc?.name).toBe('Village Elder');
    expect(session.currentScene.ui.has('npc-interaction-prompt')).toBe(true);

    expect(session.interact()).toBe(true);
    expect(session.dialogue).toMatchObject({
      npcId: elder.id,
      npcName: 'Village Elder',
      nodeId: 'elder-greeting',
    });
    expect(session.currentScene.ui.has('npc-interaction-prompt')).toBe(false);

    session.setIntent({ moving: true, direction: 'east' });
    const before = { ...session.player.position };
    simulate(session, 0.5);
    expect(session.player.position).toEqual(before);
    expect(session.player.movementState).toBe('idle');

    expect(session.chooseDialogueChoice('elder-leave')).toBe(true);
    expect(session.dialogue).toBeNull();
    simulate(session, 0.5);
    expect(session.player.position.x).toBeGreaterThan(before.x);
  });

  it('keeps every Greenhaven monster spawn and patrol point out of solid world data', () => {
    const { world } = makeSession();
    const collision = new TileCollision({ map: world.map });

    for (const monster of world.monsters) {
      expect(collision.canOccupy(monster.position), `${monster.name} spawn`).toBe(true);
      for (const waypoint of monster.patrolWaypoints) {
        expect(collision.canOccupy(waypoint), `${monster.name} waypoint`).toBe(true);
      }
    }
  });

  it('spawns monsters, lets AI chase and attack, then accepts player damage and death', () => {
    const baseWorld = createGreenhavenWorld();
    const definition = baseWorld.monsters[0];
    if (definition === undefined) {
      throw new Error('Greenhaven is missing its Forest Slime spawn');
    }
    const world = {
      ...baseWorld,
      monsters: [
        {
          ...definition,
          position: { x: 38.5, y: 33.5 },
          patrolWaypoints: [
            { x: 38.5, y: 33.5 },
            { x: 40.5, y: 33.5 },
          ],
        },
      ],
    };
    const session = new WorldSession({
      world,
      playerId: 'local:test',
      playerName: 'Tester',
      game: GAME,
    });
    session.setViewport({ width: 800, height: 600 });

    expect(session.currentScene.actors.get(definition.id)).toMatchObject({
      layer: 'monsters',
      appearance: 'forest_slime',
    });
    simulate(session, 1.5);
    expect(session.monsterStates[0]?.state).toBe('ATTACK');
    expect(session.playerHealth.hp).toBeLessThan(session.playerHealth.maxHP);

    expect(session.attackNearestMonster()).toMatchObject({ status: 'hit', hp: 6, state: 'HURT' });
    simulate(session, 0.5);
    expect(session.attackNearestMonster()).toMatchObject({ status: 'hit', hp: 0, state: 'DEAD' });
    expect(session.monsterStatus).toContain('active');
  });

  it('bounds catch-up work: a long stall is dropped and reported, not simulated', () => {
    const { session } = makeSession();
    const before = session.steps;
    const commands = session.tick(30);
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

  it('walks at the same speed at 60 Hz and 15 Hz because movement is time-based', () => {
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

    const oneStep = GAME.movement.playerSpeedTilesPerSecond / GAME.simulation.hz;
    expect(Math.abs(fast.player.position.y - slow.player.position.y)).toBeLessThan(oneStep * 1.5);
  });
});
