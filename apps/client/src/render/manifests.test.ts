import type { Direction } from '@project-realm/shared';
import { describe, expect, it } from 'vitest';
// The generator is the source of truth for what is painted; these imports are its own layout
// constants (plain data, no file system, no Node built-ins), so this test fails the moment the
// manifest and the art disagree - the exact class of bug that a "6 frames declared, 5 painted"
// mismatch produces.
import {
  ACTOR_FACINGS,
  ACTOR_FRAME_HEIGHT,
  ACTOR_FRAME_WIDTH,
  ACTOR_FRAMES,
  ACTOR_ORDER,
} from '../../../../scripts/assets/actors.mjs';
import {
  EFFECT_FRAME_COUNT,
  EFFECT_FRAME_SIZE,
  EFFECT_ORDER,
} from '../../../../scripts/assets/effects.mjs';
import { OBJECT_ORDER, OBJECT_SIZE } from '../../../../scripts/assets/objects.mjs';
import { TILE_ORDER, TILE_SIZE } from '../../../../scripts/assets/tiles.mjs';
import {
  ACTOR_DIRECTION_ROWS,
  ACTOR_WALK_FRAMES,
  SHEETS,
  actorFrame,
  effectFrame,
  objectFrame,
  sheetPixelSize,
  sheetUrl,
  stripFrame,
  tileFrame,
} from './manifests';
import { AssetLoader } from './Assets';
import type { LoadedTexture } from './Assets';

/** The generator's facing names, narrowed to the game's Direction type with a runtime assertion. */
const GENERATOR_FACINGS = ACTOR_FACINGS.filter((facing): facing is Direction =>
  ['north', 'east', 'south', 'west'].includes(facing),
);
if (GENERATOR_FACINGS.length !== ACTOR_FACINGS.length) {
  throw new Error('the generator paints a facing the game does not know');
}

/** The size the generator produces for each sheet, derived from its own layout constants. */
const GENERATED_SHEET_SIZES = {
  tileset: { width: TILE_ORDER.length * TILE_SIZE, height: TILE_SIZE },
  objects: { width: OBJECT_ORDER.length * OBJECT_SIZE, height: OBJECT_SIZE },
  actors: {
    width: ACTOR_ORDER.length * ACTOR_FRAME_WIDTH * ACTOR_FRAMES,
    height: ACTOR_FACINGS.length * ACTOR_FRAME_HEIGHT,
  },
  effects: { width: EFFECT_FRAME_COUNT * EFFECT_FRAME_SIZE, height: EFFECT_FRAME_SIZE },
} as const;

/** A loader over fake textures of the generated sizes: no GPU, no files, but real dimensions. */
function generatedSheets(): AssetLoader<LoadedTexture> {
  const loader = new AssetLoader<LoadedTexture>({
    loadTexture: (path) => {
      const key = (Object.keys(SHEETS) as (keyof typeof SHEETS)[]).find(
        (sheet) => SHEETS[sheet].file === path,
      );
      if (key === undefined) {
        return Promise.reject(new Error(`unknown sheet ${path}`));
      }
      return Promise.resolve(GENERATED_SHEET_SIZES[key]);
    },
  });
  return loader;
}

