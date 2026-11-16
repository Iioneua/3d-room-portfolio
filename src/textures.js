import * as THREE from 'three';

// Everything that appears "printed" on an object (screens, the framed page,
// the photos) is drawn here on a canvas, from the data in content.js.

const FONT = '"Segoe UI", system-ui, sans-serif';

function make(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  draw(g, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
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

export function codeScreen(station, profile) {
  return make(1024, 560, (g, w, h) => {
    g.fillStyle = '#1d1a2b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#151322';
    g.fillRect(0, 0, w, 46);
    ['#e8806f', '#e9b96a', '#7fb7a4'].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(26 + i * 24, 23, 7, 0, Math.PI * 2);
      g.fill();
    });
    g.fillStyle = '#2a2640';
    rounded(g, 300, 9, 424, 28, 14);
    g.fill();
    g.fillStyle = '#a9a3c2';
    g.font = `16px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(shortUrl(station.link.url), 512, 29);
    g.textAlign = 'left';

    // Profile column.
    const grad = g.createLinearGradient(50, 80, 150, 180);
    grad.addColorStop(0, '#f2b279');
    grad.addColorStop(1, '#c9708a');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(100, 130, 50, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f6eadd';
    g.font = `600 38px ${FONT}`;
    g.fillText(fit(g, profile.name, 230), 170, 128);
    g.fillStyle = '#a9a3c2';
    g.font = `20px ${FONT}`;
    g.fillText(fit(g, profile.role, 230), 170, 160);

    g.fillStyle = '#8d87a8';
    g.font = `16px ${FONT}`;
    g.fillText('Contributions', 50, 232);
    const r = rng(7);
    const greens = ['#2a2640', '#35506a', '#4b8a8a', '#7fc4b0', '#f2b279'];
    for (let col = 0; col < 17; col++) {
      for (let row = 0; row < 7; row++) {
        g.fillStyle = greens[Math.floor(Math.pow(r(), 1.6) * greens.length)];
        rounded(g, 50 + col * 21, 248 + row * 21, 16, 16, 3);
        g.fill();
      }
    }
    g.fillStyle = '#f2b279';
    rounded(g, 50, 440, 200, 46, 23);
    g.fill();
    g.fillStyle = '#2a1f2e';
    g.font = `600 19px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(station.link.label + '  ↗', 150, 470);
    g.textAlign = 'left';

    // Pinned projects.
    g.fillStyle = '#8d87a8';
    g.font = `16px ${FONT}`;
    g.fillText('Pinned', 470, 96);
    const dots = ['#7fc4b0', '#e9b96a', '#c9708a', '#8fa4e8'];
    station.items.slice(0, 4).forEach((item, i) => {
      const x = 470 + (i % 2) * 262;
      const y = 114 + Math.floor(i / 2) * 196;
      g.strokeStyle = '#3a3552';
      g.lineWidth = 2;
      rounded(g, x, y, 244, 176, 12);
      g.stroke();
      g.fillStyle = '#f2b279';
      g.font = `600 23px ${FONT}`;
      g.fillText(fit(g, item.title, 204), x + 20, y + 44);
      g.fillStyle = '#c9c3dd';
      g.font = `16px ${FONT}`;
      g.fillText(fit(g, item.text, 204), x + 20, y + 76);
      g.fillStyle = '#2a2640';
      rounded(g, x + 20, y + 96, 204, 8, 4);
      g.fill();
      rounded(g, x + 20, y + 112, 140, 8, 4);
      g.fill();
      g.fillStyle = dots[i % dots.length];
      g.beginPath();
      g.arc(x + 27, y + 148, 7, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#a9a3c2';
      g.font = `15px ${FONT}`;
      g.fillText(fit(g, item.tag || '', 180), x + 42, y + 153);
    });
  });
}

export function designScreen() {
  return make(760, 450, (g, w, h) => {
    g.fillStyle = '#2a2738';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#211e2e';
    g.fillRect(0, 0, 54, h);
    g.fillRect(w - 150, 0, 150, h);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i === 1 ? '#f2b279' : '#4a4563';
      rounded(g, 15, 20 + i * 42, 24, 24, 6);
      g.fill();
    }
    // Artboard.
    g.fillStyle = '#f6eadd';
    rounded(g, 96, 46, 474, 358, 8);
    g.fill();
    g.fillStyle = '#e58f76';
    g.beginPath();
    g.arc(226, 176, 78, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#6f9a96';
    rounded(g, 300, 116, 220, 150, 18);
    g.fill();
    g.fillStyle = '#e9b96a';
    g.beginPath();
    g.moveTo(330, 350);
    g.lineTo(430, 210);
    g.lineTo(530, 350);
    g.closePath();
    g.fill();
    g.fillStyle = '#3a3448';
    g.font = `700 76px Georgia, serif`;
    g.fillText('Aa', 130, 360);
    g.strokeStyle = '#8fa4e8';
    g.lineWidth = 2;
    g.strokeRect(296, 112, 228, 158);
    g.fillStyle = '#8fa4e8';
    [[296, 112], [524, 112], [296, 270], [524, 270]].forEach(([x, y]) => g.fillRect(x - 5, y - 5, 10, 10));
    // Palette panel.
    ['#e58f76', '#e9b96a', '#6f9a96', '#8fa4e8', '#c9708a', '#f6eadd'].forEach((c, i) => {
      g.fillStyle = c;
      rounded(g, w - 130 + (i % 3) * 38, 34 + Math.floor(i / 3) * 38, 30, 30, 7);
      g.fill();
    });
    g.fillStyle = '#4a4563';
    for (let i = 0; i < 7; i++) {
      rounded(g, w - 130, 140 + i * 30, i % 2 ? 76 : 108, 10, 5);
      g.fill();
    }
  });
}

export function framedPage(station, profile) {
  return make(900, 660, (g, w, h) => {
    g.fillStyle = '#f8f1e4';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c9a66b';
    g.lineWidth = 4;
    g.strokeRect(28, 28, w - 56, h - 56);
    g.lineWidth = 1.5;
    g.strokeRect(40, 40, w - 80, h - 80);

    g.fillStyle = '#0a66c2';
    rounded(g, 76, 78, 76, 76, 12);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = `700 50px ${FONT}`;
    g.fillText('in', 94, 136);

    g.fillStyle = '#3a3448';
    g.font = `700 50px Georgia, serif`;
    g.fillText(fit(g, profile.name, 640), 180, 116);
    g.fillStyle = '#8a7a6e';
    g.font = `26px ${FONT}`;
    g.fillText(fit(g, profile.role, 640), 180, 152);

    g.strokeStyle = '#dcc9a8';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(76, 196);
    g.lineTo(w - 76, 196);
    g.stroke();

    station.items.slice(0, 3).forEach((item, i) => {
      const y = 258 + i * 104;
      g.fillStyle = '#c9a66b';
      g.beginPath();
      g.arc(92, y - 10, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3a3448';
      g.font = `600 32px ${FONT}`;
      g.fillText(fit(g, item.title, 690), 124, y);
      g.fillStyle = '#8a7a6e';
      g.font = `24px ${FONT}`;
      g.fillText(fit(g, item.text, 690), 124, y + 36);
    });

    g.fillStyle = '#0a66c2';
    g.font = `600 22px ${FONT}`;
    g.textAlign = 'right';
    g.fillText(shortUrl(station.link.url) + '  ↗', w - 76, h - 70);
  });
}

// Small illustrated scenes that stand in for real photos.
export function photo(index) {
  return make(256, 256, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h);
    const draw = [
      () => {
        sky.addColorStop(0, '#5b4b8a');
        sky.addColorStop(0.55, '#f08a6b');
        sky.addColorStop(0.62, '#f7c98a');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff3d6';
        g.beginPath();
        g.arc(150, 150, 30, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#3d4673';
        g.fillRect(0, 160, w, 96);
        g.fillStyle = '#f7c98a';
        for (let i = 0; i < 6; i++) g.fillRect(130 - i * 4, 170 + i * 14, 40 + i * 8, 4);
      },
      () => {
        sky.addColorStop(0, '#a9c9d8');
        sky.addColorStop(1, '#f3e2c9');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#7b8fa6';
        g.beginPath();
        g.moveTo(-10, 256); g.lineTo(90, 80); g.lineTo(190, 256);
        g.fill();
        g.fillStyle = '#55708a';
        g.beginPath();
        g.moveTo(90, 256); g.lineTo(190, 120); g.lineTo(280, 256);
        g.fill();
        g.fillStyle = '#f8f1e4';
        g.beginPath();
        g.moveTo(90, 80); g.lineTo(68, 118); g.lineTo(90, 108); g.lineTo(110, 122);
        g.fill();
      },
      () => {
        g.fillStyle = '#d9b79a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#b58868';
        g.fillRect(0, 170, w, 86);
        g.fillStyle = '#f8f1e4';
        g.beginPath();
        g.roundRect(78, 96, 90, 86, [6, 6, 30, 30]);
        g.fill();
        g.strokeStyle = '#f8f1e4';
        g.lineWidth = 12;
        g.beginPath();
        g.arc(172, 134, 22, -Math.PI / 2, Math.PI / 2);
        g.stroke();
        g.fillStyle = '#6b4a3a';
        g.beginPath();
        g.ellipse(123, 104, 36, 9, 0, 0, Math.PI * 2);
        g.fill();
      },
      () => {
        sky.addColorStop(0, '#2f2a52');
        sky.addColorStop(1, '#c9708a');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
        const r = rng(11);
        for (let i = 0; i < 9; i++) {
          const bh = 60 + r() * 120;
          g.fillStyle = i % 2 ? '#241f3d' : '#342d55';
          g.fillRect(i * 30 - 4, h - bh, 30, bh);
          g.fillStyle = '#f7c98a';
          for (let k = 0; k < 5; k++) if (r() > 0.45) g.fillRect(i * 30 + 2 + (k % 2) * 12, h - bh + 12 + k * 18, 6, 8);
        }
      },
      () => {
        g.fillStyle = '#e8ddcf';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#c98f7a';
        g.beginPath();
        g.roundRect(88, 160, 80, 70, [4, 4, 14, 14]);
        g.fill();
        g.fillStyle = '#6f9a7c';
        [[128, 110, -0.5], [128, 100, 0], [128, 110, 0.5], [128, 130, -1.1], [128, 130, 1.1]].forEach(([x, y, a]) => {
          g.save();
          g.translate(x, 165);
          g.rotate(a);
          g.beginPath();
          g.ellipse(0, -55, 16, 55, 0, 0, Math.PI * 2);
          g.fill();
          g.restore();
        });
      },
    ];
    draw[index % draw.length]();
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

export function poster() {
  return make(420, 575, (g, w, h) => {
    g.fillStyle = '#f3e7d6';
    g.fillRect(0, 0, w, h);
    const sky = g.createLinearGradient(0, 60, 0, 330);
    sky.addColorStop(0, '#9a8fb8');
    sky.addColorStop(0.6, '#e58f76');
    sky.addColorStop(1, '#f2c48a');
    g.fillStyle = sky;
    g.beginPath();
    g.roundRect(50, 50, 320, 300, [160, 160, 0, 0]);
    g.fill();
    g.fillStyle = '#fff3d6';
    g.beginPath();
    g.arc(210, 262, 52, Math.PI, 0);
    g.fill();
    g.fillStyle = '#5f8f8c';
    g.fillRect(50, 262, 320, 88);
    g.fillStyle = '#f3e7d6';
    for (let i = 0; i < 4; i++) g.fillRect(150 - i * 22, 280 + i * 18, 120 + i * 44, 4);
    g.fillStyle = '#3a3448';
    g.textAlign = 'center';
    g.font = '700 46px Georgia, serif';
    g.fillText('MAKE THINGS', 210, 430);
    g.font = '20px "Segoe UI", system-ui, sans-serif';
    g.fillStyle = '#8a7a6e';
    g.fillText('S L O W L Y  ·  C A R E F U L L Y', 210, 474);
    g.fillStyle = '#e58f76';
    g.fillRect(180, 505, 60, 5);
  });
}
