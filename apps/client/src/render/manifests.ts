import type { Direction } from '@project-realm/shared';

/**
 * Sprite-sheet manifests: the contract between the asset generator (`scripts/assets/`) and the
 * renderer. Pure data + frame maths, no PixiJS, so it is unit-tested and can be reasoned about
 * without a GPU.
 *
 * If a sheet's layout changes, this file and the generator must change together — and the renderer
 * refuses to draw outside a texture, so a mismatch fails loudly instead of drawing garbage.
 */
export interface SheetDefinition {
  /** Public path of the image, relative to the site root. */
  readonly file: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** `strip`: the ids are consecutive frames in one row. `grid`: each id is a block of frames. */
  readonly layout: 'strip' | 'grid';
  /** Strip sheets: frames across the image. Grid sheets: frames per block, facings down the rows. */
  readonly columns: number;
  readonly rows: number;
  /** Frame identifiers: one per strip frame, or one per animation block on a grid sheet. */
  readonly ids: readonly string[];
  readonly description: string;
}

/** A rectangle inside a sheet. `sheet` is the key in {@link SHEETS}. */
export interface SheetFrame {
  readonly sheet: SheetKey;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const SHEETS = {
  tileset: {
    file: 'assets/tileset.png',
    frameWidth: 16,
    frameHeight: 16,
    layout: 'strip',
    columns: 6,
    rows: 1,
    ids: ['grass', 'grass_flowers', 'dirt', 'water', 'stone', 'cloud'],
    description: 'Ground tiles and the unexplored-world cloud',
  },
  objects: {
    file: 'assets/objects.png',
    frameWidth: 32,
    frameHeight: 32,
    layout: 'strip',
    columns: 4,
    rows: 1,
    ids: ['tree_broad', 'tree_pine', 'bush', 'rock'],
    description: 'World objects, bottom-anchored so they can overhang their tile',
  },
  actors: {
    file: 'assets/actors.png',
    frameWidth: 16,
    frameHeight: 24,
    layout: 'grid',
    // 3 walk frames per appearance block; the blocks sit side by side along the row.
    columns: 3,
    rows: 4,
    ids: ['player', 'villager'],
    description: 'Characters and NPCs: 3 frames x 4 facings per appearance',
  },
  effects: {
    file: 'assets/effects.png',
    frameWidth: 8,
    frameHeight: 8,
    layout: 'strip',
    columns: 4,
    rows: 1,
    ids: ['dust'],
    description: 'Effect animations',
  },
} as const satisfies Record<string, SheetDefinition>;

export type SheetKey = keyof typeof SHEETS;

export const SHEET_KEYS = Object.keys(SHEETS) as readonly SheetKey[];

export function sheetDefinition(sheet: SheetKey): SheetDefinition {
  return SHEETS[sheet];
}

/**
 * Pixel size the image must have for this manifest to be correct.
 *
 * Derived from the manifest's own layout fields, so comparing it with the file the generator wrote (or
 * with the loaded texture's dimensions) catches a manifest/art drift before anything is drawn.
 */
export function sheetPixelSize(sheet: SheetKey): {
  readonly width: number;
  readonly height: number;
} {
  const definition = SHEETS[sheet];
  const imageColumns =
    definition.layout === 'grid' ? definition.ids.length * definition.columns : definition.columns;
  return {
    width: imageColumns * definition.frameWidth,
    height: definition.rows * definition.frameHeight,
  };
}

/**
 * Public URL of an asset path from the manifest.
 *
 * Resolved against Vite's `BASE_URL` so the game keeps working when it is not served from the site
 * root (a sub-path deployment, or a preview server). The fallback keeps the module usable outside
 * Vite (unit tests).
 */
export function assetUrl(path: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const root = base.endsWith('/') ? base : `${base}/`;
  return `${root}${path.replace(/^\/+/, '')}`;
}

/** Public URL of a sheet. */
export function sheetUrl(sheet: SheetKey): string {
  return assetUrl(SHEETS[sheet].file);
}

/** Every sheet with its resolved URL, in manifest order. */
export function sheetUrls(): readonly { readonly sheet: SheetKey; readonly url: string }[] {
  return SHEET_KEYS.map((sheet) => ({ sheet, url: sheetUrl(sheet) }));
}

/** Total number of frames per appearance block on the actor sheet (walk cycle length). */
export const ACTOR_WALK_FRAMES = SHEETS.actors.columns;

/**
 * Facing rows, top to bottom, as the generator draws them.
 *
 * This is an ASSET layout detail, so it lives here and not in the shared package: the game's own
 * Direction list (north, east, south, west) is about the world, while the order rows appear in a PNG
 * is about the picture. Keeping them separate means reordering the sheet cannot silently change what
 * "north" means in gameplay.
 */
export const ACTOR_DIRECTION_ROWS: readonly Direction[] = ['south', 'north', 'east', 'west'];

/** A single frame from a strip sheet (tiles, objects, effects). */
export function stripFrame(sheet: SheetKey, id: string, frameIndex = 0): SheetFrame {
  const definition = SHEETS[sheet];
  // `ids` is a readonly tuple of literal strings; widen it to search with a runtime string.
  const index = (definition.ids as readonly string[]).indexOf(id);
  if (index < 0) {
    throw new Error(`Unknown frame "${id}" in sheet "${sheet}"`);
  }
  return {
    sheet,
    x: (index + frameIndex) * definition.frameWidth,
    y: 0,
    width: definition.frameWidth,
    height: definition.frameHeight,
  };
}

/** Frame `index` of a ground tile. Indices come straight from the map data. */
export function tileFrame(index: number): SheetFrame | null {
  const definition = SHEETS.tileset;
  if (!Number.isInteger(index) || index < 0 || index >= definition.ids.length) {
    // Unknown index (including -1 = "draw nothing" and NaN): the map schema allows any integer >= -1,
    // so the renderer must refuse a frame it does not have instead of drawing at NaN.
    return null;
  }
  return {
    sheet: 'tileset',
    x: index * definition.frameWidth,
    y: 0,
    width: definition.frameWidth,
    height: definition.frameHeight,
  };
}

/** Frame of a named world object. */
export function objectFrame(id: string): SheetFrame {
  return stripFrame('objects', id);
}

/** Frame of an effect animation. */
export function effectFrame(id: string, frameIndex: number): SheetFrame {
  return stripFrame('effects', id, frameIndex);
}

/**
 * Frame of an actor: appearance block + walk frame + facing row.
 *
 * `frameIndex` is clamped, not thrown on: an out-of-range animation frame would otherwise crash the
 * render loop, and a wrong frame is a cosmetic problem, not a reason to stop the game.
 */
export function actorFrame(appearance: string, facing: Direction, frameIndex: number): SheetFrame {
  const definition = SHEETS.actors;
  const appearanceIndex = (definition.ids as readonly string[]).indexOf(appearance);
  const directionRow = ACTOR_DIRECTION_ROWS.indexOf(facing);
  if (appearanceIndex < 0 || directionRow < 0) {
    throw new Error(`Unknown actor "${appearance}" facing "${facing}"`);
  }

  const walkFrames = definition.columns;
  const clampedFrame = Math.min(Math.max(frameIndex, 0), walkFrames - 1);
  const blockWidth = definition.frameWidth * walkFrames;

  return {
    sheet: 'actors',
    x: appearanceIndex * blockWidth + clampedFrame * definition.frameWidth,
    y: directionRow * definition.frameHeight,
    width: definition.frameWidth,
    height: definition.frameHeight,
  };
}
