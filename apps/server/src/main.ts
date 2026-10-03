import { isRealmError } from '@project-realm/shared';
import pkg from '../package.json' with { type: 'json' };
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from './config/env';
import type { AppConfig } from './config/env';
import { createStartupLogger } from './core/logger';
import { GameServer } from './game/GameServer';

/**
 * Entry point of the game server.
 *
 * It wires the process to the game: read configuration, build the server, translate process signals
 * and fatal errors into a clean shutdown, and exit with a code a supervisor can act on. Everything
 * else lives in GameServer and the modules below it.
 */

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
      // Nothing is configured yet, so the level cannot come from configuration: report and stop.
      createStartupLogger('info').fatal(error.message, { code: error.code });
      process.exit(1);
    }
    throw error;
  }
}

const config = loadConfigOrExit();
const server = new GameServer({ config, version: pkg.version });

let shuttingDown = false;

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  const log = server.logger;
  log.info('shutting down', { reason });

  const forceExit = setTimeout(() => {
    log.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    await server.stop();
    log.info('shutdown complete');
    process.exit(exitCode);
  } catch (error) {
    log.error('error during shutdown', undefined, error);
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
  server.logger.fatal('uncaught exception', undefined, error);
  void shutdown('uncaughtException', 1);
});
process.on('unhandledRejection', (reason) => {
  server.logger.fatal('unhandled promise rejection', undefined, reason);
  void shutdown('unhandledRejection', 1);
});

try {
  await server.start();
} catch (error) {
  const log = server.logger;
  if (isRealmError(error)) {
    // GameServer already turned this into a message with a concrete next step.
    log.fatal(error.message, { code: error.code });
  } else {
    log.fatal('failed to start the server', undefined, error);
  }

  // Closing flushes the HTTP app (and its logger) before the process disappears.
  await server.stop();
  process.exit(1);
}
