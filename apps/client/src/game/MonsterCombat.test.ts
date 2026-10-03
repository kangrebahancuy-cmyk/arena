import { createGreenhavenMonsters } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { MonsterCombat } from './MonsterCombat';
import { MonsterEntity } from './MonsterEntity';

function monsters(): MonsterEntity[] {
  return createGreenhavenMonsters().map((definition) => new MonsterEntity(definition));
}

describe('MonsterCombat', () => {
  it('strikes the nearest living monster in range and applies lethal damage', () => {
    const [slime, boar] = monsters();
    if (slime === undefined || boar === undefined) {
      throw new Error('the Greenhaven test roster is incomplete');
    }
    slime.moveTo({ x: 16.5, y: 13.5 });
    boar.moveTo({ x: 15.8, y: 13.5 });
    const combat = new MonsterCombat();
    const player = { x: 15.5, y: 13.5 };

    const firstHit = combat.attackNearest([slime, boar], player);
    expect(firstHit).toMatchObject({ status: 'hit', monsterId: boar.id, damage: 12, hp: 20 });
    expect(combat.attackNearest([slime, boar], player)).toEqual({ status: 'cooldown' });

    combat.update([], player, 0.5);
    const secondHit = combat.attackNearest([slime, boar], player);
    expect(secondHit).toMatchObject({ status: 'hit', monsterId: boar.id, hp: 8 });
    combat.update([], player, 0.5);
    expect(combat.attackNearest([slime, boar], player)).toMatchObject({
      status: 'hit',
      monsterId: boar.id,
      hp: 0,
      state: 'DEAD',
    });
  });

  it('does not hit monsters outside range or attack a defeated entity', () => {
    const [slime] = monsters();
    if (slime === undefined) {
      throw new Error('the Greenhaven test roster has no Forest Slime');
    }
    const combat = new MonsterCombat();

    expect(combat.attackNearest([slime], { x: 0, y: 0 })).toEqual({ status: 'out-of-range' });
    slime.receiveDamage(slime.maxHP);
    expect(combat.attackNearest([slime], slime.position)).toEqual({ status: 'out-of-range' });
  });

  it('attacks the player only while the monster is in ATTACK state and respects cooldown', () => {
    const [slime] = monsters();
    if (slime === undefined) {
      throw new Error('the Greenhaven test roster has no Forest Slime');
    }
    const combat = new MonsterCombat();
    slime.moveTo({ x: 10, y: 10 });
    slime.setState('ATTACK');

    expect(combat.update([slime], { x: 10.5, y: 10.5 }, 0.1)).toEqual([
      { monsterId: slime.id, monsterName: 'Forest Slime', damage: 4 },
    ]);
    expect(combat.update([slime], { x: 10.5, y: 10.5 }, 0.1)).toEqual([]);
    expect(combat.update([slime], { x: 10.5, y: 10.5 }, 1.4)).toHaveLength(1);
    expect(combat.update([slime], { x: 20, y: 20 }, 1.4)).toEqual([]);
  });
});
