import { TILE_SIZE, worldPositionToTile } from '@project-realm/shared';
import type {
  GameConfig,
  Logger,
  MoveIntent,
  NearbyNpcState,
  NpcDialogueState,
} from '@project-realm/shared';
import type { AssetProgress } from '../render/Assets';
import { PixiRenderer } from '../render/PixiRenderer';
import type { RenderStats, WorldRenderer } from '../render/WorldRenderer';
import type { Viewport } from '../render/scene';
import { GameLoop } from './GameLoop';
import { createGreenhavenWorld } from './GreenhavenWorld';
import type { PlayerAttackResult } from './MonsterCombat';
import { WorldSession } from './WorldSession';

/** Everything the stage needs from the outside world; all of it injectable, so it is testable. */
export interface WorldStageOptions {
  readonly canvas: HTMLCanvasElement;
  readonly game: GameConfig;
  readonly playerName: string;
  readonly playerId: string;
  readonly logger?: Logger;
  readonly background: string;
  /** Defaults to the browser's device pixel ratio, capped by `pixelRatioCap`. */
  readonly devicePixelRatio?: number;
  readonly pixelRatioCap?: number;
  readonly pixelated?: boolean;
  /** Creates the renderer. Defaults to PixiJS; tests inject a double. */
  readonly createRenderer?: (logger?: Logger) => WorldRenderer;
  /** Real asset progress (sheets finished / total) forwarded from the renderer to the loading screen. */
  readonly onAssetProgress?: (progress: AssetProgress) => void;
  readonly onReady?: (info: { backend: string }) => void;
}

/**
 * WorldStage - everything between "the client is online" and "a world is on screen".
 *
 * It owns the canvas, asset loading, renderer, local world/session and simulation loop, and is the only
 * place that knows all of them (the world composition root; `GameClient` owns the HTTP boot handshake).
 * `WorldBootstrap` wires input to the stage without making the stage depend on DOM events. Order matters:
 *
 *   1. the canvas gets a real size before the renderer is created,
 *   2. assets load before anything is drawn (a world drawn from missing art is a world of holes),
 *   3. the session starts only once the renderer can actually draw it,
 *   4. the loop is the last thing to start and the first thing to stop.
 *
 * Resize handling lives here too: a `ResizeObserver` on the canvas element is what makes the world
 * follow the browser window (and a phone rotating) instead of stretching.
 */
export class WorldStage {
  private readonly options: WorldStageOptions;
  private renderer: WorldRenderer | undefined;
  private session: WorldSession | undefined;
  private loop: GameLoop | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private intent: MoveIntent = { moving: false, direction: 'south' };
  private pixelated: boolean;
  private resolution = 1;
  private lastDeltaSeconds = 0;
  private lastStats: RenderStats = {
    visibleTiles: 0,
    visibleObjects: 0,
    visibleActors: 0,
    visibleEffects: 0,
  };
  private visibilityHandler: (() => void) | undefined;

  constructor(options: WorldStageOptions) {
    this.options = options;
    this.pixelated = options.pixelated ?? true;
  }

  get stats(): RenderStats {
    return this.lastStats;
  }

  get framesPerSecond(): number {
    return this.loop?.fps ?? 0;
  }

  /** Renderer resolution (devicePixelRatio, capped), for the HUD. */
  get deviceResolution(): number {
    return this.resolution;
  }

