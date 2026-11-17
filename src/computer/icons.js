import { extname } from './fs.js';

// Icons drawn for this computer. App tiles get their colour from CSS (computer.css);
// these are the white glyphs on top. No gradients or ids, so any number of copies can
// sit on the page.

const svg = (body, box = 64) => `<svg viewBox="0 0 ${box} ${box}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const glyphs = {
  finder: svg(
    '<path d="M15 22.5a3.5 3.5 0 0 1 3.5-3.5h8.2a3 3 0 0 1 2.2 1l2.6 2.8h14a3.5 3.5 0 0 1 3.5 3.5V43a3.5 3.5 0 0 1-3.5 3.5h-27A3.5 3.5 0 0 1 15 43z" fill="#fff"/>' +
      '<path d="M15 28.5h34" stroke="#bfe0ff" stroke-width="2.4"/>' +
      '<circle cx="26" cy="37" r="2.2" fill="#1f86ee"/><circle cx="38" cy="37" r="2.2" fill="#1f86ee"/>' +
      '<path d="M27 41.5c3 2 7 2 10 0" stroke="#1f86ee" stroke-width="2" fill="none" stroke-linecap="round"/>'
  ),
  terminal: svg(
    '<path d="M18 23l9 8-9 8" stroke="#f2f2f2" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M31 41h14" stroke="#f2f2f2" stroke-width="3.6" stroke-linecap="round"/>'
  ),
  code: svg(
    '<path d="M24 21L13 32l11 11M40 21l11 11-11 11" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M35.5 17l-7 30" stroke="#d6ecff" stroke-width="3.6" stroke-linecap="round"/>'
  ),
  trash: svg(
    '<path d="M15 18h34l-3.2 36.5a4 4 0 0 1-4 3.5H22.2a4 4 0 0 1-4-3.5z" fill="rgba(255,255,255,0.42)" stroke="rgba(255,255,255,0.85)" stroke-width="1.4"/>' +
      '<path d="M24 24l1.4 28M32 24v28M40 24l-1.4 28" stroke="rgba(255,255,255,0.75)" stroke-width="1.3"/>' +
      '<rect x="12" y="12" width="40" height="6" rx="3" fill="rgba(255,255,255,0.7)"/>'
  ),
  trashFull: svg(
    '<path d="M15 18h34l-3.2 36.5a4 4 0 0 1-4 3.5H22.2a4 4 0 0 1-4-3.5z" fill="rgba(255,255,255,0.42)" stroke="rgba(255,255,255,0.85)" stroke-width="1.4"/>' +
      '<path d="M20 22h22l-2 12H22z" fill="#f5f2ea"/><path d="M26 15h16v10H26z" fill="#e3edf7" transform="rotate(-12 34 20)"/>' +
      '<path d="M24 24l1.4 28M32 24v28M40 24l-1.4 28" stroke="rgba(255,255,255,0.75)" stroke-width="1.3"/>' +
      '<rect x="12" y="12" width="40" height="6" rx="3" fill="rgba(255,255,255,0.7)"/>'
  ),
};

// The mark in the top-left corner of the menu bar: a low sun behind two peaks.
export const systemMark = svg(
  '<circle cx="17" cy="7" r="3.2" fill="currentColor"/><path d="M1.5 20.5L8.6 9.2l4.3 6.4 2.6-3.6 7 8.5z" fill="currentColor"/>',
  24
);

// A folder; `badge` adds an embossed symbol for special folders.
const BADGES = {
  projects: '<path d="M27 32l-4 4 4 4M37 32l4 4-4 4M33.5 30l-3 12" stroke="#3f8fd3" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  documents: '<path d="M27 29h8l3 3v10H27z" fill="none" stroke="#3f8fd3" stroke-width="2"/><path d="M29.5 35h6M29.5 38.5h6" stroke="#3f8fd3" stroke-width="1.6"/>',
  desktop: '<rect x="24" y="29" width="16" height="10" rx="1.5" fill="none" stroke="#3f8fd3" stroke-width="2"/><path d="M29 43h6M32 39v4" stroke="#3f8fd3" stroke-width="2"/>',
  downloads: '<circle cx="32" cy="36" r="7.5" fill="none" stroke="#3f8fd3" stroke-width="2"/><path d="M32 32v7M29 36.5l3 3 3-3" stroke="#3f8fd3" stroke-width="2" fill="none"/>',
  home: '<path d="M25 37l7-6 7 6M27 35.5V42h10v-6.5" stroke="#3f8fd3" stroke-width="2" fill="none" stroke-linejoin="round"/>',
};

export function folderIcon(badge) {
  return svg(
    '<path d="M6 16a4 4 0 0 1 4-4h14.3a4 4 0 0 1 2.9 1.2l2.9 2.8H54a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#4c9fe0"/>' +
      '<path d="M6 24a4 4 0 0 1 4-4h44a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#78bdf3"/>' +
      '<path d="M10 20.8h44" stroke="#a5d4f8" stroke-width="1.4"/>' +
      (BADGES[badge] || '')
  );
}

const EXT_COLORS = {
  js: '#c9a400', mjs: '#c9a400', cjs: '#c9a400', jsx: '#1a9fc2', ts: '#2f74c0', tsx: '#2f74c0',
  json: '#8a7a2a', md: '#5b6b7c', html: '#e0572a', css: '#2f6fd6', py: '#3b72a8', txt: '#7a7a7a',
};

export function fileIcon(path) {
  const ext = extname(path).replace(/[^a-z0-9]/g, '').slice(0, 4);
  const color = EXT_COLORS[ext] || '#8a8a8e';
  return svg(
    '<path d="M15 5h22.5L51 18.5V56a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill="#fdfdfd" stroke="#cfcfd4" stroke-width="1.2"/>' +
      '<path d="M37.5 5v10.5a3 3 0 0 0 3 3H51" fill="#ececf0" stroke="#cfcfd4" stroke-width="1.2"/>' +
      '<path d="M18 26h20M18 30.5h26M18 35h16" stroke="#e1e1e6" stroke-width="2" stroke-linecap="round"/>' +
      (ext
        ? `<text x="31.5" y="52" text-anchor="middle" font-family="Inter, sans-serif" font-weight="700" font-size="${ext.length > 3 ? 8.5 : 10}" fill="${color}">${ext.toUpperCase()}</text>`
        : '')
  );
}

// Small line icons (stroke follows the text colour).
const line = (body, box = 16) =>
  `<svg viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const small = {
  folder: line('<path d="M1.8 4.2a1 1 0 0 1 1-1h3.4l1.3 1.4h5.7a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"/>'),
  projects: line('<path d="M1.8 4.2a1 1 0 0 1 1-1h3.4l1.3 1.4h5.7a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"/><path d="M6.4 7.6L5 9l1.4 1.4M9.6 7.6L11 9l-1.4 1.4"/>'),
  desktop: line('<rect x="1.8" y="2.5" width="12.4" height="8.4" rx="1"/><path d="M5.5 13.5h5M8 10.9v2.6"/>'),
  documents: line('<path d="M3.5 1.8h6l3 3v9.4h-9z"/><path d="M9.5 1.8v3h3M5.5 8h5M5.5 10.6h5"/>'),
  downloads: line('<circle cx="8" cy="8" r="6.2"/><path d="M8 4.6v6.2M5.4 8.4L8 11l2.6-2.6"/>'),
  home: line('<path d="M2 7.5L8 2.5l6 5M3.8 6.2v7.3h8.4V6.2"/><path d="M6.6 13.5V9.6h2.8v3.9"/>'),
  trash: line('<path d="M2.5 4h11M6 4V2.4h4V4M3.8 4l.7 9.6h7l.7-9.6"/>'),
  back: line('<path d="M10 3L5 8l5 5"/>'),
  forward: line('<path d="M6 3l5 5-5 5"/>'),
  grid: line('<rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>'),
  list: line('<path d="M5.5 4h8.5M5.5 8h8.5M5.5 12h8.5"/><circle cx="2.6" cy="4" r=".6"/><circle cx="2.6" cy="8" r=".6"/><circle cx="2.6" cy="12" r=".6"/>'),
  search: line('<circle cx="7" cy="7" r="4.6"/><path d="M10.4 10.4L14 14"/>'),
  chevron: line('<path d="M6 4l4 4-4 4"/>'),
  close: line('<path d="M4 4l8 8M12 4l-8 8"/>'),
  plus: line('<path d="M8 3v10M3 8h10"/>'),
  newFile: line('<path d="M3.5 1.8h6l3 3v9.4h-9z"/><path d="M9.5 1.8v3h3M8 7.5v5M5.5 10h5"/>'),
  newFolder: line('<path d="M1.8 4.2a1 1 0 0 1 1-1h3.4l1.3 1.4h5.7a1 1 0 0 1 1 1v6.6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z"/><path d="M8 7v4.4M5.8 9.2h4.4"/>'),
  refresh: line('<path d="M13 4.5V7.6H9.9"/><path d="M12.6 7.4A5 5 0 1 0 12 11"/>'),
  collapse: line('<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5.5 8h5"/>'),
  play: line('<path d="M4.5 2.8v10.4L13 8z"/>'),
  stop: line('<rect x="3.5" y="3.5" width="9" height="9" rx="1"/>'),
  sidebar: line('<rect x="1.8" y="2.5" width="12.4" height="11" rx="1.4"/><path d="M6 2.5v11"/>'),
  panel: line('<rect x="1.8" y="2.5" width="12.4" height="11" rx="1.4"/><path d="M1.8 9.5h12.4"/>'),
  wifi: line('<path d="M1.8 6.2a9 9 0 0 1 12.4 0M4 8.6a5.8 5.8 0 0 1 8 0M6.2 11a2.6 2.6 0 0 1 3.6 0"/><circle cx="8" cy="13" r=".5"/>'),
  controls: line('<rect x="1.8" y="3" width="12.4" height="4" rx="2"/><rect x="1.8" y="9" width="12.4" height="4" rx="2"/><circle cx="11.8" cy="5" r=".9"/><circle cx="4.2" cy="11" r=".9"/>'),
  battery: `<svg viewBox="0 0 26 14" xmlns="http://www.w3.org/2000/svg"><rect x=".7" y=".7" width="21.6" height="12.6" rx="3.4" fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1.2"/><rect x="2.6" y="2.6" width="15.5" height="8.8" rx="1.8" fill="currentColor"/><path d="M23.6 5v4a2 2 0 0 0 0-4z" fill="currentColor" fill-opacity=".55"/></svg>`,
  leave: line('<path d="M9.5 3H3.5v10h6"/><path d="M7 8h7M11.5 5.5L14 8l-2.5 2.5"/>'),
  external: line('<path d="M6.5 3H3v10h10V9.5"/><path d="M9 2.5h4.5V7M13.5 2.5L7.5 8.5"/>'),
};

