import { Application, Assets, Container, RendererType, Text, TextureStyle } from 'pixi.js';
import type { Texture } from 'pixi.js';
import type { TextOptions } from 'pixi.js';
import { RealmError, TILE_SIZE, visibleTileRange } from '@project-realm/shared';
import type { CameraState, Logger, TileRange } from '@project-realm/shared';
import { RENDER_LAYERS } from './scene';
import type {
  ActorState,
  EffectState,
  RenderCommand,
  RenderLayerId,
  Viewport,
  WorldUiState,
} from './scene';
import type { RenderStats, RendererInitOptions, WorldRenderer } from './WorldRenderer';
import { ActorSprite } from './sprites/ActorSprite';
import { EffectSprite } from './sprites/EffectSprite';
import { ObjectLayerView } from './sprites/ObjectLayerView';
import { TileLayerView } from './sprites/TileLayerView';
import { SHEETS, assetUrl } from './manifests';
import { AssetLoader } from './Assets';
import { TextureLibrary } from './textures';

/** Extra tiles drawn beyond the viewport, so overhanging objects and moving actors never pop in. */
const CULL_MARGIN_TILES = 2;

/**
 * Distance from an actor's feet to the top of its sprite, in world pixels (the actor frame height).
 * Taken from the manifest so a taller sprite moves the labels with it.
 */
const ACTOR_HEAD_OFFSET_PX = SHEETS.actors.frameHeight;

/**
 * The PixiJS renderer: the only file in the project that imports PixiJS.
 *
 * Scene graph it builds (one container per layer, in `RENDER_LAYERS` order):
 *
 *   app.stage
 *     └── world            <- the camera transform is applied HERE (position + scale)
 *          ├── ground      <- base tilemap, chunked and culled
 *          ├── decoration  <- overlay tilemap
 *          ├── objects     <- depth-sorted world objects
 *          ├── characters  <- the player
 *          ├── npcs
 *          ├── effects     <- short-lived puffs
 *          └── world-ui    <- labels pinned to world positions
 *
 * The camera lives on the world container, so every child is written once in world pixels and never
 * touched again by camera movement: moving the camera is one position/scale assignment per frame,
 * not a loop over sprites. Culling therefore only decides *visibility*, never positions.
 *
 * The frame loop belongs to `GameLoop`, not to PixiJS's ticker (`autoStart: false`): the project has
 * one clock and one place where delta time is computed (see shared `FixedTimestep`).
 */
export class PixiRenderer implements WorldRenderer {
  private app: Application | undefined;
  private readonly world = new Container();
  private readonly layers = Object.fromEntries(
    RENDER_LAYERS.map((layer) => [layer, new Container()]),
  ) as Record<RenderLayerId, Container>;
  private readonly tileLayers = new Map<string, TileLayerView>();
  private readonly actorSprites = new Map<string, ActorSprite>();
  private readonly effects = new Map<string, EffectSprite>();
  private readonly labels = new Map<string, { text: Text; state: WorldUiState }>();
  private textures: TextureLibrary | undefined;
  private objectLayer: ObjectLayerView | undefined;
  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private viewport: Viewport = { width: 1, height: 1 };
  private mapColumns = 0;
  private mapRows = 0;
  private pixelated = true;
  private logger: Logger | undefined;
  private backendName = 'uninitialised';

  get backend(): string {
    return this.backendName;
  }

