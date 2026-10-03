import { isRealmError } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
import { AssetLoader, sheetFiles } from './Assets';
import type { AssetProgress, LoadedTexture } from './Assets';
import { SHEETS } from './manifests';
import type { SheetDefinition } from './manifests';

/** A sheet definition small enough to reason about, so tests do not depend on the real art. */
const TEST_SHEETS = {
  tileset: {
    file: 'assets/tileset.png',
    frameWidth: 16,
    frameHeight: 16,
    layout: 'strip',
    columns: 2,
    rows: 1,
    ids: ['a', 'b'],
    description: 'test',
  },
  objects: {
    file: 'assets/objects.png',
    frameWidth: 8,
    frameHeight: 8,
    layout: 'strip',
    columns: 1,
    rows: 1,
    ids: ['o'],
    description: 'test',
  },
} as const satisfies Record<string, SheetDefinition>;

function loaderWith(
  loadTexture: (path: string) => Promise<LoadedTexture>,
  onProgress?: (progress: AssetProgress) => void,
): AssetLoader<LoadedTexture> {
  return new AssetLoader<LoadedTexture>({
    loadTexture,
    sheets: TEST_SHEETS,
    ...(onProgress !== undefined ? { onProgress } : {}),
  });
}

describe('AssetLoader', () => {
  it('loads every sheet and hands them out by key', async () => {
    const loader = loaderWith(() => Promise.resolve({ width: 32, height: 16 }));
    await loader.loadAll();

    expect(loader.get('tileset')).toEqual({ width: 32, height: 16 });
    expect(loader.get('objects')).toEqual({ width: 32, height: 16 });
  });

  it('reports progress that matches the real work done', async () => {
    const progress: AssetProgress[] = [];
    const loader = loaderWith(
      () => Promise.resolve({ width: 8, height: 8 }),
      (entry) => progress.push(entry),
    );
    await loader.loadAll();

    // Reported before each download (with the file it is about to read) and once at the end...
    expect(progress.map((entry) => entry.loaded)).toEqual([0, 1, 2]);
    // ...so the ratio never claims work that has not finished.
    expect(progress.at(-1)).toEqual({ loaded: 2, total: 2, ratio: 1, current: '' });
    expect(progress[0]?.current).toBe('assets/tileset.png');
  });

  it('refuses to hand out a sheet that was never loaded', () => {
    const loader = loaderWith(() => Promise.resolve({ width: 8, height: 8 }));
    let caught: unknown;
    try {
      loader.get('objects');
    } catch (error) {
      caught = error;
    }
    expect(isRealmError(caught)).toBe(true);
  });

  it('wraps a failed download in a RealmError that names the file', async () => {
    const loader = loaderWith((path) =>
      path.includes('objects')
        ? Promise.reject(new Error('404'))
        : Promise.resolve({ width: 8, height: 8 }),
    );

    let caught: unknown;
    try {
      await loader.loadAll();
    } catch (error) {
      caught = error;
    }

    expect(isRealmError(caught)).toBe(true);
    expect((caught as Error).message).toContain('assets/objects.png');
  });

  it('validates a frame against the texture it came from', async () => {
    const loader = loaderWith(() => Promise.resolve({ width: 32, height: 16 }));
    await loader.loadAll();

    expect(
      loader.frameIsInsideSheet({ sheet: 'tileset', x: 16, y: 0, width: 16, height: 16 }),
    ).toBe(true);
    // One pixel past the right edge: the art was regenerated with a different layout.
    expect(
      loader.frameIsInsideSheet({ sheet: 'tileset', x: 17, y: 0, width: 16, height: 16 }),
    ).toBe(false);
    expect(
      loader.frameIsInsideSheet({ sheet: 'tileset', x: -1, y: 0, width: 16, height: 16 }),
    ).toBe(false);
    expect(loader.frameIsInsideSheet({ sheet: 'tileset', x: 0, y: 0, width: 0, height: 16 })).toBe(
      false,
    );
  });

  it('lists the real sheet paths, in manifest order', () => {
    expect(sheetFiles()).toEqual([
      SHEETS.tileset.file,
      SHEETS.objects.file,
      SHEETS.actors.file,
      SHEETS.effects.file,
    ]);
    expect(AssetLoader.sheetFile('actors')).toBe(SHEETS.actors.file);
  });
});
