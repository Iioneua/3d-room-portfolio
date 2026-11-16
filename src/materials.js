import * as THREE from 'three';

// Surface materials for the room. All textures are painted on canvases at load
// time, so there are no image files to download.

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { srgb = false, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// Soft random blotches: a tiny random image stretched over the canvas.
function noise(g, size, cells, alpha, r) {
  const c = makeCanvas(cells, cells);
  const cg = c.getContext('2d');
  const img = cg.createImageData(cells, cells);
  for (let i = 0; i < cells * cells; i++) {
    const v = Math.floor(r() * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  cg.putImageData(img, 0, 0);
  g.globalAlpha = alpha;
  g.drawImage(c, 0, 0, size, size);
  g.globalAlpha = 1;
}

function grainStroke(g, x, y, length, wobble, r) {
  g.beginPath();
  g.moveTo(x, y);
  const steps = Math.max(3, Math.floor(length / 60));
  for (let i = 1; i <= steps; i++) {
    g.lineTo(x + (length * i) / steps, y + (r() - 0.5) * wobble);
  }
  g.stroke();
}

function floorTextures() {
  const S = 2048;
  const B = 1024;
  const color = makeCanvas(S, S);
  const bump = makeCanvas(B, B);
  const g = color.getContext('2d');
  const b = bump.getContext('2d');
  const r = rng(21);
  const k = B / S;
  b.fillStyle = '#c8c8c8';
  b.fillRect(0, 0, B, B);

  const rows = 24;
  const rh = S / rows;
  for (let row = 0; row < rows; row++) {
    const y = row * rh;
    let x = -r() * 700;
    while (x < S) {
      const len = 520 + r() * 620;
      const light = 0.9 + r() * 0.18;
      const warm = (r() - 0.5) * 10;
      const fill = `rgb(${Math.round(170 * light + warm)}, ${Math.round(136 * light)}, ${Math.round(103 * light - warm)})`;
      // Draw twice when a plank crosses the right edge so the texture tiles.
      for (const ox of [0, -S]) {
        const px = x + ox;
        if (px > S || px + len < 0) continue;
        g.fillStyle = fill;
        g.fillRect(px, y, len, rh);
        g.save();
        g.beginPath();
        g.rect(px, y, len, rh);
        g.clip();
        const strokes = rng(Math.floor(x * 7 + row * 131));
        for (let i = 0; i < 26; i++) {
          g.strokeStyle = `rgba(70, 42, 20, ${0.04 + strokes() * 0.1})`;
          g.lineWidth = 0.6 + strokes() * 1.6;
          grainStroke(g, px - 20, y + strokes() * rh, len + 40, 5, strokes);
        }
        g.restore();
        g.fillStyle = 'rgba(38, 22, 10, 0.6)';
        g.fillRect(px, y, 2, rh);
        b.fillStyle = '#4a4a4a';
        b.fillRect(px * k, y * k, 1.5, rh * k);
      }
      x += len;
    }
    g.fillStyle = 'rgba(38, 22, 10, 0.55)';
    g.fillRect(0, y, S, 2);
    b.fillStyle = '#4a4a4a';
    b.fillRect(0, y * k, B, 1.5);
  }
  noise(b, B, 256, 0.12, r);
  return {
    map: toTexture(color, { srgb: true, repeat: [2, 2] }),
    bump: toTexture(bump, { repeat: [2, 2] }),
  };
}

function grainTexture() {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const r = rng(8);
  g.fillStyle = 'rgb(238, 230, 222)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 190; i++) {
    g.strokeStyle = `rgba(95, 62, 36, ${0.05 + r() * 0.16})`;
    g.lineWidth = 0.5 + r() * 2.2;
    grainStroke(g, -10, r() * S, S + 20, 9, r);
  }
  return toTexture(c, { srgb: true });
}

function plasterBump() {
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const r = rng(3);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  noise(g, S, 6, 0.25, r);
  noise(g, S, 40, 0.25, r);
  noise(g, S, 160, 0.3, r);
  noise(g, S, 512, 0.2, r);
  return toTexture(c, { repeat: [5, 2.5] });
}

function weaveBump() {
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const r = rng(5);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < S; i += 4) {
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(0, i, S, 2);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(i, 0, 1.5, S);
  }
  noise(g, S, 64, 0.25, r);
  return toTexture(c);
}

function rugTextures() {
  const S = 1024;
  const color = makeCanvas(S, S);
  const bump = makeCanvas(S, S);
  const g = color.getContext('2d');
  const b = bump.getContext('2d');
  const r = rng(13);
  g.fillStyle = '#d9cbb4';
  g.fillRect(0, 0, S, S);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, S, S);
  // Braided rings, like a round jute rug.
  for (let radius = S / 2; radius > 0; radius -= 11) {
    const t = radius / (S / 2);
    const band = (t > 0.62 && t < 0.8) || (t > 0.2 && t < 0.26);
    const shade = 0.9 + r() * 0.16;
    const base = band ? [128, 150, 140] : [214, 198, 172];
    g.strokeStyle = `rgb(${base.map((v) => Math.round(v * shade)).join(',')})`;
    g.lineWidth = 9;
    g.beginPath();
    g.arc(S / 2, S / 2, radius, 0, Math.PI * 2);
    g.stroke();
    b.strokeStyle = '#d0d0d0';
    b.lineWidth = 6;
    b.beginPath();
    b.arc(S / 2, S / 2, radius, 0, Math.PI * 2);
    b.stroke();
    b.strokeStyle = '#303030';
    b.lineWidth = 2;
    b.beginPath();
    b.arc(S / 2, S / 2, radius - 5.5, 0, Math.PI * 2);
    b.stroke();
  }
  noise(g, S, 512, 0.08, r);
  noise(b, S, 512, 0.2, r);
  const map = toTexture(color, { srgb: true });
  const bumpMap = toTexture(bump);
  map.wrapS = map.wrapT = bumpMap.wrapS = bumpMap.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bump: bumpMap };
}

