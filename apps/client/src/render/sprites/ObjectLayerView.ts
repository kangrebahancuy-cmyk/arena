import { Container, Sprite } from 'pixi.js';
import { TILE_SIZE, type TileRange } from '@project-realm/shared';
import { objectFrame } from '../manifests';
import type { ObjectState } from '../scene';
import type { TextureLibrary } from '../textures';

/**
 * The world-object layer: trees, rocks, bushes.
 *
 * Two things make this layer more than a pile of pictures:
 *
 *   - **Depth sorting.** Objects are anchored at the bottom of their tile and sorted by that y
 *     position, so a character standing below a tree is drawn in front of it and one standing above
 *     is drawn behind. That is the classic 2.5D trick and it is why the layer keeps
 *     `sortableChildren` on.
 *   - **Culling.** Objects whose tile is off screen are hidden, so a large zone with hundreds of
 *     trees costs nothing while the player is elsewhere.
 */
export class ObjectLayerView extends Container {
  private readonly sprites = new Map<string, Sprite>();
  private readonly textures: TextureLibrary;

  constructor(textures: TextureLibrary) {
    super();
    this.textures = textures;
    this.label = 'objects';
    this.eventMode = 'none';
    // Sort children by zIndex whenever a child is added or its zIndex changes (depth order).
    this.sortableChildren = true;
  }

  add(state: ObjectState): void {
    if (this.sprites.has(state.id)) {
      return;
    }
    const sprite = new Sprite({
      texture: this.textures.frame(objectFrame(state.sprite)),
      anchor: { x: 0.5, y: 1 },
      roundPixels: true,
    });
    // Map data gives the bottom-centre anchor; sprite size and its atlas frame stay renderer concerns.
    const x = state.position.x * TILE_SIZE;
    const y = state.position.y * TILE_SIZE;
    sprite.position.set(x, y);
    sprite.zIndex = y;
    this.sprites.set(state.id, sprite);
    this.addChild(sprite);
  }

  remove(id: string): void {
    const sprite = this.sprites.get(id);
    if (sprite === undefined) {
      return;
    }
    this.sprites.delete(id);
    sprite.destroy();
  }

  /**
   * Shows the objects standing inside the visible tile range.
   *
   * Objects can be up to two tiles tall (32 px on a 16 px tile), so the caller passes the tile range
   * already widened by a margin; this method only compares tile coordinates.
   */
  updateVisibility(range: TileRange, marginTiles = 2): number {
    let visible = 0;
    for (const sprite of this.sprites.values()) {
      const column = Math.floor(sprite.x / TILE_SIZE);
      const row = Math.floor(sprite.y / TILE_SIZE) - 1;
      const inside =
        column >= range.minColumn - marginTiles &&
        column <= range.maxColumn + marginTiles &&
        row >= range.minRow - marginTiles &&
        row <= range.maxRow + marginTiles;
      sprite.visible = inside;
      if (inside) {
        visible += 1;
      }
    }
    return visible;
  }

  get size(): number {
    return this.sprites.size;
  }
}
