import * as THREE from 'three';
import { PHASES, formatTime } from './pomodoro.js';

// Everything that appears printed or displayed on an object (screens, the plaque,
// prints) is drawn here on a canvas, from the data in content.js.

const SANS = '"Inter", "Segoe UI", system-ui, sans-serif';
const MONO = '"JetBrains Mono", "Cascadia Code", Consolas, monospace';
const SERIF = '"Instrument Serif", Georgia, serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c) {
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function make(w, h, draw) {
  const c = canvas(w, h);
  draw(c.getContext('2d'), w, h);
  return toTexture(c);
}

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// Smooth 1D noise for mountain ridges.
function ridgeNoise(seed) {
  const r = rng(seed);
  const values = Array.from({ length: 1024 }, r);
  const at = (i) => values[((i % 1024) + 1024) % 1024];
  const smooth = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    return at(i) + (at(i + 1) - at(i)) * u;
  };
  return (x) => {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let o = 0; o < 5; o++) {
      sum += amp * smooth(x * freq + o * 17.3);
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm;
  };
}

// A dusk lake with mountains, like the view from the window. It is the wallpaper of
// the monitor and of the computer's desktop. Horizontal positions are measured in
// screen heights from the centre, so a wider screen simply shows more of the same view.
export function wallpaper(g, w, h) {
  const horizon = h * 0.6;
  const X = (x) => (x - w / 2) / h;

  const sky = g.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#171a42');
  sky.addColorStop(0.32, '#35306c');
  sky.addColorStop(0.62, '#86599a');
  sky.addColorStop(0.86, '#df869a');
  sky.addColorStop(1, '#f6b48f');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, horizon + 1);

  // Glow where the sun has just set.
  const sunX = w / 2 + h * 0.3;
  const glow = g.createRadialGradient(sunX, horizon, 0, sunX, horizon, h * 0.75);
  glow.addColorStop(0, 'rgba(255, 205, 160, 0.55)');
  glow.addColorStop(0.45, 'rgba(255, 150, 160, 0.14)');
  glow.addColorStop(1, 'rgba(255, 150, 160, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, w, horizon);

  // Stars, fading out towards the horizon.
  const r = rng(11);
  const stars = Math.round((w * h) / 9000);
  for (let i = 0; i < stars; i++) {
    const y = Math.pow(r(), 1.6) * horizon * 0.6;
    const a = (1 - y / (horizon * 0.6)) * (0.25 + r() * 0.65);
    g.fillStyle = `rgba(255, 244, 236, ${a.toFixed(3)})`;
    const s = Math.max(1, h * (r() < 0.08 ? 0.0024 : 0.0013));
    g.fillRect(r() * w, y, s, s);
  }

  // Thin clouds lit from below.
  for (let i = 0; i < 9; i++) {
    const cx = r() * w;
    const cy = horizon * (0.42 + r() * 0.36);
    const cloud = g.createRadialGradient(cx, cy, 0, cx, cy, h * (0.2 + r() * 0.25));
    cloud.addColorStop(0, `rgba(255, 186, 190, ${(0.08 + r() * 0.1).toFixed(3)})`);
    cloud.addColorStop(1, 'rgba(255, 186, 190, 0)');
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.12);
    g.translate(-cx, -cy);
    g.fillStyle = cloud;
    g.fillRect(cx - h * 0.5, cy - h * 0.5, h, h);
    g.restore();
  }

  const layers = [
    { top: 0.37, amp: 0.2, scale: 2.2, seed: 3, a: '#b48bb0', b: '#a07ca6' },
    { top: 0.45, amp: 0.13, scale: 3.4, seed: 8, a: '#7d5d96', b: '#67518a' },
    { top: 0.52, amp: 0.075, scale: 5.5, seed: 13, a: '#45375f', b: '#352b50' },
  ];
  // Height of a ridge at x: sharp peaks from folded noise over a softer base.
  const ridge = (n, x) => {
    const peaks = 1 - Math.abs(2 * n(x) - 1);
    return 1 - (0.7 * peaks + 0.3 * n(x * 0.5 + 40));
  };
  const drawMountains = () => {
    for (const L of layers) {
      const n = ridgeNoise(L.seed);
      g.beginPath();
      g.moveTo(0, horizon + 1);
      for (let x = 0; x <= w + 2; x += 2) g.lineTo(x, Math.min(horizon, h * (L.top + L.amp * ridge(n, X(x) * L.scale + L.seed))));
      g.lineTo(w, horizon + 1);
      g.closePath();
      const fill = g.createLinearGradient(0, h * L.top, 0, horizon);
      fill.addColorStop(0, L.a);
      fill.addColorStop(1, L.b);
      g.fillStyle = fill;
      g.fill();
    }
  };
  drawMountains();

  // Haze sitting on the water line.
  const haze = g.createLinearGradient(0, horizon - h * 0.07, 0, horizon);
  haze.addColorStop(0, 'rgba(240, 170, 175, 0)');
  haze.addColorStop(1, 'rgba(240, 170, 175, 0.32)');
  g.fillStyle = haze;
  g.fillRect(0, horizon - h * 0.07, w, h * 0.07);

  // The lake, with the mountains mirrored in it.
  const lake = g.createLinearGradient(0, horizon, 0, h);
  lake.addColorStop(0, '#d995a2');
  lake.addColorStop(0.28, '#7d6295');
  lake.addColorStop(0.7, '#2c2853');
  lake.addColorStop(1, '#14152c');
  g.fillStyle = lake;
  g.fillRect(0, horizon, w, h - horizon);
  g.save();
  g.beginPath();
  g.rect(0, horizon, w, h - horizon);
  g.clip();
  g.globalAlpha = 0.32;
  g.translate(0, horizon * 2);
  g.scale(1, -1);
  drawMountains();
  g.restore();
  const fade = g.createLinearGradient(0, horizon, 0, h);
  fade.addColorStop(0, 'rgba(20, 21, 44, 0)');
  fade.addColorStop(0.5, 'rgba(20, 21, 44, 0.55)');
  fade.addColorStop(1, 'rgba(20, 21, 44, 0.9)');
  g.fillStyle = fade;
  g.fillRect(0, horizon, w, h - horizon);

  // The sunset glow on the water.
  const shine = g.createRadialGradient(sunX, horizon, 0, sunX, horizon, h * 0.35);
  shine.addColorStop(0, 'rgba(255, 196, 170, 0.35)');
  shine.addColorStop(1, 'rgba(255, 196, 170, 0)');
  g.save();
  g.translate(sunX, horizon);
  g.scale(0.5, 1);
  g.translate(-sunX, -horizon);
  g.fillStyle = shine;
  g.fillRect(sunX - h, horizon, h * 2, h * 0.4);
  g.restore();

  // Ripples.
  for (let i = 0; i < (w / h) * 140; i++) {
    const y = horizon + Math.pow(r(), 1.5) * (h - horizon);
    const len = h * (0.01 + r() * 0.06) * (0.4 + (y - horizon) / (h - horizon));
    g.fillStyle = `rgba(255, 214, 205, ${(0.03 + r() * 0.09).toFixed(3)})`;
    g.fillRect(r() * w, y, len, Math.max(1, h * 0.0012));
  }

  // Town lights along the shore, with their reflections.
  const towns = Math.max(3, Math.round((w / h) * 3));
  for (let t = 0; t < towns; t++) {
    const cx = r() * w;
    const spread = h * (0.05 + r() * 0.12);
    const count = 6 + Math.floor(r() * 14);
    for (let i = 0; i < count; i++) {
      const x = cx + (r() - 0.5) * spread * 2;
      const y = horizon - h * (0.002 + r() * 0.012);
      const s = Math.max(1.2, h * 0.0022);
      const light = g.createRadialGradient(x, y, 0, x, y, s * 4);
      light.addColorStop(0, 'rgba(255, 226, 170, 0.95)');
      light.addColorStop(0.3, 'rgba(255, 200, 140, 0.35)');
      light.addColorStop(1, 'rgba(255, 200, 140, 0)');
      g.fillStyle = light;
      g.fillRect(x - s * 4, y - s * 4, s * 8, s * 8);
      g.fillStyle = 'rgba(255, 210, 160, 0.11)';
      g.fillRect(x - s / 2, horizon + h * 0.003, s, h * (0.006 + r() * 0.022));
    }
  }
}

