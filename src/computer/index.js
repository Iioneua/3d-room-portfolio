import './computer.css';
import { createFS, HOME } from './fs.js';
import { seedFiles, DESKTOP, WELCOME } from './seed.js';
import { createOS } from './os.js';
import { createTerminal } from './terminal.js';

// The computer you enter through the monitor on the desk: a desktop with a Terminal
// working on in-memory files. The pomodoro and the games will live here too.

export function createComputer({ profile, stations, onLeave }) {
  const fs = createFS();
  seedFiles(fs);

  const ctx = { fs, profile, stations, leave: onLeave };
  const os = createOS({ profile, onLeave, onHelp: () => openTerminal({ command: 'cat ~/welcome.txt' }) });
  ctx.os = os;

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

  os.register(terminal);
  os.setDesktopMenu(() => [
    { label: 'Open Terminal Here', action: () => openTerminal({ cwd: DESKTOP }) },
    '-',
    { label: 'Step Back from the Computer', action: onLeave },
  ]);

  let first = true;
  return {
    show() {
      os.show();
      if (!first) return;
      first = false;
      setTimeout(() => openTerminal({ command: `cat ${WELCOME.replace(HOME, '~')}` }), 350);
    },
    hide: () => os.hide(),
    // The desktop's own size and the scale it is shown at when the camera is still.
    setSize: (width, height, scale) => os.setSize(width, height, scale),
    // Where the monitor's screen is on the page this frame.
    track: (rect) => os.track(rect),
  };
}
