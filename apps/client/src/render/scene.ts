import type { CameraState, Direction, Position, TileId } from '@project-realm/shared';

/**
 * The scene the renderer draws, described as data, plus the commands that change it.
 *
 * Why not let game code reach into the renderer: this is the seam that keeps the renderer
 * replaceable. `WorldSession` (game logic) owns the scene, `diffScene` computes the smallest set of
 * commands that turns the previous snapshot into the current one, and whatever implements
 * `WorldRenderer` (PixiJS today) applies them. Nothing in the game imports PixiJS, and the diff is a
 * pure function that is unit-tested without a GPU.
 */

/** Draw order. Every layer is drawn in this order, and later phases slot into it without renumbering. */
export const RENDER_LAYERS = [
  'ground',
  'decoration',
  'objects',
  'characters',
  'npcs',
  'monsters',
  'effects',
  'world-ui',
] as const;

export type RenderLayerId = (typeof RENDER_LAYERS)[number];

/** A tile layer in world space: one map layer, in pixels, ready to draw. */
export interface TileLayerState {
  readonly id: string;
  /** Which world draw-order group this tilemap layer belongs to. */
  readonly role: 'ground' | 'decoration';
  /**
   * `row * columns + column`; null draws nothing.
   *
   * Mutable on purpose: the session owns the map data and can edit it through `tiles-changed`
   * patches. Map tile IDs remain semantic until the renderer maps them to atlas frames.
   */
  readonly tiles: (TileId | null)[];
  readonly columns: number;
  readonly rows: number;
  readonly sheet: 'tileset';
}

export interface ObjectState {
  readonly id: string;
  readonly sprite: string;
  readonly layer: 'objects';
  /** Tile-space bottom-centre anchor; sprite dimensions stay a rendering concern. */
  readonly position: Position;
}

export type ActorLayer = 'characters' | 'npcs' | 'monsters';
export type ActorAnimationState = 'idle' | 'walk' | 'attack' | 'hurt' | 'dead';

export interface ActorState {
  readonly id: string;
  /** Which appearance on the actor sheet. */
  readonly appearance: string;
  readonly layer: ActorLayer;
  /** Position in TILE units (world coordinates), so movement is smooth between tiles. */
  readonly position: Position;
  readonly facing: Direction;
  readonly moving: boolean;
  readonly animationState: ActorAnimationState;
  /** Optional name shown above the actor on the world-ui layer. */
  readonly name?: string | undefined;
}

export interface EffectState {
  readonly id: string;
  readonly effect: string;
  readonly position: Position;
  /** Seconds since the effect started. The renderer picks the animation frame from this. */
  readonly ageSeconds: number;
  readonly lifetimeSeconds: number;
}

export interface WorldUiState {
  readonly id: string;
  readonly text: string;
  /** World position (tile units) the label is pinned above. */
  readonly position: Position;
  /** Vertical offset in screen pixels, so the label clears the sprite head at any zoom. */
  readonly offsetY: number;
  /** When set, the label follows this actor instead of staying where it was created. */
  readonly followActorId?: string | undefined;
}

/**
 * Everything the renderer needs to draw one frame.
 *
 * The collections are mutable `Map`s because the session owns the scene and replaces entries in
 * place; `diffScene` takes them as `ReadonlyMap` so consumers (and tests) cannot mutate them by
 * accident. `snapshotOf` in `WorldSession` copies the maps for exactly this reason.
 */
export interface WorldScene {
  readonly layers: readonly TileLayerState[];
  readonly objects: Map<string, ObjectState>;
  readonly actors: Map<string, ActorState>;
  readonly effects: Map<string, EffectState>;
  readonly ui: Map<string, WorldUiState>;
}

export function emptyScene(): WorldScene {
  return { layers: [], objects: new Map(), actors: new Map(), effects: new Map(), ui: new Map() };
}

/** Size of the drawing surface, in CSS pixels (device pixels are the renderer's business). */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

