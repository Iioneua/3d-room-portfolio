import { h, icon, clamp, MOD } from './dom.js';
import { glyphs, systemMark, small } from './icons.js';
import { wallpaper as paintWallpaper } from '../textures.js';

// The desktop: wallpaper, menu bar, dock, windows, menus, notifications and dialogs.
// Apps (for now the Terminal) register themselves and open windows through it.
//
// The desktop sits on the monitor's screen in the room. It has its own size in CSS
// pixels (about 1530 by 640, the screen's shape) and is moved and scaled every frame
// to cover the screen exactly as the camera sees it.

const MENUBAR = 28;
const DOCK_SPACE = 86;

export function createOS({ profile, onLeave, onHelp }) {
  const view = { w: 1530, h: 640, x: 0, y: 0, s: 1, base: 1 };
  const toLocal = (cx, cy) => [(cx - view.x) / view.s, (cy - view.y) / view.s];

  const root = h('div', { class: 'mac', 'aria-hidden': 'true', style: { width: `${view.w}px`, height: `${view.h}px` } });
  const wallpaper = h('canvas', { class: 'mac-wallpaper' });
  const desktop = h('div', { class: 'mac-desktop' });
  const layer = h('div', { class: 'mac-windows' });
  const menubar = h('div', { class: 'mac-menubar' });
  const dock = h('nav', { class: 'mac-dock', 'aria-label': 'Dock' });
  const toasts = h('div', { class: 'mac-toasts' });
  const overlay = h('div', { class: 'mac-overlay' });
  const widgetTime = h('p', { class: 'mac-widget-time' });
  const widgetDate = h('p', { class: 'mac-widget-date' });
  const widget = h('div', { class: 'mac-widget', 'aria-hidden': 'true' }, widgetTime, widgetDate);
  root.append(wallpaper, widget, desktop, layer, dock, menubar, toasts, overlay);
  document.body.append(root);

  const apps = new Map();
  // Owns the windows that belong to no app in the dock, such as About This Computer.
  const system = { id: 'system', name: 'System', inDock: false, windows: [] };
  apps.set(system.id, system);
  let active = null;
  let zTop = 10;
  let spawned = 0;
  let isOn = false;

  const workArea = () => ({ x: 0, y: MENUBAR, w: view.w, h: view.h - MENUBAR - DOCK_SPACE });

  // ---------- Wallpaper ----------
  function drawWallpaper() {
    // Sharp at the size the desktop is shown at once the camera has stopped.
    const ratio = Math.min((window.devicePixelRatio || 1) * view.base, 2.5);
    const w = Math.round(view.w * ratio);
    const hgt = Math.round(view.h * ratio);
    if (wallpaper.width === w && wallpaper.height === hgt) return;
    wallpaper.width = w;
    wallpaper.height = hgt;
    paintWallpaper(wallpaper.getContext('2d'), w, hgt);
  }

  // ---------- Windows ----------
  function apply(win) {
    const r = win.rect;
    Object.assign(win.el.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    win.onResize?.();
  }

  function topWindow(except) {
    let best = null;
    for (const app of apps.values()) {
      for (const w of app.windows) {
        if (w === except || w.minimized) continue;
        if (!best || +w.el.style.zIndex > +best.el.style.zIndex) best = w;
      }
    }
    return best;
  }

  function focusWindow(win) {
    if (!win) {
      active?.el.classList.remove('is-active');
      active = null;
      renderMenubar();
      return;
    }
    if (win.el.style.zIndex != zTop) win.el.style.zIndex = ++zTop;
    if (active === win) return;
    active?.el.classList.remove('is-active');
    active = win;
    win.el.classList.add('is-active');
    renderMenubar();
    // Keyboard shortcuts go to the window that was just brought forward.
    if (!win.el.contains(document.activeElement)) win.el.focus({ preventScroll: true });
    win.onFocus?.();
  }

  function animate(el, cls, ms) {
    el.classList.add(cls);
    return new Promise((resolve) => setTimeout(() => {
      el.classList.remove(cls);
      resolve();
    }, ms));
  }

  function openWindow(app, opts = {}) {
    const area = workArea();
    const w = Math.min(opts.width ?? 760, area.w - 40);
    const hgt = Math.min(opts.height ?? 480, area.h - 24);
    // The first window is centred; later ones step down and to the right.
    const offset = (spawned++ % 6) * 26;
    const x = opts.x ?? Math.round((area.w - w) / 2 + offset);
    const y = opts.y ?? Math.round(area.y + Math.max(10, (area.h - hgt) / 2 - 10) + offset * 0.6);

    const lights = h('div', { class: 'mac-lights' },
      h('button', { class: 'mac-light mac-light-close', type: 'button', 'aria-label': 'Close', html: '<svg viewBox="0 0 10 10"><path d="M3 3l4 4M7 3L3 7"/></svg>' }),
      h('button', { class: 'mac-light mac-light-min', type: 'button', 'aria-label': 'Minimise', html: '<svg viewBox="0 0 10 10"><path d="M2.5 5h5"/></svg>' }),
      h('button', { class: 'mac-light mac-light-zoom', type: 'button', 'aria-label': 'Zoom', html: '<svg viewBox="0 0 10 10"><path d="M3 6.6V3h3.6zM7 3.4V7H3.4z"/></svg>' })
    );
    const titleEl = h('span', { class: 'mac-title', text: opts.title ?? app.name });
    const titlebar = opts.titlebar === false ? null : h('header', { class: 'mac-titlebar', 'data-drag': '' }, titleEl);
    const body = h('div', { class: 'mac-win-body' });
    const el = h('section', { class: `mac-win ${opts.className || ''}`, role: 'dialog', tabindex: '-1', 'aria-label': opts.title ?? app.name }, titlebar, body, lights);
    for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) el.append(h('div', { class: `mac-resize mac-resize-${d}`, 'data-dir': d }));

    const win = {
      app,
      el,
      body,
      rect: { x: clamp(x, 0, area.w - w), y: clamp(y, MENUBAR, area.y + area.h - hgt), w, h: hgt },
      min: { w: opts.minWidth ?? 380, h: opts.minHeight ?? 240 },
      minimized: false,
      zoomed: null,
      beforeClose: null,
      onClose: null,
      onFocus: null,
      onResize: null,
      setTitle(text) {
        titleEl.textContent = text;
        el.setAttribute('aria-label', text);
      },
      focus: () => focusWindow(win),
      close: () => closeWindow(win),
      minimize: () => minimize(win),
      toggleZoom: () => toggleZoom(win),
      dialog: (o) => dialog(win, o),
      get isActive() {
        return active === win;
      },
    };

    lights.children[0].addEventListener('click', () => win.close());
    lights.children[1].addEventListener('click', () => win.minimize());
    lights.children[2].addEventListener('click', () => win.toggleZoom());

    el.addEventListener('pointerdown', () => focusWindow(win), true);
    el.addEventListener('pointerdown', (e) => startDrag(win, e));
    el.addEventListener('dblclick', (e) => {
      if (isDragZone(e.target)) win.toggleZoom();
    });

    app.windows.push(win);
    layer.append(el);
    apply(win);
    focusWindow(win);
    animate(el, 'is-opening', 220);
    renderDock();
    // The app fills the window after this returns; its menus may depend on that.
    queueMicrotask(renderMenubar);
    return win;
  }

  const isDragZone = (target) =>
    target.closest('[data-drag]') && !target.closest('button, input, textarea, select, a, [data-nodrag]');

  function startDrag(win, e) {
    if (e.button !== 0) return;
    const handle = e.target.closest('.mac-resize');
    if (!handle && !isDragZone(e.target)) return;
    e.preventDefault();
    const dir = handle?.dataset.dir || '';
    const start = { px: e.clientX, py: e.clientY, ...win.rect };
    root.classList.add('is-dragging');
    win.zoomed = null;
    const move = (ev) => {
      const dx = (ev.clientX - start.px) / view.s;
      const dy = (ev.clientY - start.py) / view.s;
      const r = win.rect;
      if (!handle) {
        r.x = clamp(start.x + dx, 80 - start.w, view.w - 80);
        r.y = clamp(start.y + dy, MENUBAR, view.h - 50);
      } else {
        if (dir.includes('e')) r.w = Math.max(win.min.w, start.w + dx);
        if (dir.includes('s')) r.h = Math.max(win.min.h, Math.min(start.h + dy, view.h - start.y));
        if (dir.includes('w')) {
          r.w = Math.max(win.min.w, start.w - dx);
          r.x = start.x + start.w - r.w;
        }
        if (dir.includes('n')) {
          r.h = Math.max(win.min.h, start.h - Math.max(dy, MENUBAR - start.y));
          r.y = start.y + start.h - r.h;
        }
      }
      apply(win);
    };
    const up = () => {
      root.classList.remove('is-dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function toggleZoom(win) {
    if (win.zoomed) {
      win.rect = win.zoomed;
      win.zoomed = null;
    } else {
      win.zoomed = { ...win.rect };
      const a = workArea();
      win.rect = { x: a.x + 6, y: a.y + 6, w: a.w - 12, h: a.h - 6 };
    }
    animate(win.el, 'is-zooming', 260);
    apply(win);
  }

  function dockIconOf(app) {
    return dock.querySelector(`[data-app="${app.id}"] .mac-appicon`) || dock;
  }

  function genie(win) {
    const from = win.el.getBoundingClientRect();
    const to = dockIconOf(win.app).getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    return `translate(${dx / view.s}px, ${dy / view.s}px) scale(${Math.max(0.04, to.width / from.width)})`;
  }

  async function minimize(win) {
    if (win.minimized) return;
    win.minimized = true;
    win.el.classList.add('is-minimising');
    win.el.style.transform = genie(win);
    win.el.style.opacity = '0';
    if (active === win) focusWindow(topWindow(win));
    await new Promise((r) => setTimeout(r, 380));
    if (win.minimized) win.el.hidden = true;
    renderDock();
  }

  function restore(win) {
    if (!win.minimized) return focusWindow(win);
    win.minimized = false;
    win.el.hidden = false;
    win.el.classList.remove('is-minimising');
    win.el.style.transform = '';
    win.el.style.transform = genie(win);
    win.el.style.opacity = '0';
    win.el.getBoundingClientRect();
    win.el.classList.add('is-minimising');
    win.el.style.transform = '';
    win.el.style.opacity = '';
    setTimeout(() => win.el.classList.remove('is-minimising'), 380);
    focusWindow(win);
    renderDock();
  }

  async function closeWindow(win) {
    if (win.beforeClose && !(await win.beforeClose())) return;
    const list = win.app.windows;
    if (!list.includes(win)) return;
    list.splice(list.indexOf(win), 1);
    if (active === win) focusWindow(topWindow(win));
    await animate(win.el, 'is-closing', 160);
    win.el.remove();
    win.onClose?.();
    renderDock();
  }

  // ---------- Size and position on the monitor ----------
  // The desktop's own size, and the scale it is shown at once the camera stops.
  function setSize(w, hgt, base) {
    view.base = base;
    if (w !== view.w || hgt !== view.h) {
      view.w = w;
      view.h = hgt;
      root.style.width = `${w}px`;
      root.style.height = `${hgt}px`;
      // Keep windows reachable when the desktop changes size.
      const a = workArea();
      for (const app of apps.values()) {
        for (const win of app.windows) {
          const r = win.rect;
          if (win.zoomed) Object.assign(r, { x: a.x + 6, y: a.y + 6, w: a.w - 12, h: a.h - 6 });
          r.w = Math.min(r.w, a.w);
          r.h = Math.min(r.h, view.h - MENUBAR);
          r.x = clamp(r.x, 80 - r.w, view.w - 80);
          r.y = clamp(r.y, MENUBAR, Math.max(MENUBAR, view.h - 50));
          apply(win);
        }
      }
    }
    if (isOn) drawWallpaper();
  }

  // Where the screen is on the page right now (it moves while the camera does).
  function track({ x, y, width }) {
    const s = width / view.w;
    if (Math.abs(s - view.s) < 1e-5 && Math.abs(x - view.x) < 0.01 && Math.abs(y - view.y) < 0.01) return;
    view.x = x;
    view.y = y;
    view.s = s;
    root.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }

  // ---------- Dialogs (sheets that drop from a window's title bar) ----------
  function dialog(win, { title, message, buttons }) {
    return new Promise((resolve) => {
      const done = (value) => {
        backdrop.remove();
        resolve(value);
      };
      const row = h('div', { class: 'mac-sheet-buttons' },
        buttons.map((b) => h('button', { type: 'button', class: b.primary ? 'is-primary' : '', text: b.label, onclick: () => done(b.value) }))
      );
      const sheet = h('div', { class: 'mac-sheet', role: 'alertdialog' },
        h('span', { class: `mac-appicon mac-appicon-${win.app.id} mac-sheet-icon`, html: glyphs[win.app.id] || '' }),
        h('strong', { text: title }),
        message ? h('p', { text: message }) : null,
        row
      );
      const backdrop = h('div', { class: 'mac-sheet-backdrop' }, sheet);
      backdrop.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') done(buttons.find((b) => b.cancel)?.value ?? null);
      });
      win.el.append(backdrop);
      (row.querySelector('.is-primary') || row.firstChild).focus();
    });
  }

  // ---------- Menus ----------
  let openMenu = null;

  function menuList(items, onPick) {
    const list = h('div', { class: 'mac-menu', role: 'menu' });
    for (const item of items) {
      if (item === '-') {
        list.append(h('div', { class: 'mac-menu-sep' }));
        continue;
      }
      list.append(
        h('button', {
          type: 'button',
          role: 'menuitem',
          class: `mac-menu-item${item.checked ? ' is-checked' : ''}`,
          disabled: item.disabled,
          onclick: () => {
            closeMenus();
            onPick?.();
            item.action?.();
          },
        },
        h('span', { class: 'mac-menu-check', text: item.checked ? '✓' : '' }),
        h('span', { class: 'mac-menu-label', text: item.label }),
        item.shortcut ? h('span', { class: 'mac-menu-key', text: item.shortcut }) : null)
      );
    }
    return list;
  }

  function closeMenus() {
    overlay.replaceChildren();
    openMenu?.button.classList.remove('is-open');
    openMenu = null;
  }

  function showMenu(button, getMenu) {
    closeMenus();
    const menu = getMenu();
    if (!menu) return;
    const list = menuList(menu.items);
    const [left] = toLocal(button.getBoundingClientRect().left, 0);
    list.style.left = `${Math.min(left, view.w - 260)}px`;
    list.style.top = `${MENUBAR - 2}px`;
    overlay.append(list);
    button.classList.add('is-open');
    openMenu = { button, list };
  }

  // A right-click menu at the pointer.
  function contextMenu(event, items) {
    event.preventDefault();
    event.stopPropagation();
    closeMenus();
    const list = menuList(items);
    overlay.append(list);
    const [x, y] = toLocal(event.clientX, event.clientY);
    list.style.left = `${Math.max(4, Math.min(x, view.w - list.offsetWidth - 6))}px`;
    list.style.top = `${Math.max(MENUBAR, Math.min(y, view.h - list.offsetHeight - 6))}px`;
    openMenu = { button: h('span'), list };
  }

  document.addEventListener('pointerdown', (e) => {
    if (!openMenu) return;
    if (e.target.closest('.mac-menu') || e.target.closest('.mac-menubar-title')) return;
    closeMenus();
  }, true);

  // ---------- Menu bar ----------
  const clock = h('span', { class: 'mac-clock' });
  const leave = h('button', { type: 'button', class: 'mac-leave', onclick: () => onLeave() }, icon(small.leave), 'Step back');
  const status = h('div', { class: 'mac-status' },
    leave,
    icon(small.battery, 'ic mac-battery'),
    icon(small.wifi),
    icon(small.search),
    icon(small.controls),
    clock
  );
  const menus = h('div', { class: 'mac-menus' });
  menubar.append(menus, status);

  function windowMenu(app) {
    const list = app.windows.filter((w) => w.el.isConnected);
    return {
      title: 'Window',
      items: [
        { label: 'Minimise', shortcut: `${MOD}M`, disabled: !active, action: () => active && minimize(active) },
        { label: 'Zoom', disabled: !active, action: () => active && toggleZoom(active) },
        { label: 'Bring All to Front', disabled: !list.length, action: () => list.forEach((w) => restore(w)) },
        ...(list.length ? ['-'] : []),
        ...list.map((w) => ({ label: w.el.getAttribute('aria-label'), checked: w === active, action: () => restore(w) })),
      ],
    };
  }

  // The menus of the app in front. Built again each time a menu opens, so items are
  // greyed out (or ticked) according to what is going on right now.
  function menuDefs() {
    const app = active?.app || [...apps.values()].find((a) => a.inDock !== false);
    if (!app) return [];
    return [
      {
        mark: true,
        items: [
          { label: 'About This Computer', action: about },
          '-',
          { label: 'Step Back from the Computer', action: () => onLeave() },
        ],
      },
      {
        title: app.name,
        bold: true,
        items: [
          { label: `Hide ${app.name}`, disabled: !app.windows.length, action: () => app.windows.forEach((w) => minimize(w)) },
          '-',
          { label: `Quit ${app.name}`, disabled: !app.windows.length, action: () => [...app.windows].forEach((w) => w.close()) },
        ],
      },
      ...(app.menus?.(active?.app === app ? active : null) || []),
      windowMenu(app),
      { title: 'Help', items: [{ label: 'How This Computer Works', action: () => onHelp?.() }, { label: 'Step Back from the Computer', action: () => onLeave() }] },
    ];
  }

  function renderMenubar() {
    menus.replaceChildren(
      ...menuDefs().map((menu, index) => {
        const current = () => menuDefs()[index];
        const button = h('button', {
          type: 'button',
          class: `mac-menubar-title${menu.bold ? ' is-bold' : ''}${menu.mark ? ' is-mark' : ''}`,
          'aria-label': menu.mark ? 'System menu' : null,
        });
        if (menu.mark) button.append(icon(systemMark));
        else button.textContent = menu.title;
        button.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (openMenu?.button === button) closeMenus();
          else showMenu(button, current);
        });
        button.addEventListener('pointerenter', () => {
          if (openMenu && openMenu.button !== button && openMenu.button.classList.contains('mac-menubar-title')) showMenu(button, current);
        });
        return button;
      })
    );
  }

  let clockTimer = null;
  function tickClock() {
    const d = new Date();
    const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    clock.textContent = `${day}  ${time}`;
    widgetTime.textContent = time;
    widgetDate.textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  // ---------- Dock ----------
  function renderDock() {
    const items = [...apps.values()].filter((a) => a.inDock !== false).map((app) => {
      const item = h('button', { type: 'button', class: 'mac-dock-item', 'data-app': app.id, 'aria-label': app.name },
        h('span', { class: 'mac-dock-tip', text: app.name }),
        h('span', { class: `mac-appicon mac-appicon-${app.id}`, html: glyphs[app.id] }),
        h('span', { class: `mac-dock-dot${app.windows.length ? ' is-on' : ''}` })
      );
      item.addEventListener('click', () => dockClick(app, item));
      return item;
    });
    dock.replaceChildren(...items);
  }

  function dockClick(app, item) {
    const visible = app.windows.filter((w) => !w.minimized);
    if (!app.windows.length) {
      item.classList.add('is-bouncing');
      setTimeout(() => item.classList.remove('is-bouncing'), 700);
      app.launch({});
    } else if (visible.length) {
      visible.sort((a, b) => a.el.style.zIndex - b.el.style.zIndex).forEach((w) => focusWindow(w));
    } else restore(app.windows[app.windows.length - 1]);
  }

  // Icons grow as the pointer passes over them.
  let raf = 0;
  dock.addEventListener('pointermove', (e) => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      for (const item of dock.querySelectorAll('.mac-dock-item')) {
        const r = item.getBoundingClientRect();
        const d = Math.abs(e.clientX - (r.left + r.width / 2));
        const s = 1 + 0.42 * Math.max(0, 1 - d / (130 * view.s)) ** 1.6;
        item.style.setProperty('--s', s.toFixed(3));
      }
    });
  });
  dock.addEventListener('pointerleave', () => {
    cancelAnimationFrame(raf);
    for (const item of dock.querySelectorAll('.mac-dock-item')) item.style.setProperty('--s', 1);
  });

  // ---------- Desktop ----------
  let desktopMenu = null;
  desktop.addEventListener('pointerdown', (e) => {
    if (e.target === desktop) focusWindow(null);
  });
  desktop.addEventListener('contextmenu', (e) => {
    if (e.target === desktop && desktopMenu) contextMenu(e, desktopMenu());
  });
  root.addEventListener('contextmenu', (e) => {
    if (!e.defaultPrevented && !e.target.closest('input, textarea, .term')) e.preventDefault();
  });

  // ---------- Notifications ----------
  function notify({ title, body, app = 'system', timeout = 9000, onClick }) {
    const close = h('button', { type: 'button', class: 'mac-toast-close', 'aria-label': 'Dismiss', html: small.close });
    const toast = h('div', { class: 'mac-toast', role: 'status' },
      h('span', { class: `mac-appicon mac-appicon-${app}`, html: glyphs[app] || '' }),
      h('div', { class: 'mac-toast-text' }, h('strong', { text: title }), h('p', { text: body })),
      close
    );
    const dismiss = () => {
      toast.classList.remove('is-in');
      setTimeout(() => toast.remove(), 300);
    };
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      dismiss();
    });
    toast.addEventListener('click', () => {
      onClick?.();
      dismiss();
    });
    toasts.append(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('is-in')));
    if (timeout) setTimeout(dismiss, timeout);
  }

  // ---------- About this computer ----------
  let aboutWin = null;
  function about() {
    if (aboutWin?.el.isConnected) return aboutWin.focus();
    aboutWin = openWindow(system, { title: 'About This Computer', width: 340, height: 400, minWidth: 340, minHeight: 400, className: 'mac-about' });
    aboutWin.body.append(
      h('span', { class: 'mac-about-mark', html: systemMark }),
      h('h2', { text: `${profile.name}'s computer` }),
      h('p', { class: 'mac-about-role', text: profile.role }),
      h('dl', {},
        h('dt', { text: 'Display' }), h('dd', { text: 'Ultrawide, on the desk' }),
        h('dt', { text: 'Memory' }), h('dd', { text: 'Resets when you reload' }),
        h('dt', { text: 'Built with' }), h('dd', { text: 'Three.js' })
      ),
      h('button', { type: 'button', class: 'mac-button', text: 'Step back', onclick: () => onLeave() })
    );
  }

  // ---------- Keys ----------
  document.addEventListener('keydown', (e) => {
    if (!isOn) return;
    if (e.key === 'Escape' && openMenu) closeMenus();
  });

  return {
    root,
    register(app) {
      app.windows = [];
      apps.set(app.id, app);
      renderDock();
      renderMenubar();
    },
    openWindow,
    focusWindow,
    restore,
    notify,
    contextMenu,
    setDesktopMenu: (fn) => (desktopMenu = fn),
    refreshMenubar: renderMenubar,
    setSize,
    track,
    get active() {
      return active;
    },
    get isOn() {
      return isOn;
    },
    show() {
      isOn = true;
      drawWallpaper();
      tickClock();
      clearInterval(clockTimer);
      clockTimer = setInterval(tickClock, 10000);
      root.removeAttribute('aria-hidden');
      root.classList.add('is-on');
      renderMenubar();
    },
    hide() {
      isOn = false;
      closeMenus();
      clearInterval(clockTimer);
      root.setAttribute('aria-hidden', 'true');
      root.classList.remove('is-on');
    },
  };
}
