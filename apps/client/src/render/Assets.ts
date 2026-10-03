import { RealmError } from '@project-realm/shared';
import type { Logger } from '@project-realm/shared';
import {
  SHEETS,
  SHEET_KEYS,
  type SheetDefinition,
  type SheetFrame,
  type SheetKey,
} from './manifests';

/**
 * Asset loading for the world renderer.
 *
 * Two jobs, both deliberately outside PixiJS:
 *   1. load every sheet named in the manifest, reporting progress that is real (files finished, not a
 *      timer or a guess), so the loading screen cannot lie about what is happening;
 *   2. validate a frame rectangle against the texture it belongs to before anything is drawn.
 *
 * The actual image decoding is injected (`loadTextures`), which keeps this module testable in Node
 * and keeps the dependency on PixiJS's loader in exactly one place.
 */

/** A loaded image, reduced to what the loader and the frame validation need. */
export interface LoadedTexture {
  readonly width: number;
  readonly height: number;
}

/** Sheet textures, keyed by sheet. */
export type LoadedSheets = Readonly<Record<SheetKey, LoadedTexture>>;

export interface AssetProgress {
  /** Sheets finished so far. */
  readonly loaded: number;
  readonly total: number;
  /** 0..1, derived from the two numbers above. */
  readonly ratio: number;
  /** What is being loaded right now - a real file path, shown to the player. */
  readonly current: string;
}

export interface AssetLoaderOptions<TTexture extends LoadedTexture> {
  /**
   * Loads one sheet and resolves to a texture. The default implementation uses PixiJS's `Assets`;
   * tests inject a double.
   */
  readonly loadTexture: (path: string, sheet: SheetDefinition) => Promise<TTexture>;
  readonly onProgress?: (progress: AssetProgress) => void;
  readonly logger?: Logger;
  /** Defaults to the manifest's sheets; injectable so tests can use tiny fakes. */
  readonly sheets?: Readonly<Record<string, SheetDefinition>>;
}

export class AssetLoader<TTexture extends LoadedTexture> {
  private readonly options: AssetLoaderOptions<TTexture>;
  private readonly loaded = new Map<SheetKey, TTexture>();

  constructor(options: AssetLoaderOptions<TTexture>) {
    this.options = options;
  }

  /**
   * Loads every sheet, in manifest order, reporting progress after each one.
   *
   * Errors are wrapped into a {@link RealmError} with the offending path: a missing or corrupt asset
   * must stop the world from starting with a message that says which file is at fault, instead of
   * leaving players on a half-drawn map.
   */
  async loadAll(): Promise<LoadedSheets> {
    const sheets = (this.options.sheets ?? SHEETS) as Readonly<Record<string, SheetDefinition>>;
    const keys = Object.keys(sheets) as SheetKey[];
    const total = keys.length;

    for (const [index, key] of keys.entries()) {
      const definition = sheets[key];
      if (definition === undefined) {
        continue;
      }
      this.options.onProgress?.({
        loaded: index,
        total,
        ratio: index / total,
        current: definition.file,
      });

      try {
        const texture = await this.options.loadTexture(definition.file, definition);
        this.loaded.set(key, texture);
      } catch (error) {
        throw new RealmError('invalid_state', `Could not load asset "${definition.file}"`, {
          cause: error,
          context: { file: definition.file, sheet: key },
        });
      }
      this.options.logger?.debug('asset loaded', { sheet: key, file: definition.file });
    }

    this.options.onProgress?.({ loaded: total, total, ratio: 1, current: '' });
    return Object.fromEntries(this.loaded) as unknown as LoadedSheets;
  }

  get(sheet: SheetKey): TTexture {
    const texture = this.loaded.get(sheet);
    if (texture === undefined) {
      throw new RealmError('invalid_state', `Sheet "${sheet}" was requested before it was loaded`, {
        context: { sheet },
      });
    }
    return texture;
  }

  /**
   * Checks a frame rectangle against the texture it comes from.
   *
   * This is the guard that keeps the manifest and the asset generator from drifting apart: a frame
   * outside its sheet means the art was regenerated with a different layout, and the honest reaction
   * is to refuse to draw rather than to show sliced-up sprites.
   */
  frameIsInsideSheet(frame: SheetFrame): boolean {
    const texture = this.get(frame.sheet);
    return (
      frame.x >= 0 &&
      frame.y >= 0 &&
      frame.width > 0 &&
      frame.height > 0 &&
      frame.x + frame.width <= texture.width &&
      frame.y + frame.height <= texture.height
    );
  }

  /** Used by tests and by the loading screen to describe a sheet. */
  static sheetFile(key: SheetKey): string {
    return SHEETS[key].file;
  }
}

/** Every sheet path, in load order. Useful for preload hints or a build-time check. */
export function sheetFiles(): readonly string[] {
  return SHEET_KEYS.map((key) => SHEETS[key].file);
}