// VS Code's activity bar.
const bar = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const activity = {
  explorer: bar('<path d="M8.5 3h7l4 4v11h-11z"/><path d="M15.5 3v4h4"/><path d="M5.5 7v14h10"/>'),
  search: bar('<circle cx="13.5" cy="10" r="5.5"/><path d="M9.5 14l-5.5 6"/>'),
  scm: bar('<circle cx="7" cy="5" r="2.2"/><circle cx="7" cy="19" r="2.2"/><circle cx="17" cy="8" r="2.2"/><path d="M7 7.2v9.6M17 10.2c0 4-10 2.8-10 6.6"/>'),
  run: bar('<path d="M7 4.5v15l12-7.5z"/><circle cx="17.5" cy="17.5" r="2.5" stroke-width="1.3"/>'),
  account: bar('<circle cx="12" cy="9" r="4"/><path d="M4.5 20.5c1.4-3.6 4.2-5.2 7.5-5.2s6.1 1.6 7.5 5.2"/>'),
  settings: bar('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
};

// Coloured file-type marks for the editor's explorer and tabs.
const MARKS = {
  js: ['JS', '#cbcb41'], mjs: ['JS', '#cbcb41'], cjs: ['JS', '#cbcb41'], jsx: ['⚛', '#519aba'],
  ts: ['TS', '#519aba'], tsx: ['⚛', '#519aba'], json: ['{}', '#cbcb41'], md: ['M↓', '#519aba'],
  html: ['<>', '#e37933'], css: ['#', '#519aba'], py: ['py', '#3c7dbf'],
};

export function fileMark(path) {
  return MARKS[extname(path)] || ['≡', '#8d9ba8'];
}
