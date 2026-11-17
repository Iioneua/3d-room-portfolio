import './computer.css';
import { createFS, HOME, TRASH, join } from './fs.js';
import { seedFiles, PROJECTS, DESKTOP } from './seed.js';
import { createOS } from './os.js';
import { createFinder, iconFor } from './finder.js';
import { createCode } from './code.js';
import { createTerminal } from './terminal.js';
import { folderIcon } from './icons.js';

// The computer you enter through the monitor on the desk: a desktop with Finder,
// Terminal and VS Code, all working on the same in-memory files.

export function createComputer({ profile, projects, stations, onLeave }) {
  const fs = createFS();
  seedFiles(fs, { projects });

  const ctx = { fs, profile, projects, stations, leave: onLeave };
  const welcome = join(DESKTOP, 'Welcome.md');
  const os = createOS({ profile, onLeave, onHelp: () => ctx.openCode({ file: welcome }) });
  ctx.os = os;

  const finder = createFinder(ctx);
  const code = createCode(ctx);

  const terminal = {
    id: 'terminal',
    name: 'Terminal',
    launch: (opts) => openTerminal(opts),
    menus: (win) => [
      {
        title: 'Shell',
        items: [
          { label: 'New Window', action: () => openTerminal({ cwd: win?.term?.cwd }) },
          { label: 'Clear Screen', disabled: !win?.term, action: () => win.term.type('clear') },
          '-',
          { label: 'Close Window', disabled: !win, action: () => win.close() },
        ],
      },
    ],
  };

  function openTerminal({ cwd = HOME, command } = {}) {
    const win = os.openWindow(terminal, { title: 'Terminal', width: 740, height: 450, minWidth: 360, minHeight: 200, className: 'term-win' });
    const term = createTerminal(ctx, { cwd, onExit: () => win.close(), onTitle: (title) => win.setTitle(title) });
    win.body.append(term.el);
    win.term = term;
    win.onClose = () => term.dispose();
    win.onFocus = () => term.focus();
    term.focus();
    if (command) term.type(command);
    return win;
  }

  ctx.openFinder = (path, select) => finder.openFinder(path, { select });
  ctx.openCode = (opts) => code.launch(opts);
  ctx.openTerminal = (opts) => openTerminal(opts);
  ctx.openPath = (path) => (fs.isDir(path) ? ctx.openFinder(path) : ctx.openCode({ file: path }));

  os.register(finder);
  os.register(terminal);
  os.register(code);

  // Desktop icons: the Projects folder, then whatever is in ~/Desktop.
  function refreshDesktop() {
    const items = [
      {
        name: 'Projects',
        glyph: folderIcon('projects'),
        open: () => ctx.openFinder(PROJECTS),
        menu: () => [
          { label: 'Open', action: () => ctx.openFinder(PROJECTS) },
          { label: 'Open in VS Code', action: () => ctx.openCode({ folder: PROJECTS }) },
          { label: 'New Terminal at Folder', action: () => openTerminal({ cwd: PROJECTS }) },
        ],
      },
      ...fs
        .list(DESKTOP)
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => ({
          name: e.name,
          glyph: iconFor(e.path, e.type),
          open: () => ctx.openPath(e.path),
          menu: () => [
            { label: 'Open', action: () => ctx.openPath(e.path) },
            { label: 'Open in VS Code', action: () => ctx.openCode(e.type === 'dir' ? { folder: e.path } : { file: e.path }) },
            '-',
            { label: 'Move to Trash', action: () => fs.move(e.path, join(TRASH, fs.freeName(TRASH, e.name))) },
          ],
        })),
    ];
    os.setDesktopItems(items);
    os.setTrash({ full: fs.list(TRASH).length > 0 });
  }
  os.setDesktopMenu(() => [
    { label: 'New Folder', action: () => fs.mkdir(join(DESKTOP, fs.freeName(DESKTOP, 'untitled folder'))) },
    { label: 'Open Terminal Here', action: () => openTerminal({ cwd: DESKTOP }) },
    '-',
    { label: 'Step Back from the Computer', action: onLeave },
  ]);
  os.setTrash({ open: () => ctx.openFinder(TRASH) });
  fs.onChange(refreshDesktop);
  os.onLayout(refreshDesktop);
  refreshDesktop();

  let first = true;
  return {
    show() {
      os.show();
      if (!first) return;
      first = false;
      setTimeout(() => {
        finder.launch({ path: PROJECTS });
        setTimeout(() => {
          os.notify({
            app: 'finder',
            title: 'Welcome to my computer',
            body: 'These are my projects. Terminal and VS Code in the dock really work. Click to read more.',
            onClick: () => ctx.openCode({ file: welcome }),
          });
        }, 700);
      }, 350);
    },
    hide: () => os.hide(),
    // The desktop's own size and the scale it is shown at when the camera is still.
    setSize: (width, height, scale) => os.setSize(width, height, scale),
    // Where the monitor's screen is on the page this frame.
    track: (rect) => os.track(rect),
  };
}
