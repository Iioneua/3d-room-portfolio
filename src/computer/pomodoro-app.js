import { h } from './dom.js';
import { PHASES, PRESETS, STEP, LIMITS, formatTime } from '../pomodoro.js';

// The Pomodoro app: the face of the timer in src/pomodoro.js. The timer itself lives
// outside the computer, so it keeps running when the window is closed or you step
// back into the room.

const RING = 2 * Math.PI * 96; // circumference of the progress ring (radius 96)

export function createPomodoroApp(ctx) {
  const { os, pomodoro } = ctx;
  let win = null;
  let view = null;

  const app = {
    id: 'pomodoro',
    name: 'Pomodoro',
    launch: () => open(),
    menus: () => [
      {
        title: 'Timer',
        items: [
          { label: pomodoro.running ? 'Pause' : 'Start', shortcut: 'Space', action: toggle },
          { label: 'Reset', disabled: !pomodoro.started, action: () => pomodoro.reset() },
          { label: 'Skip to Next', action: () => pomodoro.skip() },
          '-',
          ...Object.entries(PHASES).map(([id, p]) => ({ label: p.label, checked: pomodoro.phase === id, action: () => select(id) })),
          '-',
          { label: 'Settings…', action: () => open().showSettings(true) },
        ],
      },
    ],
  };

  // Starting is a click, which is when the page may ask for sound and notifications.
  function toggle() {
    if (!pomodoro.running) ctx.onUserStart?.();
    pomodoro.toggle();
  }

  async function select(phase) {
    if (phase === pomodoro.phase) return;
    if (pomodoro.started && win) {
      const ok = await win.dialog({
        title: `Switch to ${PHASES[phase].label.toLowerCase()}?`,
        message: `The ${pomodoro.label.toLowerCase()} timer stops and starts over.`,
        buttons: [
          { label: 'Cancel', value: false, cancel: true },
          { label: 'Switch', value: true, primary: true },
        ],
      });
      if (!ok) return;
    }
    pomodoro.select(phase);
  }

  function build() {
    const tabs = h('div', { class: 'pomo-tabs', role: 'tablist' },
      Object.entries(PHASES).map(([id, p]) =>
        h('button', { type: 'button', role: 'tab', class: 'pomo-tab', 'data-phase': id, text: p.label, onclick: () => select(id) })
      )
    );

    const progress = h('span', { class: 'pomo-ring', html:
      `<svg viewBox="0 0 220 220" aria-hidden="true"><circle class="pomo-ring-track" cx="110" cy="110" r="96"/>` +
      `<circle class="pomo-ring-fill" cx="110" cy="110" r="96" stroke-dasharray="${RING}" transform="rotate(-90 110 110)"/></svg>` });
    const time = h('span', { class: 'pomo-time', role: 'timer', 'aria-live': 'off' });
    const label = h('span', { class: 'pomo-label' });
    const dial = h('div', { class: 'pomo-dial' }, progress, h('div', { class: 'pomo-readout' }, time, label));
    // − and + change the length of the current phase, until it starts.
    const stepper = (direction, text) =>
      h('button', { type: 'button', class: 'pomo-step', 'data-step': direction, text, onclick: () => pomodoro.adjust(direction) });
    const minus = stepper(-1, '−');
    const plus = stepper(1, '+');
    const dialRow = h('div', { class: 'pomo-dial-row' }, minus, dial, plus);

    const dots = h('div', { class: 'pomo-dots', 'aria-hidden': 'true' });
    const round = h('p', { class: 'pomo-round' });

    const main = h('button', { type: 'button', class: 'pomo-main', onclick: toggle });
    const reset = h('button', { type: 'button', class: 'pomo-icon-btn', 'aria-label': 'Reset', title: 'Reset', onclick: () => pomodoro.reset(),
      html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5v3.2h3.2"/><path d="M3.3 6.6A5 5 0 1 1 3.6 10"/></svg>' });
    const skip = h('button', { type: 'button', class: 'pomo-icon-btn', 'aria-label': 'Skip to next', title: 'Skip to next', onclick: () => pomodoro.skip(),
      html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3l7 5-7 5z"/><path d="M12.5 3v10"/></svg>' });
    const controls = h('div', { class: 'pomo-controls' }, reset, main, skip);

    // Presets: one click sets all three lengths. "Custom" lights up for anything else.
    const presetButtons = PRESETS.map((p) =>
      h('button', { type: 'button', class: 'pomo-preset', 'data-preset': p.id, title: `${p.focus} min focus, ${p.short} min break, ${p.long} min long break`, onclick: () => pomodoro.usePreset(p.id) },
        h('span', { text: p.label }), h('small', { text: `${p.focus}·${p.short}` }))
    );
    // "Custom" lights up for your own lengths, and opens the timer settings.
    const custom = h('button', { type: 'button', class: 'pomo-preset pomo-custom', 'data-preset': 'custom', onclick: () => showSettings(true) },
      h('span', { class: 'pomo-custom-gear', 'aria-hidden': 'true',
        html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v1.8M8 12.4v1.8M1.8 8h1.8M12.4 8h1.8M3.6 3.6l1.3 1.3M11.1 11.1l1.3 1.3M3.6 12.4l1.3-1.3M11.1 4.9l1.3-1.3"/></svg>' }),
      h('span', { text: 'Custom' }));
    const presets = h('div', { class: 'pomo-presets', role: 'group', 'aria-label': 'Presets' }, presetButtons, custom);
    const timerView = h('div', { class: 'pomo-view' }, tabs, dialRow, round, dots, controls, presets);

    // ---------- Settings ----------
    // A number with − and + on either side (steps of 5 minutes for focus and long
    // breaks, 1 for the rest); it can also be typed, or changed with ↑ and ↓.
    const fields = [];
    const number = (key, text, max) => {
      const min = key === 'longEvery' ? 2 : 1;
      const step = STEP[key] || 1;
      const input = h('input', { type: 'text', inputmode: 'numeric', class: 'pomo-input', 'data-key': key, 'aria-label': text });
      const less = h('button', { type: 'button', class: 'pomo-field-step', 'aria-label': `Less ${text.toLowerCase()}`, text: '−' });
      const more = h('button', { type: 'button', class: 'pomo-field-step', 'aria-label': `More ${text.toLowerCase()}`, text: '+' });
      const sync = () => {
        const v = pomodoro.settings[key];
        input.value = v;
        less.disabled = v <= min;
        more.disabled = v >= max;
      };
      const set = (value) => {
        const n = Math.round(Number(value));
        if (Number.isFinite(n)) pomodoro.setSettings({ [key]: Math.min(max, Math.max(min, n)) });
        sync();
      };
      const nudge = (dir) => {
        const now = pomodoro.settings[key];
        set(dir > 0 ? Math.floor(now / step) * step + step : Math.ceil(now / step) * step - step);
      };
      less.addEventListener('click', () => nudge(-1));
      more.addEventListener('click', () => nudge(1));
      input.addEventListener('change', () => set(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        set(pomodoro.settings[key] + (e.key === 'ArrowUp' ? 1 : -1));
      });
      fields.push(sync);
      return h('div', { class: 'pomo-field' }, h('span', { text }),
        h('span', { class: 'pomo-field-input' }, less, input, more, h('small', { text: key === 'longEvery' ? 'focus sessions' : 'min' })));
    };
    const check = (key, text) => {
      const input = h('input', { type: 'checkbox', 'data-key': key });
      input.addEventListener('change', () => pomodoro.setSettings({ [key]: input.checked }));
      return h('label', { class: 'pomo-check' }, input, h('span', { text }));
    };
    const notifyNote = h('p', { class: 'pomo-note' });
    const settingsView = h('div', { class: 'pomo-view pomo-settings', hidden: true },
      h('h3', { text: 'Timer settings' }),
      number('focus', 'Focus', 180),
      number('short', 'Short break', 60),
      number('long', 'Long break', 90),
      number('longEvery', 'Long break after', 12),
      check('autoStart', 'Start the next phase by itself'),
      check('sound', 'Play a chime when a phase ends'),
      notifyNote,
      h('p', { class: 'pomo-note', text: 'The timer keeps running when you close this window or step back from the computer.' }),
      h('div', { class: 'pomo-foot' }, h('span'), h('button', { type: 'button', class: 'mac-button', text: 'Done', onclick: () => showSettings(false) }))
    );

    const el = h('div', { class: 'pomo' }, timerView, settingsView);

    function showSettings(on) {
      timerView.hidden = on;
      settingsView.hidden = !on;
      if (on) {
        const s = pomodoro.settings;
        fields.forEach((sync) => sync());
        for (const input of settingsView.querySelectorAll('input[type="checkbox"]')) input.checked = s[input.dataset.key];
        const perm = 'Notification' in window ? Notification.permission : 'unsupported';
        notifyNote.textContent = {
          granted: 'When this tab is in the background, a notification tells you a phase has ended.',
          denied: 'Notifications are blocked for this site, so only the chime tells you a phase has ended.',
          default: 'Press Start once and the page asks whether it may notify you when a phase ends.',
          unsupported: 'This browser cannot show notifications; the chime tells you a phase has ended.',
        }[perm];
        settingsView.querySelector('input')?.focus();
      }
    }

    let lastText = '';
    function render() {
      const left = pomodoro.remaining();
      const text = formatTime(left);
      if (text !== lastText) {
        lastText = text;
        time.textContent = text;
      }
      const share = 1 - left / pomodoro.total();
      progress.querySelector('.pomo-ring-fill').style.strokeDashoffset = String(RING * (1 - share));
      el.dataset.phase = pomodoro.phase;
      el.classList.toggle('is-running', pomodoro.running);
      label.textContent = pomodoro.running ? pomodoro.label : pomodoro.started ? 'Paused' : pomodoro.label;
      main.textContent = pomodoro.running ? 'Pause' : pomodoro.started ? 'Resume' : 'Start';
      reset.disabled = !pomodoro.started;
      // − and + only before the phase starts, and not past the limits.
      const s = pomodoro.settings;
      const key = PHASES[pomodoro.phase].setting;
      // Hidden (but keeping their place) once the phase has started.
      for (const b of [minus, plus]) b.classList.toggle('is-off', !pomodoro.adjustable);
      minus.disabled = s[key] <= LIMITS[key][0];
      plus.disabled = s[key] >= LIMITS[key][1];
      minus.title = `${STEP[key]} min shorter`;
      plus.title = `${STEP[key]} min longer`;
      const active = pomodoro.preset?.id || 'custom';
      for (const b of presets.querySelectorAll('.pomo-preset')) b.classList.toggle('is-active', b.dataset.preset === active);
      custom.title = active === 'custom' ? `Your own lengths: ${s.focus} min focus, ${s.short} min break, ${s.long} min long break` : 'Set your own lengths, and other timer settings';
      for (const tab of tabs.children) {
        const on = tab.dataset.phase === pomodoro.phase;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', String(on));
      }
      const every = pomodoro.settings.longEvery;
      if (dots.childElementCount !== every) dots.replaceChildren(...Array.from({ length: every }, () => h('span')));
      [...dots.children].forEach((dot, i) => {
        dot.classList.toggle('is-done', i < pomodoro.done || pomodoro.phase === 'long');
        dot.classList.toggle('is-now', pomodoro.phase === 'focus' && i === pomodoro.done);
      });
      const n = pomodoro.phase === 'long' ? every : pomodoro.done + (pomodoro.phase === 'focus' ? 1 : 0);
      round.textContent = pomodoro.phase === 'long' ? 'Cycle complete: enjoy the long break' : `Focus session ${Math.max(1, n)} of ${every}`;
    }

    return { el, render, showSettings };
  }

  function open() {
    if (win?.el.isConnected) {
      os.restore(win);
      return view;
    }
    win = os.openWindow(app, { title: 'Pomodoro', width: 480, height: 470, minWidth: 440, minHeight: 360, className: 'pomo-win' });
    view = build();
    win.body.append(view.el);
    view.render();
    const stopChange = pomodoro.on('change', () => {
      view.render();
      os.refreshMenubar();
    });
    const tick = setInterval(() => pomodoro.running && view.render(), 250);
    win.el.addEventListener('keydown', (e) => {
      if (e.key !== ' ' || e.target.closest('input, button')) return;
      e.preventDefault();
      toggle();
    });
    win.onClose = () => {
      stopChange();
      clearInterval(tick);
      win = null;
    };
    return view;
  }

  // A notice on the desktop when a phase ends while you are at the computer.
  pomodoro.on('end', ({ finished, next }) => {
    if (!os.isOn) return;
    const toBreak = next !== 'focus';
    os.notify({
      app: 'pomodoro',
      title: finished === 'focus' ? 'Focus session done' : 'Break is over',
      body: toBreak ? `Time for a ${PHASES[next].label.toLowerCase()}.` : 'Back to focus.',
      onClick: () => open(),
    });
  });

  return { app, open };
}
