// Production bundle of the game server -> dist/main.js (run with `npm start`).
//
// - Third-party runtime dependencies stay EXTERNAL: they are loaded from node_modules at runtime,
//   which keeps native addons (database drivers, password hashing, ...) working in later phases.
// - Workspace packages (@project-realm/*) are BUNDLED, because they ship TypeScript source.
import { readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

const external = Object.keys(pkg.dependencies ?? {}).filter(
  (name) => !name.startsWith('@project-realm/'),
);

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });

await build({
  absWorkingDir: packageRoot,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  external,
  logLevel: 'info',
});
