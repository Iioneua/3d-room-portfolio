import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from 'codemirror';
import { indentWithTab, undo, redo } from '@codemirror/commands';
import { indentUnit, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { openSearchPanel } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { python } from '@codemirror/lang-python';
import { h, icon, MOD, modKey, clamp } from './dom.js';
import { HOME, basename, dirname, join, pretty, extname, isInside } from './fs.js';
import { glyphs, small, activity, fileMark } from './icons.js';
import { PROJECTS } from './seed.js';
import { createTerminal, quoteArg } from './terminal.js';

// A code editor laid out like VS Code (Dark Modern theme), built on CodeMirror.

const LANGUAGES = {
  js: ['JavaScript', () => javascript()],
  mjs: ['JavaScript', () => javascript()],
  cjs: ['JavaScript', () => javascript()],
  jsx: ['JavaScript JSX', () => javascript({ jsx: true })],
  ts: ['TypeScript', () => javascript({ typescript: true })],
  tsx: ['TypeScript JSX', () => javascript({ typescript: true, jsx: true })],
  json: ['JSON', () => json()],
  md: ['Markdown', () => markdown()],
  html: ['HTML', () => html()],
  css: ['CSS', () => css()],
  py: ['Python', () => python()],
};
const language = (path) => LANGUAGES[extname(path)] || ['Plain Text', null];
const RUNNABLE = ['js', 'mjs', 'cjs'];

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: '#1f1f1f', color: '#cccccc', fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-content': { caretColor: '#aeafad', padding: '2px 0 40px' },
    '.cm-cursor, .cm-dropCursor': { borderLeft: '2px solid #aeafad' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: '#264f78 !important' },
    '.cm-activeLine': { backgroundColor: 'transparent', boxShadow: 'inset 0 0 0 1px #282828' },
    '.cm-gutters': { backgroundColor: '#1f1f1f', color: '#6e7681', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#cccccc' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 18px', minWidth: '48px' },
    '.cm-foldGutter .cm-gutterElement': { color: '#8b8b8b', padding: '0 4px' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(0, 100, 0, 0.12)', outline: '1px solid #6b6b6b' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(173, 214, 255, 0.12)' },
    '.cm-searchMatch': { backgroundColor: 'rgba(234, 92, 0, 0.33)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: '#9e6a03' },
    '.cm-panels': { backgroundColor: '#252526', color: '#cccccc', borderColor: '#2b2b2b' },
    '.cm-panels input, .cm-panels button': { fontFamily: 'var(--sans)', fontSize: '12px' },
    '.cm-tooltip': { backgroundColor: '#252526', border: '1px solid #454545', color: '#cccccc' },
    '.cm-tooltip-autocomplete > ul > li': { fontFamily: 'var(--mono)', fontSize: '12.5px', padding: '2px 8px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#04395e', color: '#ffffff' },
    '.cm-completionIcon': { opacity: 0.7 },
    '.cm-foldPlaceholder': { backgroundColor: '#3a3d41', border: 'none', color: '#cccccc' },
  },
  { dark: true }
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.definitionKeyword, t.self, t.null, t.bool, t.atom, t.tagName], color: '#569cd6' },
  { tag: [t.controlKeyword, t.moduleKeyword], color: '#c586c0' },
  { tag: [t.string, t.special(t.string), t.character, t.attributeValue, t.link, t.url, t.monospace], color: '#ce9178' },
  { tag: t.regexp, color: '#d16969' },
  { tag: t.escape, color: '#d7ba7d' },
  { tag: [t.number, t.integer, t.float, t.unit], color: '#b5cea8' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.quote], color: '#6a9955' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))], color: '#dcdcaa' },
  { tag: [t.variableName, t.propertyName, t.definition(t.variableName), t.definition(t.propertyName), t.attributeName, t.labelName], color: '#9cdcfe' },
  { tag: [t.typeName, t.className, t.namespace, t.definition(t.typeName)], color: '#4ec9b0' },
  { tag: [t.angleBracket], color: '#808080' },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket, t.meta], color: '#cccccc' },
  { tag: t.heading, color: '#569cd6', fontWeight: 'bold' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.invalid, color: '#f44747' },
]);

function fuzzy(query, text) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  let score = 0;
  let j = 0;
  let streak = 0;
  for (let i = 0; i < s.length && j < q.length; i++) {
    if (s[i] === q[j]) {
      j++;
      streak++;
      score += 1 + streak;
    } else streak = 0;
  }
  return j === q.length ? score : 0;
}

