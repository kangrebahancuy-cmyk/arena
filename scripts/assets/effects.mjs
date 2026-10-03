// Effect sprites: 8x8 frames, hand-authored as ASCII so the shape is readable in the source.
//
// The first effect is a footstep dust puff: the effects layer emits one while the prototype walker
// moves, which is how the layer proves it is driven by the render loop (positioned in world space,
// advancing on delta time, fading out).
//
// '.' = transparent, 'A' = bright dust, 'a' = faint dust
import { PixelCanvas } from './pixelCanvas.mjs';
import { PALETTE } from './palette.mjs';

export const EFFECT_FRAME_SIZE = 8;

/** Order of the effects inside effects.png. The TypeScript manifest mirrors this list. */
export const EFFECT_ORDER = ['dust'];

/** The dust puff, expanding and fading over four frames. */
const DUST_FRAMES = [
  {
    bright: 205,
    faint: 0,
    art: [
      '........',
      '........',
      '...AA...',
      '...AA...',
      '........',
      '........',
      '........',
      '........',
    ],
  },
  {
    bright: 175,
    faint: 0,
    art: [
      '........',
      '........',
      '...AA...',
      '..A..A..',
      '...AA...',
      '........',
      '........',
      '........',
    ],
  },
  {
    bright: 140,
    faint: 95,
    art: [
      '........',
      '...A.A..',
      '..a...a.',
      '...A.A..',
      '..a..a..',
      '........',
      '........',
      '........',
    ],
  },
  {
    bright: 95,
    faint: 60,
    art: [
      '........',
      '..a...a.',
      '........',
      '...a.a..',
      '..a...a.',
      '........',
      '........',
      '........',
    ],
  },
];

export const EFFECT_FRAME_COUNT = DUST_FRAMES.length;

function paintDustFrame(frame) {
  const definition = DUST_FRAMES[frame];
  const canvas = new PixelCanvas(EFFECT_FRAME_SIZE, EFFECT_FRAME_SIZE);
  const [r, g, b] = PALETTE.dust;

  definition.art.forEach((row, y) => {
    [...row].forEach((symbol, x) => {
      if (symbol === 'A') {
        canvas.set(x, y, [r, g, b, definition.bright]);
      } else if (symbol === 'a') {
        canvas.set(x, y, [r, g, b, definition.faint]);
      }
    });
  });

  return canvas;
}

/** effects.png: every effect in one horizontal strip of 8x8 frames. */
export function createEffectsSheet() {
  const sheet = new PixelCanvas(
    EFFECT_FRAME_SIZE * EFFECT_FRAME_COUNT * EFFECT_ORDER.length,
    EFFECT_FRAME_SIZE,
  );
  EFFECT_ORDER.forEach((name, effectIndex) => {
    const painter = name === 'dust' ? paintDustFrame : null;
    if (painter === null) {
      throw new Error(`No painter for effect "${name}"`);
    }
    for (let frame = 0; frame < EFFECT_FRAME_COUNT; frame += 1) {
      const index = effectIndex * EFFECT_FRAME_COUNT + frame;
      painter(frame).toSheet(sheet, index * EFFECT_FRAME_SIZE, 0);
    }
  });
  return sheet;
}
