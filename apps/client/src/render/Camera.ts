import {
  computeCameraTransform,
  screenToWorld,
  visibleTileRange,
  worldToScreen,
} from '@project-realm/shared';
import type {
  CameraState,
  CameraViewport,
  Position,
  TileRange,
  WorldBounds,
} from '@project-realm/shared';
import { visibleWorldBounds } from '@project-realm/shared';

export interface CameraOptions {
  readonly zoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /**
   * Time constant of the follow smoothing, in seconds: the time it takes to cover ~63% of the
   * remaining distance. 0 = locked to the target (the camera never lags), which is what tests use.
   */
  readonly followHalfLifeSeconds: number;
}

export const DEFAULT_CAMERA_OPTIONS: CameraOptions = {
  zoom: 3,
  minZoom: 1,
  maxZoom: 6,
  followHalfLifeSeconds: 0.12,
};

/** Zoom that keeps roughly 12-20 tiles visible across the shorter screen side, on any device. */
export function defaultZoomForViewport(viewport: CameraViewport): number {
  const shorterSide = Math.max(1, Math.min(viewport.width, viewport.height));
  return clamp(
    Math.round(shorterSide / 320) + 1,
    DEFAULT_CAMERA_OPTIONS.minZoom,
    DEFAULT_CAMERA_OPTIONS.maxZoom,
  );
}

/**
 * The camera: position, zoom and following, on top of the shared camera maths.
 *
 * It is stateful (smoothing needs the previous frame) but has no renderer dependency, so the whole
 * thing - follow, clamp, zoom limits - is unit-tested in Node.
 */
export class Camera {
  private state: CameraState;
  private viewport: CameraViewport = { width: 1, height: 1 };
  private readonly options: CameraOptions;

  constructor(options: Partial<CameraOptions> = {}) {
    this.options = { ...DEFAULT_CAMERA_OPTIONS, ...options };
    this.state = { x: 0, y: 0, zoom: this.options.zoom };
  }

  get snapshot(): CameraState {
    return this.state;
  }

  get zoom(): number {
    return this.state.zoom;
  }

  setViewport(viewport: CameraViewport): void {
    // A zero-sized viewport happens for one frame while a container is display:none; keeping 1x1 is
    // less surprising than dividing by zero inside the visible-bounds maths.
    this.viewport = { width: Math.max(1, viewport.width), height: Math.max(1, viewport.height) };
  }

  /** Jumps straight to a world position (start of the session, teleports, tests). */
  snapTo(position: Position): void {
    this.state = { ...this.state, x: position.x, y: position.y };
  }

  /**
   * Moves toward `target` by a fraction of the remaining distance.
   *
   * Frame-rate independent: the fraction is derived from the elapsed time, so a 144 Hz screen and a
   * 30 Hz screen reach the same place at the same moment (this is why it is exponential smoothing and
   * not `x += (target - x) * 0.1`, which would accelerate with frame rate).
   */
  follow(target: Position, deltaSeconds: number): void {
    const { followHalfLifeSeconds } = this.options;
    if (followHalfLifeSeconds <= 0 || deltaSeconds <= 0) {
      this.snapTo(target);
      return;
    }

    const alpha = 1 - Math.pow(2, -deltaSeconds / followHalfLifeSeconds);
    this.state = {
      ...this.state,
      x: this.state.x + (target.x - this.state.x) * alpha,
      y: this.state.y + (target.y - this.state.y) * alpha,
    };
  }

  setZoom(zoom: number): void {
    this.state = { ...this.state, zoom: clamp(zoom, this.options.minZoom, this.options.maxZoom) };
  }

  zoomBy(steps: number): void {
    this.setZoom(this.state.zoom + steps);
  }

  /**
   * Keeps the view inside the map, so the player never stares at empty space beyond the world edge.
   * When the map is smaller than the viewport on an axis, it is centred on that axis instead.
   */
  clampToMap(columns: number, rows: number, tileSize: number, marginTiles = 2): void {
    const halfWidth = this.viewport.width / (2 * this.state.zoom);
    const halfHeight = this.viewport.height / (2 * this.state.zoom);
    const mapWidth = columns * tileSize;
    const mapHeight = rows * tileSize;
    const margin = marginTiles * tileSize;

    this.state = {
      ...this.state,
      x: clampAxis(this.state.x, mapWidth, halfWidth, margin),
      y: clampAxis(this.state.y, mapHeight, halfHeight, margin),
    };
  }

  worldToScreen(point: Position): Position {
    return worldToScreen(point, this.state, this.viewport);
  }

  screenToWorld(point: Position): Position {
    return screenToWorld(point, this.state, this.viewport);
  }

  visibleBounds(): WorldBounds {
    return visibleWorldBounds(this.state, this.viewport);
  }

  visibleTileRange(columns: number, rows: number, marginTiles = 1): TileRange {
    return visibleTileRange(this.state, this.viewport, columns, rows, marginTiles);
  }

  /** Position + scale for the container that holds the world (see shared `computeCameraTransform`). */
  transform(): { x: number; y: number; scale: number } {
    return computeCameraTransform(this.state, this.viewport);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampAxis(value: number, mapSize: number, halfViewport: number, margin: number): number {
  const min = Math.min(halfViewport - margin, mapSize / 2);
  const max = Math.max(mapSize - halfViewport + margin, mapSize / 2);
  return clamp(value, min, max);
}
