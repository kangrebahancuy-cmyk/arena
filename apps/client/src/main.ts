import './ui/styles.css';
import { isRealmError } from '@project-realm/shared';
import { readClientConfig } from './config/clientConfig';
import { installGlobalErrorHandlers } from './core/globalErrors';
import { createClientLogger } from './core/logger';
import { GameClient } from './game/GameClient';
import { startWorld } from './game/WorldBootstrap';
import type { WorldBootstrapHandle } from './game/WorldBootstrap';
import { BootScreen } from './ui/BootScreen';
import { renderFatalError } from './ui/FatalErrorScreen';

/**
 * Entry point of the browser client: read configuration, build the game client and the view that
 * renders its state, and make sure a failure to start is visible instead of silent.
 *
 * This is the composition root: the only place that knows every module. Everything else receives
 * what it needs (see docs/ARCHITECTURE.md, "Dependency rules").
 */
const root = document.getElementById('app');
if (root === null) {
  throw new Error('index.html is missing the #app root element');
}

try {
  const config = readClientConfig();
  const logger = createClientLogger({ name: 'client', threshold: config.logLevel });
  installGlobalErrorHandlers(logger.child('window'));

  const client = new GameClient({ config, logger });
  const screen = new BootScreen(root, config, {
    onRetry: () => {
      client.retryNow();
    },
    onReload: () => {
      window.location.reload();
    },
  });

  // The world starts once, and only after the handshake with the server succeeded: the renderer itself
  // needs nothing from the server, but "the client is online" is the real condition for entering the
  // world, and a world that appeared while the server was unreachable would be a lie.
  let world: WorldBootstrapHandle | undefined;
  let worldStarting = false;

  const enterWorld = (): void => {
    if (world !== undefined || worldStarting) {
      return;
    }
    worldStarting = true;
    void startWorld({ root, config, logger: logger.child('world') })
      .then((handle) => {
        world = handle;
      })
      .catch((error: unknown) => {
        // startWorld has already put the reason on screen and cleaned up after itself; the console
        // entry (and the global error handler) is the developer-facing half of the same failure.
        logger.error('entering the world failed', {
          message: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        worldStarting = false;
      });
  };

  client.subscribe((state) => {
    screen.render(state);
    if (state.phase === 'online') {
      enterWorld();
    }
  });
  client.start();

  // A stopped client tears the world down with it (the renderer, the loop, the listeners), so a future
  // "log out" or a fatal error can never leave a render loop running against a dead client.
  window.addEventListener('pagehide', () => {
    world?.stop();
    world = undefined;
    client.stop();
  });
} catch (error) {
  // Configuration is unreadable, so there is no log level to honour: use the default and report.
  const logger = createClientLogger({ name: 'client', threshold: 'info' });
  if (isRealmError(error)) {
    logger.fatal(error.message, { code: error.code });
    renderFatalError(root, error.message);
  } else {
    logger.fatal('client failed to start', undefined, error);
    renderFatalError(root, 'Unexpected error while starting the client.');
  }
}
