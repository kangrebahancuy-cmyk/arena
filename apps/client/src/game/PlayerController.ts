import type { Direction, MoveIntent, Position } from '@project-realm/shared';
import { movePosition } from '@project-realm/shared';
import type { CollisionResolver } from '../physics/Collision';

export type PlayerMovementState = 'idle' | 'moving';
export type PlayerAnimationState = 'idle' | 'walk';

/** Complete local player state owned by the controller while the game is offline. */
export interface LocalPlayerState {
  readonly id: string;
  readonly name: string;
  readonly position: Position;
  readonly direction: Direction;
  readonly movementState: PlayerMovementState;
  readonly speed: number;
  readonly animationState: PlayerAnimationState;
}

export interface PlayerControllerUpdate {
  /** True when the player actually changed world position during this step. */
  readonly moved: boolean;
  /** True when position, direction, movement state, or animation state changed. */
  readonly changed: boolean;
}

/**
 * Player Controller translates movement intent into player state.
 *
 * It owns player identity, direction, movement/animation states and speed. Position integration is
 * delegated to the shared movement function, while collision resolution is provided independently.
 */
export class PlayerController {
  private player: LocalPlayerState;
  private intent: MoveIntent;
  private readonly collision: CollisionResolver;

  constructor(options: {
    readonly id: string;
    readonly name: string;
    readonly position: Position;
    readonly direction: Direction;
    readonly speed: number;
    readonly collision: CollisionResolver;
  }) {
    if (!Number.isFinite(options.speed) || options.speed <= 0) {
      throw new RangeError(`PlayerController: speed must be > 0, got ${options.speed}`);
    }

    this.collision = options.collision;
    this.player = {
      id: options.id,
      name: options.name,
      position: { ...options.position },
      direction: options.direction,
      movementState: 'idle',
      speed: options.speed,
      animationState: 'idle',
    };
    this.intent = { moving: false, direction: options.direction };
  }

  get state(): LocalPlayerState {
    return this.player;
  }

  setIntent(intent: MoveIntent): void {
    this.intent = intent;
  }

  /** Applies one fixed simulation step and reports whether scene state needs to be refreshed. */
  update(deltaSeconds: number): PlayerControllerUpdate {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return { moved: false, changed: false };
    }

    const direction = this.intent.moving ? this.intent.direction : this.player.direction;
    const desired = movePosition(
      this.player.position,
      this.intent,
      this.player.speed,
      deltaSeconds,
    );
    const position = this.collision.resolveMovement(this.player.position, desired);
    const moved = position.x !== this.player.position.x || position.y !== this.player.position.y;
    const movementState: PlayerMovementState = moved ? 'moving' : 'idle';
    const animationState: PlayerAnimationState = moved ? 'walk' : 'idle';
    const changed =
      moved ||
      direction !== this.player.direction ||
      movementState !== this.player.movementState ||
      animationState !== this.player.animationState;

    if (changed) {
      this.player = {
        ...this.player,
        position: moved ? { ...position } : this.player.position,
        direction,
        movementState,
        animationState,
      };
    }

    return { moved, changed };
  }
}
