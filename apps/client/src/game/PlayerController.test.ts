import { describe, expect, it } from 'vitest';
import { PlayerController } from './PlayerController';

const START = { x: 5, y: 7 };
const STEP = 1 / 20;

function makeController(isWalkable: (position: { x: number; y: number }) => boolean = () => true) {
  return new PlayerController({
    id: 'local:test',
    name: 'Tester',
    position: START,
    direction: 'south',
    speed: 4.2,
    collision: {
      resolveMovement: (_current, desired) => (isWalkable(desired) ? desired : _current),
    },
  });
}

describe('PlayerController', () => {
  it('owns the required local player identity and movement fields', () => {
    const controller = makeController();

    expect(controller.state).toEqual({
      id: 'local:test',
      name: 'Tester',
      position: START,
      direction: 'south',
      movementState: 'idle',
      speed: 4.2,
      animationState: 'idle',
    });
  });

  it('moves at constant speed and exposes moving/walk state', () => {
    const controller = makeController();
    controller.setIntent({ moving: true, direction: 'east' });

    expect(controller.update(STEP)).toEqual({ moved: true, changed: true });
    expect(controller.state.position.x).toBeCloseTo(START.x + 4.2 * STEP);
    expect(controller.state.position.y).toBe(START.y);
    expect(controller.state.direction).toBe('east');
    expect(controller.state.movementState).toBe('moving');
    expect(controller.state.animationState).toBe('walk');
  });

  it('stops immediately when movement input is released and resets the animation to idle', () => {
    const controller = makeController();
    controller.setIntent({ moving: true, direction: 'north' });
    controller.update(STEP);
    const stoppedAt = controller.state.position;

    controller.setIntent({ moving: false, direction: 'north' });
    expect(controller.update(STEP)).toEqual({ moved: false, changed: true });
    expect(controller.state.position).toEqual(stoppedAt);
    expect(controller.state.direction).toBe('north');
    expect(controller.state.movementState).toBe('idle');
    expect(controller.state.animationState).toBe('idle');
  });

  it('keeps the current direction and stays idle when input is not held', () => {
    const controller = makeController();
    controller.setIntent({ moving: false, direction: 'west' });

    const update = controller.update(STEP);

    expect(update).toEqual({ moved: false, changed: false });
    expect(controller.state.direction).toBe('south');
    expect(controller.state.position).toEqual(START);
    expect(controller.state.movementState).toBe('idle');
  });

  it('turns in place when the requested direction is blocked without playing a walk animation', () => {
    const controller = makeController(() => false);
    controller.setIntent({ moving: true, direction: 'west' });

    expect(controller.update(STEP)).toEqual({ moved: false, changed: true });
    expect(controller.state.position).toEqual(START);
    expect(controller.state.direction).toBe('west');
    expect(controller.state.movementState).toBe('idle');
    expect(controller.state.animationState).toBe('idle');
  });

  it('does not change player state for an invalid timestep', () => {
    const controller = makeController();
    controller.setIntent({ moving: true, direction: 'east' });
    const initial = controller.state;

    expect(controller.update(Number.NaN)).toEqual({ moved: false, changed: false });
    expect(controller.state).toBe(initial);
  });

  it('rejects a non-positive speed', () => {
    expect(
      () =>
        new PlayerController({
          id: 'local:test',
          name: 'Tester',
          position: START,
          direction: 'south',
          speed: 0,
          collision: { resolveMovement: (_current, desired) => desired },
        }),
    ).toThrow(RangeError);
  });
});
