import * as THREE from 'three';

// Everything that appears printed or displayed on an object (screens, the plaque,
// prints) is drawn here on a canvas, from the data in content.js.

const SANS = '"Inter", "Segoe UI", system-ui, sans-serif';
const MONO = '"Cascadia Code", Consolas, "Courier New", monospace';
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

function fit(g, text, maxWidth) {
  if (g.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && g.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

const shortUrl = (url) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/^mailto:/, '').replace(/\/$/, '');

// A dusk landscape like the view from the window, used as the desktop wallpaper.
function wallpaper(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#2b2d5c');
  sky.addColorStop(0.45, '#7a5f9a');
  sky.addColorStop(0.8, '#e08fa0');
  sky.addColorStop(1, '#f7b892');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h * 0.62);
  const r = rng(4);
  const ridge = (base, amp, color, seed) => {
    const rr = rng(seed);
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, h * 0.62);
    let y = base;
    for (let x = 0; x <= w; x += 8) {
      y += (rr() - 0.5) * amp;
      y = Math.min(Math.max(y, base - amp * 4), base + amp * 2);
      g.lineTo(x, h * y);
    }
    g.lineTo(w, h * 0.62);
    g.fill();
  };
  ridge(0.5, 0.012, '#9a7aa6', 3);
  ridge(0.55, 0.01, '#6c5687', 8);
  ridge(0.59, 0.008, '#463a63', 13);
  const lake = g.createLinearGradient(0, h * 0.62, 0, h);
  lake.addColorStop(0, '#d69aa4');
  lake.addColorStop(0.4, '#6d5a8c');
  lake.addColorStop(1, '#1c1d3a');
  g.fillStyle = lake;
  g.fillRect(0, h * 0.62, w, h * 0.38);
  for (let i = 0; i < 70; i++) {
    const x = r() * w;
    g.fillStyle = `rgba(255, 214, 160, ${0.5 + r() * 0.5})`;
    g.fillRect(x, h * 0.615 - r() * 3, 2, 2);
    g.fillStyle = 'rgba(255, 200, 150, 0.18)';
    g.fillRect(x, h * 0.63, 2, 10 + r() * 20);
  }
}

function windowFrame(g, x, y, w, h, title) {
  g.fillStyle = 'rgba(22, 20, 32, 0.9)';
  rounded(g, x, y, w, h, 14);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1.5;
  g.stroke();
  ['#f0766a', '#f2c25b', '#69c97a'].forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x + 20 + i * 18, y + 18, 5.5, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = 'rgba(235, 228, 245, 0.6)';
  g.font = `500 15px ${SANS}`;
  g.textAlign = 'center';
  g.fillText(title, x + w / 2, y + 23);
  g.textAlign = 'left';
}

// The ultrawide monitor: wallpaper, menu bar, clock, a terminal and the project list.
export function desktopScreen(station, profile) {
  const W = 2048;
  const H = 606;
  const c = canvas(W, H);
  const g = c.getContext('2d');
  const base = canvas(W, H);
  wallpaper(base.getContext('2d'), W, H);

  function draw() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    g.drawImage(base, 0, 0);
    // Menu bar.
    g.fillStyle = 'rgba(16, 14, 26, 0.45)';
    g.fillRect(0, 0, W, 30);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = `600 15px ${SANS}`;
    g.fillText(profile.name, 22, 20);
    g.font = `15px ${SANS}`;
    ['File', 'Edit', 'View', 'Go', 'Window'].forEach((t, i) => g.fillText(t, 100 + i * 62, 20));
    g.textAlign = 'right';
    g.fillText(`${now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}   ${time}`, W - 22, 20);
    g.textAlign = 'center';
    // Clock.
    g.fillStyle = 'rgba(255, 255, 255, 0.92)';
    g.font = `400 92px ${SERIF}`;
    g.fillText(time, W / 2, 132);
    g.font = `500 17px ${SANS}`;
    g.fillStyle = 'rgba(255, 255, 255, 0.7)';
    g.fillText(now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }), W / 2, 160);
    g.textAlign = 'left';

    // Terminal.
    const tx = 560;
    const ty = 200;
    windowFrame(g, tx, ty, 430, 300, 'zsh — ~/projects');
    g.font = `15px ${MONO}`;
    const lines = [
      ['#8be3a1', '➜ ', '#e9e4f5', 'git pull'],
      ['#9b95b8', '', '#9b95b8', 'Already up to date.'],
      ['#8be3a1', '➜ ', '#e9e4f5', 'npm run dev'],
      ['#9b95b8', '', '#c7a6ff', '  VITE ready in 249 ms'],
      ['#9b95b8', '', '#9b95b8', '  ➜ Local: localhost:5173'],
      ['#8be3a1', '➜ ', '#e9e4f5', 'git commit -m "polish"'],
      ['#9b95b8', '', '#9b95b8', '[main 9fbba53] polish'],
      ['#8be3a1', '➜ ', '#e9e4f5', '▍'],
    ];
    lines.forEach(([c1, p, c2, t], i) => {
      g.fillStyle = c1;
      g.fillText(p, tx + 22, ty + 66 + i * 28);
      g.fillStyle = c2;
      g.fillText(t, tx + 22 + g.measureText(p).width, ty + 66 + i * 28);
    });

    // Projects window.
    const px = 1030;
    const py = 200;
    windowFrame(g, px, py, 460, 300, shortUrl(station.link.url));
    g.fillStyle = '#f3ecff';
    g.font = `600 20px ${SANS}`;
    g.fillText('Pinned projects', px + 24, py + 70);
    const dots = ['#8be3a1', '#f2c25b', '#f0766a', '#8fa4e8'];
    station.items.slice(0, 4).forEach((item, i) => {
      const y = py + 108 + i * 46;
      g.fillStyle = 'rgba(255,255,255,0.05)';
      rounded(g, px + 18, y - 24, 424, 38, 8);
      g.fill();
      g.fillStyle = dots[i % dots.length];
      g.beginPath();
      g.arc(px + 36, y - 5, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ece6f7';
      g.font = `600 16px ${SANS}`;
      g.fillText(fit(g, item.title, 140), px + 52, y);
      g.fillStyle = '#a49dbd';
      g.font = `15px ${SANS}`;
      g.fillText(fit(g, item.text, 220), px + 200, y);
    });

    // Dock.
    const icons = ['#e9e4f5', '#8be3a1', '#f2c25b', '#8fa4e8', '#f0766a', '#c7a6ff', '#69c9c0'];
    const dw = icons.length * 46 + 16;
    g.fillStyle = 'rgba(30, 26, 44, 0.55)';
    rounded(g, W / 2 - dw / 2, H - 58, dw, 50, 16);
    g.fill();
    icons.forEach((col, i) => {
      g.fillStyle = col;
      rounded(g, W / 2 - dw / 2 + 12 + i * 46, H - 50, 34, 34, 9);
      g.fill();
    });
  }

  draw();
  const texture = toTexture(c);
  let minute = new Date().getMinutes();
  return {
    texture,
    // Redraws the clock when the minute changes.
    tick() {
      const m = new Date().getMinutes();
      if (m === minute) return;
      minute = m;
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
