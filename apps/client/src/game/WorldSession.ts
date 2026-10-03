import { FixedTimestep, TILE_SIZE, areaAtPosition } from '@project-realm/shared';
import type {
  GameConfig,
  Logger,
  MoveIntent,
  NearbyNpcState,
  NpcDialogueState,
  Position,
} from '@project-realm/shared';
import { TileCollision } from '../physics/Collision';
import { Camera, defaultZoomForViewport } from '../render/Camera';
import type { Viewport } from '../render/scene';
import {
  diffScene,
  emptyScene,
  type ActorAnimationState,
  type ActorState,
  type ObjectState,
  type RenderCommand,
  type TileLayerState,
  type WorldScene,
  type WorldUiState,
} from '../render/scene';
import type { GreenhavenWorld } from './GreenhavenWorld';
import { MonsterAI } from './MonsterAI';
import { MonsterCombat } from './MonsterCombat';
import type { PlayerAttackResult } from './MonsterCombat';
import type { MonsterEntity, MonsterRuntimeState } from './MonsterEntity';
import { MonsterSpawner } from './MonsterSpawner';
import { NpcInteractionSystem } from './NpcInteractionSystem';
import { PlayerController } from './PlayerController';
import type { LocalPlayerState } from './PlayerController';

/** How often a footstep puff is emitted while walking. */
const DUST_INTERVAL_SECONDS = 0.22;

/**
 * How long a dust puff exists. Slightly longer than the renderer's own animation (0.45 s) so the
 * sprite always plays to the end before its scene entry is retired.
 */
const EFFECT_LIFETIME_SECONDS = 0.5;
const PROTOTYPE_PLAYER_MAX_HP = 100;

/**
 * WorldSession - Greenhaven's local world logic and the bridge between game code and the renderer.
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
 * map collision, area lookup and the render diff are all covered by unit tests.
 */
export class WorldSession {
  readonly camera: Camera;

  private readonly world: GreenhavenWorld;
  private readonly collision: TileCollision;
  private readonly playerController: PlayerController;
  private readonly npcInteractions: NpcInteractionSystem;
  private readonly monsterSpawner: MonsterSpawner;
  private readonly monsterAI: MonsterAI;
  private readonly monsterCombat: MonsterCombat;
  private playerHp = PROTOTYPE_PLAYER_MAX_HP;
  private readonly timestep: FixedTimestep;
  private latestIntent: MoveIntent = { moving: false, direction: 'south' };
  private readonly logger: Logger | undefined;
  private scene: WorldScene;
  private rendered: WorldScene = emptyScene();
  private previousPlayerPosition: Position = { x: 0, y: 0 };
  private dustTimer = 0;
  private stepCount = 0;
  private droppedSecondsTotal = 0;
  private effectSequence = 0;
  private viewport: Viewport = { width: 1, height: 1 };
  private pendingViewport: Viewport | undefined;

