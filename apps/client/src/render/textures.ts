import { Rectangle, Texture } from 'pixi.js';
import { RealmError } from '@project-realm/shared';
import type { AssetLoader, LoadedSheets } from './Assets';
import type { SheetFrame, SheetKey } from './manifests';

/**
 * Turns manifest frame rectangles into PixiJS textures.
 *
 * One GPU texture per sheet is uploaded; every frame is a cheap `Texture` that *shares* the sheet's
 * source and only differs by its frame rectangle. That is the whole point of a sprite sheet: one
 * upload, many sprites, batched into few draw calls.
 *
 * Every frame is validated against the loaded image before it is handed out, so a manifest that does
 * not match the generated art fails here - once, loudly - instead of drawing sliced-up sprites.
 */
export class TextureLibrary {
  private readonly cache = new Map<string, Texture>();
  private readonly sheets: LoadedSheets;
  private readonly loader: Pick<AssetLoader<Texture>, 'frameIsInsideSheet'>;

  constructor(sheets: LoadedSheets, loader: Pick<AssetLoader<Texture>, 'frameIsInsideSheet'>) {
    this.sheets = sheets;
    this.loader = loader;
  }

  static from(assets: AssetLoader<Texture>): TextureLibrary {
    // `loadAll()` resolves before the renderer is built, so the sheets are already in the loader.
    const sheets = {
      tileset: assets.get('tileset'),
      objects: assets.get('objects'),
      actors: assets.get('actors'),
      effects: assets.get('effects'),
    } as LoadedSheets;
    return new TextureLibrary(sheets, assets);
  }

  sheet(sheet: SheetKey): Texture {
    const texture = this.sheets[sheet];
    if (texture === undefined) {
      throw new RealmError('invalid_state', `Sheet "${sheet}" is not loaded`, {
        context: { sheet },
      });
    }
    return texture as Texture;
  }

  /** The texture for a frame, created once and reused. */
  frame(frame: SheetFrame): Texture {
    const key = `${frame.sheet}:${frame.x},${frame.y},${frame.width},${frame.height}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    if (!this.loader.frameIsInsideSheet(frame)) {
      const sheet = this.sheet(frame.sheet);
      throw new RealmError(
        'invalid_state',
        `Frame ${frame.x},${frame.y} ${frame.width}x${frame.height} of "${frame.sheet}" is outside the ${sheet.width}x${sheet.height} sheet. ` +
          'The sprite manifest and the generated art have drifted apart: run `npm run assets`.',
        { context: { sheet: frame.sheet } },
      );
    }

    const texture = new Texture({
      source: this.sheet(frame.sheet).source,
      label: frame.sheet,
      frame: new Rectangle(frame.x, frame.y, frame.width, frame.height),
    });
    // Nearest-neighbour or smooth filtering is a global switch (the "pixelated" toggle), applied to
    // sheet sources: one setting per uploaded image instead of one per frame.
    this.cache.set(key, texture);
    return texture;
  }

  /**
   * Switches filtering for every sheet at once.
   *
   * Pixel art wants `nearest` so scaling keeps hard edges; `linear` is the smoother look some players
   * prefer on high-DPI screens. Both are legitimate, so it is a setting, not a decision baked in.
   */
  setPixelated(pixelated: boolean): void {
    for (const sheet of Object.values(this.sheets) as Texture[]) {
      if (sheet !== undefined) {
        sheet.source.scaleMode = pixelated ? 'nearest' : 'linear';
      }
    }
  }

  /** Releases the frame textures owned here (sheet sources belong to the asset loader). */
  destroy(): void {
    for (const texture of this.cache.values()) {
      texture.destroy(false);
    }
    this.cache.clear();
  }
}
