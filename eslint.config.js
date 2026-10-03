import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Module boundaries (see docs/ARCHITECTURE.md, "Dependency rules"):
 *
 *   packages/shared  ->  nothing in this repo, and no Node/browser-only APIs (it runs in both)
 *   apps/client      ->  shared only; never server code or Node built-ins
 *   apps/server      ->  shared only; never client code or bundler tooling
 *
 * npm workspaces hoist every package into the root node_modules, so a forbidden import would still
 * *resolve* at runtime ("phantom dependency"). These rules are what actually prevents it.
 *
 * Layering INSIDE each app uses the same mechanism. A layer may import only from layers to its right:
 *
 *   client:  main -> game -> ui / input -> boot / render -> net -> core   (config/shared are usable anywhere)
 *   server:  main -> game -> http -> config | core | ports
 *
 * "game" holds the entry points (GameClient / GameServer): they may use everything below them, and
 * nothing below them may import back up.
 *
 * Dependencies point one way only, so a lower layer can be replaced or tested without the layers above.
 */
const NODE_BUILTINS = {
  group: ['node:*'],
  message:
    'Node built-ins are not available in browser code (or in the environment-agnostic shared package).',
};
const SERVER_ONLY = {
  group: ['@project-realm/server', '@project-realm/server/*', 'fastify', 'fastify/*', '@fastify/*'],
  message: 'Server code must never be imported by the client or the shared package.',
};
const CLIENT_ONLY = {
  group: ['@project-realm/client', '@project-realm/client/*', 'vite', 'vite/*'],
  message:
    'Client code and bundler tooling must never be imported by the server or the shared package.',
};

/** Forbids importing the given sibling layers (by folder or file name) from a lower layer. */
const mayNotImport = (layer, forbidden) => ({
  group: forbidden.flatMap((name) => [`**/${name}`, `**/${name}/**`]),
  message: `"${layer}" is a lower layer: it must not import from ${forbidden.map((name) => `"${name}"`).join(', ')} (docs/ARCHITECTURE.md, "Dependency rules").`,
});
const CLIENT_BASE = [NODE_BUILTINS, SERVER_ONLY];
const SERVER_BASE = [CLIENT_ONLY];

export default defineConfig(
  globalIgnores(['**/dist/**', '**/coverage/**', '**/node_modules/**']),

  // --- TypeScript (type-aware) -------------------------------------------------------------
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Use the structured logger (server) or surface the problem in the UI (client).
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },

  // --- Plain JavaScript (config and tooling scripts, run by Node) ----------------------------
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { 'no-console': 'off' },
  },

  // --- Boundary rules ------------------------------------------------------------------------
  {
    files: ['packages/shared/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NODE_BUILTINS, SERVER_ONLY, CLIENT_ONLY] }],
    },
  },
  {
    files: ['apps/client/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [NODE_BUILTINS, SERVER_ONLY] }],
    },
  },
  {
    files: ['apps/server/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [CLIENT_ONLY] }],
    },
  },

  // The browser console belongs to one module: it is the only place where the log level can be
  // honoured consistently, and where a message can be formatted for devtools.
  {
    files: ['apps/client/src/core/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  // --- Layering inside the client: main -> game -> ui -> boot -> net -> core ------------------
  // (A rule set for a more specific `files` glob REPLACES the one above, so the base patterns repeat.)
  {
    files: ['apps/client/src/core/**/*.ts', 'apps/client/src/config/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...CLIENT_BASE,
            mayNotImport('core/config', ['net', 'boot', 'render', 'ui', 'game']),
          ],
        },
      ],
    },
  },
  {
    files: ['apps/client/src/net/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...CLIENT_BASE, mayNotImport('net', ['boot', 'render', 'ui', 'game'])] },
      ],
    },
  },
  {
    // The renderer knows about images, the GPU and the scene description - nothing above it. A
    // renderer that could reach the boot handshake or the UI would no longer be replaceable.
    files: ['apps/client/src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...CLIENT_BASE, mayNotImport('render', ['net', 'boot', 'ui', 'game'])] },
      ],
    },
  },
  {
    files: ['apps/client/src/boot/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...CLIENT_BASE, mayNotImport('boot', ['render', 'ui', 'game'])] },
      ],
    },
  },
  {
    // Input is an independent leaf: it turns DOM events into shared movement intent and knows no game,
    // UI, renderer, collision or networking implementation.
    files: ['apps/client/src/input/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...CLIENT_BASE,
            mayNotImport('input', ['net', 'boot', 'render', 'ui', 'physics', 'game']),
          ],
        },
      ],
    },
  },
  {
    // Physics only receives world-space positions and grid queries; it cannot depend on gameplay/UI.
    files: ['apps/client/src/physics/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...CLIENT_BASE,
            mayNotImport('physics', ['net', 'boot', 'render', 'ui', 'input', 'game']),
          ],
        },
      ],
    },
  },
  {
    // The UI layer may describe what it shows (including renderer types such as asset progress), but
    // it must never drive the game: data flows in through methods, actions flow out through callbacks.
    files: ['apps/client/src/ui/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...CLIENT_BASE, mayNotImport('ui', ['net', 'input', 'game'])] },
      ],
    },
  },

  // --- Layering inside the server: main -> game -> http -> config | core | ports --------------
  {
    files: [
      'apps/server/src/core/**/*.ts',
      'apps/server/src/config/**/*.ts',
      'apps/server/src/ports/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...SERVER_BASE,
            mayNotImport('core/config/ports', ['http', 'game', 'app', 'main']),
          ],
        },
      ],
    },
  },
  {
    files: ['apps/server/src/http/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...SERVER_BASE, mayNotImport('http', ['game', 'app', 'main'])] },
      ],
    },
  },
  {
    files: ['apps/server/src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [...SERVER_BASE, mayNotImport('game', ['main'])] },
      ],
    },
  },

  // Keep last: turns off any stylistic rule that would fight Prettier.
  prettier,
);
