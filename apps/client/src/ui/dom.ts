export type Child = Node | string;

/**
 * Tiny typed element builder.
 *
 * Text children are inserted as text NODES, never parsed as HTML, so server-provided strings (version,
 * error messages, later: player names and chat) cannot inject markup. Do not use `innerHTML` for them.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  element.append(...children);
  return element;
}
