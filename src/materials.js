import * as THREE from 'three';

// Surface materials for the room. Wood, plaster, the floor and fabrics use scanned
// textures (see assets.js); the book spines are painted on a canvas.

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

function canvasTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------- UVs in metres ----------
// Gives a mesh texture coordinates measured in metres, projected along the axis each
// face points to, so a texture keeps its real size on every face. The longer side of
// each face runs along v, which is the grain direction of the wood textures.
let uvSeed = 1;
export function metricUVs(geometry) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  if (!pos || !nor || !uv) return;
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3()).toArray();
  const r = rng(uvSeed++ * 977);
  const offset = [r() * 3, r() * 3];
  const axes = [[1, 2], [0, 2], [0, 1]];
  const p = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    const axis = nx > ny && nx > nz ? 0 : ny > nz ? 1 : 2;
    const [a, b] = axes[axis];
    const [ua, va] = size[a] >= size[b] ? [b, a] : [a, b];
    p[0] = pos.getX(i);
    p[1] = pos.getY(i);
    p[2] = pos.getZ(i);
    uv.setXY(i, p[ua] + offset[0], p[va] + offset[1]);
  }
  uv.needsUpdate = true;
}

// ---------- Books ----------
// One texture holding 31 book spines plus a strip of page edges, so every book on the
// shelf can share a single material.
export const BOOK_COLUMNS = 16;
export const BOOK_ROWS = 2;
const TITLES = [
  'The Shape of Design', 'Thinking in Systems', 'Ways of Seeing', 'Grid Systems', 'Clean Code',
  'Interaction of Color', 'Design as Art', 'The Pragmatic Programmer', 'Refactoring',
  'Structure and Interpretation', 'The Timeless Way', 'Notes on the Synthesis', 'Steal Like an Artist',
  'On Writing Well', 'A Pattern Language', 'Don’t Make Me Think', 'The Elements of Style',
  'Eloquent JavaScript', 'Show Your Work', 'Atlas of the Sea', 'Field Notes', 'Typography',
  'The Design of Everyday Things', 'Deep Work', 'Hackers & Painters', 'Just Enough Research',
  'Universal Principles', 'Making Comics', 'The Old Man and the Sea', 'Dune', 'Siddhartha',
];
const AUTHORS = ['Hara', 'Meadows', 'Berger', 'Müller-Brockmann', 'Martin', 'Albers', 'Munari', 'Hunt', 'Fowler',
  'Abelson', 'Alexander', 'Kleon', 'Zinsser', 'Krug', 'Strunk', 'Haverbeke', 'Norman', 'Newport', 'Graham',
  'Hall', 'Lidwell', 'McCloud', 'Hemingway', 'Herbert', 'Hesse'];
const COVERS = [
  ['#1f2a3a', '#d9c9a3'], ['#6e2b25', '#e8d9b8'], ['#2f4a3a', '#e5d6ae'], ['#e9e1d0', '#2a2a2a'],
  ['#c9953f', '#1f1b16'], ['#151515', '#e9e2d2'], ['#8a8f93', '#f2efe8'], ['#f4f1ea', '#b5482f'],
  ['#3c5a7a', '#f1ece2'], ['#b35a3c', '#f6eedf'], ['#556b4f', '#f3ecdc'], ['#d8cbb2', '#42382c'],
  ['#2d2b38', '#e2b866'], ['#7a3b4b', '#f0e4d0'], ['#e4d7bd', '#6b2a22'], ['#41546b', '#e8c27a'],
];

function bookAtlas() {
  const CW = 64;
  const CH = 512;
  const c = makeCanvas(CW * BOOK_COLUMNS, CH * BOOK_ROWS);
  const g = c.getContext('2d');
  const r = rng(77);
  let n = 0;
  for (let row = 0; row < BOOK_ROWS; row++) {
    for (let col = 0; col < BOOK_COLUMNS; col++) {
      const x = col * CW;
      const y = row * CH;
      if (row === BOOK_ROWS - 1 && col === BOOK_COLUMNS - 1) {
        // Page edges: cream with fine lines.
        g.fillStyle = '#ece3cf';
        g.fillRect(x, y, CW, CH);
        for (let i = 0; i < CW; i += 2) {
          g.fillStyle = `rgba(120, 100, 70, ${0.08 + r() * 0.12})`;
          g.fillRect(x + i, y, 1, CH);
        }
        continue;
      }
      const [bg, fg] = COVERS[Math.floor(r() * COVERS.length)];
      g.fillStyle = bg;
      g.fillRect(x, y, CW, CH);
      // Cloth or paper grain.
      for (let i = 0; i < 90; i++) {
        g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
        g.fillRect(x, y + r() * CH, CW, 1 + r() * 2);
      }
      const style = Math.floor(r() * 4);
      g.fillStyle = fg;
      g.strokeStyle = fg;
      if (style === 0) {
        // Gilt bands top and bottom.
        g.fillRect(x + 4, y + 26, CW - 8, 3);
        g.fillRect(x + 4, y + 34, CW - 8, 1.5);
        g.fillRect(x + 4, y + CH - 34, CW - 8, 1.5);
        g.fillRect(x + 4, y + CH - 29, CW - 8, 3);
      } else if (style === 1) {
        g.fillRect(x, y + CH * 0.12, CW, CH * 0.09);
      } else if (style === 2) {
        g.fillRect(x + 6, y + 40, CW - 12, 30);
      }
      // Title, written along the spine.
      const title = TITLES[n % TITLES.length];
      const author = AUTHORS[Math.floor(r() * AUTHORS.length)];
      g.save();
      g.translate(x + CW / 2, y + CH / 2);
      g.rotate(Math.PI / 2);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const serif = r() > 0.4;
      g.font = `${serif ? '' : '600 '}${22 + Math.floor(r() * 5)}px ${serif ? 'Georgia, serif' : '"Segoe UI", sans-serif'}`;
      let t = serif ? title : title.toUpperCase();
      while (g.measureText(t).width > CH * 0.5 && t.length > 4) t = t.slice(0, -2);
      if (t.length < title.length) t = t.trim() + '…';
      g.fillText(t, -10, 0);
      g.fillStyle = fg;
      g.font = `15px ${serif ? 'Georgia, serif' : '"Segoe UI", sans-serif'}`;
      g.globalAlpha = 0.85;
      g.fillText(author.toUpperCase(), CH * 0.34, 0);
      g.restore();
      // Rounded spine: darker at the edges.
      const shade = g.createLinearGradient(x, 0, x + CW, 0);
      shade.addColorStop(0, 'rgba(0,0,0,0.32)');
      shade.addColorStop(0.18, 'rgba(0,0,0,0)');
      shade.addColorStop(0.5, 'rgba(255,255,255,0.05)');
      shade.addColorStop(0.82, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.32)');
      g.fillStyle = shade;
      g.fillRect(x, y, CW, CH);
      // Worn top and bottom.
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, y, CW, 4);
      g.fillRect(x, y + CH - 4, CW, 4);
      n++;
    }
  }
  return canvasTexture(c);
}

