// Icons drawn for this computer. App tiles get their colour from CSS (computer.css);
// these are the white glyphs on top. No gradients or ids, so any number of copies can
// sit on the page.

const svg = (body, box = 64) => `<svg viewBox="0 0 ${box} ${box}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

// The mark in the top-left corner of the menu bar: a low sun behind two peaks.
export const systemMark = svg(
  '<circle cx="17" cy="7" r="3.2" fill="currentColor"/><path d="M1.5 20.5L8.6 9.2l4.3 6.4 2.6-3.6 7 8.5z" fill="currentColor"/>',
  24
);

export const glyphs = {
  // A stopwatch with its hand at a quarter past.
  pomodoro: svg(
    '<circle cx="32" cy="35" r="16" fill="none" stroke="#fff" stroke-width="3.6"/>' +
      '<path d="M28 13.5h8M32 13.5V19M45 22l2.6-2.6" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M32 35V26.5M32 35l6 3.5" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>'
  ),
  terminal: svg(
    '<path d="M18 23l9 8-9 8" stroke="#f2f2f2" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M31 41h14" stroke="#f2f2f2" stroke-width="3.6" stroke-linecap="round"/>'
  ),
  // Windows that belong to no app in the dock (About This Computer, notices).
  system: svg(
    '<circle cx="40" cy="22" r="5" fill="#fff"/><path d="M11 46l13-19 8 11 5-6.5 13 14.5z" fill="#fff"/>'
  ),
};

// Small line icons (stroke follows the text colour).
const line = (body, box = 16) =>
  `<svg viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const small = {
  search: line('<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4L14 14"/>'),
  close: line('<path d="M4 4l8 8M12 4l-8 8"/>'),
  wifi: line('<path d="M1.8 6.2a9 9 0 0 1 12.4 0M4 8.6a5.8 5.8 0 0 1 8 0M6.2 11a2.6 2.6 0 0 1 3.6 0"/><circle cx="8" cy="13" r=".5"/>'),
  controls: line('<rect x="1.8" y="3" width="12.4" height="4" rx="2"/><rect x="1.8" y="9" width="12.4" height="4" rx="2"/><circle cx="11.8" cy="5" r=".9"/><circle cx="4.2" cy="11" r=".9"/>'),
  battery: `<svg viewBox="0 0 26 14" xmlns="http://www.w3.org/2000/svg"><rect x=".7" y=".7" width="21.6" height="12.6" rx="3.4" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.2"/><rect x="2.6" y="2.6" width="15.5" height="8.8" rx="1.8" fill="currentColor"/><path d="M23.6 5v4a2 2 0 0 0 0-4z" fill="currentColor" fill-opacity=".55"/></svg>`,
  leave: line('<path d="M9.5 3H3.5v10h6"/><path d="M7 8h7M11.5 5.5L14 8l-2.5 2.5"/>'),
};
