import { GAME_TITLE } from '@project-realm/shared';
import { el } from './dom';

/**
 * Last-resort screen: shown when the client cannot even start (invalid configuration, missing root
 * element, ...). It replaces whatever is on the page, so at least the failure is visible instead of
 * a blank tab.
 *
 * The message is inserted as text, never as HTML: it can contain values that came from outside.
 */
export function renderFatalError(root: HTMLElement, message: string): void {
  root.replaceChildren(
    el(
      'main',
      { class: 'boot' },
      el(
        'section',
        { class: 'card', role: 'alert' },
        el('h1', {}, GAME_TITLE),
        el('h2', { class: 'section-title' }, 'The client could not start'),
        el('p', { class: 'detail' }, message),
        el('p', { class: 'note' }, 'Technical details are in the browser console (F12).'),
      ),
    ),
  );
}
