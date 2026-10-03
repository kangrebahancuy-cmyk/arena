import type {
  Direction,
  MonsterData,
  MonsterState,
  MonsterType,
  Position,
} from '@project-realm/shared';

export const MONSTER_IDLE_SECONDS = 0.8;
export const MONSTER_HURT_SECONDS = 0.28;

export interface MonsterRuntimeState {
  readonly id: string;
  readonly type: MonsterType;
  readonly name: string;
  readonly sprite: string;
  readonly position: Position;
  readonly hp: number;
  readonly maxHP: number;
  readonly level: number;
  readonly movementSpeed: number;
  readonly detectionRadius: number;
  readonly attackRange: number;
  readonly attackCooldown: number;
  readonly attackDamage: number;
  readonly respawnSeconds: number;
  readonly patrolWaypoints: readonly Position[];
  readonly state: MonsterState;
  readonly facing: Direction;
  readonly moving: boolean;
}

/** Runtime monster entity: definition-backed stats plus mutable local combat/AI state. */
export class MonsterEntity {
  readonly definition: MonsterData;
  position: Position;
  hp: number;
  state: MonsterState = 'IDLE';
  facing: Direction = 'south';
  moving = false;
  patrolWaypointIndex = 0;
  attackCooldownRemaining = 0;
  stateTimerRemaining = MONSTER_IDLE_SECONDS;

  constructor(definition: MonsterData) {
    this.definition = definition;
    this.position = { ...definition.position };
    this.hp = definition.maxHP;
  }

  get id(): string {
    return this.definition.id;
  }

  get type(): MonsterType {
    return this.definition.type;
  }

  get name(): string {
    return this.definition.name;
  }

  get maxHP(): number {
    return this.definition.maxHP;
  }

  setState(state: MonsterState, timerSeconds = 0): void {
    this.state = state;
    this.stateTimerRemaining = Math.max(0, timerSeconds);
    this.moving = state === 'PATROL' || state === 'CHASE';
  }

  updateStateTimer(deltaSeconds: number): boolean {
    this.stateTimerRemaining = Math.max(0, this.stateTimerRemaining - deltaSeconds);
    return this.stateTimerRemaining === 0;
  }

  updateAttackCooldown(deltaSeconds: number): void {
    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - deltaSeconds);
  }

  get patrolTarget(): Position {
    return this.definition.patrolWaypoints[this.patrolWaypointIndex] ?? this.definition.position;
  }

  advancePatrolTarget(): void {
    this.patrolWaypointIndex =
      (this.patrolWaypointIndex + 1) % this.definition.patrolWaypoints.length;
  }

  face(direction: Direction): void {
    this.facing = direction;
  }

  moveTo(position: Position): void {
    this.position = { ...position };
  }

  /** Returns the applied damage and moves the entity to HURT or DEAD. */
  receiveDamage(damage: number): number {
    if (this.state === 'DEAD' || !Number.isFinite(damage) || damage <= 0) {
      return 0;
    }
    const appliedDamage = Math.min(this.hp, Math.floor(damage));
    if (appliedDamage <= 0) {
      return 0;
    }
    this.hp -= appliedDamage;
    if (this.hp === 0) {
      this.setState('DEAD');
    } else {
      this.setState('HURT', MONSTER_HURT_SECONDS);
    }
    return appliedDamage;
  }

  respawn(): void {
    this.position = { ...this.definition.position };
    this.hp = this.definition.maxHP;
    this.patrolWaypointIndex = 0;
    this.attackCooldownRemaining = 0;
    this.facing = 'south';
    this.setState('IDLE', MONSTER_IDLE_SECONDS);
  }

  snapshot(): MonsterRuntimeState {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      sprite: this.definition.sprite,
      position: { ...this.position },
      hp: this.hp,
      maxHP: this.maxHP,
      level: this.definition.level,
      movementSpeed: this.definition.movementSpeed,
      detectionRadius: this.definition.detectionRadius,
      attackRange: this.definition.attackRange,
      attackCooldown: this.definition.attackCooldown,
      attackDamage: this.definition.attackDamage,
      respawnSeconds: this.definition.respawnSeconds,
      patrolWaypoints: this.definition.patrolWaypoints.map((point) => ({ ...point })),
      state: this.state,
      facing: this.facing,
      moving: this.moving,
    };
  }
}