function keyboardTexture() {
  const W = 840;
  const H = 270;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#cfc9c0';
  g.fillRect(0, 0, W, H);
  const rows = [15, 15, 14, 13, 9];
  rows.forEach((count, row) => {
    const y = 10 + row * 51;
    const w = (W - 20) / count;
    for (let i = 0; i < count; i++) {
      g.fillStyle = 'rgba(60,50,45,0.35)';
      g.beginPath();
      g.roundRect(10 + i * w + 3, y + 4, w - 6, 45, 6);
      g.fill();
      g.fillStyle = row === 4 && i === 4 ? '#e9e4dc' : '#f1ece5';
      g.beginPath();
      g.roundRect(10 + i * w + 3, y + 1, w - 6, 43, 6);
      g.fill();
    }
  });
  return toTexture(c, { srgb: true });
}

function softDot() {
  const c = makeCanvas(32, 32);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return toTexture(c, { srgb: true });
}

export function createMaterials() {
  const floor = floorTextures();
  const grain = grainTexture();
  const plaster = plasterBump();
  const weave = weaveBump();
  const rug = rugTextures();
  const cache = new Map();
  const cached = (key, build) => {
    if (!cache.has(key)) cache.set(key, build());
    return cache.get(key);
  };
  const std = (options) => new THREE.MeshStandardMaterial(options);

  return {
    floor: std({ map: floor.map, bumpMap: floor.bump, bumpScale: 0.6, roughness: 0.46 }),
    wall: std({ color: '#ece2d5', roughness: 0.93, bumpMap: plaster, bumpScale: 0.35 }),
    ceiling: std({ color: '#f3ede4', roughness: 0.95 }),
    rug: std({ map: rug.map, bumpMap: rug.bump, bumpScale: 1.4, roughness: 1 }),
    glass: std({ color: '#ffffff', transparent: true, opacity: 0.07, roughness: 0.03, depthWrite: false }),
    mirror: std({ color: '#f2f4f4', metalness: 1, roughness: 0.04 }),
    black: std({ color: '#17161a', roughness: 0.38 }),
    screenOff: std({ color: '#0c0c10', roughness: 0.2 }),
    dot: softDot(),
    keyboardTop: std({ map: keyboardTexture(), roughness: 0.6 }),

    // Varnished or oiled wood, tinted by colour.
    wood: (color, rough = 0.5) =>
      cached(`wood${color}${rough}`, () => std({ color, map: grain, roughness: rough })),
    // Painted or lacquered surfaces.
    paint: (color, rough = 0.5) => cached(`paint${color}${rough}`, () => std({ color, roughness: rough })),
    ceramic: (color) => cached(`ceramic${color}`, () => std({ color, roughness: 0.22 })),
    metal: (color, rough = 0.32) =>
      cached(`metal${color}${rough}`, () => std({ color, metalness: 1, roughness: rough })),
    // Woven cloth. `scale` is how many times the weave repeats across a face.
    fabric: (color, scale = 24, side = THREE.FrontSide) =>
      cached(`fabric${color}${scale}${side}`, () => {
        const bumpMap = weave.clone();
        bumpMap.repeat.set(scale, scale);
        return std({ color, roughness: 1, bumpMap, bumpScale: 0.8, side });
      }),
    leaf: (color) =>
      cached(`leaf${color}`, () => std({ color, roughness: 0.45, side: THREE.DoubleSide })),
    // Something that gives off light: bulbs, lampshades, LEDs.
    glow: (color, strength = 2) =>
      std({ color: '#000000', emissive: color, emissiveIntensity: strength, roughness: 0.8, side: THREE.DoubleSide }),
  };
}
