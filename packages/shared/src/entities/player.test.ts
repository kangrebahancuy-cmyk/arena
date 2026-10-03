import { describe, expect, it } from 'vitest';
import {
  PLAYER_NAME_MAX_LENGTH,
  PLAYER_NAME_MIN_LENGTH,
  PlayerIdSchema,
  PlayerStateSchema,
} from './player';

const valid = {
  id: 'player-1',
  name: 'Aria_7',
  position: { x: 12.5, y: 3 },
  facing: 'south',
};

describe('PlayerIdSchema', () => {
  it('accepts a server-issued id and brands it', () => {
    expect(PlayerIdSchema.parse('abc123')).toBe('abc123');
  });

  it.each([
    ['an empty id', ''],
    ['a non-string id', 42],
  ])('rejects %s', (_label, value) => {
    expect(PlayerIdSchema.safeParse(value).success).toBe(false);
  });
});

describe('PlayerStateSchema', () => {
  it('accepts the state of a player standing in the world', () => {
    expect(PlayerStateSchema.parse(valid)).toEqual(valid);
  });

  it('ignores unknown fields, so a newer server stays readable by an older client', () => {
    const parsed = PlayerStateSchema.parse({ ...valid, health: 100, guild: 'nobody' });

    expect(parsed).toEqual(valid);
    expect(parsed).not.toHaveProperty('health');
  });

  it.each([
    ['a missing id', { id: undefined }],
    ['a missing name', { name: undefined }],
    ['a missing position', { position: undefined }],
    ['a missing facing', { facing: undefined }],
    ['a position with a string coordinate', { position: { x: '12', y: 3 } }],
    ['a position that is not finite', { position: { x: Number.POSITIVE_INFINITY, y: 0 } }],
    ['a position with a NaN coordinate', { position: { x: Number.NaN, y: 0 } }],
    ['an unknown direction', { facing: 'up' }],
    ['a name that is too short', { name: 'ab' }],
    ['a name that is too long', { name: 'a'.repeat(PLAYER_NAME_MAX_LENGTH + 1) }],
    ['a name with a space', { name: 'Aria Seven' }],
    ['a name with a lookalike character', { name: 'Аria_7' }], // Cyrillic "А", not Latin "A"
    ['a name with markup', { name: '<b>aria</b>' }],
  ])('rejects %s', (_label, override) => {
    expect(PlayerStateSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it('accepts a name of exactly the minimum and maximum length', () => {
    expect(
      PlayerStateSchema.safeParse({ ...valid, name: 'a'.repeat(PLAYER_NAME_MIN_LENGTH) }).success,
    ).toBe(true);
    expect(
      PlayerStateSchema.safeParse({ ...valid, name: 'a'.repeat(PLAYER_NAME_MAX_LENGTH) }).success,
    ).toBe(true);
  });

  it('accepts fractional coordinates, because movement is not locked to the tile grid', () => {
    expect(
      PlayerStateSchema.parse({ ...valid, position: { x: 0.25, y: -12.75 } }).position,
    ).toEqual({
      x: 0.25,
      y: -12.75,
    });
  });
});