// The same colours as the Pomodoro app (computer.css).
const PHASE_COLOURS = { focus: '#ff8a65', short: '#5ec4b6', long: '#a594ff' };

// What the monitor shows when nobody is using it: the same desktop you get when you
// go into the computer (menu bar, clock, the Pomodoro app with the live timer, and the
// dock), so you can follow the timer from across the room.
// It is drawn in the desktop's own units (about 1530 by 640) and scaled to the canvas.
export function desktopScreen(pomodoro) {
  const W = 2048;
  const H = 856;
  const k = W / 1530;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const base = canvas(W, H);
  wallpaper(base.getContext('2d'), W, H);

  const font = (weight, size, family = SANS) => `${weight} ${size * k}px ${family}`;
  const text = (t, x, y, color, f, align = 'left') => {
    g.font = f;
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(t, x * k, y * k);
  };
  const box = (x, y, w, h, r, fill) => {
    g.fillStyle = fill;
    rounded(g, x * k, y * k, w * k, h * k, r * k);
    g.fill();
  };
  const lights = (x, y) =>
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc((x + i * 20) * k, y * k, 6 * k, 0, Math.PI * 2);
      g.fill();
    });

  function draw() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    g.drawImage(base, 0, 0);

    // Menu bar, with the sun-and-peaks mark.
    g.fillStyle = 'rgba(24, 20, 40, 0.45)';
    g.fillRect(0, 0, W, 28 * k);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(25 * k, 10 * k, 2.6 * k, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(11 * k, 21 * k);
    g.lineTo(17 * k, 11.5 * k);
    g.lineTo(20.5 * k, 16.5 * k);
    g.lineTo(22.6 * k, 13.7 * k);
    g.lineTo(28 * k, 21 * k);
    g.closePath();
    g.fill();
    let mx = 44;
    for (const [i, m] of ['Pomodoro', 'Timer', 'Window', 'Help'].entries()) {
      text(m, mx, 19, '#ffffff', font(i ? 400 : 700, 13));
      mx += g.measureText(m).width / k + 18;
    }
    const day = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
    text(`${day}  ${time}`, 1516, 19, '#ffffff', font(400, 13), 'right');

    // Clock on the desktop.
    text(time, 765, 118, 'rgba(255, 255, 255, 0.92)', font(400, 76, SERIF), 'center');
    text(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), 765, 146, 'rgba(255, 255, 255, 0.72)', font(500, 14), 'center');

    // The Pomodoro window, with the live timer.
    const left = pomodoro.remaining();
    const accent = PHASE_COLOURS[pomodoro.phase];
    const ww = 380;
    const wh = 400;
    const wx = 765 - ww / 2;
    const wy = 160;
    box(wx, wy, ww, wh, 11, 'rgba(30, 28, 38, 0.95)');
    g.save();
    rounded(g, wx * k, wy * k, ww * k, wh * k, 11 * k);
    g.clip();
    g.fillStyle = '#2c2c2f';
    g.fillRect(wx * k, wy * k, ww * k, 30 * k);
    g.restore();
    lights(wx + 20, wy + 15);
    text('Pomodoro', 765, wy + 20, '#dadadd', font(600, 12), 'center');

    // Phase tabs.
    box(765 - 150, wy + 46, 300, 28, 9, 'rgba(255, 255, 255, 0.07)');
    Object.entries(PHASES).forEach(([id, p], i) => {
      const tx = 765 - 150 + 3 + i * 98;
      if (id === pomodoro.phase) box(tx, wy + 49, 96, 22, 6, `${accent}29`);
      text(p.label, tx + 48, wy + 64, id === pomodoro.phase ? accent : '#b4b2bd', font(500, 12), 'center');
    });

    // Progress ring and time.
    const cx = 765 * k;
    const cy = (wy + 182) * k;
    const r = 88 * k;
    g.lineWidth = 7 * k;
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
    const share = 1 - left / pomodoro.total();
    if (share > 0.002) {
      g.strokeStyle = accent;
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
      g.stroke();
    }
    text(formatTime(left), 765, wy + 196, '#ffffff', font(400, 58, SERIF), 'center');
    const state = pomodoro.running ? pomodoro.label : pomodoro.started ? 'Paused' : pomodoro.label;
    text(state.toUpperCase(), 765, wy + 222, accent, font(600, 11.5), 'center');

    // Focus sessions in this cycle.
    const every = pomodoro.settings.longEvery;
    for (let i = 0; i < every; i++) {
      const dx = 765 + (i - (every - 1) / 2) * 15;
      const done = i < pomodoro.done || pomodoro.phase === 'long';
      g.fillStyle = done ? accent : 'rgba(255, 255, 255, 0.14)';
      g.beginPath();
      g.arc(dx * k, (wy + 300) * k, 4 * k, 0, Math.PI * 2);
      g.fill();
    }

    // Start / Pause button.
    box(765 - 64, wy + 324, 128, 40, 20, accent);
    text(pomodoro.running ? 'Pause' : pomodoro.started ? 'Resume' : 'Start', 765, wy + 349, '#1b1520', font(600, 15), 'center');

    // Dock: Pomodoro, then the Terminal.
    const size = 52;
    const dw = 2 * size + 5 + 14;
    const dx = 765 - dw / 2;
    const dy = 640 - 8 - (size + 12);
    box(dx, dy, dw, size + 12, 21, 'rgba(40, 32, 60, 0.45)');
    const tile = (ix, top, bottom) => {
      const grad = g.createLinearGradient(0, (dy + 6) * k, 0, (dy + 6 + size) * k);
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      box(ix, dy + 6, size, size, 12, grad);
      return [(ix + size / 2) * k, (dy + 6 + size / 2) * k];
    };
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3 * k;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    // Pomodoro: a stopwatch.
    const [px, py] = tile(dx + 7, '#ffa477', '#c9452e');
    g.beginPath();
    g.arc(px, py + 2 * k, 12 * k, 0, Math.PI * 2);
    g.moveTo(px, py + 2 * k);
    g.lineTo(px, py - 5 * k);
    g.moveTo(px - 3 * k, py - 15 * k);
    g.lineTo(px + 3 * k, py - 15 * k);
    g.stroke();
    // Terminal: a prompt.
    const [qx, qy] = tile(dx + 7 + size + 5, '#4a4a50', '#1c1c1f');
    g.beginPath();
    g.moveTo(qx - 12 * k, qy - 8 * k);
    g.lineTo(qx - 4 * k, qy);
    g.lineTo(qx - 12 * k, qy + 8 * k);
    g.moveTo(qx - 1 * k, qy + 9 * k);
    g.lineTo(qx + 12 * k, qy + 9 * k);
    g.stroke();
  }

  // What is on the screen right now; it is redrawn only when this changes (the clock's
  // minute, or the timer's second, phase or state).
  const key = () => {
    const now = new Date();
    return `${now.getHours()}:${now.getMinutes()}|${formatTime(pomodoro.remaining())}|${pomodoro.phase}|${pomodoro.running}|${pomodoro.done}`;
  };
  draw();
  const texture = toTexture(c);
  let shown = key();
  return {
    texture,
    tick() {
      const now = key();
      if (now === shown) return;
      shown = now;
      draw();
      texture.needsUpdate = true;
    },
  };
}

