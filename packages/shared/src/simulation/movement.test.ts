import { describe, expect, it } from 'vitest';
import type { Position } from '../world/position';
import { movePosition } from './movement';

const START: Position = { x: 10, y: 20 };
const SPEED = 4.2;
const STEP = 1 / 20;

describe('movePosition', () => {
  it.each([
    ['north', { x: 10, y: 19.79 }],
    ['east', { x: 10.21, y: 20 }],
    ['south', { x: 10, y: 20.21 }],
    ['west', { x: 9.79, y: 20 }],
  ] as const)('moves one fixed step %s at the configured speed', (direction, expected) => {
    expect(movePosition(START, { moving: true, direction }, SPEED, STEP)).toEqual(expected);
  });

  it('returns the same position without movement input', () => {
    expect(movePosition(START, { moving: false, direction: 'east' }, SPEED, STEP)).toBe(START);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'ignores invalid speed %s rather than corrupting the position',
    (speed) => {
      expect(movePosition(START, { moving: true, direction: 'north' }, speed, STEP)).toBe(START);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'ignores invalid delta %s rather than corrupting the position',
    (delta) => {
      expect(movePosition(START, { moving: true, direction: 'north' }, SPEED, delta)).toBe(START);
    },
  );

  it('changes one axis per intent because this game uses four-direction movement', () => {
    const east = movePosition(START, { moving: true, direction: 'east' }, SPEED, STEP);
    const south = movePosition(START, { moving: true, direction: 'south' }, SPEED, STEP);

    expect(east.x - START.x).toBeCloseTo(SPEED * STEP);
    expect(east.y).toBe(START.y);
    expect(south.y - START.y).toBeCloseTo(SPEED * STEP);
    expect(south.x).toBe(START.x);
  });

  it('is deterministic across repeated fixed steps', () => {
    let position = START;
    for (let step = 0; step < 20; step += 1) {
      position = movePosition(position, { moving: true, direction: 'east' }, SPEED, STEP);
    }

    expect(position.x).toBeCloseTo(START.x + SPEED);
    expect(position.y).toBe(START.y);
  });
});
