// The pomodoro timer: focus, then a break, again and again, with a long break after
// every few focus sessions.
//
// The timer keeps no ticking counter. While it runs it only stores when the current
// phase ends (`endsAt`), and the time left is worked out from the clock whenever it is
// needed. Browsers slow down timers in background tabs, so a counter would drift; a
// timestamp does not. The same state will be shared by everyone in a session later on.

export const PHASES = {
  focus: { label: 'Focus', setting: 'focus' },
  short: { label: 'Short break', setting: 'short' },
  long: { label: 'Long break', setting: 'long' },
};

export const DEFAULT_SETTINGS = {
  focus: 25, // minutes
  short: 5,
  long: 15,
  longEvery: 4, // a long break after this many focus sessions
  autoStart: false, // start the next phase by itself
  sound: true, // chime when a phase ends
};

const SETTINGS_KEY = 'dusk-desk.pomodoro.settings';
const STATE_KEY = 'dusk-desk.pomodoro.state';

// Browser storage can be missing or blocked (private windows, previews); the timer
// still works, it just starts fresh next time.
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not saved; nothing else to do.
  }
}

const clampMinutes = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

function cleanSettings(s = {}) {
  const d = DEFAULT_SETTINGS;
  return {
    focus: clampMinutes(s.focus, 1, 180, d.focus),
    short: clampMinutes(s.short, 1, 60, d.short),
    long: clampMinutes(s.long, 1, 90, d.long),
    longEvery: clampMinutes(s.longEvery, 2, 12, d.longEvery),
    autoStart: typeof s.autoStart === 'boolean' ? s.autoStart : d.autoStart,
    sound: typeof s.sound === 'boolean' ? s.sound : d.sound,
  };
}

// "25:00", or "1:05:00" past an hour.
export function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function createPomodoro() {
  let settings = cleanSettings(load(SETTINGS_KEY) || {});
  const full = (phase) => settings[PHASES[phase].setting] * 60000;

  // phase: what we are doing now. done: focus sessions finished in this cycle.
  // endsAt: when the phase ends, while running. left: time left, while stopped.
  let state = { phase: 'focus', done: 0, endsAt: null, left: full('focus') };
  const saved = load(STATE_KEY);
  if (saved && PHASES[saved.phase]) {
    state = {
      phase: saved.phase,
      done: Math.max(0, Number(saved.done) || 0),
      endsAt: Number.isFinite(saved.endsAt) ? saved.endsAt : null,
      left: Number.isFinite(saved.left) ? saved.left : full(saved.phase),
    };
  }

  const listeners = { change: new Set(), end: new Set() };
  const emit = (type, detail) => listeners[type].forEach((fn) => fn(detail));
  let endTimer = null;

  function commit() {
    save(STATE_KEY, state);
    schedule();
    emit('change', api);
  }

  // One timeout for the end of the phase. A single timeout (not a chain of them) is
  // what background tabs delay the least.
  function schedule() {
    clearTimeout(endTimer);
    if (state.endsAt === null) return;
    endTimer = setTimeout(check, Math.max(0, state.endsAt - Date.now()) + 50);
  }

  function nextPhase() {
    if (state.phase !== 'focus') return { phase: 'focus', done: state.done };
    const done = state.done + 1;
    return done >= settings.longEvery ? { phase: 'long', done: 0 } : { phase: 'short', done };
  }

  // Moves on to the next phase; it runs by itself only if `run` is set.
  function advance(run, now = Date.now()) {
    const finished = state.phase;
    const { phase, done } = nextPhase();
    state = { phase, done, endsAt: run ? now + full(phase) : null, left: full(phase) };
    return finished;
  }

  // Called when the end timeout fires, and when the tab comes back to the front.
  function check() {
    if (state.endsAt === null || Date.now() < state.endsAt) return;
    const finished = advance(settings.autoStart, state.endsAt);
    commit();
    emit('end', { finished, next: state.phase, api });
  }

  // A phase that ended while the page was closed: move on quietly, without a chime.
  if (state.endsAt !== null && Date.now() >= state.endsAt) {
    advance(false);
    save(STATE_KEY, state);
  }
  schedule();
  document.addEventListener('visibilitychange', () => document.hidden || check());

  const api = {
    get phase() {
      return state.phase;
    },
    get label() {
      return PHASES[state.phase].label;
    },
    get running() {
      return state.endsAt !== null;
    },
    // Focus sessions finished in this cycle (0 to longEvery - 1).
    get done() {
      return state.done;
    },
    // Has the current phase been started at all (running, or paused part-way)?
    get started() {
      return state.endsAt !== null || state.left < full(state.phase);
    },
    get settings() {
      return { ...settings };
    },
    remaining(now = Date.now()) {
      return state.endsAt !== null ? Math.max(0, state.endsAt - now) : state.left;
    },
    total: () => full(state.phase),

    start() {
      if (state.endsAt !== null) return;
      state = { ...state, endsAt: Date.now() + state.left };
      commit();
    },
    pause() {
      if (state.endsAt === null) return;
      state = { ...state, endsAt: null, left: api.remaining() };
      commit();
    },
    toggle: () => (state.endsAt === null ? api.start() : api.pause()),
    // Back to the start of the current phase, stopped.
    reset() {
      state = { ...state, endsAt: null, left: full(state.phase) };
      commit();
    },
    // Ends the current phase now and moves on (keeps running if it was running).
    skip() {
      advance(state.endsAt !== null);
      commit();
    },
    // Switch to a phase by hand, stopped and from its start.
    select(phase) {
      if (!PHASES[phase] || phase === state.phase) return;
      state = { phase, done: state.done, endsAt: null, left: full(phase) };
      commit();
    },
    setSettings(changes) {
      const before = full(state.phase);
      settings = cleanSettings({ ...settings, ...changes });
      save(SETTINGS_KEY, settings);
      // A phase that has not started yet takes the new length.
      if (state.endsAt === null && state.left === before) state = { ...state, left: full(state.phase) };
      state.done = Math.min(state.done, settings.longEvery - 1);
      commit();
    },
    on(type, fn) {
      listeners[type].add(fn);
      return () => listeners[type].delete(fn);
    },
  };
  return api;
}
