import { FixedTimestep, TILE_SIZE, worldPositionToTile } from '@project-realm/shared';
import type { Direction, GameConfig, Logger, Position } from '@project-realm/shared';
import { Camera, defaultZoomForViewport } from '../render/Camera';
import type { Viewport } from '../render/scene';
import {
  diffScene,
  emptyScene,
  type ActorState,
  type ObjectState,
  type RenderCommand,
  type TileLayerState,
  type WorldScene,
  type WorldUiState,
} from '../render/scene';
import type { PrototypeWorld } from './PrototypeWorld';

/**
 * Prototype walking speed in tiles per second. Tuned so the camera follow, the walk cycle and the
 * dust emission are all visible at default zoom. The authoritative speed will live on the server.
 */
const WALK_SPEED_TILES_PER_SECOND = 4.2;

/** How often a footstep puff is emitted while walking. */
const DUST_INTERVAL_SECONDS = 0.22;

/** Tiles revealed around the walker by the prototype fog-of-war. */
const REVEAL_RADIUS_TILES = 7;

/**
 * How long a dust puff exists. Slightly longer than the renderer's own animation (0.45 s) so the
 * sprite always plays to the end before its scene entry is retired.
 */
const EFFECT_LIFETIME_SECONDS = 0.5;

/** Movement intent, in the shape input produces it. */
export interface MoveIntent {
  readonly moving: boolean;
  readonly direction: Direction;
}

/**
 * The character the player drives in the prototype.
 *
 * Deliberately NOT the shared `PlayerState`: that type is server-issued and carries a branded id a
 * client must never invent (see `PlayerIdSchema`). Until the server owns avatars (Phase 10), this
 * local walker is the honest stand-in - a plain `{ id, name, position, facing }` whose fields already
 * match what the server will send, so swapping it later is a substitution, not a rewrite.
 */
export interface LocalWalker {
  readonly id: string;
  readonly name: string;
  position: Position;
  facing: Direction;
}

/**
 * WorldSession - the prototype world's logic, and the bridge between game code and the renderer.
 *
 * Responsibilities:
 *   - hold the authoritative-for-now state the renderer draws: tile layers, objects, actors, effects
 *     and world-space labels, all as immutable scene entries;
 *   - advance that state on the FIXED timestep from the shared config (so the day a server ticks the
 *     same rules, both sides step identically);
 *   - move the camera to follow the player, and clamp it to the map so the void never shows;
 *   - diff the new scene against the last one it handed to the renderer and return only the commands
 *     that changed something.
 *
 * What it deliberately is NOT: a networked session. Nothing here talks to the server, and the walker
 * is a local stand-in for the avatar that phase 10 will place under server authority. The UI says so
 * in plain words while it is on screen.
 *
 * No PixiJS, no DOM: everything here runs in Node, which is why the movement, the camera follow, the
 * fog reveal and the render diff are all covered by unit tests.
 */
export class WorldSession {
  readonly player: LocalWalker;
  readonly camera: Camera;

  private readonly world: PrototypeWorld;
  private readonly timestep: FixedTimestep;
  private readonly logger: Logger | undefined;
  private scene: WorldScene;
  private rendered: WorldScene = emptyScene();
  private intent: MoveIntent;
  private dustTimer = 0;
  private stepCount = 0;
  private droppedSecondsTotal = 0;
  private effectSequence = 0;
  private viewport: Viewport = { width: 1, height: 1 };
  private pendingViewport: Viewport | undefined;

  constructor(options: {
    readonly world: PrototypeWorld;
    readonly playerName: string;
    readonly playerId: string;
    readonly game: GameConfig;
    readonly logger?: Logger;
    readonly cameraOptions?: { readonly zoom?: number; readonly followHalfLifeSeconds?: number };
  }) {
    this.world = options.world;
    this.logger = options.logger;
    this.timestep = new FixedTimestep(
      options.game.simulation.hz,
      options.game.simulation.maxCatchUpSteps,
    );
    this.camera = new Camera(options.cameraOptions ?? {});

    this.player = {
      id: options.playerId,
      name: options.playerName,
      position: options.world.spawn,
      facing: options.world.spawnFacing,
    };
    this.intent = { moving: false, direction: this.player.facing };

    this.scene = this.buildInitialScene();
    this.camera.snapTo(this.cameraTarget());
  }

  /** Which fixed timestep the session runs on, for the debug HUD. */
  get simulationHz(): number {
    return this.timestep.hz;
  }

  /** Steps simulated since the session started. Real work, reported to the player (not a fake counter). */
  get steps(): number {
    return this.stepCount;
  }