  constructor(options: {
    readonly world: GreenhavenWorld;
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

    this.collision = new TileCollision({ map: options.world.map });
    this.playerController = new PlayerController({
      id: options.playerId,
      name: options.playerName,
      position: options.world.spawn.position,
      direction: options.world.spawn.direction,
      speed: options.game.movement.playerSpeedTilesPerSecond,
      collision: this.collision,
    });
    this.npcInteractions = new NpcInteractionSystem(options.world.npcs);
    this.monsterSpawner = new MonsterSpawner(options.world.monsters);
    this.monsterAI = new MonsterAI();
    this.monsterCombat = new MonsterCombat();
    this.previousPlayerPosition = { ...this.player.position };

    this.scene = this.buildInitialScene();
    this.npcInteractions.updatePlayerPosition(this.player.position);
    this.syncInteractionPrompt();
    this.camera.snapTo(this.cameraTarget(this.player.position));
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

  get player(): LocalPlayerState {
    return this.playerController.state;
  }

  get isMoving(): boolean {
    return this.player.movementState === 'moving';
  }

  get zoneName(): string {
    return this.world.map.name;
  }

  /** Most specific named area containing the player's current tile position. */
  get areaName(): string {
    return areaAtPosition(this.world.map, this.player.position)?.name ?? this.world.map.name;
  }

  get nearbyNpc(): NearbyNpcState | null {
    return this.npcInteractions.nearbyNpc;
  }

  get dialogue(): NpcDialogueState | null {
    return this.npcInteractions.dialogue;
  }

  get monsterStates(): readonly MonsterRuntimeState[] {
    return this.monsterSpawner.monsters.map((monster) => monster.snapshot());
  }

  get playerHealth(): { readonly hp: number; readonly maxHP: number } {
    return { hp: this.playerHp, maxHP: PROTOTYPE_PLAYER_MAX_HP };
  }

  get monsterStatus(): string {
    const monsters = this.monsterSpawner.monsters;
    const alive = monsters.filter((monster) => monster.state !== 'DEAD');
    let closest: MonsterEntity | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const monster of alive) {
      const distance = Math.hypot(
        monster.position.x - this.player.position.x,
        monster.position.y - this.player.position.y,
      );
      if (distance < closestDistance) {
        closest = monster;
        closestDistance = distance;
      }
    }
    if (closest !== undefined && closestDistance <= closest.definition.detectionRadius + 2) {
      return `${closest.name} · ${closest.state} · ${closest.hp}/${closest.maxHP} HP`;
    }
    return `${alive.length}/${monsters.length} active`;
  }

  /** Current viewport size in CSS pixels. */
  get viewportSize(): Viewport {
    return this.viewport;
  }

  setIntent(intent: MoveIntent): void {
    this.latestIntent = intent;
    this.playerController.setIntent(
      this.npcInteractions.isDialogueOpen ? { moving: false, direction: intent.direction } : intent,
    );
  }

  /** Opens the nearest in-range NPC's dialogue and pauses player movement while it is open. */
  interact(): boolean {
    const opened = this.npcInteractions.interact(this.player.position);
    if (opened) {
      this.playerController.setIntent({ moving: false, direction: this.player.direction });
    }
    this.syncInteractionPrompt();
    return opened;
  }

  /** Advances a linear dialogue node, or closes a terminal line when it has no responses. */
  continueDialogue(): boolean {
    if (this.npcInteractions.continueDialogue()) {
      this.syncInteractionPrompt();
      return true;
    }
    const dialogue = this.npcInteractions.dialogue;
    return dialogue !== null && dialogue.choices.length === 0 ? this.closeDialogue() : false;
  }

  chooseDialogueChoice(choiceId: string): boolean {
    const chosen = this.npcInteractions.choose(choiceId);
    if (!chosen) {
      return false;
    }
    if (!this.npcInteractions.isDialogueOpen) {
      this.playerController.setIntent(this.latestIntent);
    }
    this.syncInteractionPrompt();
    return true;
  }

  closeDialogue(): boolean {
    const closed = this.npcInteractions.closeDialogue();
    if (closed) {
      this.playerController.setIntent(this.latestIntent);
      this.syncInteractionPrompt();
    }
    return closed;
  }

  attackNearestMonster(): PlayerAttackResult {
    const result = this.monsterCombat.attackNearest(
      this.monsterSpawner.monsters,
      this.player.position,
    );
    if (result.status === 'hit') {
      this.syncMonsterActors();
    }
    return result;
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

    this.npcInteractions.updatePlayerPosition(this.player.position);
    this.syncInteractionPrompt();

    const renderPosition = this.interpolatedPlayerPosition();
    this.syncPlayerActor(renderPosition);
    this.camera.follow(this.cameraTarget(renderPosition), deltaSeconds);
    this.camera.clampToBounds(this.world.map.bounds, TILE_SIZE);

    return this.emitCommands();
  }

  /** The scene as it stands. Read-only by convention; entries are replaced, never mutated. */
  get currentScene(): WorldScene {
    return this.scene;
  }

  // ---------------------------------------------------------------- simulation

  private simulateStep(stepSeconds: number): void {
    this.stepCount += 1;

    this.previousPlayerPosition = { ...this.player.position };
    const update = this.playerController.update(stepSeconds);
    if (update.moved) {
      this.dustTimer += stepSeconds;
      if (this.dustTimer >= DUST_INTERVAL_SECONDS) {
        this.dustTimer = 0;
        this.spawnDust();
      }
    } else {
      this.dustTimer = DUST_INTERVAL_SECONDS; // the next step emits immediately
    }

    this.monsterSpawner.update(stepSeconds);
    const monsters = this.monsterSpawner.monsters;
    for (const monster of monsters) {
      this.monsterAI.update(monster, this.player.position, stepSeconds, this.collision);
    }
    for (const attack of this.monsterCombat.update(monsters, this.player.position, stepSeconds)) {
      this.playerHp = Math.max(0, this.playerHp - attack.damage);
      this.logger?.debug('monster attacked the local player', {
        monsterId: attack.monsterId,
        damage: attack.damage,
        hp: this.playerHp,
      });
    }
    this.syncMonsterActors();

    this.retireEffects(stepSeconds);
  }

  /** Remaining lifetime per live effect (see `retireEffects`). */
  private readonly pendingEffectRemovals = new Map<string, number>();

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

  // ---------------------------------------------------------------- scene plumbing

  private buildInitialScene(): WorldScene {
    const { map } = this.world;
    const layers: TileLayerState[] = [];
    const objects = new Map<string, ObjectState>();

    for (const layer of map.layers) {
      if (layer.kind === 'tile') {
        layers.push({
          id: layer.id,
          role: layer.role,
          tiles: [...layer.tiles],
          columns: map.columns,
          rows: map.rows,
          sheet: 'tileset',
        });
      } else if (layer.kind === 'objects') {
        for (const object of layer.objects) {
          objects.set(object.id, {
            id: object.id,
            sprite: object.sprite,
            layer: 'objects',
            position: { ...object.position },
          });
        }
      }
    }

    const actors = new Map<string, ActorState>();
    actors.set(this.player.id, {
      id: this.player.id,
      appearance: 'player',
      layer: 'characters',
      position: { ...this.player.position },
      facing: this.player.direction,
      moving: false,
      animationState: this.player.animationState,
    });
    for (const npc of this.world.npcs) {
      actors.set(npc.id, {
        id: npc.id,
        appearance: npc.sprite,
        layer: 'npcs',
        position: { ...npc.position },
        facing: 'south',
        moving: false,
        animationState: 'idle',
        name: npc.name,
      });
    }
    for (const monster of this.monsterSpawner.monsters) {
      actors.set(monster.id, {
        id: monster.id,
        appearance: monster.definition.sprite,
        layer: 'monsters',
        position: { ...monster.position },
        facing: monster.facing,
        moving: false,
        animationState: 'idle',
        name: monster.name,
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
    for (const npc of this.world.npcs) {
      ui.set(`label:${npc.id}`, {
        id: `label:${npc.id}`,
        text: npc.name,
        position: { ...npc.position },
        offsetY: 6,
        followActorId: npc.id,
      });
    }
    for (const monster of this.monsterSpawner.monsters) {
      ui.set(`label:${monster.id}`, {
        id: `label:${monster.id}`,
        text: `${monster.name} · Lv ${monster.definition.level} · ${monster.hp}/${monster.maxHP} HP`,
        position: { ...monster.position },
        offsetY: 7,
        followActorId: monster.id,
      });
    }

    return { layers, objects, actors, effects: new Map(), ui };
  }

  /** Keeps the monster actor layer and its small HP/status labels in sync with runtime entities. */
  private syncMonsterActors(): void {
    for (const monster of this.monsterSpawner.monsters) {
      const animationState: ActorAnimationState =
        monster.state === 'HURT'
          ? 'hurt'
          : monster.state === 'DEAD'
            ? 'dead'
            : monster.state === 'ATTACK'
              ? 'attack'
              : monster.moving
                ? 'walk'
                : 'idle';
      this.scene.actors.set(monster.id, {
        id: monster.id,
        appearance: monster.definition.sprite,
        layer: 'monsters',
        position: { ...monster.position },
        facing: monster.facing,
        moving: monster.moving,
        animationState,
        name: monster.name,
      });
      this.scene.ui.set(`label:${monster.id}`, {
        id: `label:${monster.id}`,
        text:
          monster.state === 'DEAD'
            ? `${monster.name} · down`
            : `${monster.name} · Lv ${monster.definition.level} · ${monster.hp}/${monster.maxHP} HP`,
        position: { ...monster.position },
        offsetY: 7,
        followActorId: monster.id,
      });
    }
  }

  /** Adds an above-head talk prompt only while an NPC is in range and no dialogue is open. */
  private syncInteractionPrompt(): void {
    const promptId = 'npc-interaction-prompt';
    const nearby = this.npcInteractions.nearbyNpc;
    const npc =
      nearby === null ? undefined : this.world.npcs.find((candidate) => candidate.id === nearby.id);
    if (npc === undefined || this.npcInteractions.isDialogueOpen) {
      this.scene.ui.delete(promptId);
      return;
    }

    this.scene.ui.set(promptId, {
      id: promptId,
      text: 'E · Talk',
      position: { ...npc.position },
      offsetY: 16,
      followActorId: npc.id,
    });
  }

  /** Replaces the player's actor entry with the render-interpolated position. */
  private syncPlayerActor(position: Position): void {
    const actor = this.scene.actors.get(this.player.id);
    if (actor === undefined) {
      return;
    }
    this.scene.actors.set(this.player.id, {
      ...actor,
      position: { ...position },
      facing: this.player.direction,
      moving: this.player.movementState === 'moving',
      animationState: this.player.animationState,
    });
  }

  /** Blends the last two fixed simulation positions for smooth rendering between 20 Hz steps. */
  private interpolatedPlayerPosition(): Position {
    const current = this.player.position;
    const alpha = Math.max(0, Math.min(1, this.timestep.interpolation));
    return {
      x: this.previousPlayerPosition.x + (current.x - this.previousPlayerPosition.x) * alpha,
      y: this.previousPlayerPosition.y + (current.y - this.previousPlayerPosition.y) * alpha,
    };
  }

  /** Where the camera wants to be: the middle of the character, not its top-left corner. */
  private cameraTarget(position: Position): { x: number; y: number } {
    return {
      x: (position.x + 0.5) * TILE_SIZE,
      y: (position.y + 0.5) * TILE_SIZE,
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

    commands.push(...diffScene(this.rendered, this.scene));

    this.rendered = snapshotOf(this.scene);
    return commands;
  }
}

/**
 * Shallow copies the scene maps so the diff compares against what the renderer actually received.
 *
 * Without this the session would hold a reference to the same maps it keeps mutating, every diff
 * would see no change, and the renderer would freeze on the first frame.
 */
function snapshotOf(scene: WorldScene): WorldScene {
  return {
    // Layers keep their identity: edits can travel as `tiles-changed` patches, and copying every
    // map-cell array on each rendered frame would be pure waste.
    layers: [...scene.layers],
    objects: new Map(scene.objects),
    actors: new Map(scene.actors),
    effects: new Map(scene.effects),
    ui: new Map(scene.ui),
  };
}
