// Ground tiles: 16x16 frames, drawn from primitives.
//
// These are PROGRAMMER ART for the prototype world. They exist to prove the renderer, the tile grid,
// the camera and the culling - not to be the project's final look. docs/ASSETS.md records that status.
import { PixelCanvas } from './pixelCanvas.mjs';
import { PALETTE } from './palette.mjs';

export const TILE_SIZE = 16;

/** Order of the tiles inside tileset.png. The TypeScript manifest mirrors this list. */
export const TILE_ORDER = [
  'grass',
  'grass_flowers',
  'dirt',
  'water',
  'stone',
  'cloud',
  'stone_wall',
  'wood_plank',
];

/** Base grass with deterministic noise: identical output on every run. */
function paintGrass(canvas) {
  canvas.fill(PALETTE.grassBase);
  canvas.speckle(PALETTE.grassDark, 0.16, 11);
  canvas.speckle(PALETTE.grassLight, 0.1, 23);
  // A few upright blades so large fields do not look like flat noise.
  for (let i = 0; i < 5; i += 1) {
    const x = Math.floor(PixelCanvas.hash(i, 7, 31) * TILE_SIZE);
    const y = Math.floor(PixelCanvas.hash(i, 13, 37) * (TILE_SIZE - 3));
    canvas.set(x, y, PALETTE.grassDarker);
    canvas.set(x, y + 1, PALETTE.grassDarker);
    canvas.set(x + 1, y + 1, PALETTE.grassDarker);
  }
}

function paintGrassFlowers(canvas) {
  paintGrass(canvas);
  const flowers = [
    [3, 4],
    [11, 6],
    [6, 11],
    [12, 12],
  ];
  flowers.forEach(([x, y], index) => {
    const color = index % 2 === 0 ? PALETTE.flowerWhite : PALETTE.flowerYellow;
    canvas.set(x, y, color);
    canvas.set(x + 1, y, color);
    canvas.set(x, y + 1, color);
    canvas.set(x + 1, y + 1, color);
    canvas.set(x, y + 2, PALETTE.grassDarker);
  });
}

function paintDirt(canvas) {
  canvas.fill(PALETTE.dirtBase);
  canvas.speckle(PALETTE.dirtDark, 0.2, 41);
  canvas.speckle(PALETTE.dirtLight, 0.12, 43);
  // Pebbles, placed deterministically.
  for (let i = 0; i < 3; i += 1) {
    const x = 1 + Math.floor(PixelCanvas.hash(i, 3, 47) * (TILE_SIZE - 4));
    const y = 1 + Math.floor(PixelCanvas.hash(i, 5, 53) * (TILE_SIZE - 4));
    canvas.set(x, y, PALETTE.pebble);
    canvas.set(x + 1, y, PALETTE.pebble);
    canvas.set(x, y + 1, PALETTE.pebble);
  }
  // A slightly darker rim reads as a deliberate border until real edge transitions arrive with the
  // zod-validated map format in Phase 4 (tilemaps need 47-tile autotiling to blend biomes properly).
  for (let i = 0; i < TILE_SIZE; i += 1) {
    canvas.set(i, 0, PALETTE.dirtDark);
    canvas.set(i, TILE_SIZE - 1, PALETTE.dirtDark);
    canvas.set(0, i, PALETTE.dirtDark);
    canvas.set(TILE_SIZE - 1, i, PALETTE.dirtDark);
  }
}

function paintWater(canvas) {
  canvas.fill(PALETTE.waterDeep);
  canvas.speckle(PALETTE.waterMid, 0.25, 61);
  // Wave lines: two rows of lighter water, offset from each other.
  for (let x = 0; x < TILE_SIZE; x += 4) {
    canvas.fillRect(x, 4, 3, 1, PALETTE.waterMid);
    canvas.fillRect(x + 2, 5, 3, 1, PALETTE.waterLight);
    canvas.fillRect(x + 1, 11, 2, 1, PALETTE.waterLight);
  }
  for (let i = 0; i < TILE_SIZE; i += 1) {
    canvas.set(i, 0, PALETTE.waterEdge);
    canvas.set(i, TILE_SIZE - 1, PALETTE.waterEdge);
    canvas.set(0, i, PALETTE.waterEdge);
    canvas.set(TILE_SIZE - 1, i, PALETTE.waterEdge);
  }
}