  /** Seconds dropped by the catch-up bound (a backgrounded tab). Zero in normal play. */
  get droppedSeconds(): number {
    return this.droppedSecondsTotal;
  }

  get isMoving(): boolean {
    return this.intent.moving;
  }

  get zoneName(): string {
    return this.world.map.name;
  }

  /** Current viewport size in CSS pixels. */
  get viewportSize(): Viewport {
    return this.viewport;
  }

  setIntent(intent: MoveIntent): void {
    this.intent = intent;
  }

  /**
   * Tells the session how big the view is.
   *
   * The camera needs the size to clamp against the map edges and to compute the visible tile range,
   * so resizing is part of the simulation, not only of the renderer.
   */
  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
    this.camera.setViewport(viewport);
    this.pendingViewport = viewport;
  }

  /** Current viewport size in CSS pixels, for the renderer's resize path. */
  /** Picks a zoom that shows a sensible amount of the world on this screen size. */
  setDefaultZoomForViewport(): void {
    this.camera.setZoom(defaultZoomForViewport(this.viewport));
  }

  /** Seconds of simulated time represented by the steps taken so far (test/debug helper). */
  get simulatedSeconds(): number {
    return this.stepCount * this.timestep.stepSeconds;
  }

  /**
   * Advances the world by one frame's worth of real time and returns what the renderer must do.
   *
   * Fixed steps, then rendering-side smoothing: simulation stays deterministic, the camera and the
   * view stay smooth.
   */
  tick(deltaSeconds: number): readonly RenderCommand[] {
    const { steps, droppedSeconds } = this.timestep.advance(deltaSeconds);

    if (droppedSeconds > 0) {
      this.droppedSecondsTotal += droppedSeconds;
      // Honest reporting: a stall means the client fell behind, and the log says by how much.
      this.logger?.debug('dropped simulation time after a stall', {
        droppedSeconds: Number(droppedSeconds.toFixed(3)),
        steps,
      });
    }

    for (let step = 0; step < steps; step += 1) {
      this.simulateStep(this.timestep.stepSeconds);
    }

    this.camera.follow(this.cameraTarget(), deltaSeconds);
    this.camera.clampToMap(this.world.map.columns, this.world.map.rows, TILE_SIZE);
    this.revealAroundPlayer();

    return this.emitCommands();
  }

  /** The scene as it stands. Read-only by convention; entries are replaced, never mutated. */
  get currentScene(): WorldScene {
    return this.scene;
  }

  // ---------------------------------------------------------------- simulation

  private simulateStep(stepSeconds: number): void {
    this.stepCount += 1;

    if (this.intent.moving) {
      const moved = this.movePlayer(this.intent.direction, stepSeconds);
      if (moved) {
        this.dustTimer += stepSeconds;
        if (this.dustTimer >= DUST_INTERVAL_SECONDS) {
          this.dustTimer = 0;
          this.spawnDust();
        }
      }
    } else {
      this.dustTimer = DUST_INTERVAL_SECONDS; // the next step emits immediately
    }

    this.updatePatrols(stepSeconds);
    this.retireEffects(stepSeconds);
  }

  /** Moves the player, refusing the move when the target tile is not walkable. */
  private movePlayer(direction: Direction, stepSeconds: number): boolean {
    const distance = WALK_SPEED_TILES_PER_SECOND * stepSeconds;
    const delta = DIRECTION_DELTA[direction];
    const candidate = {
      x: this.player.position.x + delta.x * distance,
      y: this.player.position.y + delta.y * distance,
    };

    const facingChanged = this.player.facing !== direction;
    const blocked = !this.canStandAt(candidate);

    if (blocked) {
      if (facingChanged) {
        this.player.facing = direction; // turning in place is always allowed
        this.syncPlayerActor();
      }
      return false;
    }

    this.player.position = candidate;
    this.player.facing = direction;
    this.syncPlayerActor();
    return true;
  }

  /** A position is walkable when the tiles the character's body overlaps are walkable. */
  private canStandAt(position: { x: number; y: number }): boolean {
    const corners = [
      worldPositionToTile({ x: position.x + 0.15, y: position.y + 0.15 }),
      worldPositionToTile({ x: position.x + 0.85, y: position.y + 0.15 }),
      worldPositionToTile({ x: position.x + 0.15, y: position.y + 0.85 }),
      worldPositionToTile({ x: position.x + 0.85, y: position.y + 0.85 }),
    ];
    return corners.every((tile) => {
      const layer = this.world.map.layers[0];
      const index = layer?.tiles[tile.row * this.world.map.columns + tile.column] ?? -1;
      return this.world.walkable(index);
    });
  }

  private updatePatrols(stepSeconds: number): void {
    for (const patrol of this.world.patrols) {
      const actor = this.scene.actors.get(patrol.id);
      if (actor === undefined) {
        continue;
      }
      const target = patrol.waypoints[this.patrolTargetIndex(patrol.id)] ?? patrol.waypoints[0];
      if (target === undefined) {
        continue;
      }

      const deltaX = target.x - actor.position.x;
      const deltaY = target.y - actor.position.y;
      const remaining = Math.hypot(deltaX, deltaY);
      const step = patrol.speed * stepSeconds;

      if (remaining <= step) {
        // Arrived: snap onto the waypoint and head for the next one.
        const nextIndex = (this.patrolTargetIndex(patrol.id) + 1) % patrol.waypoints.length;
        this.patrolTargets.set(patrol.id, nextIndex);
        this.scene.actors.set(patrol.id, {
          ...actor,
          position: { x: target.x, y: target.y },
          moving: false,
        });
        continue;
      }

      const direction: Direction =
        Math.abs(deltaX) >= Math.abs(deltaY)
          ? deltaX > 0
            ? 'east'
            : 'west'
          : deltaY > 0
            ? 'south'
            : 'north';
      this.scene.actors.set(patrol.id, {
        ...actor,
        position: {
          x: actor.position.x + (deltaX / remaining) * step,
          y: actor.position.y + (deltaY / remaining) * step,
        },
        facing: direction,
        moving: true,
      });
    }
  }

  private readonly patrolTargets = new Map<string, number>();

  /** Remaining lifetime per live effect (see `retireEffects`). */
  private readonly pendingEffectRemovals = new Map<string, number>();

  private patrolTargetIndex(patrolId: string): number {
    return this.patrolTargets.get(patrolId) ?? 0;
  }

  private spawnDust(): void {
    this.effectSequence += 1;
    const id = `dust:${this.effectSequence}`;
    this.scene.effects.set(id, {
      id,
      effect: 'dust',
      position: { ...this.player.position },
      ageSeconds: 0,
      lifetimeSeconds: EFFECT_LIFETIME_SECONDS,
    });
    this.pendingEffectRemovals.set(id, EFFECT_LIFETIME_SECONDS);
  }

  /**
   * Retires finished effects.
   *
   * The session owns the lifetime because the renderer is a replaceable port: an effect that only the
   * renderer knew about would leak its scene entry. The renderer still animates the frames locally
   * (no per-frame commands), and its own animation is slightly shorter, so the sprite always finishes
   * before the removal arrives.
   */
  private retireEffects(stepSeconds: number): void {
    for (const [id, remaining] of [...this.pendingEffectRemovals]) {
      const left = remaining - stepSeconds;
      if (left > 0) {
        this.pendingEffectRemovals.set(id, left);
        continue;
      }
      this.pendingEffectRemovals.delete(id);
      this.scene.effects.delete(id);
    }
  }

  /**
   * Reveals the map around the player by clearing fog tiles.
   *
   * Prototype-only mechanic: it exists to exercise per-tile updates on a chunked tile layer (the
   * structure a real tilemap needs), and it is labelled as prototype in the UI. A real world does not
   * ship cloud fog - if it ever does, the server decides what each player has seen.
   */
  private revealAroundPlayer(): void {
    const playerTile = worldPositionToTile(this.player.position);
    const layer = this.scene.layers[0];
    if (layer === undefined) {
      return;
    }

    const changes: { column: number; row: number; index: number }[] = [];
    for (
      let row = playerTile.row - REVEAL_RADIUS_TILES;
      row <= playerTile.row + REVEAL_RADIUS_TILES;
      row += 1
    ) {
      for (
        let column = playerTile.column - REVEAL_RADIUS_TILES;
        column <= playerTile.column + REVEAL_RADIUS_TILES;
        column += 1
      ) {
        if (column < 0 || row < 0 || column >= layer.columns || row >= layer.rows) {
          continue;
        }
        const distance = Math.hypot(column - playerTile.column, row - playerTile.row);
        if (distance > REVEAL_RADIUS_TILES) {
          continue;
        }
        const index = row * layer.columns + column;
        if (layer.tiles[index] !== FOG_TILE_INDEX) {
          continue;
        }
        layer.tiles[index] = -1;
        changes.push({ column, row, index: -1 });
      }
    }

    if (changes.length > 0) {
      // The tile array is owned by the scene; the changed indices are pushed to the renderer as a
      // patch instead of resending the whole layer.
      this.pendingTileChanges.push({ layerId: layer.id, changes });
    }
  }

  private readonly pendingTileChanges: {
    layerId: string;
    changes: { column: number; row: number; index: number }[];
  }[] = [];

  // ---------------------------------------------------------------- scene plumbing

  private buildInitialScene(): WorldScene {
    const { map } = this.world;
    const ground: TileLayerState = {
      id: this.world.layerId,
      tiles: [...(map.layers[0]?.tiles ?? [])],
      columns: map.columns,
      rows: map.rows,
      sheet: 'tileset',
    };

    // Everything starts under cloud; the player's surroundings are cleared on the first tick.
    for (let index = 0; index < ground.tiles.length; index += 1) {
      ground.tiles[index] = FOG_TILE_INDEX;
    }

    const objects = new Map<string, ObjectState>();
    for (const object of this.world.objects) {
      objects.set(object.id, {
        id: object.id,
        sprite: object.sprite,
        layer: 'objects',
        column: object.column,
        row: object.row,
      });
    }

    const actors = new Map<string, ActorState>();
    actors.set(this.player.id, {
      id: this.player.id,
      appearance: 'player',
      layer: 'characters',
      position: { ...this.player.position },
      facing: this.player.facing,
      moving: false,
    });
    for (const patrol of this.world.patrols) {
      const start = patrol.waypoints[0];
      if (start === undefined) {
        continue;
      }
      actors.set(patrol.id, {
        id: patrol.id,
        appearance: patrol.appearance,
        layer: 'npcs',
        position: { ...start },
        facing: 'east',
        moving: false,
        name: patrol.name,
      });
    }

    const ui = new Map<string, WorldUiState>();
    ui.set(`label:${this.player.id}`, {
      id: `label:${this.player.id}`,
      text: this.player.name,
      position: { ...this.player.position },
      offsetY: 6,
      followActorId: this.player.id,
    });
    for (const patrol of this.world.patrols) {
      const start = patrol.waypoints[0];
      if (start === undefined) {
        continue;
      }
      ui.set(`label:${patrol.id}`, {
        id: `label:${patrol.id}`,
        text: patrol.name,
        position: { ...start },
        offsetY: 6,
        followActorId: patrol.id,
      });
    }

    return { layers: [ground], objects, actors, effects: new Map(), ui };
  }

  /** Replaces the player's actor entry so the diff notices the change (entries are immutable). */
  private syncPlayerActor(): void {
    const actor = this.scene.actors.get(this.player.id);
    if (actor === undefined) {
      return;
    }
    this.scene.actors.set(this.player.id, {
      ...actor,
      position: { ...this.player.position },
      facing: this.player.facing,
      moving: this.intent.moving,
    });
  }

  /** Where the camera wants to be: the middle of the character, not its top-left corner. */
  private cameraTarget(): { x: number; y: number } {
    return {
      x: (this.player.position.x + 0.5) * TILE_SIZE,
      y: (this.player.position.y + 0.5) * TILE_SIZE,
    };
  }

  /** Commands for everything that changed since the previous tick. */
  private emitCommands(): readonly RenderCommand[] {
    const commands: RenderCommand[] = [];

    if (this.pendingViewport !== undefined) {
      commands.push({ type: 'viewport', viewport: this.pendingViewport });
      this.pendingViewport = undefined;
    }

    commands.push({ type: 'camera', camera: this.camera.snapshot });

    for (const patch of this.pendingTileChanges) {
      commands.push({ type: 'tiles-changed', layerId: patch.layerId, changes: patch.changes });
    }
    this.pendingTileChanges.length = 0;

    commands.push(...diffScene(this.rendered, this.scene));

    this.rendered = snapshotOf(this.scene);
    return commands;
  }
}

/** Tile index of the fog cloud, from the generated tile sheet. */
export const FOG_TILE_INDEX = 5;

const DIRECTION_DELTA: Readonly<Record<Direction, { x: number; y: number }>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

/**
 * Shallow copies the scene maps so the diff compares against what the renderer actually received.
 *
 * Without this the session would hold a reference to the same maps it keeps mutating, every diff
 * would see no change, and the renderer would freeze on the first frame.
 */
function snapshotOf(scene: WorldScene): WorldScene {
  return {
    // Layers keep their identity: tile edits are sent as `tiles-changed` patches, and copying the
    // tile array (2 560 numbers for the prototype zone) on every frame would be pure waste.
    layers: [...scene.layers],
    objects: new Map(scene.objects),
    actors: new Map(scene.actors),
    effects: new Map(scene.effects),
    ui: new Map(scene.ui),
  };
}