  /**
   * A snapshot of everything the debug HUD shows.
   *
   * Plain numbers and strings, so the UI layer can display it without importing a single game type
   * (see `WorldHudModel`). Read-only by construction: it is rebuilt on every call.
   */
  get hud(): {
    zone: string;
    area: string;
    backend: string;
    fps: number;
    deltaMs: number;
    simulationHz: number;
    steps: number;
    droppedSeconds: number;
    camera: { x: number; y: number; zoom: number };
    player: {
      column: number;
      row: number;
      direction: string;
      movementState: string;
      speed: number;
      animationState: string;
    };
    visible: { tiles: number; objects: number; actors: number; effects: number };
    viewport: { width: number; height: number; resolution: number };
    pixelated: boolean;
    intent: string;
    nearbyNpc: string;
    playerHealth: string;
    monsters: string;
  } {
    const session = this.session;
    const position = session?.player.position ?? { x: 0, y: 0 };
    const tile = worldPositionToTile(position);
    const camera = session?.camera.snapshot ?? { x: 0, y: 0, zoom: 1 };
    const held = this.intent.moving ? `held: ${this.intent.direction}` : 'idle';

    return {
      // Zone and backend are real values; before the world starts they are simply empty.
      zone: session?.zoneName ?? '—',
      area: session?.areaName ?? '—',
      backend: this.renderer?.backend ?? '—',
      fps: this.loop?.fps ?? 0,
      deltaMs: this.lastDeltaSeconds * 1000,
      simulationHz: session?.simulationHz ?? this.options.game.simulation.hz,
      steps: session?.steps ?? 0,
      droppedSeconds: session?.droppedSeconds ?? 0,
      camera: { x: camera.x, y: camera.y, zoom: camera.zoom },
      player: {
        column: tile.column,
        row: tile.row,
        direction: session?.player.direction ?? '—',
        movementState: session?.player.movementState ?? 'idle',
        speed: session?.player.speed ?? this.options.game.movement.playerSpeedTilesPerSecond,
        animationState: session?.player.animationState ?? 'idle',
      },
      visible: {
        tiles: this.lastStats.visibleTiles,
        objects: this.lastStats.visibleObjects,
        actors: this.lastStats.visibleActors,
        effects: this.lastStats.visibleEffects,
      },
      viewport: {
        width: this.session?.viewportSize.width ?? 0,
        height: this.session?.viewportSize.height ?? 0,
        resolution: this.resolution,
      },
      pixelated: this.pixelated,
      intent: held,
      nearbyNpc: session?.nearbyNpc?.name ?? 'None',
      playerHealth:
        session === undefined ? '—' : `${session.playerHealth.hp}/${session.playerHealth.maxHP} HP`,
      monsters: session?.monsterStatus ?? '—',
    };
  }

  /** Player position in world pixels, for the HUD's coordinate readout. */
  get playerWorldPixels(): { x: number; y: number } {
    const position = this.session?.player.position ?? { x: 0, y: 0 };
    return { x: position.x * TILE_SIZE, y: position.y * TILE_SIZE };
  }

  /** Stops the loop without tearing anything down (backgrounded tab). */
  pause(): void {
    this.loop?.stop();
  }

  /** Restarts the loop after {@link pause}. */
  resume(): void {
    this.loop?.start();
  }

  get isRunning(): boolean {
    return this.loop?.isRunning ?? false;
  }

  /** Builds the world. Throws a {@link RealmError} when a step cannot be completed. */
  async start(): Promise<{ backend: string }> {
    const logger = this.options.logger;

    // 1. A canvas with a real size, then the renderer.
    this.resolution = this.computeResolution();
    const viewport = this.measureViewport();

    const renderer = this.options.createRenderer?.(logger) ?? new PixiRenderer();
    this.renderer = renderer;
    // 2. The renderer brings up its drawing context AND its sprite sheets, reporting real progress
    //    (sheets finished out of sheets defined) while it runs.
    await renderer.init({
      canvas: this.options.canvas,
      viewport,
      resolution: this.resolution,
      background: this.options.background,
      pixelated: this.pixelated,
      ...(logger !== undefined ? { logger } : {}),
      ...(this.options.onAssetProgress !== undefined
        ? { onAssetProgress: this.options.onAssetProgress }
        : {}),
    });

    // 3. The world and its session.
    const world = createGreenhavenWorld();
    const session = new WorldSession({
      world,
      playerId: this.options.playerId,
      playerName: this.options.playerName,
      game: this.options.game,
      ...(logger !== undefined ? { logger: logger.child('world') } : {}),
    });
    this.session = session;
    session.setViewport(viewport);
    session.setDefaultZoomForViewport();
    // Input can arrive before the world has finished starting (a key held while loading); applying the
    // pending intent here means that key is already in effect on the first simulated step.
    session.setIntent(this.intent);

    // 4. Resize first (so the very first frame is already correct), then the loop and the pause rules.
    this.observeResize();
    this.observeVisibility();

    this.loop = new GameLoop({
      onFrame: ({ deltaSeconds }) => {
        this.tick(deltaSeconds);
      },
      ...(logger !== undefined ? { logger } : {}),
    });
    this.loop.start();

    this.options.onReady?.({ backend: renderer.backend });
    logger?.info('world ready', {
      zone: session.zoneName,
      area: session.areaName,
      backend: renderer.backend,
      hz: session.simulationHz,
      playerSpeedTilesPerSecond: this.options.game.movement.playerSpeedTilesPerSecond,
    });

    return { backend: renderer.backend };
  }

  /** Movement intent from the input layer. */
  setIntent(intent: MoveIntent): void {
    this.intent = intent;
    this.session?.setIntent(intent);
  }

  /** Movement intent as the stage last received it (the HUD reads it to show what is being pressed). */
  get currentIntent(): MoveIntent {
    return this.intent;
  }

  get nearbyNpc(): NearbyNpcState | null {
    return this.session?.nearbyNpc ?? null;
  }

  get dialogue(): NpcDialogueState | null {
    return this.session?.dialogue ?? null;
  }

