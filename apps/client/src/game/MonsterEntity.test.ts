import { createGreenhavenMonsters } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { MonsterEntity } from './MonsterEntity';

function forestSlime(): MonsterEntity {
  const definition = createGreenhavenMonsters()[0];
  if (definition === undefined) {
    throw new Error('the test Greenhaven roster has no Forest Slime');
  }
  return new MonsterEntity(definition);
}

describe('MonsterEntity', () => {
  it('creates a runtime instance from a validated spawn definition', () => {
    const entity = forestSlime();

    expect(entity.snapshot()).toMatchObject({
      id: 'monster-forest-slime-grove',
      type: 'forest_slime',
      hp: 18,
      maxHP: 18,
      level: 1,
      state: 'IDLE',
      moving: false,
    });
  });

  it('enters HURT for nonlethal damage and DEAD at zero HP', () => {
    const entity = forestSlime();

    expect(entity.receiveDamage(5)).toBe(5);
    expect(entity.hp).toBe(13);
    expect(entity.state).toBe('HURT');

    expect(entity.receiveDamage(100)).toBe(13);
    expect(entity.hp).toBe(0);
    expect(entity.state).toBe('DEAD');
    expect(entity.receiveDamage(1)).toBe(0);
  });

  it('restores full health, spawn position, and idle state for respawn', () => {
    const entity = forestSlime();
    const spawnPosition = { ...entity.position };
    entity.moveTo({ x: spawnPosition.x + 3, y: spawnPosition.y });
    entity.receiveDamage(entity.maxHP);

    entity.respawn();

    expect(entity.position).toEqual(spawnPosition);
    expect(entity.hp).toBe(entity.maxHP);
    expect(entity.state).toBe('IDLE');
    expect(entity.moving).toBe(false);
  });
});
