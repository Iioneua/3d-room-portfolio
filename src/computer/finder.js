import { h, icon } from './dom.js';
import { HOME, TRASH, basename, dirname, join, pretty, extname, kindOf, formatSize, formatDate } from './fs.js';
import { folderIcon, fileIcon, small } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { PROJECTS, DESKTOP, DOCUMENTS } from './seed.js';
import { quoteArg } from './terminal.js';

const DOWNLOADS = `${HOME}/Downloads`;

const PLACES = [
  { label: 'Projects', path: PROJECTS, icon: 'projects' },
  { label: 'Desktop', path: DESKTOP, icon: 'desktop' },
  { label: 'Documents', path: DOCUMENTS, icon: 'documents' },
  { label: 'Downloads', path: DOWNLOADS, icon: 'downloads' },
  { label: 'guest', path: HOME, icon: 'home' },
];

const BADGES = { [PROJECTS]: 'projects', [DESKTOP]: 'desktop', [DOCUMENTS]: 'documents', [DOWNLOADS]: 'downloads', [HOME]: 'home' };
export const iconFor = (path, type) => (type === 'dir' ? folderIcon(BADGES[path]) : fileIcon(path));

const RUNNABLE = ['js', 'mjs', 'cjs'];

export function titleFor(path) {
  if (path === '/') return 'Macintosh HD';
  if (path === TRASH) return 'Trash';
  return basename(path);
}