  interact(): boolean {
    return this.session?.interact() ?? false;
  }

  continueDialogue(): boolean {
    return this.session?.continueDialogue() ?? false;
  }

  chooseDialogueChoice(choiceId: string): boolean {
    return this.session?.chooseDialogueChoice(choiceId) ?? false;
  }

  closeDialogue(): boolean {
    return this.session?.closeDialogue() ?? false;
  }

  attackNearestMonster(): PlayerAttackResult | null {
    return this.session?.attackNearestMonster() ?? null;
  }

  /** Zoom by whole steps, from the HUD buttons or the keyboard. */
  zoomBy(steps: number): void {
    this.session?.camera.zoomBy(steps);
  }

  resetZoom(): void {
    this.session?.setDefaultZoomForViewport();
  }

  togglePixelated(): boolean {
    this.pixelated = !this.pixelated;
    this.renderer?.setPixelated(this.pixelated);
    return this.pixelated;
  }

  /** Current zoom level, for the HUD. */
  get zoom(): number {
    return this.session?.camera.zoom ?? 1;
  }

  /**
   * Advances the world by `deltaSeconds` and draws one frame.
   *
   * The render loop calls this once per animation frame; tests and pause/resume call it directly, which
   * is what makes the whole stage verifiable without a browser or a real clock.
   */
  tick(deltaSeconds: number): void {
    const session = this.session;
    const renderer = this.renderer;
    if (session === undefined || renderer === undefined) {
      return;
    }

    this.lastDeltaSeconds = deltaSeconds;
    // Simulation + diff first, drawing second: the renderer draws the state it was just handed.
    renderer.apply(session.tick(deltaSeconds));
    this.lastStats = renderer.render(deltaSeconds);
  }

  /**
   * Re-measures the canvas and applies the new size to the renderer and the camera.
   *
   * Called by the `ResizeObserver` (or the window's resize event where there is no observer).
   * Exposed as a method rather than buried in the observer because it is the behaviour the acceptance
   * criteria talk about: resizing must not lose the scene or the camera.
   */
  handleResize(): void {
    const viewport = this.measureViewport();
    this.resolution = this.computeResolution();
    this.renderer?.resize(viewport, this.resolution);
    this.session?.setViewport(viewport);
  }

  stop(): void {
    this.loop?.stop();
    this.loop = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    if (this.visibilityHandler !== undefined) {
      globalThis.document?.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = undefined;
    }
    this.renderer?.destroy();
    this.renderer = undefined;
    this.session = undefined;
  }

  /**
   * Pauses while the tab is hidden and resumes when it comes back.
   *
   * Browsers already throttle `requestAnimationFrame` in a hidden tab, but relying on that leaves the
   * loop running (slowly) against a renderer nobody can see. Stopping it is cheaper and makes the
   * resume path explicit: the loop's first frame after a start reports a zero delta, so coming back to
   * a tab can never teleport the player.
   */
  private observeVisibility(): void {
    const documentRef = globalThis.document;
    if (documentRef === undefined) {
      return;
    }
    this.visibilityHandler = () => {
      if (documentRef.hidden) {
        this.pause();
      } else {
        this.resume();
      }
    };
    documentRef.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private observeResize(): void {
    const canvas = this.options.canvas;
    // The renderer resizes its drawing buffer, the session resizes the camera and its culling: a resize
    // must not lose the scene, and it must not leave the camera looking at the wrong place.
    const apply = (): void => {
      this.handleResize();
    };

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(apply);
      this.resizeObserver.observe(canvas);
    } else {
      // Very old browsers: fall back to the window event, and still resize correctly.
      globalThis.addEventListener?.('resize', apply);
    }
    apply();
  }

  private measureViewport(): Viewport {
    const element = this.options.canvas;
    // `getBoundingClientRect` reflects the CSS box (which is what the player sees); `clientWidth` can
    // be 0 for a canvas inside a hidden container, hence the fallback to the window size.
    const rect = element.getBoundingClientRect();
    const width = Math.round(rect.width > 0 ? rect.width : (globalThis.innerWidth ?? 640));
    const height = Math.round(rect.height > 0 ? rect.height : (globalThis.innerHeight ?? 360));
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  /**
   * Device pixel ratio, capped.
   *
   * A DPR of 3 draws 9 times the pixels of DPR 1; on a phone that is the difference between 60 fps and
   * a warm hand. The cap is a real trade-off, so it is explicit and logged by the HUD, not hidden.
   */
  private computeResolution(): number {
    const cap = this.options.pixelRatioCap ?? 2;
    const dpr = this.options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
    return Math.max(1, Math.min(cap, dpr));
  }
}
