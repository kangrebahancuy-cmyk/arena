// Cross-platform cleaner (works on Windows cmd/PowerShell, macOS and Linux - no `rm -rf` needed).
//
//   npm run clean              removes build output (dist/, coverage/)
//   npm run clean -- --deps    also removes every node_modules folder
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const withDeps = process.argv.includes('--deps');

const targets = [
  'apps/client/dist',
  'apps/server/dist',
  'packages/shared/dist',
  'coverage',
  'apps/client/coverage',
  'apps/server/coverage',
  'packages/shared/coverage',
];

if (withDeps) {
  targets.push(
    'node_modules',
    'apps/client/node_modules',
    'apps/server/node_modules',
    'packages/shared/node_modules',
  );
}

await Promise.all(
  targets.map((target) => rm(path.join(root, target), { recursive: true, force: true })),
);

console.log(`Removed: ${targets.join(', ')}`);
