import { PROTOCOL_VERSION } from '@project-realm/shared';
import { BootController } from '../boot/bootController';
import type { ClientConfig } from '../config/clientConfig';
import { ApiClient } from '../net/ApiClient';
import { fetchServerHealth } from '../net/health';
import { BootScreen } from '../ui/BootScreen';

/**
 * Composition root of the client: the only place that knows every module and wires them together.
 * Everything else depends on small interfaces, which keeps modules replaceable and testable.
 *
 * Later phases extend this wiring (renderer in Phase 2, input in Phase 3, realtime connection in
 * Phase 10, login/character select in Phase 11) without touching the modules that already exist.
 */
export function startApp(root: HTMLElement, config: ClientConfig): void {
  const api = new ApiClient();

  const boot = new BootController({
    fetchHealth: (signal) => fetchServerHealth(api, signal),
    clientProtocolVersion: PROTOCOL_VERSION,
  });

  const screen = new BootScreen(root, config, {
    onRetry: () => {
      boot.retryNow();
    },
    onReload: () => {
      window.location.reload();
    },
  });

  boot.subscribe((state) => {
    screen.render(state);
  });
  boot.start();
}
