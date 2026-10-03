import { describe, expect, it } from 'vitest';
import { MonsterDataListSchema, MonsterDataSchema, MonsterStateSchema } from './monster';

const monster = {
  id: 'monster-test',
  type: 'forest_slime',
  name: 'Test Slime',
  position: { x: 10.5, y: 12.5 },
  sprite: 'forest_slime',
  maxHP: 18,
  level: 1,
  movementSpeed: 1,
  detectionRadius: 4.5,
  attackRange: 0.9,
  attackCooldown: 1.2,
  attackDamage: 4,
  respawnSeconds: 20,
  patrolWaypoints: [
    { x: 10.5, y: 12.5 },
    { x: 13.5, y: 12.5 },
  ],
} as const;

describe('monster schemas', () => {
  it('accepts a complete data-driven spawn definition', () => {
    expect(MonsterDataSchema.parse(monster)).toMatchObject({
      id: 'monster-test',
      type: 'forest_slime',
      maxHP: 18,
      patrolWaypoints: [
        { x: 10.5, y: 12.5 },
        { x: 13.5, y: 12.5 },
      ],
    });
  });

  it('accepts the six declared runtime states and rejects misspellings', () => {
    for (const state of ['IDLE', 'PATROL', 'CHASE', 'ATTACK', 'HURT', 'DEAD']) {
      expect(MonsterStateSchema.parse(state)).toBe(state);
    }
    expect(() => MonsterStateSchema.parse('chase')).toThrow();
  });

  it('rejects invalid combat stats, empty routes, and unsupported monster types', () => {
    expect(() => MonsterDataSchema.parse({ ...monster, maxHP: 0 })).toThrow();
    expect(() => MonsterDataSchema.parse({ ...monster, attackCooldown: -1 })).toThrow();
    expect(() => MonsterDataSchema.parse({ ...monster, movementSpeed: 0 })).toThrow();
    expect(() => MonsterDataSchema.parse({ ...monster, type: 'goblin' })).toThrow();
    expect(() => MonsterDataSchema.parse({ ...monster, patrolWaypoints: [] })).toThrow();
  });

  it('requires unique spawn point IDs', () => {
    expect(
      MonsterDataListSchema.parse([monster, { ...monster, id: 'monster-another' }]),
    ).toHaveLength(2);
    expect(() => MonsterDataListSchema.parse([monster, monster])).toThrow();
  });
});