export function createCode(ctx) {
  const { fs, os } = ctx;

  let win = null;
  let view = null;
  let workspace = PROJECTS;
  const docs = new Map(); // path → { state, saved }
  let tabs = [];
  let current = null;
  let sideView = 'explorer';
  let sideOpen = true;
  let panelOpen = false;
  let panelHeight = 220;
  let term = null;
  const expanded = new Set();
  let selectedPath = null;
  let creating = null; // { type, parent }
  let renaming = null;
  let quiet = false;
  let searchQuery = '';
  let ui = null;

  const app = {
    id: 'code',
    name: 'VS Code',
    launch: (opts = {}) => open(opts),
    menus: () => {
      if (!win) return [];
      return [
        {
          title: 'File',
          items: [
            { label: 'New File…', action: () => startCreate('file') },
            { label: 'New Folder…', action: () => startCreate('dir') },
            '-',
            { label: 'Open Folder…', action: pickFolder },
            { label: 'Go to File…', shortcut: `${MOD}P`, action: () => quick('') },
            '-',
            { label: 'Save', shortcut: `${MOD}S`, disabled: !current, action: () => save() },
            { label: 'Save All', disabled: !tabs.some(isDirty), action: saveAll },
            '-',
            { label: 'Close Editor', disabled: !current, action: () => closeTab(current) },
            { label: 'Close Window', action: () => win.close() },
          ],
        },
        {
          title: 'Edit',
          items: [
            { label: 'Undo', shortcut: `${MOD}Z`, disabled: !current, action: () => undo(view) },
            { label: 'Redo', shortcut: `${MOD}${MOD === '⌘' ? '⇧Z' : 'Y'}`, disabled: !current, action: () => redo(view) },
            '-',
            { label: 'Find', shortcut: `${MOD}F`, disabled: !current, action: () => openSearchPanel(view) },
            { label: 'Find in Files', action: () => showSide('search') },
          ],
        },
        {
          title: 'View',
          items: [
            { label: 'Command Palette…', shortcut: `${MOD === '⌘' ? '⇧⌘' : 'Ctrl+Shift+'}P`, action: () => quick('>') },
            '-',
            { label: 'Explorer', checked: sideOpen && sideView === 'explorer', action: () => showSide('explorer') },
            { label: 'Search', checked: sideOpen && sideView === 'search', action: () => showSide('search') },
            { label: 'Run and Debug', checked: sideOpen && sideView === 'run', action: () => showSide('run') },
            '-',
            { label: 'Side Bar', checked: sideOpen, shortcut: `${MOD}B`, action: toggleSide },
            { label: 'Terminal', checked: panelOpen, shortcut: 'Ctrl+`', action: togglePanel },
          ],
        },
        { title: 'Run', items: [{ label: 'Run Without Debugging', shortcut: 'F5', action: runCurrent }] },
        {
          title: 'Terminal',
          items: [
            { label: 'New Terminal', action: () => openPanel(true) },
            { label: 'Kill Terminal', disabled: !term, action: killTerminal },
          ],
        },
      ];
    },
  };

  // ---------- Window ----------
  function open({ folder, file } = {}) {
    const fresh = !win;
    if (fresh) build(folder || (file ? projectRoot(file) : PROJECTS));
    else os.restore(win);
    if (folder && !fresh) setWorkspace(folder);
    if (file) {
      if (!isInside(file, workspace)) setWorkspace(projectRoot(file));
      openFile(file);
    }
    win.focus();
  }

  function projectRoot(file) {
    if (isInside(file, PROJECTS) && file !== PROJECTS) return join(PROJECTS, file.slice(PROJECTS.length + 1).split('/')[0]);
    return dirname(file);
  }

  function build(folder) {
    workspace = fs.isDir(folder) ? folder : PROJECTS;
    win = os.openWindow(app, { title: 'VS Code', width: 1120, height: 680, minWidth: 620, minHeight: 360, titlebar: false, className: 'vs-win' });

    const commandCenter = h('button', { type: 'button', class: 'vs-command-center', onclick: () => quick('') }, icon(small.search), h('span'));
    const titlebar = h('header', { class: 'vs-titlebar', 'data-drag': '' },
      h('div', { class: 'vs-title-space' }),
      commandCenter,
      h('div', { class: 'vs-title-actions' },
        h('button', { type: 'button', class: 'vs-icon-btn', 'aria-label': 'Toggle side bar', onclick: toggleSide }, icon(small.sidebar)),
        h('button', { type: 'button', class: 'vs-icon-btn', 'aria-label': 'Toggle panel', onclick: togglePanel }, icon(small.panel))
      )
    );
    const activityButtons = {};
    const activityBar = h('nav', { class: 'vs-activity' },
      ...[['explorer', 'Explorer'], ['search', 'Search'], ['scm', 'Source Control'], ['run', 'Run and Debug']].map(([id, label]) => {
        activityButtons[id] = h('button', { type: 'button', class: 'vs-activity-btn', title: label, 'aria-label': label, onclick: () => showSide(id, true) }, icon(activity[id], 'ic vs-activity-ic'));
        return activityButtons[id];
      }),
      h('div', { class: 'vs-activity-spacer' }),
      h('span', { class: 'vs-activity-btn is-static', title: 'Accounts' }, icon(activity.account, 'ic vs-activity-ic')),
      h('span', { class: 'vs-activity-btn is-static', title: 'Manage' }, icon(activity.settings, 'ic vs-activity-ic'))
    );
    const side = h('aside', { class: 'vs-side' });
    const tabsEl = h('div', { class: 'vs-tabs' });
    const runBtn = h('button', { type: 'button', class: 'vs-icon-btn vs-run', title: 'Run JavaScript File (F5)', 'aria-label': 'Run file', onclick: runCurrent }, icon(small.play));
    const tabBar = h('div', { class: 'vs-tabbar' }, tabsEl, h('div', { class: 'vs-tab-actions' }, runBtn));
    const crumbs = h('div', { class: 'vs-crumbs' });
    const host = h('div', { class: 'vs-editor-host' });
    const welcome = welcomePage();
    const panelBody = h('div', { class: 'vs-panel-body' });
    const panelGrip = h('div', { class: 'vs-panel-grip' });
    const panel = h('section', { class: 'vs-panel' },
      panelGrip,
      h('header', { class: 'vs-panel-head' },
        h('span', { class: 'vs-panel-tab is-active', text: 'TERMINAL' }),
        h('div', { class: 'vs-panel-actions' },
          h('button', { type: 'button', class: 'vs-icon-btn', title: 'New Terminal', 'aria-label': 'New terminal', onclick: () => openPanel(true) }, icon(small.plus)),
          h('button', { type: 'button', class: 'vs-icon-btn', title: 'Kill Terminal', 'aria-label': 'Kill terminal', onclick: killTerminal }, icon(small.trash)),
          h('button', { type: 'button', class: 'vs-icon-btn', title: 'Close Panel', 'aria-label': 'Close panel', onclick: closePanel }, icon(small.close))
        )
      ),
      panelBody
    );
    panel.hidden = true;
    const editorArea = h('section', { class: 'vs-editor-area' }, tabBar, crumbs, host, welcome, panel);
    const status = h('footer', { class: 'vs-status' });
    const root = h('div', { class: 'vs' }, titlebar, h('div', { class: 'vs-main' }, activityBar, side, editorArea), status);
    win.body.append(root);

    view = new EditorView({ parent: host, state: EditorState.create({ doc: '' }) });
    ui = { commandCenter, activityButtons, side, tabsEl, runBtn, crumbs, host, welcome, panel, panelBody, status, root };

    // Panel height drag.
    panelGrip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const startY = e.clientY;
      const start = panelHeight;
      const move = (ev) => {
        panelHeight = clamp(start - (ev.clientY - startY), 90, editorArea.clientHeight - 80);
        panel.style.height = `${panelHeight}px`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });

    win.el.addEventListener('keydown', onKey, true);
    win.onFocus = () => current && view?.focus();
    win.beforeClose = confirmCloseWindow;
    win.onClose = () => {
      term?.dispose();
      view?.destroy();
      win = view = term = ui = null;
      docs.clear();
      tabs = [];
      current = null;
      panelOpen = false;
      expanded.clear();
    };
    renderAll();
  }

  function onKey(e) {
    const mod = modKey(e);
    const key = e.key.toLowerCase();
    let handled = true;
    if (mod && !e.shiftKey && key === 's') save();
    else if (mod && e.shiftKey && key === 'p') quick('>');
    else if (mod && !e.shiftKey && key === 'p') quick('');
    else if (e.ctrlKey && (e.code === 'Backquote' || e.key === '`')) togglePanel();
    else if (mod && !e.shiftKey && key === 'b') toggleSide();
    else if (e.key === 'F5') runCurrent();
    else if (e.key === 'F2' && selectedPath && e.target.closest('.vs-side')) startRename(selectedPath);
    else handled = false;
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function welcomePage() {
    const row = (label, key, action) =>
      h('button', { type: 'button', class: 'vs-welcome-row', onclick: action }, h('span', { text: label }), h('kbd', { text: key }));
    return h('div', { class: 'vs-welcome' },
      h('span', { class: 'vs-welcome-logo', html: glyphs.code }),
      h('div', { class: 'vs-welcome-list' },
        row('Show All Commands', MOD === '⌘' ? '⇧⌘P' : 'Ctrl+Shift+P', () => quick('>')),
        row('Go to File', `${MOD}P`, () => quick('')),
        row('Toggle Terminal', 'Ctrl+`', togglePanel),
        row('Run JavaScript File', 'F5', runCurrent),
        row('Save', `${MOD}S`, () => save())
      )
    );
  }

  // ---------- Files and tabs ----------
  function createState(content, path) {
    const lang = language(path)[1];
    return EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        theme,
        syntaxHighlighting(highlight),
        lang ? lang() : [],
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            renderTabs();
            updateTitle();
          }
          if (u.docChanged || u.selectionSet) renderStatus();
        }),
      ],
    });
  }

  const stateOf = (path) => (path === current && view ? view.state : docs.get(path)?.state);
  const isDirty = (path) => {
    const d = docs.get(path);
    return !!d && !stateOf(path).doc.eq(d.saved);
  };

  function openFile(path, line) {
    if (!fs.isFile(path)) return;
    if (!docs.has(path)) {
      const state = createState(fs.read(path), path);
      docs.set(path, { state, saved: state.doc });
      tabs.push(path);
    }
    if (isInside(path, workspace)) {
      for (let d = dirname(path); d !== workspace && isInside(d, workspace); d = dirname(d)) expanded.add(d);
    }
    selectedPath = path;
    activate(path);
    if (line) {
      const l = view.state.doc.line(clamp(line.number, 1, view.state.doc.lines));
      const from = l.from + clamp(line.col ?? 0, 0, l.length);
      view.dispatch({ selection: { anchor: from, head: from + (line.length ?? 0) }, scrollIntoView: true });
    }
  }

  function activate(path) {
    if (current && docs.has(current) && view) docs.get(current).state = view.state;
    current = path;
    if (path) view.setState(docs.get(path).state);
    renderAll();
    if (path) requestAnimationFrame(() => view?.focus());
  }

  function save(path = current) {
    if (!path || !docs.has(path)) return;
    const state = stateOf(path);
    quiet = true;
    try {
      fs.mkdir(dirname(path), true);
      fs.write(path, state.doc.toString());
      docs.get(path).saved = state.doc;
    } catch (e) {
      os.notify({ app: 'code', title: `Couldn't save ${basename(path)}`, body: e.message });
    } finally {
      quiet = false;
    }
    renderAll();
  }

  function saveAll() {
    tabs.filter(isDirty).forEach((p) => save(p));
  }

  async function closeTab(path, ask = true) {
    if (!path) return;
    if (ask && isDirty(path)) {
      const choice = await win.dialog({
        title: `Do you want to save the changes you made to ${basename(path)}?`,
        message: "Your changes will be lost if you don't save them.",
        buttons: [
          { label: "Don't Save", value: 'discard' },
          { label: 'Cancel', value: 'cancel', cancel: true },
          { label: 'Save', value: 'save', primary: true },
        ],
      });
      if (choice === 'save') save(path);
      else if (choice !== 'discard') return;
    }
    const i = tabs.indexOf(path);
    if (i < 0) return;
    tabs.splice(i, 1);
    docs.delete(path);
    if (current === path) {
      current = null;
      activate(tabs[Math.min(i, tabs.length - 1)] || null);
    } else renderAll();
  }

  async function confirmCloseWindow() {
    const dirty = tabs.filter(isDirty);
    if (!dirty.length) return true;
    const choice = await win.dialog({
      title: dirty.length === 1 ? `Do you want to save the changes you made to ${basename(dirty[0])}?` : `Do you want to save the changes to ${dirty.length} files?`,
      message: "Your changes will be lost if you don't save them.",
      buttons: [
        { label: "Don't Save", value: 'discard' },
        { label: 'Cancel', value: 'cancel', cancel: true },
        { label: dirty.length === 1 ? 'Save' : 'Save All', value: 'save', primary: true },
      ],
    });
    if (choice === 'save') saveAll();
    return choice === 'save' || choice === 'discard';
  }

  function setWorkspace(path) {
    if (!fs.isDir(path) || path === workspace) return;
    workspace = path;
    expanded.clear();
    selectedPath = null;
    renderAll();
  }

  // Files changed by the terminal or Finder: reload clean tabs, drop deleted ones.
  fs.onChange(() => {
    if (!win || quiet) return;
    for (const path of [...tabs]) {
      const d = docs.get(path);
      if (!fs.isFile(path)) {
        if (!isDirty(path)) closeTab(path, false);
        continue;
      }
      const disk = fs.read(path);
      if (isDirty(path) || d.saved.toString() === disk) continue;
      if (path === current) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: disk } });
        d.saved = view.state.doc;
      } else {
        d.state = d.state.update({ changes: { from: 0, to: d.state.doc.length, insert: disk } }).state;
        d.saved = d.state.doc;
      }
    }
    if (!fs.isDir(workspace)) workspace = fs.isDir(PROJECTS) ? PROJECTS : HOME;
    renderAll();
  });

  // ---------- Explorer actions ----------
  function startCreate(type, parent) {
    if (!win) return;
    if (!parent) {
      const sel = selectedPath && fs.stat(selectedPath);
      parent = sel ? (sel.type === 'dir' ? selectedPath : dirname(selectedPath)) : workspace;
    }
    if (!isInside(parent, workspace)) parent = workspace;
    if (parent !== workspace) expanded.add(parent);
    creating = { type, parent };
    renaming = null;
    showSide('explorer');
  }

  function finishCreate(input) {
    if (!creating) return;
    const { type, parent } = creating;
    const name = input.value.trim().replace(/^\/+|\/+$/g, '');
    if (!name) {
      creating = null;
      renderSide();
      return;
    }
    const path = join(parent, name);
    if (fs.exists(path)) {
      input.classList.add('is-invalid');
      input.title = `A file or folder ${name} already exists at this location.`;
      return;
    }
    creating = null;
    quiet = true;
    try {
      if (type === 'dir') fs.mkdir(path, true);
      else {
        fs.mkdir(dirname(path), true);
        fs.write(path, '');
      }
    } finally {
      quiet = false;
    }
    for (let d = dirname(path); isInside(d, workspace) && d !== workspace; d = dirname(d)) expanded.add(d);
    if (type === 'dir') {
      expanded.add(path);
      selectedPath = path;
      renderAll();
    } else openFile(path);
  }

  function startRename(path) {
    renaming = path;
    creating = null;
    selectedPath = path;
    showSide('explorer');
  }

  function finishRename(input, from) {
    if (renaming !== from) return;
    renaming = null;
    const name = input.value.trim();
    const to = join(dirname(from), name);
    if (!name || name.includes('/') || to === from || fs.exists(to)) {
      renderSide();
      return;
    }
    quiet = true;
    try {
      fs.move(from, to);
    } finally {
      quiet = false;
    }
    // Open tabs follow the file (or everything inside a renamed folder).
    for (const [path, d] of [...docs]) {
      if (!isInside(path, from)) continue;
      const moved = to + path.slice(from.length);
      docs.delete(path);
      docs.set(moved, d);
      tabs = tabs.map((p) => (p === path ? moved : p));
      if (current === path) current = moved;
    }
    if (expanded.delete(from)) expanded.add(to);
    selectedPath = to;
    renderAll();
  }

  function trashPath(path) {
    const name = basename(path);
    const bin = `${HOME}/.Trash`;
    fs.move(path, join(bin, fs.freeName(bin, name)));
  }

  function treeMenu(e, path) {
    const node = path && fs.stat(path);
    const items = [];
    if (!node || node.type === 'dir') {
      const dir = path || workspace;
      items.push(
        { label: 'New File…', action: () => startCreate('file', dir) },
        { label: 'New Folder…', action: () => startCreate('dir', dir) },
        { label: 'Open in Integrated Terminal', action: () => openPanel(true, dir) },
        { label: 'Reveal in Finder', action: () => ctx.openFinder(dir) }
      );
    } else {
      items.push({ label: 'Open', action: () => openFile(path) });
      if (RUNNABLE.includes(extname(path))) items.push({ label: 'Run in Terminal', action: () => runFile(path) });
      items.push({ label: 'Reveal in Finder', action: () => ctx.openFinder(dirname(path), basename(path)) });
    }
    if (path) {
      items.push(
        '-',
        { label: 'Copy Path', action: () => navigator.clipboard?.writeText(path).catch(() => {}) },
        '-',
        { label: 'Rename…', shortcut: 'F2', action: () => startRename(path) },
        { label: 'Delete', action: () => trashPath(path) }
      );
    }
    os.contextMenu(e, items);
  }

  // ---------- Run ----------
  function runFile(path) {
    if (isDirty(path)) save(path);
    openPanel(false);
    const rel = isInside(path, term.cwd) && path !== term.cwd ? path.slice(term.cwd.length + (term.cwd === '/' ? 0 : 1)) : pretty(path);
    term.type(`node ${rel.startsWith('~/') ? `~/${rel.slice(2).split('/').map(quoteArg).join('/')}` : quoteArg(rel)}`);
  }

  function runCurrent() {
    if (!win) return;
    if (!current) {
      os.notify({ app: 'code', title: 'Nothing to run', body: 'Open a JavaScript file first, for example Documents/hello.js.' });
      return;
    }
    runFile(current);
  }

  // ---------- Panel and side bar ----------
  function openPanel(fresh, cwd) {
    if (fresh && term) killTerminal();
    if (!term) {
      term = createTerminal(ctx, {
        cwd: cwd || workspace,
        banner: false,
        onExit: () => {
          killTerminal();
          closePanel();
        },
      });
      ui.panelBody.replaceChildren(term.el);
    } else if (cwd) term.cd(cwd);
    panelOpen = true;
    ui.panel.hidden = false;
    ui.panel.style.height = `${panelHeight}px`;
    requestAnimationFrame(() => term?.focus());
  }

  function closePanel() {
    panelOpen = false;
    if (ui) ui.panel.hidden = true;
    view?.focus();
  }

  function togglePanel() {
    if (panelOpen) closePanel();
    else openPanel(false);
  }

  function killTerminal() {
    term?.dispose();
    term = null;
    ui?.panelBody.replaceChildren();
  }

  function toggleSide() {
    sideOpen = !sideOpen;
    renderSide();
  }

  function showSide(id, toggle = false) {
    if (toggle && sideOpen && sideView === id) sideOpen = false;
    else {
      sideOpen = true;
      sideView = id;
    }
    renderSide();
    if (sideOpen && id === 'search') requestAnimationFrame(() => ui?.side.querySelector('.vs-search-input')?.focus());
  }

  function pickFolder() {
    const dirs = [];
    const walk = (p) => {
      for (const e of fs.list(p)) {
        if (e.type !== 'dir' || e.name.startsWith('.')) continue;
        dirs.push(e.path);
        walk(e.path);
      }
    };
    walk(HOME);
    quick('', {
      placeholder: 'Open a folder',
      items: (q) =>
        [HOME, ...dirs]
          .map((p) => ({ p, score: fuzzy(q, pretty(p)) }))
          .filter((x) => x.score)
          .sort((a, b) => b.score - a.score)
          .slice(0, 60)
          .map(({ p }) => ({ label: basename(p), detail: pretty(p), run: () => setWorkspace(p) })),
    });
  }

  // ---------- Quick open and command palette ----------
  function commands() {
    return [
      { label: 'File: Save', key: `${MOD}S`, run: () => save() },
      { label: 'File: Save All', run: saveAll },
      { label: 'File: New File…', run: () => startCreate('file') },
      { label: 'File: New Folder…', run: () => startCreate('dir') },
      { label: 'File: Open Folder…', run: pickFolder },
      { label: 'Go to File…', key: `${MOD}P`, run: () => quick('') },
      { label: 'View: Close Editor', run: () => closeTab(current) },
      { label: 'View: Toggle Terminal', key: 'Ctrl+`', run: togglePanel },
      { label: 'View: Toggle Primary Side Bar Visibility', key: `${MOD}B`, run: toggleSide },
      { label: 'View: Show Explorer', run: () => showSide('explorer') },
      { label: 'View: Show Search', run: () => showSide('search') },
      { label: 'Run: Run Without Debugging', key: 'F5', run: runCurrent },
      { label: 'Terminal: Create New Terminal', run: () => openPanel(true) },
      { label: 'Help: Step Back from the Computer', run: () => ctx.leave() },
    ];
  }

  function quick(prefix, custom) {
    if (!win) return;
    ui.root.querySelector('.vs-quick-backdrop')?.remove();
    const input = h('input', { class: 'vs-quick-input', spellcheck: 'false', value: prefix, placeholder: custom?.placeholder || 'Search files by name (type > for commands)' });
    const list = h('div', { class: 'vs-quick-list', role: 'listbox' });
    const box = h('div', { class: 'vs-quick' }, input, list);
    const backdrop = h('div', { class: 'vs-quick-backdrop' }, box);
    let items = [];
    let index = 0;

    const close = () => {
      backdrop.remove();
      if (current) view?.focus();
    };

    function compute() {
      const q = input.value;
      if (custom) return custom.items(q.trim());
      if (q.startsWith('>')) {
        const query = q.slice(1).trim();
        return commands()
          .map((c) => ({ ...c, score: fuzzy(query, c.label) }))
          .filter((c) => c.score)
          .sort((a, b) => (query ? b.score - a.score : 0))
          .map((c) => ({ label: c.label, key: c.key, run: c.run }));
      }
      const query = q.trim();
      return fs
        .walk(workspace)
        .map((p) => {
          const rel = p.slice(workspace.length + 1);
          const score = fuzzy(query, basename(p)) * 2 || fuzzy(query, rel);
          return { p, rel, score };
        })
        .filter((x) => x.score)
        .sort((a, b) => b.score - a.score || a.rel.localeCompare(b.rel))
        .slice(0, 50)
        .map(({ p, rel }) => ({ label: basename(p), detail: dirname(rel) === '.' || !rel.includes('/') ? '' : dirname(rel), mark: fileMark(p), run: () => openFile(p) }));
    }

    function draw() {
      items = compute();
      index = clamp(index, 0, Math.max(0, items.length - 1));
      list.replaceChildren(
        ...(items.length
          ? items.map((item, i) =>
              h('div', { class: `vs-quick-item${i === index ? ' is-active' : ''}`, role: 'option', onpointerdown: (e) => { e.preventDefault(); pick(i); } },
                item.mark ? h('span', { class: 'vs-mark', style: { color: item.mark[1] }, text: item.mark[0] }) : null,
                h('span', { class: 'vs-quick-label', text: item.label }),
                item.detail ? h('span', { class: 'vs-quick-detail', text: item.detail }) : null,
                item.key ? h('kbd', { text: item.key }) : null
              )
            )
          : [h('div', { class: 'vs-quick-none', text: input.value.startsWith('>') ? 'No matching commands' : 'No matching results' })])
      );
      list.children[index]?.scrollIntoView({ block: 'nearest' });
    }

    function pick(i) {
      const item = items[i];
      close();
      item?.run();
    }

    input.addEventListener('input', () => {
      index = 0;
      draw();
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        index = clamp(index + (e.key === 'ArrowDown' ? 1 : -1), 0, Math.max(0, items.length - 1));
        draw();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        pick(index);
      } else if (e.key === 'Escape') close();
    });
    backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === backdrop) close();
    });
    ui.root.append(backdrop);
    draw();
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  // ---------- Drawing ----------
  function updateTitle() {
    if (!win) return;
    const name = basename(workspace);
    win.setTitle(current ? `${basename(current)}${isDirty(current) ? ' ●' : ''} — ${name}` : `${name} — VS Code`);
    ui.commandCenter.lastChild.textContent = name;
  }

  function renderAll() {
    if (!win) return;
    renderSide();
    renderTabs();
    renderCrumbs();
    renderStatus();
    updateTitle();
    ui.host.hidden = !current;
    ui.welcome.hidden = !!current;
    ui.runBtn.hidden = !current || !RUNNABLE.includes(extname(current));
  }

  function renderTabs() {
    if (!win) return;
    ui.tabsEl.replaceChildren(
      ...tabs.map((path) => {
        const [mark, color] = fileMark(path);
        const dirty = isDirty(path);
        const close = h('button', { type: 'button', class: 'vs-tab-close', 'aria-label': `Close ${basename(path)}` }, icon(small.close));
        close.addEventListener('click', (e) => {
          e.stopPropagation();
          closeTab(path);
        });
        const tab = h('div', { class: `vs-tab${path === current ? ' is-active' : ''}${dirty ? ' is-dirty' : ''}`, title: pretty(path), role: 'tab' },
          h('span', { class: 'vs-mark', style: { color }, text: mark }),
          h('span', { class: 'vs-tab-name', text: basename(path) }),
          close
        );
        tab.addEventListener('pointerdown', (e) => {
          if (e.button === 1) {
            e.preventDefault();
            closeTab(path);
          } else if (e.button === 0 && path !== current) activate(path);
        });
        return tab;
      })
    );
    ui.tabsEl.querySelector('.is-active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderCrumbs() {
    if (!current) {
      ui.crumbs.replaceChildren();
      ui.crumbs.hidden = true;
      return;
    }
    ui.crumbs.hidden = false;
    const inside = isInside(current, workspace);
    const parts = inside ? [basename(workspace), ...current.slice(workspace.length + 1).split('/')] : pretty(current).split('/').filter(Boolean);
    const [mark, color] = fileMark(current);
    ui.crumbs.replaceChildren(
      ...parts
        .flatMap((p, i) => [
          i ? h('span', { class: 'vs-crumb-sep', html: small.chevron }) : null,
          i === parts.length - 1 ? h('span', { class: 'vs-mark', style: { color }, text: mark }) : null,
          h('span', { class: 'vs-crumb', text: p }),
        ])
        .filter(Boolean)
    );
  }

  function renderStatus() {
    if (!win) return;
    const items = [];
    if (current && view) {
      const sel = view.state.selection.main;
      const line = view.state.doc.lineAt(sel.head);
      const picked = Math.abs(sel.to - sel.from);
      items.push(`Ln ${line.number}, Col ${sel.head - line.from + 1}${picked ? ` (${picked} selected)` : ''}`, 'Spaces: 2', 'UTF-8', 'LF', language(current)[0]);
    }
    ui.status.replaceChildren(
      h('span', { class: 'vs-status-remote', html: '<svg viewBox="0 0 16 16"><path d="M3 6l3-3M3 6l3 3M13 10l-3-3M13 10l-3 3" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>' }),
      h('span', { class: 'vs-status-item', text: '⊗ 0   ⚠ 0' }),
      h('span', { class: 'vs-status-spacer' }),
      ...items.map((text) => h('span', { class: 'vs-status-item', text }))
    );
  }

  function renderSide() {
    if (!win) return;
    ui.root.classList.toggle('vs-no-side', !sideOpen);
    for (const [id, b] of Object.entries(ui.activityButtons)) b.classList.toggle('is-active', sideOpen && id === sideView);
    if (!sideOpen) return;
    if (sideView === 'explorer') renderExplorer();
    else if (sideView === 'search') renderSearch();
    else if (sideView === 'scm') {
      ui.side.replaceChildren(
        h('div', { class: 'vs-side-head', text: 'SOURCE CONTROL' }),
        h('p', { class: 'vs-side-note', text: "The folder currently open doesn't have a Git repository, and Git isn't installed on this computer." })
      );
    } else {
      ui.side.replaceChildren(
        h('div', { class: 'vs-side-head', text: 'RUN AND DEBUG' }),
        h('div', { class: 'vs-side-pad' },
          h('button', { type: 'button', class: 'vs-primary', text: 'Run and Debug', onclick: runCurrent }),
          h('p', { class: 'vs-side-note', text: 'Opens the terminal below and runs the JavaScript file you are editing with node. Press F5 any time to do the same.' })
        )
      );
    }
  }

  function renderExplorer() {
    const tree = h('div', { class: 'vs-tree', role: 'tree', tabindex: '0' });
    const head = h('div', { class: 'vs-section-head' },
      h('span', { class: 'vs-section-chev', html: small.chevron }),
      h('span', { class: 'vs-section-name', text: basename(workspace).toUpperCase() || '/' }),
      h('div', { class: 'vs-section-actions' },
        h('button', { type: 'button', class: 'vs-icon-btn', title: 'New File…', 'aria-label': 'New file', onclick: () => startCreate('file') }, icon(small.newFile)),
        h('button', { type: 'button', class: 'vs-icon-btn', title: 'New Folder…', 'aria-label': 'New folder', onclick: () => startCreate('dir') }, icon(small.newFolder)),
        h('button', { type: 'button', class: 'vs-icon-btn', title: 'Collapse Folders', 'aria-label': 'Collapse folders', onclick: () => { expanded.clear(); renderSide(); } }, icon(small.collapse))
      )
    );
    tree.append(...treeRows(workspace, 0));
    tree.addEventListener('click', (e) => {
      const row = e.target.closest('[data-path]');
      if (!row) return;
      const path = row.dataset.path;
      selectedPath = path;
      if (fs.isDir(path)) {
        if (expanded.has(path)) expanded.delete(path);
        else expanded.add(path);
        renderSide();
      } else openFile(path);
    });
    tree.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('[data-path]');
      if (row) selectedPath = row.dataset.path;
      treeMenu(e, row ? row.dataset.path : null);
    });
    ui.side.replaceChildren(h('div', { class: 'vs-side-head', text: 'EXPLORER' }), head, tree);
    tree.querySelector('input')?.focus();
  }

  function inputRow(depth, value, onCommit, onCancel, isDir) {
    const input = h('input', { class: 'vs-tree-input', value, spellcheck: 'false' });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') onCommit(input);
      if (e.key === 'Escape') onCancel();
    });
    input.addEventListener('blur', () => setTimeout(() => input.isConnected && onCommit(input), 0));
    input.addEventListener('click', (e) => e.stopPropagation());
    requestAnimationFrame(() => {
      input.focus();
      const dot = isDir ? -1 : value.lastIndexOf('.');
      input.setSelectionRange(0, dot > 0 ? dot : value.length);
    });
    return h('div', { class: 'vs-row vs-row-input', style: { paddingLeft: `${10 + depth * 12}px` } },
      h('span', { class: 'vs-chev', html: isDir ? small.chevron : '' }),
      input
    );
  }

  function treeRows(dir, depth) {
    const rows = [];
    if (creating?.parent === dir) {
      rows.push(inputRow(depth, '', finishCreate, () => {
        creating = null;
        renderSide();
      }, creating.type === 'dir'));
    }
    const entries = fs
      .list(dir)
      .filter((e) => !e.name.startsWith('.'))
      .sort((a, b) => (a.type === b.type ? 0 : a.type === 'dir' ? -1 : 1));
    for (const e of entries) {
      const isDir = e.type === 'dir';
      if (renaming === e.path) {
        rows.push(inputRow(depth, e.name, (input) => finishRename(input, e.path), () => {
          renaming = null;
          renderSide();
        }, isDir));
      } else {
        const [mark, color] = fileMark(e.path);
        rows.push(
          h('div', {
            class: `vs-row${e.path === current ? ' is-active' : ''}${e.path === selectedPath ? ' is-selected' : ''}${isDirty(e.path) ? ' is-dirty' : ''}`,
            style: { paddingLeft: `${10 + depth * 12}px` },
            'data-path': e.path,
            role: 'treeitem',
            title: pretty(e.path),
          },
          h('span', { class: `vs-chev${isDir && expanded.has(e.path) ? ' is-open' : ''}`, html: isDir ? small.chevron : '' }),
          isDir ? null : h('span', { class: 'vs-mark', style: { color }, text: mark }),
          h('span', { class: 'vs-row-name', text: e.name }))
        );
      }
      if (isDir && expanded.has(e.path)) rows.push(...treeRows(e.path, depth + 1));
    }
    return rows;
  }

  function renderSearch() {
    const input = h('input', { class: 'vs-search-input', placeholder: 'Search', value: searchQuery, spellcheck: 'false' });
    const results = h('div', { class: 'vs-search-results' });
    const summary = h('p', { class: 'vs-side-note' });
    const run = () => {
      searchQuery = input.value;
      const q = searchQuery.toLowerCase();
      results.replaceChildren();
      if (!q) {
        summary.textContent = '';
        return;
      }
      let total = 0;
      let files = 0;
      for (const path of fs.walk(workspace)) {
        const lines = fs.read(path).split('\n');
        const hits = [];
        lines.forEach((text, i) => {
          const col = text.toLowerCase().indexOf(q);
          if (col >= 0 && hits.length < 50) hits.push({ number: i + 1, col, text });
        });
        if (!hits.length) continue;
        files++;
        total += hits.length;
        const [mark, color] = fileMark(path);
        const rel = path.slice(workspace.length + 1);
        results.append(
          h('div', { class: 'vs-search-file' },
            h('span', { class: 'vs-mark', style: { color }, text: mark }),
            h('span', { class: 'vs-row-name', text: basename(path) }),
            h('span', { class: 'vs-quick-detail', text: rel.includes('/') ? dirname(rel) : '' }),
            h('span', { class: 'vs-badge', text: String(hits.length) })
          ),
          ...hits.map((hit) => {
            const start = Math.max(0, hit.col - 18);
            const before = (start ? '…' : '') + hit.text.slice(start, hit.col).trimStart();
            return h('button', {
              type: 'button',
              class: 'vs-search-hit',
              onclick: () => openFile(path, { number: hit.number, col: hit.col, length: q.length }),
            },
            h('span', { text: before }),
            h('mark', { text: hit.text.slice(hit.col, hit.col + q.length) }),
            h('span', { text: hit.text.slice(hit.col + q.length, hit.col + q.length + 60) }));
          })
        );
      }
      summary.textContent = total ? `${total} result${total === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}` : 'No results found.';
    };
    let timer = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(run, 120);
    });
    ui.side.replaceChildren(h('div', { class: 'vs-side-head', text: 'SEARCH' }), h('div', { class: 'vs-side-pad' }, input), summary, results);
    run();
  }

  return app;
}
