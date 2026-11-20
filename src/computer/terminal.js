import { h } from './dom.js';
import { HOME, USER, FSError, normalize, pretty, basename, dirname } from './fs.js';

// A zsh-like shell over the computer's in-memory file system, for the Terminal app.

const HISTORY = []; // shared by every terminal window, like zsh's shared history
const STARTED = Date.now();

const HELP = [
  ['ls [-la] [folder]', 'list what is in a folder'],
  ['cd <folder>', 'go into a folder (cd .. goes up, cd goes home)'],
  ['pwd', 'show where you are'],
  ['cat <file>', 'print a file'],
  ['tree [folder]', 'show a folder and everything inside it'],
  ['echo <text>', 'print text; add > file to write it to a file'],
  ['touch / mkdir', 'make an empty file / a folder'],
  ['cp / mv / rm', 'copy, move or rename, and delete'],
  ['open <link>', 'open a link in a new tab'],
  ['about', 'who I am and where to find me'],
  ['neofetch', 'information about this computer'],
  ['history / clear', 'earlier commands / clear the screen'],
  ['exit', 'close this terminal'],
];

class UsageError extends Error { }

function plain(parts) {
  return [].concat(parts).map((p) => (typeof p === 'string' ? p : p.text)).join('');
}

function shellDate(d = new Date()) {
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour12: false });
  const tz = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || '';
  return `${wd} ${mon} ${String(d.getDate()).padStart(2, ' ')} ${time} ${tz} ${d.getFullYear()}`;
}

function lsDate(ms) {
  const d = new Date(ms);
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${mon} ${String(d.getDate()).padStart(2, ' ')} ${time}`;
}

const quoteArg = (s) => (/[\s'"\\$;&|<>]/.test(s) ? `'${s.replace(/'/g, "'\\''")}'` : s);
const shortLink = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/^mailto:/, '').replace(/\/$/, '');

