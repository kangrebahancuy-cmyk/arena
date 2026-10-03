// World objects: 32x32 frames that stand ON a 16x16 tile.
//
// A tile is 16x16, but a tree that fits inside one tile looks like a bush. So the object layer draws
// 32x32 frames anchored at the bottom-centre of their tile, which lets a tree overhang the tiles
// above it (and is exactly what the depth-sorted object layer is for).
import { PixelCanvas } from './pixelCanvas.mjs';
import { PALETTE } from './palette.mjs';

export const OBJECT_SIZE = 32;

/** Order of the objects inside objects.png. The TypeScript manifest mirrors this list. */
export const OBJECT_ORDER = ['tree_broad', 'tree_pine', 'bush', 'rock'];

function paintTreeBroad(canvas) {
  // Trunk: 4 px wide, rooted at the bottom-centre of the frame.
  canvas.fillRect(14, 20, 4, 10, PALETTE.trunk);
  canvas.fillRect(17, 20, 1, 10, PALETTE.trunkDark);
  // Two roots flare out at the base.
  canvas.set(13, 29, PALETTE.trunkDark);
  canvas.set(18, 29, PALETTE.trunkDark);

  // Canopy: overlapping ellipses, light coming from the upper left.
  canvas.fillEllipse(16, 13, 11, 9, PALETTE.leafMid);
  canvas.fillEllipse(12, 10, 8, 6, PALETTE.leafLight);
  canvas.fillEllipse(21, 17, 7, 5, PALETTE.leafDark);
  canvas.speckle(PALETTE.leafDark, 0.14, 71, [4, 3, 24, 18]);
  canvas.speckle(PALETTE.leafLight, 0.1, 73, [5, 4, 22, 16]);
  canvas.outline(PALETTE.outline);
}

function paintTreePine(canvas) {
  canvas.fillRect(14, 22, 4, 8, PALETTE.trunkDark);
  // Three tiers, each wider than the one above: the classic conifer silhouette.
  const tiers = [
    { top: 3, halfWidth: 5, bottom: 14 },
    { top: 9, halfWidth: 8, bottom: 19 },
    { top: 15, halfWidth: 11, bottom: 24 },
  ];
  for (const tier of tiers) {
    const height = tier.bottom - tier.top;
    for (let y = tier.top; y <= tier.bottom; y += 1) {
      const progress = (y - tier.top) / height;
      const half = Math.max(1, Math.round(tier.halfWidth * progress));
      canvas.fillRect(16 - half, y, half * 2, 1, y % 3 === 0 ? PALETTE.pineLight : PALETTE.pineMid);
    }
    canvas.fillRect(16 - tier.halfWidth, tier.bottom, tier.halfWidth * 2, 1, PALETTE.pineDark);
  }
  canvas.speckle(PALETTE.pineDark, 0.12, 79, [6, 4, 20, 20]);
  canvas.outline(PALETTE.outline);
}

function paintBush(canvas) {
  canvas.fillEllipse(13, 24, 8, 7, PALETTE.leafMid);
  canvas.fillEllipse(20, 25, 7, 6, PALETTE.leafDark);
  canvas.fillEllipse(11, 21, 5, 4, PALETTE.leafLight);
  // A few berries so the bush is recognisable at a glance.
  const berries = [
    [10, 24],
    [16, 27],
    [21, 23],
    [17, 20],
  ];
  for (const [x, y] of berries) {
    canvas.set(x, y, PALETTE.berry);
    canvas.set(x + 1, y, PALETTE.berry);
  }
  canvas.outline(PALETTE.outline);
}

function paintRock(canvas) {
  canvas.fillEllipse(16, 25, 10, 6, PALETTE.rockBase);
  canvas.fillEllipse(13, 22, 7, 5, PALETTE.rockLight);
  canvas.fillEllipse(21, 27, 6, 4, PALETTE.rockDark);
  canvas.speckle(PALETTE.rockDark, 0.12, 83, [8, 20, 16, 10]);
  canvas.outline(PALETTE.outline);
}

const OBJECT_PAINTERS = {
  tree_broad: paintTreeBroad,
  tree_pine: paintTreePine,
  bush: paintBush,
  rock: paintRock,
};

/** objects.png: every world object in one horizontal strip of 32x32 frames. */
export function createObjectsSheet() {
  const sheet = new PixelCanvas(OBJECT_SIZE * OBJECT_ORDER.length, OBJECT_SIZE);
  OBJECT_ORDER.forEach((name, index) => {
    const frame = new PixelCanvas(OBJECT_SIZE, OBJECT_SIZE);
    OBJECT_PAINTERS[name](frame);
    frame.toSheet(sheet, index * OBJECT_SIZE, 0);
  });
  return sheet;
}
