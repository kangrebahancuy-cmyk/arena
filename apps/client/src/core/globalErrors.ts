import type { Logger } from '@project-realm/shared';

/**
 * Routes errors that escape application code into the logger.
 *
 * Without this, a crash inside a callback or an unawaited promise disappears into the browser
 * console (or nowhere at all), and a player sees a frozen screen with no explanation anywhere.
 *
 * These handlers only REPORT. They never try to recover a broken game state or to keep playing:
 * after an uncaught error the client's state is unknown, and pretending otherwise is exactly the
 * kind of fakery this project avoids. The honest reaction is a clear log line today, and a proper
 * "something went wrong" screen once there is a game to lose (Phases 2+).
 *
 * Returns a function that removes the handlers again (used by tests).
 */
export function installGlobalErrorHandlers(logger: Logger): () => void {
  const onError = (event: ErrorEvent): void => {
    // `event.error` is null for errors from another origin; the message is all there is then.
    logger.error(
      'uncaught error',
      { source: event.filename, line: event.lineno, column: event.colno },
      event.error ?? event.message,
    );
  };

  const onUnhandledRejection = (event: Event): void => {
    // lib.dom does not map "unhandledrejection" in WindowEventMap, but the browser does dispatch a
    // PromiseRejectionEvent here; the reason is the rejected value.
    logger.error('unhandled promise rejection', undefined, (event as PromiseRejectionEvent).reason);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
