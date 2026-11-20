// A small in-memory file system for the computer's Terminal.
// Paths are written the Unix way. Nothing is saved: a reload starts fresh.

export const USER = 'guest';
export const HOME = `/Users/${USER}`;

export class FSError extends Error {}

export const basename = (p) => p.slice(p.lastIndexOf('/') + 1) || '/';
export const dirname = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
export const join = (dir, name) => (dir === '/' ? `/${name}` : `${dir}/${name}`);

export function extname(p) {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i + 1).toLowerCase() : '';
}

// Turns a path typed by someone (relative, with ~, . or ..) into a clean absolute one.
export function normalize(path, cwd = HOME) {
  if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
  const parts = (path.startsWith('/') ? path : `${cwd}/${path}`).split('/');
  const out = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

// The home folder is shown as ~, the way a shell does.
export function pretty(p) {
  if (p === HOME) return '~';
  if (p.startsWith(`${HOME}/`)) return `~${p.slice(HOME.length)}`;
  return p;
}

const isInside =(path, dir) => path === dir || path.startsWith(dir === '/' ? '/' : `${dir}/`);

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });

export function createFS() {
  const dir = () => ({ type: 'dir', children: new Map(), mtime: Date.now() });
  const file = (content) => ({ type: 'file', content, mtime: Date.now() });
  const root = dir();
  const listeners = new Set();

  function get(path) {
    let node = root;
    for (const part of path.split('/')) {
      if (!part) continue;
      if (node.type !== 'dir') return null;
      node = node.children.get(part);
      if (!node) return null;
    }
    return node;
  }

  function need(path) {
    const node = get(path);
    if (!node) throw new FSError(`no such file or directory: ${pretty(path)}`);
    return node;
  }

  function parentOf(path) {
    const parent = need(dirname(path));
    if (parent.type !== 'dir') throw new FSError(`not a directory: ${pretty(dirname(path))}`);
    return parent;
  }

  function changed(...paths) {
    for (const fn of listeners) fn(paths);
  }

  function touchParent(path) {
    const parent = get(dirname(path));
    if (parent) parent.mtime = Date.now();
  }

  function clone(node) {
    if (node.type === 'file') return file(node.content);
    const copy = dir();
    for (const [name, child] of node.children) copy.children.set(name, clone(child));
    return copy;
  }

  const fs = {
    stat: (path) => get(path),
    exists: (path) => !!get(path),
    isDir: (path) => get(path)?.type === 'dir',
    isFile: (path) => get(path)?.type === 'file',

    list(path) {
      const node = need(path);
      if (node.type !== 'dir') throw new FSError(`not a directory: ${pretty(path)}`);
      return [...node.children]
        .map(([name, n]) => ({ name, path: join(path, name), type: n.type, node: n }))
        .sort(byName);
    },

    read(path) {
      const node = need(path);
      if (node.type === 'dir') throw new FSError(`is a directory: ${pretty(path)}`);
      return node.content;
    },

    write(path, content = '') {
      const parent = parentOf(path);
      const name = basename(path);
      const existing = parent.children.get(name);
      if (existing?.type === 'dir') throw new FSError(`is a directory: ${pretty(path)}`);
      if (existing) {
        existing.content = content;
        existing.mtime = Date.now();
      } else {
        parent.children.set(name, file(content));
        parent.mtime = Date.now();
      }
      changed(path);
    },

    touch(path) {
      const node = get(path);
      if (node) {
        node.mtime = Date.now();
        changed(path);
      } else fs.write(path, '');
    },

    mkdir(path, parents = false) {
      if (parents) {
        let at = '';
        for (const part of path.split('/').filter(Boolean)) {
          at += `/${part}`;
          const node = get(at);
          if (!node) {
            get(dirname(at)).children.set(part, dir());
          } else if (node.type !== 'dir') throw new FSError(`not a directory: ${pretty(at)}`);
        }
        changed(path);
        return;
      }
      const parent = parentOf(path);
      if (parent.children.has(basename(path))) throw new FSError(`file exists: ${pretty(path)}`);
      parent.children.set(basename(path), dir());
      parent.mtime = Date.now();
      changed(path);
    },

    remove(path, recursive = false) {
      const node = need(path);
      if (path === '/' || path === HOME) throw new FSError(`refusing to remove ${pretty(path)}`);
      if (node.type === 'dir' && !recursive) throw new FSError(`is a directory: ${pretty(path)}`);
      parentOf(path).children.delete(basename(path));
      touchParent(path);
      changed(path);
    },

    // Moves or renames. Moving onto an existing folder puts it inside that folder.
    move(from, to) {
      const node = need(from);
      if (fs.isDir(to)) to = join(to, basename(from));
      if (from === to) return to;
      if (isInside(to, from)) throw new FSError(`cannot move a folder into itself: ${pretty(from)}`);
      const target = get(to);
      if (target?.type === 'dir') throw new FSError(`file exists: ${pretty(to)}`);
      const parent = parentOf(to);
      parentOf(from).children.delete(basename(from));
      touchParent(from);
      parent.children.set(basename(to), node);
      parent.mtime = Date.now();
      changed(from, to);
      return to;
    },

    copy(from, to, recursive = false) {
      const node = need(from);
      if (node.type === 'dir' && !recursive) throw new FSError(`${pretty(from)} is a directory (not copied)`);
      if (fs.isDir(to)) to = join(to, basename(from));
      if (isInside(to, from)) throw new FSError(`cannot copy a folder into itself: ${pretty(from)}`);
      const parent = parentOf(to);
      parent.children.set(basename(to), clone(node));
      parent.mtime = Date.now();
      changed(to);
      return to;
    },

    // Every file under a folder, as full paths.
    walk(path) {
      const out = [];
      const visit = (p) => {
        for (const entry of fs.list(p)) {
          if (entry.name.startsWith('.')) continue;
          if (entry.type === 'dir') visit(entry.path);
          else out.push(entry.path);
        }
      };
      if (fs.isDir(path)) visit(path);
      return out;
    },

    // A free name in a folder: "untitled folder", "untitled folder 2", ...
    freeName(dirPath, name) {
      if (!get(join(dirPath, name))) return name;
      const dot = name.lastIndexOf('.');
      const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
      for (let i = 2; ; i++) {
        const candidate = `${stem} ${i}${ext}`;
        if (!get(join(dirPath, candidate))) return candidate;
      }
    },

    size(path) {
      const node = get(path);
      if (!node || node.type !== 'file') return 0;
      return new TextEncoder().encode(node.content).length;
    },

    // Calls `fn(paths)` after every change. Returns a function that stops listening.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return fs;
}
