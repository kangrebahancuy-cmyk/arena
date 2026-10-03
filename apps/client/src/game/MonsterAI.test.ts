import { createGreenhavenMonsters } from '@project-realm/shared';
import type { CollisionResolver } from '../physics/Collision';
import { describe, expect, it } from 'vitest';
import { MonsterAI } from './MonsterAI';
import { MonsterEntity } from './MonsterEntity';

const openGround: CollisionResolver = {
  resolveMovement: (_current, desired) => desired,
};

function forestSlime(): MonsterEntity {
  const definition = createGreenhavenMonsters()[0];
  if (definition === undefined) {
    throw new Error('the test Greenhaven roster has no Forest Slime');
  }
  return new MonsterEntity(definition);
}

describe('MonsterAI', () => {
  it('idles at spawn, then patrols its data-defined route', () => {
    const monster = forestSlime();
    const ai = new MonsterAI();
    const player = { x: 60, y: 40 };
    const spawnPosition = { ...monster.position };

    ai.update(monster, player, 0.4, openGround);
    expect(monster.state).toBe('IDLE');
    expect(monster.position).toEqual(spawnPosition);

    ai.update(monster, player, 0.5, openGround);
    expect(monster.state).toBe('PATROL');
    ai.update(monster, player, 0.1, openGround);
    expect(monster.position.x).toBeGreaterThan(spawnPosition.x);
    expect(monster.moving).toBe(true);
  });

  it('detects a nearby player, chases, and switches to ATTACK at melee range', () => {
    const monster = forestSlime();
    const ai = new MonsterAI();

    ai.update(monster, { x: monster.position.x + 3, y: monster.position.y }, 0.1, openGround);
    expect(monster.state).toBe('CHASE');
    expect(monster.position.x).toBeGreaterThan(14.5);
    expect(monster.facing).toBe('east');

    ai.update(monster, { x: monster.position.x + 0.5, y: monster.position.y }, 0.1, openGround);
    expect(monster.state).toBe('ATTACK');
    expect(monster.moving).toBe(false);
  });

  it('returns to patrol outside detection range and pauses briefly when hurt', () => {
    const monster = forestSlime();
    const ai = new MonsterAI();
    const nearPlayer = { x: monster.position.x + 2, y: monster.position.y };
    ai.update(monster, nearPlayer, 0.1, openGround);
    expect(monster.state).toBe('CHASE');

    ai.update(monster, { x: 60, y: 40 }, 0.1, openGround);
    expect(monster.state).toBe('PATROL');

    monster.receiveDamage(1);
    const hurtPosition = { ...monster.position };
    expect(monster.state).toBe('HURT');
    ai.update(monster, nearPlayer, 0.1, openGround);
    expect(monster.position).toEqual(hurtPosition);
    expect(monster.state).toBe('HURT');

    ai.update(monster, nearPlayer, 0.25, openGround);
    expect(monster.state).toBe('CHASE');
  });

  it('does not move a dead monster', () => {
    const monster = forestSlime();
    monster.receiveDamage(monster.maxHP);
    const position = { ...monster.position };

    const result = new MonsterAI().update(monster, { x: 0, y: 0 }, 1, openGround);

    expect(monster.state).toBe('DEAD');
    expect(monster.position).toEqual(position);
    expect(result.moved).toBe(false);
  });
});
