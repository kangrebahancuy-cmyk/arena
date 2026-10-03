import { Container, Sprite } from 'pixi.js';
import type { TileRange } from '@project-realm/shared';
import type { TileLayerState } from '../scene';
import type { TextureLibrary } from '../textures';
import { tileFrame } from '../manifests';

/** Tiles per chunk edge. 16 x 16 tiles = 256 x 256 pixels of world space per chunk. */
export const CHUNK_TILES = 16;

/**
 * Draws one map layer, split into chunks.
 *
 * Why chunks: a 300x300 zone is 90 000 tiles, and one sprite object per tile would cost more in
 * JavaScript bookkeeping than in drawing. Grouping tiles into chunks means culling happens on tens of
 * containers instead of tens of thousands of sprites, and a tile change only rebuilds its own chunk.
 * Chunks are built the first time they become visible, so a session never pays for map it never sees.
 *
 * This is the structure tilemaps need (Phase 4): several layers, each culled, each able to change
 * individual tiles at runtime - here exercised by the fog clouds clearing as the player walks.
 */
export class TileLayerView extends Container {
  private readonly chunks = new Map<string, Container>();
  private readonly state: TileLayerState;
  private readonly textures: TextureLibrary;
  private readonly tileSize: number;
  private visibleChunks = 0;

  constructor(state: TileLayerState, textures: TextureLibrary, tileSize: number) {
    super();
    this.state = state;
    this.textures = textures;
    this.tileSize = tileSize;
    this.label = `tiles:${state.id}`;
    // Tiles never need hit testing; skipping it saves work in the interaction system.
    this.eventMode = 'none';
  }

  /** Rebuilds the chunks that a tile change touched. Called for fog reveal / map edits. */
  applyTileChanges(
    changes: readonly {
      readonly column: number;
      readonly row: number;
      readonly tileId: string | null;
    }[],
  ): void {
    const dirty = new Set<string>();
    for (const change of changes) {
      const column = Math.round(change.column);
      const row = Math.round(change.row);
      this.state.tiles[row * this.state.columns + column] = change.tileId;
      dirty.add(chunkKey(Math.floor(column / CHUNK_TILES), Math.floor(row / CHUNK_TILES)));
    }

    for (const key of dirty) {
      const chunk = this.chunks.get(key);
      if (chunk !== undefined) {
        chunk.destroy({ children: true });
        this.chunks.delete(key);
      }
    }
  }

  /**
   * Shows only the chunks that intersect the viewport.
   *
   * Returns how many tiles are actually on screen, which is a real number for the debug HUD (and the
   * honest way to show that culling is working, rather than claiming a sprite count).
   */
  updateVisibility(range: TileRange): number {
    let visible = 0;
    const minChunkX = Math.floor(range.minColumn / CHUNK_TILES);
    const maxChunkX = Math.floor(range.maxColumn / CHUNK_TILES);
    const minChunkY = Math.floor(range.minRow / CHUNK_TILES);
    const maxChunkY = Math.floor(range.maxRow / CHUNK_TILES);

    for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
        const chunk = this.chunkAt(chunkX, chunkY);
        if (chunk === undefined) {
          continue;
        }
        chunk.visible = true;
        visible += 1;
      }
    }

    // Hide the rest: chunks outside the viewport keep their sprites but are skipped by the renderer.
    for (const [key, chunk] of this.chunks) {
      const [chunkX, chunkY] = key.split(',').map(Number) as [number, number];
      const inside =
        chunkX >= minChunkX && chunkX <= maxChunkX && chunkY >= minChunkY && chunkY <= maxChunkY;
      chunk.visible = inside;
    }

    this.visibleChunks = visible;
    return this.countTilesInRange(range);
  }

  get visibleChunkCount(): number {
    return this.visibleChunks;
  }

  get columns(): number {
    return this.state.columns;
  }

  get rows(): number {
    return this.state.rows;
  }

  /** Number of drawn tiles inside a range - used by the debug stats. */
  countTilesInRange(range: TileRange): number {
    const columns = Math.max(
      0,
      Math.min(range.maxColumn, this.state.columns - 1) - range.minColumn + 1,
    );
    const rows = Math.max(0, Math.min(range.maxRow, this.state.rows - 1) - range.minRow + 1);
    return columns * rows;
  }

  /** Builds a chunk if it is inside the map and does not exist yet. */
  private chunkAt(chunkX: number, chunkY: number): Container | undefined {
    const maxChunkX = Math.ceil(this.state.columns / CHUNK_TILES) - 1;
    const maxChunkY = Math.ceil(this.state.rows / CHUNK_TILES) - 1;
    if (chunkX < 0 || chunkY < 0 || chunkX > maxChunkX || chunkY > maxChunkY) {
      return undefined;
    }

    const key = chunkKey(chunkX, chunkY);
    const existing = this.chunks.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const chunk = this.buildChunk(chunkX, chunkY);
    this.chunks.set(key, chunk);
    this.addChild(chunk);
    return chunk;
  }

  private buildChunk(chunkX: number, chunkY: number): Container {
    const chunk = new Container();
    chunk.label = `chunk:${chunkX},${chunkY}`;

    const startColumn = chunkX * CHUNK_TILES;
    const startRow = chunkY * CHUNK_TILES;
    const endColumn = Math.min(startColumn + CHUNK_TILES, this.state.columns);
    const endRow = Math.min(startRow + CHUNK_TILES, this.state.rows);

    for (let row = startRow; row < endRow; row += 1) {
      for (let column = startColumn; column < endColumn; column += 1) {
        const tileId = this.state.tiles[row * this.state.columns + column] ?? null;
        if (tileId === null) {
          continue; // Transparent decoration cells have no tile sprite.
        }
        const frame = tileFrame(tileId);
        if (frame === null) {
          continue; // unknown tile index: draw nothing rather than guess
        }
        const sprite = new Sprite({ texture: this.textures.frame(frame), roundPixels: true });
        sprite.position.set(column * this.tileSize, row * this.tileSize);
        chunk.addChild(sprite);
      }
    }

    return chunk;
  }
}

function chunkKey(chunkX: number, chunkY: number): string {
  return `${chunkX},${chunkY}`;
}
