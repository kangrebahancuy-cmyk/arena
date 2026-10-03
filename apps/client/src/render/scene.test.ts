import { describe, expect, it } from 'vitest';
import { diffScene, emptyScene } from './scene';
import type { ActorState, ObjectState, RenderCommand, TileLayerState, WorldScene } from './scene';

function layer(id = 'ground', role: 'ground' | 'decoration' = 'ground'): TileLayerState {
  return {
    id,
    role,
    tiles: ['grass', 'dirt', null, 'stone'],
    columns: 2,
    rows: 2,
    sheet: 'tileset',
  };
}

function object(id: string, x = 1.5, y = 2): ObjectState {
  return { id, sprite: 'bush', layer: 'objects', position: { x, y } };
}

function actor(id: string, x = 2, y = 3): ActorState {
  return {
    id,
    appearance: 'player',
    layer: 'characters',
    position: { x, y },
    facing: 'south',
    moving: false,
    animationState: 'idle',
  };
}

function scene(overrides: Partial<WorldScene> = {}): WorldScene {
  return { ...emptyScene(), ...overrides };
}

function typesOf(commands: readonly RenderCommand[]): string[] {
  return commands.map((command) => command.type);
}

describe('diffScene', () => {
  it('produces nothing when the scene did not change', () => {
    const current = scene({ layers: [layer()], objects: new Map([['a', object('a')]]) });
    expect(diffScene(current, current)).toEqual([]);
  });

  it('adds a layer that was not there before, and removes one that disappeared', () => {
    const added = diffScene(scene(), scene({ layers: [layer('ground')] }));
    expect(added).toEqual([{ type: 'layer-added', layer: layer('ground') }]);

    const removed = diffScene(scene({ layers: [layer('ground')] }), scene());
    expect(removed).toEqual([{ type: 'layer-removed', id: 'ground' }]);
  });

  it('never resends a tile layer whose array was edited in place', () => {
    // Tile edits travel as `tiles-changed` patches, so an in-place edit must NOT look like a new layer.
    const before = scene({ layers: [layer()] });
    const after = scene({ layers: [layer()] });
    (after.layers[0] as { tiles: (string | null)[] }).tiles[0] = 'water';

    expect(diffScene(before, after)).toEqual([]);
  });

  it('reports a changed entry by identity, and keeps the added/changed distinction', () => {
    const unchanged = actor('player');
    const before = scene({ actors: new Map([['player', unchanged]]) });
    const next = scene({
      actors: new Map([['player', { ...unchanged, moving: true, animationState: 'walk' }]]),
    });

    const commands = diffScene(before, next);
    expect(typesOf(commands)).toEqual(['actor-changed']);
    expect(commands[0]).toMatchObject({ type: 'actor-changed', actor: { moving: true } });

    // A freshly built but equal entry is not a change (structural fallback).
    const rebuilt = scene({ actors: new Map([['player', actor('player')]]) });
    expect(diffScene(scene({ actors: new Map([['player', actor('player')]]) }), rebuilt)).toEqual(
      [],
    );
  });

  it('detects additions and removals of objects and actors', () => {
    const before = scene({
      objects: new Map([['a', object('a')]]),
      actors: new Map([['x', actor('x')]]),
    });
    const next = scene({ objects: new Map([['b', object('b', 2, 2)]]), actors: new Map() });

    const commands = diffScene(before, next);
    expect(commands).toContainEqual({ type: 'object-added', object: object('b', 2, 2) });
    expect(commands).toContainEqual({ type: 'object-removed', id: 'a' });
    expect(commands).toContainEqual({ type: 'actor-removed', id: 'x' });
  });

  it('distinguishes ui-changed from ui-added and follows removals', () => {
    const before = scene({
      ui: new Map([
        ['label:player', { id: 'label:player', text: 'A', position: { x: 0, y: 0 }, offsetY: 6 }],
      ]),
    });
    const next = scene({
      ui: new Map([
        ['label:player', { id: 'label:player', text: 'A', position: { x: 1, y: 0 }, offsetY: 6 }],
        ['label:npc', { id: 'label:npc', text: 'B', position: { x: 2, y: 2 }, offsetY: 6 }],
      ]),
    });

    expect(typesOf(diffScene(before, next))).toEqual(['ui-changed', 'ui-added']);
    // The way back changes the player's label position again and drops the other one.
    expect(typesOf(diffScene(next, before))).toEqual(['ui-changed', 'ui-removed']);
  });

  it('treats equal values with different key order as unchanged (structural fallback)', () => {
    const left = scene({
      effects: new Map([
        [
          'dust:1',
          {
            id: 'dust:1',
            effect: 'dust',
            position: { x: 1, y: 2 },
            ageSeconds: 0,
            lifetimeSeconds: 0.5,
          },
        ],
      ]),
    });
    const right = scene({
      effects: new Map([
        [
          'dust:1',
          {
            lifetimeSeconds: 0.5,
            ageSeconds: 0,
            position: { x: 1, y: 2 },
            effect: 'dust',
            id: 'dust:1',
          },
        ],
      ]),
    });

    expect(diffScene(left, right)).toEqual([]);
  });
});
