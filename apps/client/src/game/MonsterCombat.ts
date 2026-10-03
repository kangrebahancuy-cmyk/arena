import type { Position } from '@project-realm/shared';
import type { MonsterEntity } from './MonsterEntity';
import { distanceBetween } from './MonsterAI';

export const PLAYER_ATTACK_RANGE = 1.35;
export const PLAYER_ATTACK_DAMAGE = 12;
export const PLAYER_ATTACK_COOLDOWN_SECONDS = 0.45;

export interface MonsterAttackEvent {
  readonly monsterId: string;
  readonly monsterName: string;
  readonly damage: number;
}

export type PlayerAttackResult =
  | {
      readonly status: 'hit';
      readonly monsterId: string;
      readonly monsterName: string;
      readonly damage: number;
      readonly hp: number;
      readonly maxHP: number;
      readonly state: MonsterEntity['state'];
    }
  | { readonly status: 'out-of-range' }
  | { readonly status: 'cooldown' };

/** Resolves local player strikes and monster attacks; AI decisions remain in `MonsterAI`. */
export class MonsterCombat {
  private playerAttackCooldownRemaining = 0;

  update(
    monsters: readonly MonsterEntity[],
    playerPosition: Position,
    deltaSeconds: number,
  ): readonly MonsterAttackEvent[] {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return [];
    }
    this.playerAttackCooldownRemaining = Math.max(
      0,
      this.playerAttackCooldownRemaining - deltaSeconds,
    );

    const events: MonsterAttackEvent[] = [];
    for (const monster of monsters) {
      monster.updateAttackCooldown(deltaSeconds);
      if (monster.state !== 'ATTACK' || monster.attackCooldownRemaining > 0) {
        continue;
      }
      if (distanceBetween(monster.position, playerPosition) > monster.definition.attackRange) {
        continue;
      }
      events.push({
        monsterId: monster.id,
        monsterName: monster.name,
        damage: monster.definition.attackDamage,
      });
      monster.attackCooldownRemaining = monster.definition.attackCooldown;
    }
    return events;
  }

  /** Strikes the closest living monster inside the small local prototype's melee range. */
  attackNearest(monsters: readonly MonsterEntity[], playerPosition: Position): PlayerAttackResult {
    if (this.playerAttackCooldownRemaining > 0) {
      return { status: 'cooldown' };
    }

    let closest: MonsterEntity | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const monster of monsters) {
      if (monster.state === 'DEAD') {
        continue;
      }
      const distance = distanceBetween(monster.position, playerPosition);
      if (distance <= PLAYER_ATTACK_RANGE && distance < closestDistance) {
        closest = monster;
        closestDistance = distance;
      }
    }
    if (closest === undefined) {
      return { status: 'out-of-range' };
    }

    const damage = closest.receiveDamage(PLAYER_ATTACK_DAMAGE);
    if (damage === 0) {
      return { status: 'out-of-range' };
    }
    this.playerAttackCooldownRemaining = PLAYER_ATTACK_COOLDOWN_SECONDS;
    return {
      status: 'hit',
      monsterId: closest.id,
      monsterName: closest.name,
      damage,
      hp: closest.hp,
      maxHP: closest.maxHP,
      state: closest.state,
    };
  }
}
