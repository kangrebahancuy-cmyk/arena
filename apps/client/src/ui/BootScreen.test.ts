// @vitest-environment happy-dom
import type { HealthResponse } from '@project-realm/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BootState } from '../boot/bootController';
import { readClientConfig } from '../config/clientConfig';
import { BootScreen } from './BootScreen';

// Built through the real configuration reader, so the screen is tested against the config the app
// actually produces (and a new required field surfaces here immediately).
const CONFIG = readClientConfig({ DEV: true }, '0.1.0');

function health(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    service: 'project-realm-server',
    version: '0.1.0',
    protocolVersion: 1,
    uptimeSeconds: 134,
    serverTime: '2026-10-02T12:00:00.000Z',
    ...overrides,
  };
}

function setup() {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const onRetry = vi.fn();
  const onReload = vi.fn();
  const screen = new BootScreen(root, CONFIG, { onRetry, onReload });

  const visibleButtons = (): string[] =>
    [...root.querySelectorAll('button')]
      .filter((button) => !button.hidden)
      .map((b) => b.textContent);
  const status = (): HTMLElement => {
    const element = root.querySelector<HTMLElement>('[role="status"]');
    if (element === null) throw new Error('status region not found');
    return element;
  };
  const button = (label: string): HTMLButtonElement => {
    const found = [...root.querySelectorAll('button')].find((b) => b.textContent === label);
    if (found === undefined) throw new Error(`button "${label}" not found`);
    return found;
  };

  return { root, screen, onRetry, onReload, visibleButtons, status, button };
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('BootScreen', () => {
  it('renders the game title and the client build', () => {
    const { root } = setup();

    expect(root.querySelector('h1')?.textContent).toBe('Project Realm');
    expect(root.textContent).toContain('v0.1.0 · development build');
  });

  it('announces server status through a live region (role="status")', () => {
    const { status } = setup();

    expect(status().textContent).toContain('Starting…');
  });

  it('says plainly that the world does not exist yet', () => {
    const { root } = setup();

    expect(root.textContent).toContain('no world, no gameplay and no realtime connection yet');
  });

  it('shows the startup phase before the first request goes out', () => {
    const { screen, status, visibleButtons } = setup();

    screen.render({ phase: 'starting' });
    expect(status().textContent).toContain('Preparing the client');
    expect(visibleButtons()).toEqual([]);
  });

  it('offers a reload (and nothing else) once the client has been stopped', () => {
    const { screen, status, visibleButtons } = setup();

    screen.render({ phase: 'stopped' });

    expect(status().textContent).toContain('Stopped');
    expect(visibleButtons()).toEqual(['Reload page']);
  });

  it('shows progress while checking, including the attempt number after a failure', () => {
    const { screen, status, visibleButtons } = setup();

    screen.render({ phase: 'checking', attempt: 1 });
    expect(status().textContent).toContain('Contacting the server');

    screen.render({ phase: 'checking', attempt: 3 });
    expect(status().textContent).toContain('Attempt 3');
    expect(visibleButtons()).toEqual([]);
  });

  it('shows exactly what the server reported when online', () => {
    const { screen, root, status, visibleButtons } = setup();

    screen.render({
      phase: 'online',
      health: health({ version: '3.1.4', uptimeSeconds: 134, protocolVersion: 1 }),
      latencyMs: 25,
    });

    expect(status().textContent).toContain('Online');
    expect(status().textContent).toContain('v3.1.4 · up 2m 14s · 25 ms');
    expect(root.textContent).toContain('v1 · compatible');
    expect(visibleButtons()).toEqual([]);
  });

  it('asks the player to reload when the protocol is incompatible', () => {
    const { screen, root, status, visibleButtons, button, onReload, onRetry } = setup();

    screen.render({
      phase: 'incompatible',
      health: health({ protocolVersion: 2 }),
      clientProtocolVersion: 1,
    });

    expect(status().textContent).toContain('Update required');
    expect(root.textContent).toContain('client v1 · server v2');
    expect(visibleButtons()).toEqual(['Reload page']);

    button('Reload page').click();
    expect(onReload).toHaveBeenCalledOnce();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('explains an outage, shows the countdown and offers a manual retry', () => {
    const { screen, status, visibleButtons, button, onRetry } = setup();

    screen.render({
      phase: 'offline',
      reason: { kind: 'network', message: 'Could not reach the server', status: undefined },
      attempt: 2,
      retryInMs: 2_001,
    });

    expect(status().textContent).toContain('Offline');
    expect(status().textContent).toContain('Could not reach the server.');
    expect(status().textContent).toContain('Retrying in 3s.'); // rounded up, never "0s"
    expect(visibleButtons()).toEqual(['Retry now']);

    button('Retry now').click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('hides the whole button row when no action is available', () => {
    const { screen, root } = setup();
    const row = root.querySelector<HTMLElement>('.actions');

    expect(row?.hidden).toBe(true);

    screen.render({
      phase: 'offline',
      reason: { kind: 'timeout', message: 'x', status: undefined },
      attempt: 1,
      retryInMs: 1_000,
    });
    expect(row?.hidden).toBe(false);

    screen.render({ phase: 'online', health: health(), latencyMs: 5 });
    expect(row?.hidden).toBe(true);
  });

  it('returns to a clean state after recovering from an outage', () => {
    const { screen, status, visibleButtons } = setup();

    screen.render({
      phase: 'offline',
      reason: { kind: 'network', message: 'x', status: undefined },
      attempt: 1,
      retryInMs: 1_000,
    });
    screen.render({ phase: 'online', health: health(), latencyMs: 5 });

    expect(status().textContent).not.toContain('Offline');
    expect(visibleButtons()).toEqual([]);
  });

  describe('untrusted text (server messages) is rendered as text, never as HTML', () => {
    const HOSTILE =
      '<img src="x" onerror="window.__pwned = true"><script>window.__pwned = true</script>';

    it('in an error message', () => {
      const { screen, root, status } = setup();

      screen.render({
        phase: 'offline',
        reason: { kind: 'http', message: HOSTILE, status: 403 },
        attempt: 1,
        retryInMs: 1_000,
      });

      expect(status().textContent).toContain(HOSTILE);
      expect(root.querySelector('img[src="x"]')).toBeNull();
      expect(root.querySelector('script')).toBeNull();
    });

    it('in the reported server version', () => {
      const { screen, root, status } = setup();
      const state: BootState = {
        phase: 'online',
        health: health({ version: '<b id="injected">9</b>' }),
        latencyMs: 1,
      };

      screen.render(state);

      expect(status().textContent).toContain('<b id="injected">9</b>');
      expect(root.querySelector('#injected')).toBeNull();
    });
  });
});