export function createFinder(ctx) {
  const { fs, os } = ctx;
  const instances = new Set();
  const projectOf = (path) => (dirname(path) === PROJECTS ? ctx.projects.find((p) => p.name === basename(path)) : null);

  const app = {
    id: 'finder',
    name: 'Finder',
    launch: ({ path } = {}) => openFinder(path || PROJECTS),
    menus: (win) => {
      const f = win?.finder;
      const sel = f?.selection();
      return [
        {
          title: 'File',
          items: [
            { label: 'New Finder Window', action: () => openFinder(f?.path || PROJECTS) },
            { label: 'New Folder', disabled: !f, action: () => f.newFolder() },
            '-',
            { label: 'Open', disabled: !sel, action: () => f.open(sel) },
            { label: 'Open in VS Code', disabled: !f, action: () => ctx.openCode(sel ? target(sel) : { folder: f.path }) },
            '-',
            { label: 'Move to Trash', disabled: !sel || f.path === TRASH, action: () => f.trash(sel) },
            '-',
            { label: 'Close Window', disabled: !win, action: () => win.close() },
          ],
        },
        {
          title: 'View',
          items: [
            { label: 'as Icons', checked: f?.view === 'icons', disabled: !f, action: () => f.setView('icons') },
            { label: 'as List', checked: f?.view === 'list', disabled: !f, action: () => f.setView('list') },
            '-',
            { label: 'Show Preview', checked: !!f?.showPreview, disabled: !f, action: () => f.togglePreview() },
          ],
        },
        {
          title: 'Go',
          items: [
            ...PLACES.map((p) => ({ label: p.path === HOME ? 'Home' : p.label, action: () => (f ? f.go(p.path) : openFinder(p.path)) })),
            { label: 'Trash', action: () => (f ? f.go(TRASH) : openFinder(TRASH)) },
          ],
        },
      ];
    },
  };

  const target = (entry) => (entry.type === 'dir' ? { folder: entry.path } : { file: entry.path });

  function openFinder(path, { select } = {}) {
    const existing = [...instances].find((f) => f.path === path);
    if (existing) {
      os.restore(existing.win);
      if (select) existing.select(select);
      return existing;
    }
    const f = finderWindow(path);
    if (select) f.select(select);
    return f;
  }

  fs.onChange(() => instances.forEach((f) => f.refresh()));

  function finderWindow(startPath) {
    const state = { path: startPath, back: [], forward: [], view: 'icons', selected: null, preview: true, renaming: null };
    const win = os.openWindow(app, {
      title: titleFor(startPath),
      width: 960,
      height: 580,
      minWidth: 560,
      minHeight: 340,
      titlebar: false,
      className: 'finder-win',
    });

    // ---------- Layout ----------
    const placeButtons = PLACES.map((p) =>
      h('button', { type: 'button', class: 'finder-place', 'data-path': p.path, onclick: () => go(p.path) }, icon(small[p.icon]), h('span', { text: p.label }))
    );
    const sidebar = h('aside', { class: 'finder-side', 'data-drag': '' }, h('p', { class: 'finder-side-head', text: 'Favourites' }), placeButtons);
    const backBtn = h('button', { type: 'button', class: 'finder-tool', 'aria-label': 'Back', onclick: () => history(-1) }, icon(small.back));
    const fwdBtn = h('button', { type: 'button', class: 'finder-tool', 'aria-label': 'Forward', onclick: () => history(1) }, icon(small.forward));
    const titleEl = h('h2', { class: 'finder-title' });
    const iconsBtn = h('button', { type: 'button', class: 'finder-seg', 'aria-label': 'Icons', onclick: () => setView('icons') }, icon(small.grid));
    const listBtn = h('button', { type: 'button', class: 'finder-seg', 'aria-label': 'List', onclick: () => setView('list') }, icon(small.list));
    const emptyBtn = h('button', { type: 'button', class: 'finder-empty-trash', text: 'Empty', onclick: () => emptyTrash() });
    const bar = h('header', { class: 'finder-bar', 'data-drag': '' },
      h('div', { class: 'finder-nav' }, backBtn, fwdBtn),
      titleEl,
      h('div', { class: 'finder-spacer' }),
      emptyBtn,
      h('div', { class: 'finder-segs' }, iconsBtn, listBtn)
    );
    const content = h('div', { class: 'finder-content', tabindex: '0' });
    const preview = h('aside', { class: 'finder-preview' });
    const pathbar = h('footer', { class: 'finder-path' });
    const main = h('section', { class: 'finder-main' }, bar, h('div', { class: 'finder-panes' }, content, preview), pathbar);
    win.body.append(sidebar, main);

    // ---------- Navigation ----------
    function go(path, record = true) {
      if (path === state.path) return;
      if (record) {
        state.back.push(state.path);
        state.forward = [];
      }
      state.path = path;
      state.selected = null;
      state.renaming = null;
      render();
    }

    function history(step) {
      const from = step < 0 ? state.back : state.forward;
      const to = step < 0 ? state.forward : state.back;
      if (!from.length) return;
      to.push(state.path);
      state.path = from.pop();
      state.selected = null;
      render();
    }

    function setView(view) {
      state.view = view;
      render();
    }

    const entries = () => fs.list(state.path).filter((e) => !e.name.startsWith('.'));
    const selection = () => (state.selected ? entries().find((e) => e.name === state.selected) || null : null);

    function select(name) {
      state.selected = name;
      for (const el of content.querySelectorAll('[data-name]')) el.classList.toggle('is-selected', el.dataset.name === name);
      renderPreview();
      renderPath();
    }

    function open(entry) {
      if (!entry) return;
      if (entry.type === 'dir') go(entry.path);
      else ctx.openCode({ file: entry.path });
    }

    // ---------- Changes ----------
    function newFolder() {
      const name = fs.freeName(state.path, 'untitled folder');
      fs.mkdir(join(state.path, name));
      state.selected = name;
      state.renaming = name;
      render();
    }

    function newFile() {
      const name = fs.freeName(state.path, 'untitled.txt');
      fs.write(join(state.path, name), '');
      state.selected = name;
      state.renaming = name;
      render();
    }

    function trash(entry) {
      if (!entry) return;
      if (state.path === TRASH) {
        fs.remove(entry.path, true);
        return;
      }
      fs.move(entry.path, join(TRASH, fs.freeName(TRASH, entry.name)));
      state.selected = null;
    }

    async function emptyTrash() {
      if (!fs.list(TRASH).length) return;
      const ok = await win.dialog({
        title: 'Are you sure you want to permanently erase the items in the Trash?',
        message: "You can't undo this action.",
        buttons: [
          { label: 'Cancel', value: false, cancel: true },
          { label: 'Empty Trash', value: true, primary: true },
        ],
      });
      if (ok) for (const e of fs.list(TRASH)) fs.remove(e.path, true);
    }

    function startRename(name) {
      state.selected = name;
      state.renaming = name;
      render();
    }

    function commitRename(input, oldName) {
      if (state.renaming !== oldName) return;
      state.renaming = null;
      const name = input.value.trim();
      if (name && name !== oldName && !name.includes('/') && !fs.exists(join(state.path, name))) {
        fs.move(join(state.path, oldName), join(state.path, name));
        state.selected = name;
      }
      render();
      content.focus();
    }

    // ---------- Drawing ----------
    function label(entry) {
      if (state.renaming !== entry.name) return h('span', { class: 'finder-label', text: entry.name });
      const input = h('input', { class: 'finder-rename', value: entry.name, spellcheck: 'false' });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commitRename(input, entry.name);
        if (e.key === 'Escape') {
          state.renaming = null;
          render();
        }
      });
      input.addEventListener('blur', () => commitRename(input, entry.name));
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      requestAnimationFrame(() => {
        input.focus();
        const dot = entry.type === 'file' ? entry.name.lastIndexOf('.') : -1;
        input.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
      });
      return input;
    }

    function render() {
      if (!fs.isDir(state.path)) {
        let p = state.path;
        while (!fs.isDir(p)) p = dirname(p);
        state.path = p;
      }
      const list = entries();
      if (state.selected && !list.some((e) => e.name === state.selected)) state.selected = null;
      const title = titleFor(state.path);
      titleEl.textContent = title;
      win.setTitle(title);
      for (const b of placeButtons) b.classList.toggle('is-active', b.dataset.path === state.path);
      backBtn.disabled = !state.back.length;
      fwdBtn.disabled = !state.forward.length;
      iconsBtn.classList.toggle('is-on', state.view === 'icons');
      listBtn.classList.toggle('is-on', state.view === 'list');
      emptyBtn.hidden = state.path !== TRASH;
      emptyBtn.disabled = !list.length;
      content.className = `finder-content is-${state.view}`;
      win.el.classList.toggle('finder-no-preview', !state.preview);

      if (state.view === 'icons') {
        content.replaceChildren(
          ...list.map((e) =>
            h('div', { class: `finder-item${e.name === state.selected ? ' is-selected' : ''}`, 'data-name': e.name, title: e.name },
              h('span', { class: 'finder-icon', html: iconFor(e.path, e.type) }),
              label(e)
            )
          )
        );
      } else {
        content.replaceChildren(
          h('div', { class: 'finder-row finder-head' }, ...['Name', 'Date Modified', 'Size', 'Kind'].map((t) => h('span', { text: t }))),
          ...list.map((e) =>
            h('div', { class: `finder-row${e.name === state.selected ? ' is-selected' : ''}`, 'data-name': e.name },
              h('span', { class: 'finder-row-name' }, h('span', { class: 'finder-mini', html: iconFor(e.path, e.type) }), label(e)),
              h('span', { text: formatDate(e.node.mtime) }),
              h('span', { text: e.type === 'dir' ? '--' : formatSize(fs.size(e.path)) }),
              h('span', { text: kindOf(e.path, e.type) })
            )
          )
        );
      }
      if (!list.length) content.append(h('p', { class: 'finder-empty', text: state.path === TRASH ? 'The Trash is empty.' : 'This folder is empty.' }));
      renderPreview();
      renderPath();
    }

    function renderPath() {
      const parts = [];
      let p = state.path;
      while (true) {
        parts.unshift(p);
        if (p === '/') break;
        p = dirname(p);
      }
      const crumbs = [];
      parts.forEach((part, i) => {
        if (i) crumbs.push(h('span', { class: 'finder-crumb-sep', html: small.chevron }));
        crumbs.push(h('button', { type: 'button', class: 'finder-crumb', text: titleFor(part), onclick: () => go(part) }));
      });
      const count = entries().length;
      pathbar.replaceChildren(
        h('div', { class: 'finder-crumbs' }, crumbs),
        h('span', { class: 'finder-count', text: `${count} item${count === 1 ? '' : 's'}${state.selected ? ', 1 selected' : ''}` })
      );
    }

    function infoRows(rows) {
      return h('dl', { class: 'finder-info' }, rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
    }

    function actions(...buttons) {
      return h('div', { class: 'finder-actions' }, buttons.filter(Boolean));
    }

    const button = (text, onclick, primary) => h('button', { type: 'button', class: `finder-btn${primary ? ' is-primary' : ''}`, text, onclick });

    function projectCard(entry, project) {
      const files = fs.walk(entry.path).length;
      return [
        h('span', { class: 'finder-preview-icon', html: folderIcon() }),
        h('h3', { text: project.title || project.name }),
        h('p', { class: 'finder-preview-text', text: project.about || project.description }),
        project.stack?.length ? h('div', { class: 'finder-tags' }, project.stack.map((s) => h('span', { text: s }))) : null,
        infoRows([
          ['Folder', project.name],
          ...(project.year ? [['Year', project.year]] : []),
          ['Files', String(files)],
        ]),
        actions(
          button('Open', () => go(entry.path), true),
          button('Open in VS Code', () => ctx.openCode({ folder: entry.path })),
          project.link
            ? h('a', { class: 'finder-btn', href: project.link, target: '_blank', rel: 'noopener noreferrer' }, 'View online', icon(small.external))
            : null
        ),
      ];
    }

    function filePreview(entry) {
      const ext = extname(entry.path);
      const text = fs.read(entry.path);
      let body;
      if (ext === 'md') body = h('div', { class: 'finder-doc', html: renderMarkdown(text) });
      else body = h('pre', { class: 'finder-code', text: text.split('\n').slice(0, 80).join('\n') || ' ' });
      return [
        body,
        h('h3', { class: 'finder-preview-name', text: entry.name }),
        infoRows([
          ['Kind', kindOf(entry.path, 'file')],
          ['Size', formatSize(fs.size(entry.path))],
          ['Modified', formatDate(entry.node.mtime)],
        ]),
        actions(
          button('Open in VS Code', () => ctx.openCode({ file: entry.path }), true),
          RUNNABLE.includes(ext) ? button('Run in Terminal', () => ctx.openTerminal({ cwd: dirname(entry.path), command: `node ${quoteArg(entry.name)}` })) : null
        ),
      ];
    }

    function folderPreview(path, name) {
      const count = fs.list(path).filter((e) => !e.name.startsWith('.')).length;
      const readme = join(path, 'README.md');
      const project = projectOf(path);
      if (project) return projectCard({ path, name }, project).concat(fs.isFile(readme) ? [h('div', { class: 'finder-doc', html: renderMarkdown(fs.read(readme)) })] : []);
      const out = [
        h('span', { class: 'finder-preview-icon', html: folderIcon(BADGES[path]) }),
        h('h3', { text: name }),
        infoRows([
          ['Kind', 'Folder'],
          ['Contains', `${count} item${count === 1 ? '' : 's'}`],
          ['Modified', formatDate(fs.stat(path).mtime)],
        ]),
      ];
      if (path === PROJECTS && !state.selected) out.splice(2, 0, h('p', { class: 'finder-preview-text', text: 'Select a project to see what it is. Double-click it to look inside.' }));
      if (fs.isFile(readme)) out.push(h('div', { class: 'finder-doc', html: renderMarkdown(fs.read(readme)) }));
      return out;
    }

    function renderPreview() {
      const sel = selection();
      let parts;
      if (!sel) parts = folderPreview(state.path, titleFor(state.path));
      else if (sel.type === 'dir') {
        const project = projectOf(sel.path);
        parts = project ? projectCard(sel, project) : folderPreview(sel.path, sel.name);
      } else parts = filePreview(sel);
      preview.replaceChildren(...parts.filter(Boolean));
      preview.scrollTop = 0;
    }

    // ---------- Pointer and keys ----------
    const entryAt = (target) => {
      const el = target.closest('[data-name]');
      return el ? entries().find((e) => e.name === el.dataset.name) : null;
    };

    content.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.finder-rename')) return;
      const entry = entryAt(e.target);
      if (entry || !e.target.closest('.finder-head')) select(entry ? entry.name : null);
    });
    content.addEventListener('dblclick', (e) => open(entryAt(e.target)));
    content.addEventListener('contextmenu', (e) => {
      const entry = entryAt(e.target);
      if (entry) {
        select(entry.name);
        const inTrash = state.path === TRASH;
        os.contextMenu(e, [
          { label: 'Open', action: () => open(entry) },
          { label: 'Open in VS Code', action: () => ctx.openCode(target(entry)) },
          entry.type === 'dir'
            ? { label: 'New Terminal at Folder', action: () => ctx.openTerminal({ cwd: entry.path }) }
            : RUNNABLE.includes(extname(entry.path))
              ? { label: 'Run in Terminal', action: () => ctx.openTerminal({ cwd: state.path, command: `node ${quoteArg(entry.name)}` }) }
              : null,
          '-',
          { label: 'Rename', disabled: inTrash, action: () => startRename(entry.name) },
          { label: inTrash ? 'Delete Immediately' : 'Move to Trash', action: () => trash(entry) },
        ].filter(Boolean));
      } else {
        select(null);
        os.contextMenu(e, [
          { label: 'New Folder', disabled: state.path === TRASH, action: newFolder },
          { label: 'New File', disabled: state.path === TRASH, action: newFile },
          '-',
          { label: 'Open in VS Code', action: () => ctx.openCode({ folder: state.path }) },
          { label: 'New Terminal at Folder', action: () => ctx.openTerminal({ cwd: state.path }) },
          '-',
          { label: 'as Icons', checked: state.view === 'icons', action: () => setView('icons') },
          { label: 'as List', checked: state.view === 'list', action: () => setView('list') },
        ]);
      }
    });
    content.addEventListener('keydown', (e) => {
      if (e.target !== content) return;
      const list = entries();
      const i = list.findIndex((x) => x.name === state.selected);
      if (e.key === 'Enter') open(list[i]);
      else if (e.key === 'Delete' || (e.key === 'Backspace' && (e.metaKey || e.ctrlKey))) trash(list[i]);
      else if (['ArrowRight', 'ArrowDown'].includes(e.key)) select(list[Math.min(i + 1, list.length - 1)]?.name ?? null);
      else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) select(list[Math.max(i - 1, 0)]?.name ?? null);
      else if (e.key === 'F2' && list[i]) startRename(list[i].name);
      else return;
      e.preventDefault();
    });

    const f = {
      win,
      get path() {
        return state.path;
      },
      get view() {
        return state.view;
      },
      get showPreview() {
        return state.preview;
      },
      selection,
      select,
      open,
      go,
      setView,
      newFolder,
      trash,
      togglePreview() {
        state.preview = !state.preview;
        render();
      },
      refresh: () => {
        if (!state.renaming) render();
      },
    };
    win.finder = f;
    win.onClose = () => instances.delete(f);
    instances.add(f);
    render();
    return f;
  }

  app.openFinder = openFinder;
  return app;
}