export type RenderCommand =
  | { readonly type: 'viewport'; readonly viewport: Viewport }
  | { readonly type: 'camera'; readonly camera: CameraState }
  | { readonly type: 'layer-added'; readonly layer: TileLayerState }
  | { readonly type: 'layer-removed'; readonly id: string }
  | {
      readonly type: 'tiles-changed';
      readonly layerId: string;
      readonly changes: readonly {
        readonly column: number;
        readonly row: number;
        readonly tileId: TileId | null;
      }[];
    }
  | { readonly type: 'object-added'; readonly object: ObjectState }
  | { readonly type: 'object-removed'; readonly id: string }
  | { readonly type: 'actor-added'; readonly actor: ActorState }
  | { readonly type: 'actor-changed'; readonly actor: ActorState }
  | { readonly type: 'actor-removed'; readonly id: string }
  | { readonly type: 'effect-added'; readonly effect: EffectState }
  | { readonly type: 'effect-removed'; readonly id: string }
  | { readonly type: 'ui-added'; readonly element: WorldUiState }
  | { readonly type: 'ui-changed'; readonly element: WorldUiState }
  | { readonly type: 'ui-removed'; readonly id: string };

/**
 * Computes the commands that turn `previous` into `next`.
 *
 * Entries are compared by object identity first: `WorldSession` replaces an entry object when (and
 * only when) something about it changed, so the common case - a still actor, an unmoved object - is
 * a pointer comparison and produces no commands at all. Values are compared as a fallback so a
 * caller that rebuilds a scene from scratch still gets a correct (if less optimal) diff.
 */
export function diffScene(previous: WorldScene, next: WorldScene): RenderCommand[] {
  const commands: RenderCommand[] = [];

  diffCollection(
    previous.objects,
    next.objects,
    commands,
    (object) => ({
      type: 'object-added',
      object,
    }),
    (id) => ({ type: 'object-removed', id }),
  );

  diffCollection(
    previous.actors,
    next.actors,
    commands,
    (actor, existedBefore) => ({ type: existedBefore ? 'actor-changed' : 'actor-added', actor }),
    (id) => ({ type: 'actor-removed', id }),
  );

  diffCollection(
    previous.effects,
    next.effects,
    commands,
    (effect) => ({
      type: 'effect-added',
      effect,
    }),
    (id) => ({ type: 'effect-removed', id }),
  );

  diffCollection(
    previous.ui,
    next.ui,
    commands,
    (element, existedBefore) => ({ type: existedBefore ? 'ui-changed' : 'ui-added', element }),
    (id) => ({ type: 'ui-removed', id }),
  );

  const previousLayers = new Map(previous.layers.map((layer) => [layer.id, layer]));
  for (const layer of next.layers) {
    if (!previousLayers.has(layer.id)) {
      commands.push({ type: 'layer-added', layer });
    }
  }
  for (const layer of previous.layers) {
    if (!next.layers.some((candidate) => candidate.id === layer.id)) {
      commands.push({ type: 'layer-removed', id: layer.id });
    }
  }

  return commands;
}

function diffCollection<T>(
  previous: ReadonlyMap<string, T>,
  next: ReadonlyMap<string, T>,
  commands: RenderCommand[],
  added: (value: T, existedBefore: boolean) => RenderCommand,
  removed: (id: string) => RenderCommand,
): void {
  for (const [id, value] of next) {
    const before = previous.get(id);
    if (before === value) {
      continue; // same object: nothing changed
    }
    if (before !== undefined && equalsEntry(before, value)) {
      continue; // equal values from a freshly built scene: still nothing to do
    }
    commands.push(added(value, before !== undefined));
  }
  for (const id of previous.keys()) {
    if (!next.has(id)) {
      commands.push(removed(id));
    }
  }
}

/** Structural comparison for the fallback path. Shallow, because scene entries are flat by design. */
function equalsEntry(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) {
    return false;
  }
  for (const key of keys) {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue === rightValue) {
      continue;
    }
    if (
      typeof leftValue === 'object' &&
      typeof rightValue === 'object' &&
      leftValue !== null &&
      rightValue !== null &&
      equalsEntry(leftValue, rightValue)
    ) {
      continue;
    }
    return false;
  }
  return true;
}
