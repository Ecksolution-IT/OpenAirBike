type Child = Node | string | number | false | null | undefined;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** Tiny hyperscript helper: h('button', { class: 'big', onclick: fn }, 'Start'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

/** Sets text only when it changed, to keep per-frame updates cheap. */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

export function navigate(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}

/** A view renders into `root` and returns a cleanup function. */
export type View = (root: HTMLElement) => (() => void) | void;
