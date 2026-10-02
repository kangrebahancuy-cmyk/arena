import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };
import { buildApp } from './app';
import { ConfigError, loadConfig } from './config/env';
import type { AppConfig } from './config/env';

/** Upper bound for a graceful shutdown before the process is forced to exit. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

// Optional local overrides for development (apps/server/.env, git-ignored). This file sits one level
// below the package root both as src/main.ts and as the bundled dist/main.js.
// Variables already present in the real environment always take precedence over the file.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

const config = loadConfigOrExit();
const app = await buildApp({ config, version: pkg.version });

let shuttingDown = false;

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  app.log.info({ reason }, 'shutting down');

  const forceExit = setTimeout(() => {
    app.log.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    // Later phases hook in here (via Fastify's onClose): stop the game loop, flush persistence, close the DB.
    await app.close();
    app.log.info('shutdown complete');
    process.exit(exitCode);
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown');
    process.exit(1);
  }
}

// SIGINT = Ctrl+C. SIGTERM = process managers and containers. SIGBREAK = Ctrl+Break / closing the
// console window on Windows (Windows has no real SIGTERM). A second Ctrl+C force-quits.
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
if (process.platform === 'win32') {
  signals.push('SIGBREAK');
}
for (const signal of signals) {
  process.once(signal, () => void shutdown(signal, 0));
}

// After an unexpected error the process state is unknown: log it, close cleanly, exit non-zero so a
// supervisor restarts the server.
process.on('uncaughtException', (error) => {
  app.log.fatal({ err: error }, 'uncaught exception');
  void shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  app.log.fatal({ err: reason }, 'unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  const code = errorCode(error);
  if (code === 'EADDRINUSE') {
    app.log.fatal(
      `Port ${config.port} is already in use. Stop the other process or set PORT in apps/server/.env.`,
    );
  } else if (code === 'EACCES') {
    app.log.fatal(
      `Not allowed to listen on ${config.host}:${config.port}. On Windows the port may be reserved by the system: choose another PORT (see docs/SETUP-WINDOWS.md).`,
    );
  } else {
    app.log.fatal({ err: error }, 'failed to start the server');
  }
  process.exit(1);
}
