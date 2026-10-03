import type { MapData, MapRectangle, ObjectData, TileLayer } from '../protocol/world';
import type { Position } from './position';

/** Narrow, renderer-independent physics port shared by the client and server. */
export interface CollisionResolver {
  resolveMovement(current: Position, desired: Position): Position;
}

export interface TileCollisionOptions {
  readonly map: MapData;
  /** Player body margin inside its logical 1x1-tile footprint; defaults to 0.15 tiles. */
  readonly bodyInset?: number;
  /** Maximum sweep distance in tiles, preventing a fast step tunnelling through thin obstacles. */
  readonly maxSweepStep?: number;
}

/**
 * Collision resolver for validated shared map data.
 *
 * Movement is blocked by semantic tile definitions (e.g. water), the explicit collision layer, object
 * colliders (e.g. rocks and buildings), and the map boundary. The renderer is not involved, so the
 * client and server apply the same world rules.
 */
export class TileCollision implements CollisionResolver {
  private readonly map: MapData;
  private readonly tileLayers: readonly TileLayer[];
  private readonly tileBlocking = new Map<string, boolean>();
  private readonly collisionMask: readonly boolean[];
  private readonly objects: readonly ObjectData[];
  private readonly bodyInset: number;
  private readonly maxSweepStep: number;

  constructor(options: TileCollisionOptions) {
    const bodyInset = options.bodyInset ?? 0.15;
    if (!Number.isFinite(bodyInset) || bodyInset < 0 || bodyInset >= 0.5) {
      throw new RangeError(`TileCollision: bodyInset must be in [0, 0.5), got ${bodyInset}`);
    }

    const maxSweepStep = options.maxSweepStep ?? 0.1;
    if (!Number.isFinite(maxSweepStep) || maxSweepStep <= 0) {
      throw new RangeError(`TileCollision: maxSweepStep must be > 0, got ${maxSweepStep}`);
    }

    this.map = options.map;
    this.bodyInset = bodyInset;
    this.maxSweepStep = maxSweepStep;
    this.tileLayers = options.map.layers.filter(
      (layer): layer is TileLayer => layer.kind === 'tile',
    );
    for (const tile of options.map.tileData) {
      this.tileBlocking.set(tile.id, tile.blocksMovement);
    }
    const collisionLayer = options.map.layers.find((layer) => layer.kind === 'collision');
    this.collisionMask = collisionLayer?.kind === 'collision' ? collisionLayer.solid : [];
    this.objects = options.map.layers.flatMap((layer) =>
      layer.kind === 'objects' ? layer.objects : [],
    );
  }

  /** True when the inset player body fits in the boundary and overlaps no solid data. */
  canOccupy(position: Position): boolean {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return false;
    }

    const left = position.x + this.bodyInset;
    const top = position.y + this.bodyInset;
    const right = position.x + 1 - this.bodyInset;
    const bottom = position.y + 1 - this.bodyInset;
    const boundary = this.map.bounds;
    if (
      left < boundary.x ||
      top < boundary.y ||
      right > boundary.x + boundary.width ||
      bottom > boundary.y + boundary.height
    ) {
      return false;
    }

    const firstColumn = Math.floor(left);
    const lastColumn = Math.floor(right - Number.EPSILON * Math.max(1, Math.abs(right)));
    const firstRow = Math.floor(top);
    const lastRow = Math.floor(bottom - Number.EPSILON * Math.max(1, Math.abs(bottom)));
    for (let row = firstRow; row <= lastRow; row += 1) {
      for (let column = firstColumn; column <= lastColumn; column += 1) {
        if (this.isTileBlocked(column, row)) {
          return false;
        }
      }
    }

    return !this.overlapsObjectCollider({ left, top, right, bottom });
  }

  /**
   * Sweeps from the current position to the desired position and stops at the last safe sample.
   *
   * The fixed timestep keeps ordinary movement below a quarter tile per step; the sweep also prevents
   * a future caller from tunnelling through a wall or object with a large displacement.
   */
  resolveMovement(current: Position, desired: Position): Position {
    if (
      !Number.isFinite(current.x) ||
      !Number.isFinite(current.y) ||
      !Number.isFinite(desired.x) ||
      !Number.isFinite(desired.y)
    ) {
      return current;
    }

    const deltaX = desired.x - current.x;
    const deltaY = desired.y - current.y;
    const distance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
    const steps = Math.max(1, Math.ceil(distance / this.maxSweepStep));
    let lastSafe = current;

    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      const candidate = {
        x: current.x + deltaX * ratio,
        y: current.y + deltaY * ratio,
      };
      if (!this.canOccupy(candidate)) {
        break;
      }
      lastSafe = candidate;
    }

    return lastSafe;
  }

  private isTileBlocked(column: number, row: number): boolean {
    if (column < 0 || row < 0 || column >= this.map.columns || row >= this.map.rows) {
      return true;
    }

    const index = row * this.map.columns + column;
    if (this.collisionMask[index] === true) {
      return true;
    }
    for (const layer of this.tileLayers) {
      const tileId = layer.tiles[index];
      if (tileId !== null && tileId !== undefined && this.tileBlocking.get(tileId) === true) {
        return true;
      }
    }
    return false;
  }

  private overlapsObjectCollider(body: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  }): boolean {
    for (const object of this.objects) {
      for (const collider of object.collision) {
        if (rectanglesOverlap(body, worldCollider(object, collider))) {
          return true;
        }
      }
    }
    return false;
  }
}

function worldCollider(object: ObjectData, collider: MapRectangle): MapRectangle {
  return {
    x: object.position.x + collider.x,
    y: object.position.y + collider.y,
    width: collider.width,
    height: collider.height,
  };
}

function rectanglesOverlap(
  body: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  },
  collider: MapRectangle,
): boolean {
  return (
    body.left < collider.x + collider.width &&
    body.right > collider.x &&
    body.top < collider.y + collider.height &&
    body.bottom > collider.y
  );
}
