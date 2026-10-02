// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { el } from './dom';

describe('el', () => {
  it('creates the requested element with attributes and children in order', () => {
    const child = document.createElement('em');
    const node = el('p', { class: 'note', id: 'intro' }, 'Hello ', child, ' world');

    expect(node.tagName).toBe('P');
    expect(node.className).toBe('note');
    expect(node.id).toBe('intro');
    expect(node.childNodes).toHaveLength(3);
    expect(node.childNodes[1]).toBe(child);
    expect(node.textContent).toBe('Hello  world');
  });

  it('works without attributes or children', () => {
    expect(el('div').outerHTML).toBe('<div></div>');
  });

  it('inserts string children as TEXT, never as HTML (names and chat will flow through here)', () => {
    const hostile = '<img src="x" onerror="alert(1)"><script>alert(2)</script>';
    const node = el('p', {}, hostile);

    expect(node.children).toHaveLength(0);
    expect(node.querySelector('img, script')).toBeNull();
    expect(node.textContent).toBe(hostile);
  });

  it('keeps hostile attribute values inside the attribute', () => {
    const node = el('span', { title: '" onmouseover="alert(1)' });

    expect(node.getAttribute('title')).toBe('" onmouseover="alert(1)');
    expect(node.getAttributeNames()).toEqual(['title']);
  });
});