export function laptopScreen() {
  return make(640, 420, (g, w, h) => {
    g.fillStyle = '#16151d';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#211f2b';
    g.fillRect(0, 0, 150, h);
    g.font = `13px ${MONO}`;
    ['src', '  main.js', '  room.js', '  outside.js', '  style.css', 'public', 'index.html'].forEach((t, i) => {
      g.fillStyle = i === 2 ? '#e9e4f5' : '#8d87a8';
      g.fillText(t, 16, 30 + i * 22);
    });
    const r = rng(9);
    const palette = ['#c7a6ff', '#8be3a1', '#f2c25b', '#8fa4e8', '#e9e4f5', '#8d87a8'];
    for (let i = 0; i < 17; i++) {
      let x = 172 + (i % 4 === 0 ? 0 : 20 + Math.floor(r() * 3) * 20);
      g.fillStyle = '#4a4560';
      g.fillText(String(i + 1).padStart(2, ' '), 154, 30 + i * 22);
      const parts = 1 + Math.floor(r() * 3);
      for (let k = 0; k < parts; k++) {
        const len = 30 + r() * 110;
        g.fillStyle = palette[Math.floor(r() * palette.length)];
        g.fillRect(x, 21 + i * 22, len, 9);
        x += len + 10;
      }
    }
  });
}

