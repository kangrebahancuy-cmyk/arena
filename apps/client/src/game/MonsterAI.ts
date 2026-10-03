import type { Direction, Position } from '@project-realm/shared';
import type { CollisionResolver } from '../physics/Collision';
import type { MonsterEntity } from './MonsterEntity';

export interface MonsterAIUpdate {
  readonly stateChanged: boolean;
  readonly moved: boolean;
}

/** Simple deterministic, local decision maker for idle, patrol, detection, chase, and attack states. */
export class MonsterAI {
  update(
    monster: MonsterEntity,
    playerPosition: Position,
    deltaSeconds: number,
    collision: CollisionResolver,
  ): MonsterAIUpdate {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || monster.state === 'DEAD') {
      return { stateChanged: false, moved: false };
    }

    const originalState = monster.state;
    const originalPosition = monster.position;

    if (monster.state === 'HURT') {
      if (!monster.updateStateTimer(deltaSeconds)) {
        return { stateChanged: false, moved: false };
      }
      monster.setState('IDLE', 0);
    }

    const playerDistance = distanceBetween(monster.position, playerPosition);
    if (playerDistance <= monster.definition.attackRange) {
      monster.setState('ATTACK');
      return result(monster, originalState, originalPosition);
    }

    if (playerDistance <= monster.definition.detectionRadius) {
      monster.setState('CHASE');
      this.moveToward(monster, playerPosition, deltaSeconds, collision);
      return result(monster, originalState, originalPosition);
    }

    if (monster.state === 'CHASE' || monster.state === 'ATTACK') {
      monster.setState('PATROL');
    }

    if (monster.state === 'IDLE') {
      if (!monster.updateStateTimer(deltaSeconds)) {
        return result(monster, originalState, originalPosition);
      }
      monster.setState('PATROL');
    }

    if (monster.state === 'PATROL') {
      this.patrol(monster, deltaSeconds, collision);
    }

    return result(monster, originalState, originalPosition);
  }

  private patrol(monster: MonsterEntity, deltaSeconds: number, collision: CollisionResolver): void {
    const target = monster.patrolTarget;
    const remaining = distanceBetween(monster.position, target);
    if (remaining <= 0.05) {
      monster.moveTo(target);
      monster.advancePatrolTarget();
      monster.moving = false;
      return;
    }
    this.moveToward(monster, target, deltaSeconds, collision);
  }

  private moveToward(
    monster: MonsterEntity,
    target: Position,
    deltaSeconds: number,
    collision: CollisionResolver,
  ): void {
    const deltaX = target.x - monster.position.x;
    const deltaY = target.y - monster.position.y;
    const remaining = Math.hypot(deltaX, deltaY);
    if (remaining <= 0.0001) {
      monster.moving = false;
      return;
    }

    const direction = directionToward(deltaX, deltaY);
    monster.face(direction);
    const step = Math.min(remaining, monster.definition.movementSpeed * deltaSeconds);
    const desired = {
      x: monster.position.x + (deltaX / remaining) * step,
      y: monster.position.y + (deltaY / remaining) * step,
    };
    const resolved = collision.resolveMovement(monster.position, desired);
    monster.moving = resolved.x !== monster.position.x || resolved.y !== monster.position.y;
    monster.moveTo(resolved);
  }
}

export function distanceBetween(first: Position, second: Position): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function directionToward(deltaX: number, deltaY: number): Direction {
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0 ? 'east' : 'west';
  }
  return deltaY >= 0 ? 'south' : 'north';
}

function result(
  monster: MonsterEntity,
  previousState: MonsterEntity['state'],
  previousPosition: Position,
): MonsterAIUpdate {
  return {
    stateChanged: monster.state !== previousState,
    moved: monster.position.x !== previousPosition.x || monster.position.y !== previousPosition.y,
  };
}
