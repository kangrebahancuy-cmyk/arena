import { describe, expect, it } from 'vitest';
import { createGreenhavenMonsters } from './greenhaven';

describe('Greenhaven monsters', () => {
  it('defines the three original monster families with combat and respawn stats', () => {
    const monsters = createGreenhavenMonsters();

    expect(monsters.map(({ name }) => name)).toEqual(['Forest Slime', 'Wild Boar', 'Thorn Wolf']);
    expect(monsters.map(({ type }) => type)).toEqual(['forest_slime', 'wild_boar', 'thorn_wolf']);
    for (const monster of monsters) {
      expect(monster.maxHP).toBeGreaterThan(0);
      expect(monster.level).toBeGreaterThan(0);
      expect(monster.movementSpeed).toBeGreaterThan(0);
      expect(monster.detectionRadius).toBeGreaterThan(0);
      expect(monster.attackRange).toBeGreaterThan(0);
      expect(monster.attackCooldown).toBeGreaterThan(0);
      expect(monster.respawnSeconds).toBeGreaterThan(0);
      expect(monster.patrolWaypoints.length).toBeGreaterThanOrEqual(2);
    }
  });
});
