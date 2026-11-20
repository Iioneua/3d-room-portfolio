import { h } from './dom.js';
import { PHASES, formatTime } from '../pomodoro.js';

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

    const dots = h('div', { class: 'pomo-dots', 'aria-hidden': 'true' });
    const round = h('p', { class: 'pomo-round' });

    const main = h('button', { type: 'button', class: 'pomo-main', onclick: toggle });
    const reset = h('button', { type: 'button', class: 'pomo-icon-btn', 'aria-label': 'Reset', title: 'Reset', onclick: () => pomodoro.reset(),
      html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3.5v3.2h3.2"/><path d="M3.3 6.6A5 5 0 1 1 3.6 10"/></svg>' });
    const skip = h('button', { type: 'button', class: 'pomo-icon-btn', 'aria-label': 'Skip to next', title: 'Skip to next', onclick: () => pomodoro.skip(),
      html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 3l7 5-7 5z"/><path d="M12.5 3v10"/></svg>' });
    const controls = h('div', { class: 'pomo-controls' }, reset, main, skip);

    const gear = h('button', { type: 'button', class: 'pomo-link', text: 'Settings', onclick: () => showSettings(true) });
    const note = h('p', { class: 'pomo-note', text: 'Keeps running when you step back from the computer.' });
    const timerView = h('div', { class: 'pomo-view' }, tabs, dial, round, dots, controls, h('div', { class: 'pomo-foot' }, note, gear));

    // ---------- Settings ----------
    const number = (key, text, max) => {
      const input = h('input', { type: 'number', min: key === 'longEvery' ? 2 : 1, max, step: 1, class: 'pomo-input', 'data-key': key });
      input.addEventListener('change', () => pomodoro.setSettings({ [key]: input.value }));
      return h('label', { class: 'pomo-field' }, h('span', { text }), h('span', { class: 'pomo-field-input' }, input, h('small', { text: key === 'longEvery' ? 'focus sessions' : 'min' })));
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
      h('div', { class: 'pomo-foot' }, h('span'), h('button', { type: 'button', class: 'mac-button', text: 'Done', onclick: () => showSettings(false) }))
    );

    const el = h('div', { class: 'pomo' }, timerView, settingsView);

    function showSettings(on) {
      timerView.hidden = on;
      settingsView.hidden = !on;
      if (on) {
        const s = pomodoro.settings;
        for (const input of settingsView.querySelectorAll('[data-key]')) {
          if (input.type === 'checkbox') input.checked = s[input.dataset.key];
          else input.value = s[input.dataset.key];
        }
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
    win = os.openWindow(app, { title: 'Pomodoro', width: 430, height: 470, minWidth: 380, minHeight: 360, className: 'pomo-win' });
    view = build();
    win.body.append(view.el);
    view.render();
    // On a small screen the window is shorter: a smaller dial keeps everything in view.
    const fit = new ResizeObserver(() => view.el.classList.toggle('is-compact', win.body.clientHeight < 430));
    fit.observe(win.body);
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
      fit.disconnect();
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