describe('sheet manifests', () => {
  it('declares exactly the frames the generator paints, in the same order', () => {
    expect(SHEETS.tileset.ids).toEqual(TILE_ORDER);
    expect(SHEETS.objects.ids).toEqual(OBJECT_ORDER);
    expect(SHEETS.actors.ids).toEqual(ACTOR_ORDER);
    expect(SHEETS.effects.ids).toEqual(EFFECT_ORDER);
  });

  it('declares the frame sizes and counts the generator uses', () => {
    expect(SHEETS.tileset.frameWidth).toBe(TILE_SIZE);
    expect(SHEETS.tileset.frameHeight).toBe(TILE_SIZE);
    expect(SHEETS.objects.frameWidth).toBe(OBJECT_SIZE);
    expect(SHEETS.objects.frameHeight).toBe(OBJECT_SIZE);
    expect(SHEETS.actors.frameWidth).toBe(ACTOR_FRAME_WIDTH);
    expect(SHEETS.actors.frameHeight).toBe(ACTOR_FRAME_HEIGHT);
    expect(SHEETS.actors.columns).toBe(ACTOR_FRAMES);
    expect(ACTOR_WALK_FRAMES).toBe(ACTOR_FRAMES);
    expect(SHEETS.effects.frameWidth).toBe(EFFECT_FRAME_SIZE);
    expect(SHEETS.effects.columns).toBe(EFFECT_FRAME_COUNT);
    expect(ACTOR_DIRECTION_ROWS).toEqual(ACTOR_FACINGS);
  });

  it('matches the sheet dimensions the generator writes', async () => {
    const loader = generatedSheets();
    await loader.loadAll();

    for (const [sheet, definition] of Object.entries(SHEETS)) {
      const texture = loader.get(sheet as keyof typeof SHEETS);
      const expected = GENERATED_SHEET_SIZES[sheet as keyof typeof GENERATED_SHEET_SIZES];
      expect({ sheet, width: texture.width, height: texture.height }).toEqual({
        sheet,
        ...expected,
      });
      // The manifest derives the image size from its own layout fields; the generator derives it from
      // its own constants. Both must agree with the file on disk (checked above via the fake textures).
      expect(sheetPixelSize(sheet as keyof typeof SHEETS)).toEqual(expected);
      expect(definition.columns * definition.frameWidth).toBeLessThanOrEqual(expected.width);
      expect(definition.rows * definition.frameHeight).toBeLessThanOrEqual(expected.height);
    }
  });

  it('resolves sheet URLs against the Vite base path', () => {
    expect(sheetUrl('tileset')).toBe('/assets/tileset.png');
    expect(sheetUrl('actors')).toBe('/assets/actors.png');
  });
});

describe('frame maths', () => {
  it('maps every declared tile index to a frame inside the tileset', () => {
    SHEETS.tileset.ids.forEach((_id, index) => {
      expect(tileFrame(index)).toMatchObject({ sheet: 'tileset', x: index * TILE_SIZE, y: 0 });
    });
  });

  it('refuses tile indices the sheet does not have (including the "draw nothing" -1)', () => {
    expect(tileFrame(-1)).toBeNull();
    expect(tileFrame(SHEETS.tileset.ids.length)).toBeNull();
    expect(tileFrame(999)).toBeNull();
  });

  it('returns null instead of throwing for a missing tile, so one bad map cell cannot stop the loop', () => {
    expect(tileFrame(Number.NaN)).toBeNull();
  });

  it('places every actor frame inside the actors sheet', () => {
    const width = GENERATED_SHEET_SIZES.actors.width;
    const height = GENERATED_SHEET_SIZES.actors.height;

    for (const appearance of ACTOR_ORDER) {
      for (const facing of GENERATOR_FACINGS) {
        for (let frame = 0; frame < ACTOR_FRAMES; frame += 1) {
          const rect = actorFrame(appearance, facing, frame);
          expect(rect.x).toBeGreaterThanOrEqual(0);
          expect(rect.y).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.width).toBeLessThanOrEqual(width);
          expect(rect.y + rect.height).toBeLessThanOrEqual(height);
        }
      }
    }
  });

  it('clamps an out-of-range walk frame instead of throwing inside the render loop', () => {
    expect(actorFrame('player', 'south', 99)).toEqual(
      actorFrame('player', 'south', ACTOR_FRAMES - 1),
    );
    expect(actorFrame('player', 'south', -3)).toEqual(actorFrame('player', 'south', 0));
  });

  it('gives each appearance, facing and effect frame a distinct rectangle', () => {
    const rectangles = new Set<string>();
    for (const appearance of ACTOR_ORDER) {
      for (const facing of GENERATOR_FACINGS) {
        const rect = actorFrame(appearance, facing, 0);
        rectangles.add(`${rect.x},${rect.y}`);
      }
    }
    expect(rectangles.size).toBe(ACTOR_ORDER.length * ACTOR_FACINGS.length);

    const effectRects = new Set(
      Array.from({ length: EFFECT_FRAME_COUNT }, (_unused, index) => {
        const rect = effectFrame('dust', index);
        return `${rect.x},${rect.y}`;
      }),
    );
    expect(effectRects.size).toBe(EFFECT_FRAME_COUNT);
  });

  it('throws for an unknown frame id: a typo must be found at development time, not drawn', () => {
    expect(() => stripFrame('objects', 'dragon')).toThrow(/Unknown frame/);
    expect(() => objectFrame('dragon')).toThrow(/Unknown frame/);
    expect(() => actorFrame('goblin', 'south', 0)).toThrow(/Unknown actor/);
  });
});