// The LinkedIn award plaque: a brushed-metal logo and an engraved nameplate.
export function plaqueLogo() {
  return make(256, 256, (g, w, h) => {
    const metal = g.createLinearGradient(0, 0, w, h);
    metal.addColorStop(0, '#e7e7ea');
    metal.addColorStop(0.45, '#a9aab0');
    metal.addColorStop(0.55, '#c9cace');
    metal.addColorStop(1, '#8c8d93');
    g.fillStyle = metal;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = `rgba(255,255,255,${0.03 + ((y * 7) % 5) * 0.012})`;
      g.fillRect(0, y, w, 1);
    }
    g.fillStyle = '#2a2b30';
    g.font = `700 150px ${SANS}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('in', w / 2 + 4, h / 2 + 8);
  });
}

export function nameplate(profile) {
  return make(512, 96, (g, w, h) => {
    const metal = g.createLinearGradient(0, 0, w, 0);
    metal.addColorStop(0, '#9e9fa5');
    metal.addColorStop(0.5, '#d4d5d9');
    metal.addColorStop(1, '#9e9fa5');
    g.fillStyle = metal;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3b40';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `400 40px ${SERIF}`;
    g.fillText(profile.name, w / 2, h / 2 - 8);
    g.font = `500 16px ${SANS}`;
    g.fillText(profile.role.toUpperCase(), w / 2, h / 2 + 24);
  });
}

export function globeTexture() {
  return make(1024, 512, (g, w, h) => {
    g.fillStyle = '#1d2a44';
    g.fillRect(0, 0, w, h);
    const r = rng(21);
    // Blobby continents from overlapping ellipses.
    const continents = [
      [0.18, 0.32, 0.1, 0.12], [0.24, 0.62, 0.05, 0.14], [0.5, 0.3, 0.08, 0.1], [0.53, 0.58, 0.07, 0.15],
      [0.7, 0.33, 0.16, 0.12], [0.84, 0.7, 0.06, 0.06], [0.42, 0.12, 0.05, 0.04],
    ];
    g.fillStyle = '#3a4a62';
    for (const [cx, cy, rx, ry] of continents) {
      for (let i = 0; i < 26; i++) {
        g.beginPath();
        g.ellipse(
          (cx + (r() - 0.5) * rx * 1.4) * w,
          (cy + (r() - 0.5) * ry * 1.4) * h,
          rx * w * (0.25 + r() * 0.35),
          ry * h * (0.25 + r() * 0.35),
          r() * Math.PI,
          0,
          Math.PI * 2
        );
        g.fill();
      }
    }
    g.strokeStyle = 'rgba(214, 178, 110, 0.55)';
    g.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(0, (i / 6) * h);
      g.lineTo(w, (i / 6) * h);
      g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      g.beginPath();
      g.moveTo((i / 12) * w, 0);
      g.lineTo((i / 12) * w, h);
      g.stroke();
    }
  });
}

// A simple orange print for the frame on the shelf.
export function orangePrint() {
  return make(400, 500, (g, w, h) => {
    g.fillStyle = '#efe7da';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9783f';
    g.fillRect(w * 0.22, h * 0.24, w * 0.56, h * 0.44);
    g.fillStyle = '#b8552c';
    g.fillRect(w * 0.22, h * 0.6, w * 0.56, h * 0.08);
  });
}

// The face of a small glowing desk light: pink fading into violet.
export function glowPanel() {
  return make(64, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffd1f0');
    grad.addColorStop(0.4, '#ff7fd1');
    grad.addColorStop(1, '#8a5cff');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function artPrint(index) {
  return make(300, 380, (g, w, h) => {
    if (index % 2 === 0) {
      g.fillStyle = '#f3e7d6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e58f76';
      g.beginPath();
      g.arc(150, 150, 82, Math.PI, 0);
      g.fill();
      g.fillStyle = '#6f9a96';
      g.fillRect(68, 170, 164, 22);
      g.fillStyle = '#e9b96a';
      g.fillRect(68, 206, 164, 22);
      g.fillStyle = '#3a3448';
      g.fillRect(68, 242, 164, 22);
    } else {
      g.fillStyle = '#3a3448';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#f2b279';
      g.beginPath();
      g.arc(110, 140, 62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#9a8fb8';
      g.beginPath();
      g.arc(190, 220, 74, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#f6eadd';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(40, 320);
      g.lineTo(260, 320);
      g.stroke();
    }
  });
}