export function createTerminal(ctx, { cwd = HOME, onExit, onTitle, banner = true } = {}) {
  const { fs, profile } = ctx;
  const host = `${profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-room`;
  let dir = fs.isDir(cwd) ? cwd : HOME;
  let prevDir = dir;
  let histIndex = HISTORY.length;
  let draft = '';
  let closed = false;

  const out = h('div', { class: 'term-out' });
  const promptEl = h('span', { class: 'term-prompt' });
  const input = h('input', {
    class: 'term-input',
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    autocapitalize: 'off',
    'aria-label': 'Terminal command',
  });
  const lineEl = h('div', { class: 'term-line' }, promptEl, input);
  const el = h('div', { class: 'term', tabindex: '-1' }, out, lineEl);

  // ---------- Output ----------
  function row(parts, cls) {
    const r = h('div', { class: cls ? `term-row ${cls}` : 'term-row' });
    for (const p of [].concat(parts)) {
      if (p == null) continue;
      if (typeof p === 'string') r.append(p);
      else if (p.href) r.append(h('a', { href: p.href, target: '_blank', rel: 'noopener noreferrer', class: p.cls, text: p.text }));
      else r.append(h('span', { class: p.cls, style: p.style, text: p.text }));
    }
    out.append(r);
    while (out.childElementCount > 1500) out.firstElementChild.remove();
    el.scrollTop = el.scrollHeight;
    return r;
  }

  function promptParts() {
    const where = dir === HOME ? '~' : basename(dir);
    return [{ text: `${USER}@${host}`, cls: 't-user' }, ' ', { text: where, cls: 't-dir' }, ' % '];
  }

  function showPrompt() {
    promptEl.replaceChildren(...promptParts().map((p) => (typeof p === 'string' ? p : h('span', { class: p.cls, text: p.text }))));
    lineEl.hidden = false;
    el.scrollTop = el.scrollHeight;
  }

  const resolve = (p) => normalize(p, dir);

  function flags(args) {
    const f = new Set();
    const rest = [];
    for (const a of args) {
      if (/^-[a-zA-Z]+$/.test(a)) for (const ch of a.slice(1)) f.add(ch);
      else rest.push(a);
    }
    return [f, rest];
  }

  function gridRow(entries) {
    const width = Math.max(...entries.map((e) => e.name.length)) + 2;
    const r = h('div', { class: 'term-row term-grid', style: { gridTemplateColumns: `repeat(auto-fill, minmax(${width}ch, max-content))` } });
    for (const e of entries) r.append(h('span', { class: e.type === 'dir' ? 't-dir' : '', text: e.name }));
    out.append(r);
    el.scrollTop = el.scrollHeight;
  }

  // ---------- Commands ----------
  // Each gets (args, io) and returns an exit code (0 or nothing means success).
  const commands = {
    help(_, io) {
      io.out([{ text: 'Commands you can use here:', cls: 't-bold' }]);
      for (const [cmd, text] of HELP) io.out([{ text: cmd.padEnd(20), cls: 't-accent' }, text]);
      io.out('');
      io.out([{ text: 'Tab completes names, and ↑ and ↓ bring back earlier commands.', cls: 't-dim' }]);
    },

    ls(args, io) {
      const [f, paths] = flags(args);
      const targets = paths.length ? paths : ['.'];
      let status = 0;
      targets.forEach((p, i) => {
        const path = resolve(p);
        const node = fs.stat(path);
        if (!node) {
          io.err(`ls: ${p}: No such file or directory`);
          status = 1;
          return;
        }
        let entries = node.type === 'dir' ? fs.list(path) : [{ name: p, path, type: 'file', node }];
        if (!f.has('a')) entries = entries.filter((e) => !e.name.startsWith('.'));
        if (targets.length > 1 && node.type === 'dir') {
          if (i) io.out('');
          io.out(`${p}:`);
        }
        if (f.has('l')) {
          if (node.type === 'dir') io.out(`total ${entries.length}`);
          for (const e of entries) {
            const isDir = e.type === 'dir';
            const size = isDir ? 64 * (fs.list(e.path).length + 2) : fs.size(e.path);
            io.out([
              `${isDir ? 'drwxr-xr-x' : '-rw-r--r--'}  1 ${USER}  staff  ${String(size).padStart(6)} ${lsDate(e.node.mtime)} `,
              { text: e.name, cls: isDir ? 't-dir' : '' },
            ]);
          }
        } else if (entries.length) io.grid(entries);
      });
      return status;
    },

    cd(args) {
      let target = args[0] ?? HOME;
      if (target === '-') target = prevDir;
      const path = resolve(target);
      if (!fs.exists(path)) throw new UsageError(`no such file or directory: ${target}`);
      if (!fs.isDir(path)) throw new UsageError(`not a directory: ${target}`);
      prevDir = dir;
      dir = path;
    },

    pwd(_, io) {
      io.out(dir);
    },

    cat(args, io) {
      if (!args.length) throw new UsageError('usage: cat <file> ...');
      let status = 0;
      for (const p of args) {
        const path = resolve(p);
        if (!fs.exists(path)) {
          io.err(`cat: ${p}: No such file or directory`);
          status = 1;
        } else if (fs.isDir(path)) {
          io.err(`cat: ${p}: Is a directory`);
          status = 1;
        } else {
          const text = fs.read(path);
          if (text) io.out(text.replace(/\n$/, ''));
        }
      }
      return status;
    },

    echo(args, io) {
      const noNewline = args[0] === '-n';
      io.out((noNewline ? args.slice(1) : args).join(' '));
    },

    touch(args) {
      if (!args.length) throw new UsageError('usage: touch <file> ...');
      for (const p of args) fs.touch(resolve(p));
    },

    mkdir(args) {
      const [f, paths] = flags(args);
      if (!paths.length) throw new UsageError('usage: mkdir [-p] <folder> ...');
      for (const p of paths) fs.mkdir(resolve(p), f.has('p'));
    },

    rm(args, io) {
      const [f, paths] = flags(args);
      if (!paths.length) throw new UsageError('usage: rm [-rf] <path> ...');
      let status = 0;
      for (const p of paths) {
        const path = resolve(p);
        if (path === '/' || path === HOME) {
          io.err(`rm: refusing to remove ${pretty(path)}`);
          status = 1;
        } else if (!fs.exists(path)) {
          if (!f.has('f')) {
            io.err(`rm: ${p}: No such file or directory`);
            status = 1;
          }
        } else if (fs.isDir(path) && !f.has('r') && !f.has('R')) {
          io.err(`rm: ${p}: is a directory (use rm -r)`);
          status = 1;
        } else {
          fs.remove(path, true);
          if (path === dir || dir.startsWith(`${path}/`)) dir = dirname(path);
        }
      }
      return status;
    },

    rmdir(args) {
      if (!args.length) throw new UsageError('usage: rmdir <folder> ...');
      for (const p of args) {
        const path = resolve(p);
        if (!fs.isDir(path)) throw new UsageError(`${p}: Not a directory`);
        if (fs.list(path).length) throw new UsageError(`${p}: Directory not empty`);
        fs.remove(path, true);
      }
    },

    mv(args) {
      if (args.length < 2) throw new UsageError('usage: mv <from> ... <to>');
      const to = resolve(args[args.length - 1]);
      const from = args.slice(0, -1);
      if (from.length > 1 && !fs.isDir(to)) throw new UsageError(`${args[args.length - 1]} is not a directory`);
      for (const p of from) fs.move(resolve(p), to);
    },

    cp(args) {
      const [f, paths] = flags(args);
      if (paths.length < 2) throw new UsageError('usage: cp [-r] <from> ... <to>');
      const to = resolve(paths[paths.length - 1]);
      for (const p of paths.slice(0, -1)) fs.copy(resolve(p), to, f.has('r') || f.has('R'));
    },

    tree(args, io) {
      const start = resolve(args[0] || '.');
      if (!fs.isDir(start)) throw new UsageError(`${args[0]}: not a folder`);
      let dirs = 0;
      let files = 0;
      io.out([{ text: args[0] || '.', cls: 't-dir' }]);
      const walk = (path, prefix) => {
        const entries = fs.list(path).filter((e) => !e.name.startsWith('.'));
        entries.forEach((e, i) => {
          const last = i === entries.length - 1;
          io.out([prefix + (last ? '└── ' : '├── '), { text: e.name, cls: e.type === 'dir' ? 't-dir' : '' }]);
          if (e.type === 'dir') {
            dirs++;
            walk(e.path, prefix + (last ? '    ' : '│   '));
          } else files++;
        });
      };
      walk(start, '');
      io.out('');
      io.out(`${dirs} ${dirs === 1 ? 'directory' : 'directories'}, ${files} ${files === 1 ? 'file' : 'files'}`);
    },

    open(args) {
      const target = args[0];
      if (!target) throw new UsageError('usage: open <link>');
      if (!/^(https?:|mailto:)/.test(target)) throw new UsageError(`only links open here (to read a file, try: cat ${quoteArg(target)})`);
      window.open(target, '_blank', 'noopener');
    },

    clear() {
      out.replaceChildren();
    },

    history(_, io) {
      HISTORY.forEach((cmd, i) => io.out(`${String(i + 1).padStart(5)}  ${cmd}`));
    },

    whoami(_, io) {
      io.out(USER);
    },

    hostname(_, io) {
      io.out(host);
    },

    date(_, io) {
      io.out(shellDate());
    },

    uname(args, io) {
      io.out(args.includes('-a') ? `Darwin ${host} 24.1.0 Darwin Kernel Version 24.1.0 arm64` : 'Darwin');
    },

    neofetch(_, io) {
      const art = [
        '         .--.         ',
        '        (    )        ',
        "    /\\   '--'   /\\    ",
        '   /  \\   /\\   /  \\   ',
        '  /    \\ /  \\ /    \\  ',
        ' /      V    V      \\ ',
        '~~~~~~~~~~~~~~~~~~~~~~',
      ];
      const minutes = Math.max(1, Math.round((Date.now() - STARTED) / 60000));
      const info = [
        [{ text: `${USER}@${host}`, cls: 't-accent t-bold' }],
        ['-'.repeat(USER.length + host.length + 1)],
        [{ text: 'OS: ', cls: 't-accent' }, 'Room OS (dusk edition)'],
        [{ text: 'Host: ', cls: 't-accent' }, `the ultrawide on ${profile.name}'s desk`],
        [{ text: 'Owner: ', cls: 't-accent' }, `${profile.name}, ${profile.role}`],
        [{ text: 'Shell: ', cls: 't-accent' }, 'zsh (mostly)'],
        [{ text: 'Uptime: ', cls: 't-accent' }, `${minutes} min${minutes === 1 ? '' : 's'}`],
      ];
      for (let i = 0; i < Math.max(art.length, info.length); i++) {
        io.out([{ text: (art[i] || ' '.repeat(22)) + '   ', cls: 't-art' }, ...(info[i] || [])]);
      }
      const colours = ['#3b3b40', '#f0766a', '#8be3a1', '#f2c25b', '#7fb6ff', '#d59cf5', '#69c9c0', '#e6e6e6'];
      io.out([' '.repeat(25), ...colours.map((c) => ({ text: '   ', cls: 't-swatch', style: { background: c } }))]);
    },

    about(_, io) {
      io.out([{ text: profile.name, cls: 't-bold' }, ` · ${profile.role}`]);
      io.out([{ text: profile.tagline, cls: 't-dim' }]);
      io.out('');
      for (const s of Object.values(ctx.stations)) {
        const label = s.link.url.startsWith('mailto:') ? 'Email' : s.kicker;
        io.out([{ text: label.padEnd(12), cls: 't-accent' }, { text: shortLink(s.link.url), href: s.link.url, cls: 't-link' }]);
      }
    },

    sudo(_, io) {
      io.err(`${USER} is not in the sudoers file. This incident will be reported.`);
      return 1;
    },

    man(args, io) {
      io.out(`No manual pages here${args[0] ? ` for ${args[0]}` : ''}. Type help to see what each command does.`);
    },

    exit() {
      closed = true;
      onExit?.();
    },
  };
  commands.ll = (args, io) => commands.ls(['-la', ...args], io);

  // ---------- Parsing and running ----------
  function tokenize(line) {
    const env = { HOME, USER, PWD: dir, SHELL: '/bin/zsh' };
    const tokens = [];
    let word = null;
    let quote = null;
    const push = () => {
      if (word !== null) tokens.push({ type: 'word', value: word });
      word = null;
    };
    const variable = (i) => {
      const m = line.slice(i + 1).match(/^\w+/);
      if (!m) return 0;
      word = (word ?? '') + (env[m[0]] ?? '');
      return m[0].length;
    };
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null;
        else if (quote === '"' && c === '\\' && '"\\$'.includes(line[i + 1] ?? '')) word += line[++i];
        else if (quote === '"' && c === '$' && /\w/.test(line[i + 1] ?? '')) i += variable(i);
        else word += c;
        continue;
      }
      if (c === "'" || c === '"') {
        quote = c;
        word ??= '';
      } else if (c === '\\' && i + 1 < line.length) word = (word ?? '') + line[++i];
      else if (/\s/.test(c)) push();
      else if (c === ';') {
        push();
        tokens.push({ type: 'op', value: ';' });
      } else if (c === '&' && line[i + 1] === '&') {
        push();
        tokens.push({ type: 'op', value: '&&' });
        i++;
      } else if (c === '|') {
        push();
        const double = line[i + 1] === '|';
        tokens.push({ type: 'op', value: double ? '||' : '|' });
        if (double) i++;
      } else if (c === '>') {
        push();
        const append = line[i + 1] === '>';
        tokens.push({ type: 'op', value: append ? '>>' : '>' });
        if (append) i++;
      } else if (c === '$' && /\w/.test(line[i + 1] ?? '')) i += variable(i);
      else if (c === '~' && word === null && (i + 1 === line.length || /[\s/]/.test(line[i + 1]))) word = HOME;
      else word = (word ?? '') + c;
    }
    if (quote) throw new UsageError(`unmatched ${quote}`);
    push();
    return tokens;
  }

  async function runLine(line) {
    let tokens;
    try {
      tokens = tokenize(line);
    } catch (e) {
      row(`zsh: ${e.message}`, 't-err');
      return;
    }
    const list = [];
    let cur = { words: [], redirect: null, op: ';' };
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      if (t.type === 'word') cur.words.push(t.value);
      else if (t.value === '>' || t.value === '>>') {
        const target = tokens[k + 1];
        if (!target || target.type !== 'word') {
          row('zsh: parse error near `\\n\'', 't-err');
          return;
        }
        cur.redirect = { append: t.value === '>>', path: target.value };
        k++;
      } else if (t.value === '|') {
        row("zsh: pipes aren't supported in this terminal", 't-err');
        return;
      } else {
        list.push(cur);
        cur = { words: [], redirect: null, op: t.value };
      }
    }
    list.push(cur);
    let status = 0;
    for (const c of list) {
      if (!c.words.length) continue;
      if (c.op === '&&' && status !== 0) continue;
      if (c.op === '||' && status === 0) continue;
      status = await runCommand(c);
      if (closed) return;
    }
  }

  async function runCommand({ words, redirect }) {
    const [name, ...args] = words;
    const collected = redirect ? [] : null;
    const io = {
      out: (parts, cls) => (collected ? collected.push(plain(parts)) : row(parts, cls)),
      err: (text) => row(text, 't-err'),
      grid: (entries) => (collected ? collected.push(...entries.map((e) => e.name)) : gridRow(entries)),
    };
    const fn = Object.hasOwn(commands, name) ? commands[name] : null;
    if (!fn) {
      io.err(`zsh: command not found: ${name}`);
      return 127;
    }
    let status;
    try {
      status = (await fn(args, io)) ?? 0;
    } catch (e) {
      io.err(e instanceof FSError || e instanceof UsageError ? `${name}: ${e.message}` : `${name}: ${e.message || e}`);
      status = 1;
    }
    if (redirect) {
      try {
        const path = resolve(redirect.path);
        const before = redirect.append && fs.isFile(path) ? fs.read(path) : '';
        fs.write(path, before + (collected.length ? `${collected.join('\n')}\n` : ''));
      } catch (e) {
        io.err(`zsh: ${e.message}`);
        return 1;
      }
    }
    return status;
  }

  async function submit(line) {
    // Keep the keyboard here (for Ctrl+C) only if someone was typing here.
    const focused = el.contains(document.activeElement);
    row([...promptParts(), line]);
    if (line.trim()) {
      if (HISTORY[HISTORY.length - 1] !== line) HISTORY.push(line);
      histIndex = HISTORY.length;
      lineEl.hidden = true;
      if (focused) el.focus({ preventScroll: true });
      await runLine(line);
    }
    if (closed) return;
    histIndex = HISTORY.length;
    draft = '';
    setTitle();
    showPrompt();
    if (focused) input.focus({ preventScroll: true });
  }

  // ---------- Tab completion ----------
  function complete() {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos);
    const word = before.match(/(?:\\ |\S)*$/)[0];
    const first = !before.slice(0, before.length - word.length).trim();
    const raw = word.replace(/\\ /g, ' ');
    let options;
    let shown;
    if (first && !raw.includes('/')) {
      options = Object.keys(commands).filter((c) => c.startsWith(raw)).sort().map((c) => `${c} `);
      shown = options.map((o) => ({ name: o.trim(), type: 'file' }));
    } else {
      const slash = raw.lastIndexOf('/');
      const head = slash >= 0 ? raw.slice(0, slash + 1) : '';
      const stem = raw.slice(slash + 1);
      const base = resolve(head || '.');
      if (!fs.isDir(base)) return;
      const matches = fs.list(base).filter((e) => e.name.startsWith(stem) && (stem.startsWith('.') || !e.name.startsWith('.')));
      options = matches.map((e) => (head + e.name).replace(/ /g, '\\ ') + (e.type === 'dir' ? '/' : ' '));
      shown = matches;
    }
    if (!options.length) return;
    let replacement = options[0];
    if (options.length > 1) {
      replacement = options.reduce((a, b) => {
        let i = 0;
        while (i < a.length && a[i] === b[i]) i++;
        return a.slice(0, i);
      });
      if (replacement.length <= word.length) {
        row([...promptParts(), input.value]);
        gridRow(shown);
        return;
      }
    }
    input.value = before.slice(0, before.length - word.length) + replacement + input.value.slice(pos);
    const caret = before.length - word.length + replacement.length;
    input.setSelectionRange(caret, caret);
  }

  // ---------- Keys ----------
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const line = input.value;
      input.value = '';
      submit(line);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      complete();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      if (!HISTORY.length) return;
      if (histIndex === HISTORY.length) draft = input.value;
      histIndex = Math.min(Math.max(histIndex + (e.key === 'ArrowUp' ? -1 : 1), 0), HISTORY.length);
      input.value = histIndex === HISTORY.length ? draft : HISTORY[histIndex];
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    } else if (e.ctrlKey && e.key.toLowerCase() === 'c' && !window.getSelection().toString() && input.selectionStart === input.selectionEnd) {
      e.preventDefault();
      row([...promptParts(), input.value, { text: '^C', cls: 't-dim' }]);
      input.value = '';
    } else if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      out.replaceChildren();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      input.value = input.value.slice(input.selectionStart);
      input.setSelectionRange(0, 0);
    }
  });

  el.addEventListener('mouseup', () => {
    if (!window.getSelection().toString()) input.focus();
  });

  // ---------- Title: "guest — -zsh — 80×24" ----------
  let size = '80×24';
  function setTitle() {
    onTitle?.(`${USER} — -zsh — ${size}`);
  }
  const probe = h('span', { class: 'term-probe', text: 'MMMMMMMMMM' });
  el.append(probe);
  const observer = new ResizeObserver(() => {
    const w = probe.offsetWidth / 10;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 19;
    if (!w) return;
    size = `${Math.max(20, Math.floor((el.clientWidth - 24) / w))}×${Math.max(5, Math.floor((el.clientHeight - 16) / lh))}`;
    setTitle();
  });
  observer.observe(el);

  if (banner) {
    row(`Last login: ${shellDate(new Date(Date.now() - 3.6e6 * 2)).replace(/ \S+ (\d{4})$/, '')} on ttys000`);
    row([{ text: 'Type ', cls: 't-dim' }, { text: 'help', cls: 't-accent' }, { text: ' to see what this terminal can do.', cls: 't-dim' }]);
  }
  showPrompt();
  setTitle();

  return {
    el,
    focus: () => input.focus(),
    get cwd() {
      return dir;
    },
    // Types a command and runs it, as if someone had entered it.
    async type(line) {
      input.value = '';
      await submit(line);
    },
    cd(path) {
      if (fs.isDir(path)) {
        prevDir = dir;
        dir = path;
        showPrompt();
      }
    },
    dispose() {
      observer.disconnect();
      closed = true;
    },
  };
}
