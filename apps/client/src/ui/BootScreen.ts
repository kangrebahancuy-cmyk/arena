import { GAME_TITLE } from '@project-realm/shared';
import type { ClientState } from '../boot/clientState';
import type { ClientConfig } from '../config/clientConfig';
import { el } from './dom';
import { describeOfflineReason, formatDuration } from './format';

export interface BootScreenActions {
  readonly onRetry: () => void;
  readonly onReload: () => void;
}

type Tone = 'info' | 'ok' | 'warn' | 'bad';

function assertNever(value: never): never {
  throw new Error(`Unhandled client state: ${JSON.stringify(value)}`);
}

/**
 * The first screen a player sees: it reports the REAL result of talking to the server.
 *
 * It is a view only — all logic lives in GameClient (and, below it, BootController), which the screen
 * merely renders. Nothing on this screen is invented: every value shown came from the server's answer
 * or from this build, and the note at the bottom is there because the world does not exist yet.
 */
export class BootScreen {
  private readonly serverPill: HTMLElement;
  private readonly serverDetail: HTMLElement;
  private readonly protocolValue: HTMLElement;
  private readonly actionsRow: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly reloadButton: HTMLButtonElement;

  constructor(root: HTMLElement, config: ClientConfig, actions: BootScreenActions) {
    this.serverPill = el('span', { class: 'pill pill--info' }, 'Starting…');
    this.serverDetail = el('span', { class: 'detail' });
    this.protocolValue = el('dd', {}, '—');

    this.retryButton = el('button', { type: 'button', class: 'button' }, 'Retry now');
    this.retryButton.addEventListener('click', actions.onRetry);
    this.reloadButton = el('button', { type: 'button', class: 'button' }, 'Reload page');
    this.reloadButton.addEventListener('click', actions.onReload);
    this.retryButton.hidden = true;
    this.reloadButton.hidden = true;
    this.actionsRow = el('div', { class: 'actions' }, this.retryButton, this.reloadButton);
    this.actionsRow.hidden = true;

    const buildLabel = `v${config.appVersion} · ${config.isDevelopmentBuild ? 'development' : 'production'} build`;

    const screen = el(
      'main',
      { class: 'boot' },
      el(
        'section',
        { class: 'card', 'aria-labelledby': 'boot-title' },
        el(
          'header',
          { class: 'brand' },
          el('img', { src: '/favicon.svg', alt: '', width: '48', height: '48' }),
          el(
            'div',
            {},
            el('h1', { id: 'boot-title' }, GAME_TITLE),
            el('p', { class: 'tagline' }, 'Persistent browser MMORPG'),
          ),
        ),
        el('h2', { class: 'section-title' }, 'System check'),
        el(
          'dl',
          { class: 'checks' },
          el('div', { class: 'row' }, el('dt', {}, 'Client'), el('dd', {}, buildLabel)),
          el(
            'div',
            { class: 'row' },
            el('dt', {}, 'Server'),
            el('dd', { role: 'status' }, this.serverPill, this.serverDetail),
          ),
          el('div', { class: 'row' }, el('dt', {}, 'Protocol'), this.protocolValue),
        ),
        this.actionsRow,
        el(
          'p',
          { class: 'note' },
          'Foundation build: there is no world, no gameplay and no realtime connection yet.',
        ),
      ),
    );

    root.replaceChildren(screen);
  }

  render(state: ClientState): void {
    switch (state.phase) {
      case 'starting':
        this.show('info', 'Starting…', 'Preparing the client');
        this.protocolValue.textContent = '—';
        this.setActions({ retry: false, reload: false });
        return;

      case 'stopped':
        this.show('warn', 'Stopped', 'The client was stopped. Reload the page to start it again.');
        this.protocolValue.textContent = '—';
        this.setActions({ retry: false, reload: true });
        return;

      case 'checking':
        this.show(
          'info',
          'Checking…',
          state.attempt > 1 ? `Attempt ${state.attempt}` : 'Contacting the server',
        );
        this.protocolValue.textContent = '—';
        this.setActions({ retry: false, reload: false });
        return;

      case 'online':
        this.show(
          'ok',
          'Online',
          `v${state.health.version} · up ${formatDuration(state.health.uptimeSeconds)} · ${state.latencyMs} ms`,
        );
        this.protocolValue.textContent = `v${state.health.protocolVersion} · compatible`;
        this.setActions({ retry: false, reload: false });
        return;

      case 'incompatible':
        this.show(
          'warn',
          'Update required',
          'This page is out of date for the server. Reload to get the latest version.',
        );
        this.protocolValue.textContent = `client v${state.clientProtocolVersion} · server v${state.health.protocolVersion}`;
        this.setActions({ retry: false, reload: true });
        return;

      case 'offline':
        this.show(
          'bad',
          'Offline',
          `${describeOfflineReason(state.reason)} Retrying in ${Math.ceil(state.retryInMs / 1000)}s.`,
        );
        this.protocolValue.textContent = '—';
        this.setActions({ retry: true, reload: false });
        return;

      default:
        return assertNever(state);
    }
  }

  private show(tone: Tone, label: string, detail: string): void {
    this.serverPill.className = `pill pill--${tone}`;
    this.serverPill.textContent = label;
    this.serverDetail.textContent = detail;
  }

  private setActions(visible: { retry: boolean; reload: boolean }): void {
    this.retryButton.hidden = !visible.retry;
    this.reloadButton.hidden = !visible.reload;
    this.actionsRow.hidden = !visible.retry && !visible.reload;
  }
}