  async init(options: RendererInitOptions): Promise<void> {
    this.logger = options.logger;
    this.viewport = {
      width: Math.max(1, Math.round(options.viewport.width)),
      height: Math.max(1, Math.round(options.viewport.height)),
    };
    this.pixelated = options.pixelated;

    const app = new Application();
    await app.init({
      canvas: options.canvas,
      width: this.viewport.width,
      height: this.viewport.height,
      background: options.background,
      // Pixel art is scaled with nearest-neighbour filtering; MSAA would only soften it and costs a
      // full-screen buffer. Worth revisiting if the art style ever moves away from hard pixels.
      antialias: false,
      // Keeps the canvas backing store in device pixels while all coordinates stay CSS pixels.
      autoDensity: true,
      resolution: options.resolution,
      // The game loop drives rendering; PixiJS must not run a second clock.
      autoStart: false,
      // Ordered preference: WebGL (broadest support, best sprite batching today), then WebGPU, then
      // the canvas renderer - a device without WebGL still gets a world instead of a black screen.
      preference: ['webgl', 'webgpu', 'canvas'],
      powerPreference: 'high-performance',
    });

    this.app = app;
    this.backendName = backendNameOf(app);

    for (const layer of RENDER_LAYERS) {
      const container = this.layers[layer];
      container.label = layer;
      // Nothing in the layer stack is interactive yet; the interaction system arrives with input and
      // UI hit-testing in later phases, and leaving it off skips a per-frame traversal.
      container.eventMode = 'none';
      this.world.addChild(container);
    }
    app.stage.addChild(this.world);

    await this.loadSheets(options);

    this.logger?.info('renderer ready', {
      backend: this.backendName,
      viewport: `${this.viewport.width}x${this.viewport.height}`,
      resolution: options.resolution,
    });
  }

  /**
   * Builds the layer stack and loads the sprite sheets.
   *
   * The renderer owns its assets on purpose: uploading images is backend-specific, and each backend
   * wants its own format. Progress is reported through the port so a loading screen can show real
   * numbers while this runs.
   */
  private async loadSheets(options: RendererInitOptions): Promise<void> {
    const loader = new AssetLoader<Texture>({
      loadTexture: async (path, definition) =>
        Assets.load<Texture>({
          alias: `sheet:${definition.file}`,
          src: assetUrl(path),
          // Pixel art must not be smoothed by the GPU: nearest-neighbour keeps 3x zoom sharp.
          data: { scaleMode: this.pixelated ? 'nearest' : 'linear' },
        }),
      ...(options.logger !== undefined ? { logger: options.logger } : {}),
      ...(options.onAssetProgress !== undefined ? { onProgress: options.onAssetProgress } : {}),
    });

    await loader.loadAll();
    const textures = TextureLibrary.from(loader);
    textures.setPixelated(this.pixelated);
    this.textures = textures;

    const objects = new ObjectLayerView(textures);
    this.objectLayer = objects;
    // Swap the object layer in at its correct position in the draw order, keeping the placeholder's
    // index so ground and decoration render before objects, actors, effects and world labels.
    const index = this.world.getChildIndex(this.layers.objects);
    this.world.removeChildAt(index);
    this.layers.objects = objects;
    this.world.addChildAt(objects, index);
  }

  apply(commands: readonly RenderCommand[]): void {
    for (const command of commands) {
      switch (command.type) {
        case 'viewport':
          this.viewport = command.viewport;
          break;

        case 'camera':
          this.camera = command.camera;
          break;

        case 'layer-added': {
          const view = new TileLayerView(command.layer, this.requireTextures(), TILE_SIZE);
          this.tileLayers.set(command.layer.id, view);
          this.mapColumns = Math.max(this.mapColumns, view.columns);
          this.mapRows = Math.max(this.mapRows, view.rows);
          this.layers[command.layer.role].addChild(view);
          break;
        }

        case 'layer-removed': {
          const view = this.tileLayers.get(command.id);
          if (view !== undefined) {
            this.tileLayers.delete(command.id);
            view.destroy({ children: true });
          }
          break;
        }

        case 'tiles-changed':
          this.tileLayers.get(command.layerId)?.applyTileChanges(command.changes);
          break;

        case 'object-added':
          this.requireObjectLayer().add(command.object);
          break;

        case 'object-removed':
          this.requireObjectLayer().remove(command.id);
          break;

        case 'actor-added':
        case 'actor-changed': {
          const sprite = this.actorSprite(
            command.actor.id,
            command.actor.appearance,
            command.actor.layer,
          );
          sprite.applyState(
            command.actor.position,
            command.actor.facing,
            command.actor.animationState,
          );
          break;
        }

        case 'actor-removed': {
          const sprite = this.actorSprites.get(command.id);
          if (sprite !== undefined) {
            this.actorSprites.delete(command.id);
            sprite.destroy({ children: true });
          }
          break;
        }

        case 'effect-added':
          this.addEffect(command.effect);
          break;

        case 'effect-removed':
          this.removeEffect(command.id);
          break;

        case 'ui-added':
        case 'ui-changed':
          this.upsertLabel(command.element);
          break;

        case 'ui-removed':
          this.removeLabel(command.id);
          break;
      }
    }
  }

