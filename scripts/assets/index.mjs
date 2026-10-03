// Generates every prototype image the client loads.
//
//   npm run assets
//
// Design rules for this folder (see docs/ASSETS.md):
//   - 100% original: every pixel is drawn here, from the project's own palette. No sprite, tileset or
//     palette from any other game is read, traced, recoloured or imported.
//   - Deterministic: no randomness that is not seeded, no floating-point drift. Running the script
//     twice produces byte-identical files, so a git diff in apps/client/public/assets always means a
//     real change to the art.
//   - Dependency-free: the PNG writer is scripts/assets/png.mjs (Node's zlib + ~60 lines).
//   - Programmer art: this is placeholder art to exercise the renderer, not final artwork.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { encodePng } from './png.mjs';
import { createTileset } from './tiles.mjs';
import { createObjectsSheet } from './objects.mjs';
import { createActorsSheet } from './actors.mjs';
import { createEffectsSheet } from './effects.mjs';

const OUTPUT_DIR = fileURLToPath(new URL('../../apps/client/public/assets/', import.meta.url));

const SHEETS = [
  { file: 'tileset.png', sheet: createTileset, description: 'ground tiles, 16x16 frames' },
  { file: 'objects.png', sheet: createObjectsSheet, description: 'world objects, 32x32 frames' },
  {
    file: 'actors.png',
    sheet: createActorsSheet,
    description: 'characters/NPCs, 16x24 x 3 frames x 4 facings',
  },
  { file: 'effects.png', sheet: createEffectsSheet, description: 'effects, 8x8 x 4 frames' },
];

export async function generateAssets() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const written = [];
  for (const { file, sheet: build, description } of SHEETS) {
    const canvas = build();
    const png = encodePng({ width: canvas.width, height: canvas.height, rgba: canvas.data });
    const path = new URL(file, pathToFileURL(`${OUTPUT_DIR}/`));
    const previous = await readFile(path).catch(() => null);
    await writeFile(path, png);

    written.push({
      file,
      description,
      width: canvas.width,
      height: canvas.height,
      bytes: png.length,
      changed: previous === null || !previous.equals(png),
      sha256: createHash('sha256').update(png).digest('hex').slice(0, 12),
    });
  }
  return written;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const written = await generateAssets();
  for (const entry of written) {
    const status = entry.changed ? 'written' : 'unchanged';
    console.log(
      `${entry.file.padEnd(14)} ${String(entry.width).padStart(3)}x${String(entry.height).padEnd(3)} ` +
        `${String(entry.bytes).padStart(5)} B  sha256:${entry.sha256}  ${status}  (${entry.description})`,
    );
  }
  console.log(`\nOutput: apps/client/public/assets/`);
}