function paintStone(canvas) {
  canvas.fill(PALETTE.stoneMortar);
  // Four cobbles with a light top-left edge, like classic stone paving.
  const cobbles = [
    [1, 1],
    [8, 1],
    [1, 8],
    [8, 8],
  ];
  for (const [x, y] of cobbles) {
    canvas.fillRect(x, y, 7, 7, PALETTE.stoneBase);
    canvas.fillRect(x, y, 7, 1, PALETTE.stoneLight);
    canvas.fillRect(x, y, 1, 7, PALETTE.stoneLight);
    canvas.fillRect(x + 6, y + 1, 1, 6, PALETTE.stoneDark);
    canvas.fillRect(x + 1, y + 6, 6, 1, PALETTE.stoneDark);
    canvas.speckle(PALETTE.stoneDark, 0.08, x * 7 + y, [x + 1, y + 1, 5, 5]);
  }
}

/**
 * The unexplored-world cloud: opaque fog drawn over every tile the player has not walked near yet.
 *
 * Two overlapping puffs plus a darker underside, with the edges left soft so neighbouring cloud tiles
 * read as one continuous blanket instead of a grid. No outline pass: a hard border per tile would show
 * the tile grid through the fog, which is exactly what fog must not do.
 */
function paintCloud(canvas) {
  canvas.fill(PALETTE.cloudBase);
  // Upper puff, offset so the pattern is not mirror-symmetric (mirrored tiles look like a bug).
  canvas.fillEllipse(5, 6, 6, 4, PALETTE.cloudLight);
  canvas.fillEllipse(12, 5, 4, 3, PALETTE.cloudLight);
  // Underside shading, keeping the darkest pixels away from the tile borders.
  canvas.fillEllipse(9, 13, 7, 3, PALETTE.cloudMid);
  canvas.fillEllipse(3, 14, 4, 2, PALETTE.cloudShade);
  canvas.speckle(PALETTE.cloudMid, 0.1, 71, [1, 1, TILE_SIZE - 2, TILE_SIZE - 2], false);
  canvas.speckle(PALETTE.cloudLight, 0.07, 73, [1, 1, TILE_SIZE - 2, TILE_SIZE - 2], false);
}

/** A solid old-quarry wall tile, intentionally distinct from the stone floor. */
function paintStoneWall(canvas) {
  canvas.fill(PALETTE.wallMortar);
  canvas.fillRect(1, 1, 14, 5, PALETTE.wallBase);
  canvas.fillRect(1, 7, 14, 4, PALETTE.wallDark);
  canvas.fillRect(1, 12, 14, 3, PALETTE.wallBase);
  canvas.fillRect(1, 1, 14, 1, PALETTE.wallLight);
  canvas.fillRect(1, 7, 14, 1, PALETTE.wallLight);
  canvas.fillRect(1, 12, 14, 1, PALETTE.wallLight);
  canvas.set(7, 6, PALETTE.wallMortar);
  canvas.set(3, 11, PALETTE.wallMortar);
  canvas.set(12, 11, PALETTE.wallMortar);
  canvas.set(4, 6, PALETTE.wallDark);
  canvas.set(11, 11, PALETTE.wallDark);
}

/** Short wooden bridge planks for the trail across Moonmere's narrow outlet. */
function paintWoodPlank(canvas) {
  canvas.fill(PALETTE.woodBase);
  for (let y = 1; y < TILE_SIZE; y += 4) {
    canvas.fillRect(1, y, TILE_SIZE - 2, 1, PALETTE.woodDark);
    canvas.fillRect(2, y + 1, TILE_SIZE - 4, 1, PALETTE.woodLight);
  }
  for (const x of [1, TILE_SIZE - 2]) {
    for (let y = 2; y < TILE_SIZE; y += 4) {
      canvas.set(x, y, PALETTE.outline);
    }
  }
}

const TILE_PAINTERS = {
  grass: paintGrass,
  grass_flowers: paintGrassFlowers,
  dirt: paintDirt,
  water: paintWater,
  stone: paintStone,
  cloud: paintCloud,
  stone_wall: paintStoneWall,
  wood_plank: paintWoodPlank,
};

/** Paints one 16x16 ground tile. Exported so objects/effects can reuse the same building blocks. */
export function paintTile(name) {
  const canvas = new PixelCanvas(TILE_SIZE, TILE_SIZE);
  TILE_PAINTERS[name](canvas);
  return canvas;
}

/** tileset.png: every ground tile in one horizontal strip. */
export function createTileset() {
  const sheet = new PixelCanvas(TILE_SIZE * TILE_ORDER.length, TILE_SIZE);
  TILE_ORDER.forEach((name, index) => {
    paintTile(name).toSheet(sheet, index * TILE_SIZE, 0);
  });
  return sheet;
}