  /**
   * Draws one frame: camera, culling, animation, draw - in that order.
   *
   * Culling before drawing is what makes a large zone cheap, and animation uses the real delta so a
   * walk cycle looks identical on a 60 Hz laptop and a 144 Hz monitor.
   */
  render(deltaSeconds: number): RenderStats {
    const app = this.app;
    if (app === undefined) {
      throw new RealmError('invalid_state', 'PixiRenderer.render() was called before init()');
    }

    this.world.position.set(
      this.viewport.width / 2 - this.camera.x * this.camera.zoom,
      this.viewport.height / 2 - this.camera.y * this.camera.zoom,
    );
    this.world.scale.set(this.camera.zoom);

    // Until the map arrives there is no size to cull against; the stage simply stays empty.
    const hasMap = this.mapColumns > 0 && this.mapRows > 0;
    const range: TileRange = hasMap
      ? visibleTileRange(
          this.camera,
          this.viewport,
          this.mapColumns,
          this.mapRows,
          CULL_MARGIN_TILES,
        )
      : { minColumn: 0, minRow: 0, maxColumn: -1, maxRow: -1 };

    let visibleTiles = 0;
    for (const view of this.tileLayers.values()) {
      visibleTiles += view.updateVisibility(range);
    }
    const visibleObjects = this.objectLayer?.updateVisibility(range) ?? 0;
    const visibleActors = this.updateActorVisibility(range);

    for (const sprite of this.actorSprites.values()) {
      sprite.advance(deltaSeconds);
    }
    for (const [id, effect] of [...this.effects]) {
      if (!effect.advance(deltaSeconds)) {
        this.removeEffect(id);
      }
    }

    // Labels follow the actors they are pinned to, so a name never drifts away from its character.
    for (const { text, state } of this.labels.values()) {
      if (state.followActorId === undefined) {
        continue;
      }
      const actor = this.actorSprites.get(state.followActorId);
      if (actor !== undefined) {
        // Sit the label above the character's head, with the offset kept constant on screen (the world
        // container is zoomed, so a screen-space offset must be divided by that zoom).
        text.position.set(actor.x, actor.y - ACTOR_HEAD_OFFSET_PX);
        text.y -= state.offsetY / this.camera.zoom;
      }
    }

    app.render();

    return {
      visibleTiles,
      visibleObjects,
      visibleActors,
      visibleEffects: this.effects.size,
    };
  }

  resize(viewport: Viewport, resolution: number): void {
    this.viewport = { width: Math.max(1, viewport.width), height: Math.max(1, viewport.height) };
    // PixiJS keeps the backing store in device pixels (CSS size x resolution) while all game maths
    // stays in CSS pixels, which is what makes resize + device pixel ratio a single call here.
    this.app?.renderer.resize(this.viewport.width, this.viewport.height, resolution);
  }

  setPixelated(pixelated: boolean): void {
    this.pixelated = pixelated;
    this.textures?.setPixelated(pixelated);
    if (this.app !== undefined) {
      // Note: crispness comes from the per-sprite `roundPixels` option (see the sprite views) plus the
      // texture scale mode; `renderer.roundPixels` is read-only in PixiJS v8.
    }
  }

  destroy(): void {
    for (const id of [...this.effects.keys()]) {
      this.removeEffect(id);
    }
    for (const sprite of this.actorSprites.values()) {
      sprite.destroy({ children: true });
    }
    this.actorSprites.clear();
    for (const label of this.labels.values()) {
      label.text.destroy();
    }
    this.labels.clear();
    for (const view of this.tileLayers.values()) {
      view.destroy({ children: true });
    }
    this.tileLayers.clear();

    // `releaseGlobalResources` also drains PixiJS's shared caches and pools: recreating a renderer in
    // the same tab (hot reload, restarting the client) must not inherit stale GPU state.
    this.app?.destroy({ removeView: false, releaseGlobalResources: true }, { children: true });
    this.app = undefined;
  }

  // ------------------------------------------------------------------ internals

