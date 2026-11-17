// Runs JavaScript files for the `node` command and the editor's Run button.
// Each run gets its own Web Worker, so an endless loop never freezes the page and
// Ctrl+C can always stop it. console.log output comes back as text, formatted
// roughly the way Node prints values.

// This function is turned into the worker's source text, so it must not use
// anything from outside itself.
function workerMain() {
  const timers = new Set();
  const native = {
    setTimeout: setTimeout.bind(self),
    clearTimeout: clearTimeout.bind(self),
    setInterval: setInterval.bind(self),
    clearInterval: clearInterval.bind(self),
  };
  let mainDone = false;
  let exitCode = 0;
  let finished = false;
  let fileName = 'script.js';

  class ExitSignal {}

  const send = (type, text) => postMessage({ type, text });

  function finish(code) {
    if (finished) return;
    finished = true;
    postMessage({ type: 'done', code });
  }

  function wrap(open, items, close) {
    const flat = `${open} ${items.join(', ')} ${close}`;
    if (flat.length <= 72 && !flat.includes('\n')) return flat;
    return `${open}\n${items.map((i) => `  ${i.replace(/\n/g, '\n  ')}`).join(',\n')}\n${close}`;
  }

  function inspect(v, depth, seen) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    const t = typeof v;
    if (t === 'string') return depth ? `'${v.replace(/'/g, "\\'")}'` : v;
    if (t === 'number') return Object.is(v, -0) ? '-0' : String(v);
    if (t === 'boolean') return String(v);
    if (t === 'bigint') return `${v}n`;
    if (t === 'symbol') return v.toString();
    if (t === 'function') {
      if (/^class\s/.test(Function.prototype.toString.call(v))) return `[class ${v.name || '(anonymous)'}]`;
      return `[Function: ${v.name || '(anonymous)'}]`;
    }
    if (seen.has(v)) return '[Circular]';
    if (v instanceof Error) return `${v.name}: ${v.message}`;
    if (v instanceof Date) return isNaN(v) ? 'Invalid Date' : v.toISOString();
    if (v instanceof RegExp) return String(v);
    if (v instanceof Promise) return 'Promise { <pending> }';
    if (depth > 2) return Array.isArray(v) ? '[Array]' : '[Object]';
    seen.add(v);
    let out;
    const next = (x) => inspect(x, depth + 1, seen);
    if (Array.isArray(v)) {
      const items = v.slice(0, 100).map(next);
      if (v.length > 100) items.push(`... ${v.length - 100} more items`);
      out = items.length ? wrap('[', items, ']') : '[]';
    } else if (v instanceof Map) {
      const items = [...v].map(([k, x]) => `${next(k)} => ${next(x)}`);
      out = `Map(${v.size}) ${items.length ? wrap('{', items, '}') : '{}'}`;
    } else if (v instanceof Set) {
      const items = [...v].map(next);
      out = `Set(${v.size}) ${items.length ? wrap('{', items, '}') : '{}'}`;
    } else {
      const items = Object.keys(v).map((k) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`}: ${next(v[k])}`);
      const ctor = Object.getPrototypeOf(v)?.constructor;
      const name = ctor && ctor !== Object && ctor.name ? `${ctor.name} ` : '';
      out = name + (items.length ? wrap('{', items, '}') : '{}');
    }
    seen.delete(v);
    return out;
  }

  function format(args) {
    const parts = [...args];
    let head = '';
    if (typeof parts[0] === 'string' && /%[sdifoOjc]/.test(parts[0]) && parts.length > 1) {
      head = parts.shift().replace(/%([sdifoOjc%])/g, (m, k) => {
        if (k === '%') return '%';
        if (!parts.length) return m;
        const a = parts.shift();
        if (k === 's') return typeof a === 'string' ? a : inspect(a, 1, new Set());
        if (k === 'd' || k === 'i') return String(k === 'i' ? parseInt(a, 10) : Number(a));
        if (k === 'f') return String(parseFloat(a));
        if (k === 'c') return '';
        return inspect(a, 1, new Set());
      });
    }
    const rest = parts.map((a) => (typeof a === 'string' ? a : inspect(a, 0, new Set())));
    return [head, ...rest].filter((s, i) => i > 0 || s !== '').join(' ');
  }

  // Where in the visitor's file an error happened (the code is wrapped in 3 lines).
  function where(err) {
    const m = String(err && err.stack).match(/<anonymous>:(\d+):(\d+)/);
    return m ? `\n    at ${fileName}:${Number(m[1]) - 3}:${m[2]}` : '';
  }

  function report(err) {
    exitCode = 1;
    if (err instanceof ExitSignal) return;
    if (err && typeof err === 'object' && 'message' in err) send('err', `${err.name || 'Error'}: ${err.message}${where(err)}`);
    else send('err', `Uncaught ${inspect(err, 1, new Set())}`);
  }

  function check() {
    if (!mainDone || timers.size) return;
    native.setTimeout(() => {
      if (mainDone && !timers.size) finish(exitCode);
    }, 0);
  }

  self.setTimeout = (fn, ms, ...args) => {
    const id = native.setTimeout(() => {
      timers.delete(id);
      try {
        if (typeof fn === 'function') fn(...args);
      } catch (e) {
        report(e);
      }
      check();
    }, ms);
    timers.add(id);
    return id;
  };
  self.clearTimeout = (id) => {
    if (timers.delete(id)) native.clearTimeout(id);
    check();
  };
  self.setInterval = (fn, ms, ...args) => {
    const id = native.setInterval(() => {
      try {
        if (typeof fn === 'function') fn(...args);
      } catch (e) {
        report(e);
      }
    }, ms);
    timers.add(id);
    return id;
  };
  self.clearInterval = (id) => {
    if (timers.delete(id)) native.clearInterval(id);
    check();
  };
  self.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    report(e.reason);
  });

  self.onmessage = async ({ data }) => {
    fileName = data.file.slice(data.file.lastIndexOf('/') + 1);
    const out = (...a) => send('out', format(a));
    const err = (...a) => send('err', format(a));
    const console = { log: out, info: out, debug: out, dir: out, table: out, warn: err, error: err, clear() {} };
    const process = {
      argv: ['/usr/local/bin/node', data.file, ...data.args],
      env: data.env,
      platform: 'darwin',
      version: 'v22.11.0',
      cwd: () => data.cwd,
      exit(code = 0) {
        finish(code);
        throw new ExitSignal();
      },
      stdout: { write: (s) => send('out', String(s).replace(/\n$/, '')) },
      stderr: { write: (s) => send('err', String(s).replace(/\n$/, '')) },
    };
    const require = (name) => {
      throw new Error(`Cannot find module '${name}'. Modules aren't available in this sandbox.`);
    };
    const module = { exports: {} };
    try {
      const run = new Function(
        'console', 'process', 'require', 'module', 'exports', '__filename', '__dirname',
        `return (async () => {\n${data.code}\n})();`
      );
      await run(console, process, require, module, module.exports, data.file, data.cwd);
    } catch (e) {
      report(e);
    }
    mainDone = true;
    check();
  };
}

let workerURL = null;

// Starts a script. Returns { stop() }; `onDone(exitCode)` is called once at the end.
export function runScript({ code, file, cwd, args = [], env = {}, onOut, onErr, onDone }) {
  workerURL ??= URL.createObjectURL(new Blob([`(${workerMain.toString()})();`], { type: 'text/javascript' }));
  const worker = new Worker(workerURL);
  let done = false;
  const finish = (exitCode) => {
    if (done) return;
    done = true;
    worker.terminate();
    onDone(exitCode);
  };
  worker.onmessage = ({ data }) => {
    if (done) return;
    if (data.type === 'out') onOut(data.text);
    else if (data.type === 'err') onErr(data.text);
    else if (data.type === 'done') finish(data.code);
  };
  worker.onerror = (e) => {
    e.preventDefault();
    onErr(e.message || 'The script crashed.');
    finish(1);
  };
  worker.postMessage({ code, file, cwd, args, env });
  return { stop: () => finish(130) };
}
