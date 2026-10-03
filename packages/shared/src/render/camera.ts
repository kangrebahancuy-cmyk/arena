import { TILE_SIZE, type TileCoordinate } from './tileGrid';
import type { Position } from '../world/position';

/**
 * Camera maths, shared on purpose.
 *
 * The client uses it every frame to draw; the server will use the same functions in Phase 10 to
 * decide what each client is allowed to see (interest management). If the two sides computed
 * visibility differently, players would see gaps at the edge of the screen. Pure functions only - no
 * rendering library, no DOM.
 *
 * Coordinate spaces (all three appear in the renderer, always in this order):
 *
 *   world tiles  --(x TILE_SIZE)-->  world pixels  --(camera + zoom)-->  screen pixels (CSS)
 */
export type WorldPoint = Position;

/** The camera centre in **world pixels**, plus zoom. */
export interface CameraState {
  readonly x: number;
  readonly y: number;
  /** 1 = one world pixel per screen pixel. Must be > 0. */
  readonly zoom: number;
}

/** The visible rectangle in **screen pixels** (CSS pixels, not device pixels - see the client's DPR handling). */
export interface CameraViewport {
  readonly width: number;
  readonly height: number;
}

/** An axis-aligned rectangle in world pixels. */
export interface WorldBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Inclusive range of tile indices that intersect the viewport. */
export interface TileRange {
  readonly minColumn: number;
  readonly minRow: number;
  readonly maxColumn: number;
  readonly maxRow: number;
}

/**
 * Position and scale for the container that holds the world.
 *
 * Apply it to a container whose children are placed in world pixels and the camera is done:
 * `container.position.set(t.x, t.y); container.scale.set(t.scale)`.
 */
export function computeCameraTransform(
  camera: CameraState,
  viewport: CameraViewport,
): { x: number; y: number; scale: number } {
  return {
    x: viewport.width / 2 - camera.x * camera.zoom,
    y: viewport.height / 2 - camera.y * camera.zoom,
    scale: camera.zoom,
  };
}

export function worldToScreen(
  point: WorldPoint,
  camera: CameraState,
  viewport: CameraViewport,
): Position {
  return {
    x: (point.x - camera.x) * camera.zoom + viewport.width / 2,
    y: (point.y - camera.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(
  point: Position,
  camera: CameraState,
  viewport: CameraViewport,
): Position {
  return {
    x: (point.x - viewport.width / 2) / camera.zoom + camera.x,
    y: (point.y - viewport.height / 2) / camera.zoom + camera.y,
  };
}

/** The world-pixel rectangle currently visible. Everything outside it may be skipped entirely. */
export function visibleWorldBounds(camera: CameraState, viewport: CameraViewport): WorldBounds {
  const halfWidth = viewport.width / (2 * camera.zoom);
  const halfHeight = viewport.height / (2 * camera.zoom);
  return {
    minX: camera.x - halfWidth,
    minY: camera.y - halfHeight,
    maxX: camera.x + halfWidth,
    maxY: camera.y + halfHeight,
  };
}

/**
 * Which tiles to draw, clamped to the map and optionally widened by a margin.
 *
 * The margin matters for objects that overhang their tile (a 32x32 tree on a 16x16 tile): without it,
 * trees would pop in at the screen edge.
 */
export function visibleTileRange(
  camera: CameraState,
  viewport: CameraViewport,
  columns: number,
  rows: number,
  marginTiles = 1,
): TileRange {
  const bounds = visibleWorldBounds(camera, viewport);
  return {
    minColumn: Math.max(0, Math.floor(bounds.minX / TILE_SIZE) - marginTiles),
    minRow: Math.max(0, Math.floor(bounds.minY / TILE_SIZE) - marginTiles),
    maxColumn: Math.min(columns - 1, Math.ceil(bounds.maxX / TILE_SIZE) + marginTiles),
    maxRow: Math.min(rows - 1, Math.ceil(bounds.maxY / TILE_SIZE) + marginTiles),
  };
}

/** True when a tile lies inside a range (used by layer views to skip off-screen work). */
export function isTileInRange(tile: TileCoordinate, range: TileRange): boolean {
  return (
    tile.column >= range.minColumn &&
    tile.column <= range.maxColumn &&
    tile.row >= range.minRow &&
    tile.row <= range.maxRow
  );
}