function softDot() {
  const c = makeCanvas(32, 32);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return canvasTexture(c);
}

// ---------- Materials ----------

export function createMaterials(assets) {
  const S = assets.surfaces;
  // Scanned textures repeat once per real tile size, because UVs are in metres.
  for (const s of Object.values(S)) {
    for (const key of ['diffuse', 'nor_gl', 'rough']) {
      if (s[key]) s[key].repeat.set(1 / s.size, 1 / s.size);
    }
  }
  const cache = new Map();
  const cached = (key, build) => {
    if (!cache.has(key)) cache.set(key, build());
    return cache.get(key);
  };
  const std = (options, metric = false) => {
    const m = new THREE.MeshStandardMaterial(options);
    m.userData.metric = metric;
    return m;
  };
  const physical = (options, metric = false) => {
    const m = new THREE.MeshPhysicalMaterial(options);
    m.userData.metric = metric;
    return m;
  };

  // Woven cloth: tinted colour, the weave as a normal map, and a soft sheen.
  const cloth = (surface, color, side, normal = 1) =>
    physical(
      {
        color,
        map: S[surface].diffuse || null,
        normalMap: S[surface].nor_gl,
        normalScale: new THREE.Vector2(normal, normal),
        roughness: 0.92,
        sheen: 0.6,
        sheenRoughness: 0.55,
        sheenColor: new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35),
        side,
      },
      true
    );

  return {
    floor: std(
      {
        map: S.floor.diffuse,
        normalMap: S.floor.nor_gl,
        roughnessMap: S.floor.rough,
        roughness: 0.9,
        color: '#a8968a',
      },
      true
    ),
    wall: std(
      {
        color: '#d8d5d3',
        normalMap: S.plaster.nor_gl,
        normalScale: new THREE.Vector2(0.55, 0.55),
        roughnessMap: S.plaster.rough,
        roughness: 1,
      },
      true
    ),
    ceiling: std(
      {
        color: '#e4e2df',
        normalMap: S.plaster.nor_gl,
        normalScale: new THREE.Vector2(0.3, 0.3),
        roughness: 0.95,
      },
      true
    ),
    books: std({ map: bookAtlas(), roughness: 0.78 }),
    glass: physical({
      color: '#ffffff',
      transparent: true,
      opacity: 0.06,
      roughness: 0.02,
      metalness: 0,
      depthWrite: false,
    }),
    black: std({ color: '#141416', roughness: 0.4 }),
    dot: softDot(),
    photos: assets.photos,

    // Oak and walnut veneers. `tint` multiplies the scanned colour.
    oak: (tint = '#ffffff', rough = 1) =>
      cached(`oak${tint}${rough}`, () =>
        std(
          {
            color: tint,
            map: S.oak.diffuse,
            normalMap: S.oak.nor_gl,
            normalScale: new THREE.Vector2(0.6, 0.6),
            roughnessMap: S.oak.rough,
            roughness: rough,
          },
          true
        )
      ),
    walnut: (tint = '#ffffff', rough = 1) =>
      cached(`walnut${tint}${rough}`, () =>
        std(
          {
            color: tint,
            map: S.walnut.diffuse,
            normalMap: S.walnut.nor_gl,
            normalScale: new THREE.Vector2(0.6, 0.6),
            roughnessMap: S.walnut.rough,
            roughness: rough,
          },
          true
        )
      ),
    // Painted or lacquered surfaces.
    paint: (color, rough = 0.5) => cached(`paint${color}${rough}`, () => std({ color, roughness: rough })),
    ceramic: (color) =>
      cached(`ceramic${color}`, () => physical({ color, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 })),
    metal: (color, rough = 0.32) =>
      cached(`metal${color}${rough}`, () => std({ color, metalness: 1, roughness: rough })),
    // Upholstery and rugs: herringbone wool. Curtains: linen.
    wool: (color, side = THREE.FrontSide) => cached(`wool${color}${side}`, () => cloth('wool', color, side, 0.8)),
    linen: (color, side = THREE.FrontSide) => cached(`linen${color}${side}`, () => cloth('linen', color, side, 0.7)),
    // Something that gives off light: bulbs, LEDs.
    glow: (color, strength = 2) =>
      std({ color: '#000000', emissive: color, emissiveIntensity: strength, roughness: 0.8, side: THREE.DoubleSide }),
  };
}
