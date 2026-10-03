import { createGreenhavenMonsters } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { MonsterSpawner } from './MonsterSpawner';

describe('MonsterSpawner', () => {
  it('spawns one runtime monster for each validated Greenhaven spawn point', () => {
    const definitions = createGreenhavenMonsters();
    const spawner = new MonsterSpawner(definitions);

    expect(spawner.monsters).toHaveLength(3);
    expect(spawner.aliveCount).toBe(3);
    expect(spawner.monsters.map(({ state }) => state)).toEqual(['IDLE', 'IDLE', 'IDLE']);
    expect(spawner.monsters.map(({ id }) => id)).toEqual(definitions.map(({ id }) => id));
  });

  it('waits for the configured respawn delay, then restores the dead monster at full HP', () => {
    const definitions = createGreenhavenMonsters();
    const spawner = new MonsterSpawner(definitions);
    const monster = spawner.monsters[0];
    const definition = definitions[0];
    if (monster === undefined || definition === undefined) {
      throw new Error('the Greenhaven test roster is empty');
    }
    monster.moveTo({ x: monster.position.x + 2, y: monster.position.y });
    monster.receiveDamage(monster.maxHP);
    expect(spawner.aliveCount).toBe(2);

    expect(spawner.update(definition.respawnSeconds - 0.1)).toEqual([]);
    expect(monster.state).toBe('DEAD');
    expect(spawner.update(0.11)).toEqual([monster.id]);
    expect(monster.state).toBe('IDLE');
    expect(monster.hp).toBe(monster.maxHP);
    expect(monster.position).toEqual(definition.position);
    expect(spawner.aliveCount).toBe(3);
  });

  it('ignores invalid or nonpositive simulation deltas', () => {
    const spawner = new MonsterSpawner(createGreenhavenMonsters());
    const monster = spawner.monsters[0];
    if (monster === undefined) {
      throw new Error('the Greenhaven test roster is empty');
    }
    monster.receiveDamage(monster.maxHP);

    expect(spawner.update(Number.NaN)).toEqual([]);
    expect(spawner.update(0)).toEqual([]);
    expect(monster.state).toBe('DEAD');
  });
});
