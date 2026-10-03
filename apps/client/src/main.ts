import './ui/styles.css';
import { isRealmError } from '@project-realm/shared';
import { readClientConfig } from './config/clientConfig';
import { installGlobalErrorHandlers } from './core/globalErrors';
import { createClientLogger } from './core/logger';
import { GameClient } from './game/GameClient';
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

  client.subscribe((state) => {
    screen.render(state);
  });
  client.start();
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
