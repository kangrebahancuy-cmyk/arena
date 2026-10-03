// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { renderFatalError } from './FatalErrorScreen';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('renderFatalError', () => {
  it('replaces the page with a visible explanation', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    root.append(document.createElement('canvas'));

    renderFatalError(root, 'Invalid client configuration');

    expect(root.querySelector('canvas')).toBeNull();
    expect(root.textContent).toContain('The client could not start');
    expect(root.textContent).toContain('Invalid client configuration');
    expect(root.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders the message as text, never as HTML', () => {
    const root = document.createElement('div');
    document.body.replaceChildren(root);
    const hostile = '<img src="x" onerror="window.__pwned = true">';

    renderFatalError(root, hostile);

    expect(root.textContent).toContain(hostile);
    expect(root.querySelector('img')).toBeNull();
  });
});