  private actorSprite(id: string, appearance: string, layer: ActorState['layer']): ActorSprite {
    const existing = this.actorSprites.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const sprite = new ActorSprite(appearance, this.requireTextures());
    this.actorSprites.set(id, sprite);
    // Game data, not ID naming conventions, decides whether an actor is a player or an NPC.
    this.layers[layer].addChild(sprite);
    return sprite;
  }

  private updateActorVisibility(range: TileRange): number {
    let visible = 0;
    for (const sprite of this.actorSprites.values()) {
      const column = Math.floor(sprite.x / TILE_SIZE);
      const row = Math.floor(sprite.y / TILE_SIZE);
      const inside =
        column >= range.minColumn - CULL_MARGIN_TILES &&
        column <= range.maxColumn + CULL_MARGIN_TILES &&
        row >= range.minRow - CULL_MARGIN_TILES &&
        row <= range.maxRow + CULL_MARGIN_TILES;
      sprite.visible = inside;
      if (inside) {
        visible += 1;
      }
    }
    return visible;
  }

  /**
   * Adds an effect under the id the scene gave it.
   *
   * The scene id is used verbatim so that `effect-removed` (which the session decides when the
   * effect's lifetime is over) finds the sprite. The lifetime comes from the scene entry too: the
   * session owns when an effect ends, the renderer only animates frames.
   */
  private addEffect(effect: EffectState): void {
    if (this.effects.has(effect.id)) {
      return;
    }
    const sprite = new EffectSprite(
      effect.effect,
      effect.position,
      effect.lifetimeSeconds,
      this.requireTextures(),
      SHEETS.effects.columns,
    );
    this.effects.set(effect.id, sprite);
    this.layers.effects.addChild(sprite);
  }

  private removeEffect(id: string): void {
    const effect = this.effects.get(id);
    if (effect !== undefined) {
      this.effects.delete(id);
      effect.destroy();
    }
  }

  private upsertLabel(state: WorldUiState): void {
    const existing = this.labels.get(state.id);
    if (existing !== undefined) {
      existing.state = state;
      if (existing.text.text !== state.text) {
        existing.text.text = state.text;
      }
      return;
    }

    const text = new Text({
      text: state.text,
      style: {
        // System font only: no network request, no font licence, and it respects OS settings.
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: 8,
        fill: 0xffffff,
        // An outline keeps the name readable over grass, water and cloud alike.
        stroke: { color: 0x1a1620, width: 2 },
        align: 'center',
      },
      anchor: { x: 0.5, y: 1 },
      roundPixels: true,
    } satisfies TextOptions);
    text.label = `label:${state.id}`;
    text.eventMode = 'none';
    text.position.set(
      (state.position.x + 0.5) * TILE_SIZE,
      (state.position.y + 1) * TILE_SIZE - ACTOR_HEAD_OFFSET_PX - state.offsetY / this.camera.zoom,
    );
    this.labels.set(state.id, { text, state });
    this.layers['world-ui'].addChild(text);
  }

  private removeLabel(id: string): void {
    const label = this.labels.get(id);
    if (label !== undefined) {
      this.labels.delete(id);
      label.text.destroy();
    }
  }

  private requireTextures(): TextureLibrary {
    if (this.textures === undefined) {
      throw new RealmError(
        'invalid_state',
        'Renderer textures are not attached yet (attachTextures)',
      );
    }
    return this.textures;
  }

  private requireObjectLayer(): ObjectLayerView {
    if (this.objectLayer === undefined) {
      throw new RealmError(
        'invalid_state',
        'Renderer textures are not attached yet (attachTextures)',
      );
    }
    return this.objectLayer;
  }
}

/**
 * PixiJS reports the backend it actually picked as a number (`renderer.type`); the HUD shows the name
 * verbatim, so a device that fell back to the canvas renderer says so instead of pretending otherwise.
 */
const BACKEND_NAMES = new Map<number, string>([
  [RendererType.WEBGL, 'webgl'],
  [RendererType.WEBGPU, 'webgpu'],
  [RendererType.CANVAS, 'canvas'],
]);

function backendNameOf(app: Application): string {
  return BACKEND_NAMES.get(app.renderer.type) ?? 'unknown';
}

// Default filtering for any texture created outside the texture library (a future effect, an atlas
// loaded by hand): hard pixels, matching the rest of the world. Sheets still override it on demand.
TextureStyle.defaultOptions.scaleMode = 'nearest';
