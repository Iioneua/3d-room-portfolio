// Tiny helpers for building the computer's interface.

// h('div', { class: 'x', onclick: fn }, child, 'text', ...)
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'html') el.innerHTML = value; // only ever used with the icons in icons.js
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) el.append(child);
  return el;
}

// An element holding one of the SVG icons from icons.js.
export const icon = (markup, className = 'ic') => h('span', { class: className, html: markup, 'aria-hidden': 'true' });

export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
// The key shown in shortcuts: ⌘ on a Mac, Ctrl elsewhere.
export const MOD = isMac ? '⌘' : 'Ctrl+';
export const modKey = (e) => (isMac ? e.metaKey : e.ctrlKey);

export function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}
