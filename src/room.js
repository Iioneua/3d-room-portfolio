import * as THREE from 'three';
import * as tex from './textures.js';
import { createWindowMaterial } from './windowView.js';

// The whole room is built here from simple shapes. Units are roughly metres.
// Floor is 8 x 8, centred on the origin. Walls stand on the -x and -z sides.

const C = {
  wallBack: '#ecd9c6',
  wallLeft: '#e6cfbb',
  trim: '#f6ece0',
  floorA: '#c2936d',
  floorB: '#b98a66',
  floorC: '#c89b76',
  base: '#6a4f52',
  wood: '#a9744f',
  woodLight: '#d0a47c',
  woodDark: '#6f4a3a',
  ink: '#3a3448',
  inkSoft: '#4a4563',
  cream: '#f3e7d6',
  sage: '#8aa39b',
  teal: '#5f8f8c',
  mustard: '#d9a55b',
  blush: '#d9917e',
  rose: '#d7a99a',
  lavender: '#9a8fb8',
  leaf: '#6f9a7c',
  leafDark: '#557f68',
  terracotta: '#c98263',
};

const materials = new Map();
function mat(color) {
  if (!materials.has(color)) {
    materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  }
  return materials.get(color);
}

function add(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, typeof material === 'string' ? mat(material) : material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const box = (p, w, h, d, c, x, y, z) => add(p, new THREE.BoxGeometry(w, h, d), c, x, y, z);
const cyl = (p, rt, rb, h, c, x, y, z, seg = 12) => add(p, new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z);

function group(parent, x, y, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}

// A flat, unlit surface that shows a canvas texture (screens, prints, photos).
function printed(parent, w, h, texture, x, y, z, lit = false) {
  const material = lit
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 })
    : new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = lit;
  parent.add(mesh);
  return mesh;
}

function glow(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.6 });
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

function bush(parent, x, y, z, s = 1, pot = C.terracotta) {
  const g = group(parent, x, y, z);
  cyl(g, 0.09 * s, 0.07 * s, 0.14 * s, pot, 0, 0.07 * s, 0, 10);
  const blob = new THREE.IcosahedronGeometry(0.11 * s, 0);
  add(g, blob, C.leaf, 0, 0.24 * s, 0);
  add(g, blob, C.leafDark, 0.07 * s, 0.19 * s, 0.04 * s).scale.setScalar(0.8);
  add(g, blob, C.leaf, -0.07 * s, 0.2 * s, -0.03 * s).scale.setScalar(0.75);
  return g;
}

function leafyPlant(parent, x, z) {
  const g = group(parent, x, 0, z);
  cyl(g, 0.26, 0.2, 0.42, C.cream, 0, 0.21, 0, 12);
  cyl(g, 0.23, 0.23, 0.03, C.woodDark, 0, 0.42, 0, 12);
  const leaf = new THREE.IcosahedronGeometry(0.2, 0);
  const count = 9;
  for (let i = 0; i < count; i++) {
    const pivot = group(g, 0, 0.42, 0, (i / count) * Math.PI * 2 + (i % 2) * 0.3);
    const tilt = 0.35 + (i % 3) * 0.22;
    const length = 1.5 + (i % 3) * 0.35;
    const m = add(pivot, leaf, i % 2 ? C.leaf : C.leafDark, 0, 0, 0);
    m.scale.set(0.5, length * 1.5, 0.14);
    m.rotation.z = -tilt;
    m.position.set(Math.sin(tilt) * 0.3 * length, Math.cos(tilt) * 0.3 * length, 0);
  }
  return g;
}

function buildShell(scene) {
  box(scene, 8.7, 0.45, 8.7, C.base, -0.15, -0.42, -0.15);
  const planks = [C.floorA, C.floorB, C.floorC, C.floorB, C.floorA, C.floorC, C.floorB, C.floorA, C.floorC, C.floorB];
  planks.forEach((c, i) => box(scene, 8, 0.2, 0.8, c, 0, -0.1, -3.6 + i * 0.8).castShadow = false);

  // Back wall (-z).
  box(scene, 8.3, 3.8, 0.3, C.wallBack, -0.15, 1.9, -4.15);
  box(scene, 8, 0.16, 0.05, C.trim, 0, 0.08, -3.975);

  // Left wall (-x), built around the window opening.
  box(scene, 0.3, 1.15, 2.4, C.wallLeft, -4.15, 0.575, -1.7);
  box(scene, 0.3, 0.85, 2.4, C.wallLeft, -4.15, 3.375, -1.7);
  box(scene, 0.3, 3.8, 4.5, C.wallLeft, -4.15, 1.9, 1.75);
  box(scene, 0.3, 3.8, 1.1, C.wallLeft, -4.15, 1.9, -3.45);
  box(scene, 0.05, 0.16, 8, C.trim, -3.975, 0.08, 0);

  // Invisible ceiling: lets the sun in through the window only.
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(9, 0.1, 9),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  );
  ceiling.position.set(-0.15, 3.9, -0.15);
  ceiling.castShadow = true;
  scene.add(ceiling);
}

function buildWindow(scene) {
  const material = createWindowMaterial(2.4 / 1.8);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), material);
  view.rotation.y = Math.PI / 2;
  view.position.set(-4.22, 2.05, -1.7);
  scene.add(view);

  box(scene, 0.12, 0.09, 2.58, C.trim, -3.97, 2.99, -1.7);
  box(scene, 0.12, 0.09, 2.58, C.trim, -3.97, 1.11, -1.7);
  box(scene, 0.12, 1.8, 0.09, C.trim, -3.97, 2.05, -2.94);
  box(scene, 0.12, 1.8, 0.09, C.trim, -3.97, 2.05, -0.46);
  box(scene, 0.07, 1.8, 0.06, C.trim, -4.1, 2.05, -1.7);
  box(scene, 0.07, 0.06, 2.4, C.trim, -4.1, 2.05, -1.7);
  box(scene, 0.32, 0.06, 2.7, C.trim, -3.88, 1.07, -1.7);

  const rod = cyl(scene, 0.022, 0.022, 3.3, C.woodDark, -3.86, 3.2, -1.7, 8);
  rod.rotation.x = Math.PI / 2;
  box(scene, 0.07, 2.15, 0.4, C.rose, -3.86, 2.12, -3.12);
  box(scene, 0.07, 2.15, 0.4, C.rose, -3.86, 2.12, -0.28);

  bush(scene, -3.86, 1.1, -2.5, 0.8, C.cream);
  return material;
}

function buildSofa(scene) {
  const g = group(scene, -3.4, 0, -1.7);
  box(g, 1.05, 0.3, 2.3, C.sage, 0, 0.3, 0);
  box(g, 0.25, 0.62, 2.3, C.sage, -0.4, 0.74, 0);
  box(g, 1.05, 0.5, 0.2, C.sage, 0, 0.52, -1.05);
  box(g, 1.05, 0.5, 0.2, C.sage, 0, 0.52, 1.05);
  box(g, 0.74, 0.14, 0.92, '#9bb3ab', 0.12, 0.52, -0.48);
  box(g, 0.74, 0.14, 0.92, '#9bb3ab', 0.12, 0.52, 0.48);
  const p1 = box(g, 0.14, 0.36, 0.36, C.mustard, -0.14, 0.78, -0.66);
  p1.rotation.z = -0.3;
  const p2 = box(g, 0.14, 0.34, 0.34, C.blush, -0.14, 0.77, 0.62);
  p2.rotation.set(0.25, 0, -0.3);
  [[-0.42, -1.02], [0.42, -1.02], [-0.42, 1.02], [0.42, 1.02]].forEach(([x, z]) =>
    cyl(g, 0.035, 0.03, 0.15, C.woodDark, x, 0.075, z, 8)
  );
}

function buildLounge(scene) {
  // Rug.
  const rug = (r, c, y) => {
    const m = cyl(scene, r, r, 0.02, c, -0.5, y, 0.1, 40);
    m.castShadow = false;
    return m;
  };
  rug(2.0, C.cream, 0.01);
  rug(1.62, '#8fa9a4', 0.016);
  rug(1.2, C.cream, 0.022);

  // Coffee table.
  const t = group(scene, -1.3, 0, -0.5);
  cyl(t, 0.52, 0.52, 0.05, C.woodLight, 0, 0.42, 0, 24);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = cyl(t, 0.025, 0.02, 0.42, C.woodDark, Math.cos(a) * 0.36, 0.2, Math.sin(a) * 0.36, 8);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  cyl(t, 0.055, 0.045, 0.1, C.cream, 0.15, 0.495, 0.1, 10);
  cyl(t, 0.045, 0.045, 0.01, '#6b4a3a', 0.15, 0.541, 0.1, 10);
  box(t, 0.3, 0.035, 0.22, C.lavender, -0.15, 0.463, -0.08).rotation.y = 0.4;
  box(t, 0.26, 0.03, 0.2, C.mustard, -0.15, 0.495, -0.08).rotation.y = 0.2;

  // Floor lamp.
  const l = group(scene, -3.45, 0, 0.1);
  cyl(l, 0.18, 0.2, 0.04, C.ink, 0, 0.02, 0, 16);
  cyl(l, 0.02, 0.02, 1.6, C.ink, 0, 0.82, 0, 8);
  const shade = cyl(l, 0.15, 0.27, 0.34, glow('#ffd9a3', 0.9), 0, 1.72, 0, 16);
  shade.castShadow = false;
  const lamp = new THREE.PointLight('#ffc58a', 5, 7, 2);
  lamp.position.set(-3.3, 1.6, 0.1);
  scene.add(lamp);

  leafyPlant(scene, -3.35, 3.3);
}

function buildSideboard(scene, station, profile) {
  const g = group(scene, -3.68, 0, 1.4);
  box(g, 0.55, 0.62, 1.6, C.woodLight, 0, 0.45, 0);
  box(g, 0.02, 0.5, 0.74, C.wood, 0.28, 0.45, -0.39);
  box(g, 0.02, 0.5, 0.74, C.wood, 0.28, 0.45, 0.39);
  cyl(g, 0.02, 0.02, 0.03, C.ink, 0.3, 0.5, -0.08, 8).rotation.z = Math.PI / 2;
  cyl(g, 0.02, 0.02, 0.03, C.ink, 0.3, 0.5, 0.08, 8).rotation.z = Math.PI / 2;
  [[-0.2, -0.7], [0.2, -0.7], [-0.2, 0.7], [0.2, 0.7]].forEach(([x, z]) =>
    cyl(g, 0.03, 0.025, 0.14, C.woodDark, x, 0.07, z, 8)
  );
  // On top: a record player, a stack of books and a plant.
  box(g, 0.36, 0.08, 0.42, C.ink, 0, 0.8, 0.42);
  cyl(g, 0.14, 0.14, 0.012, '#2a2535', 0, 0.846, 0.42, 20);
  cyl(g, 0.045, 0.045, 0.014, C.blush, 0, 0.848, 0.42, 12);
  box(g, 0.3, 0.05, 0.22, C.teal, 0, 0.785, -0.08);
  box(g, 0.27, 0.045, 0.2, C.blush, 0.01, 0.832, -0.08).rotation.y = 0.2;
  bush(g, 0, 0.76, -0.55, 1.15, C.cream);

  // The framed page on the wall above it.
  const f = group(scene, -3.97, 2.1, 1.4, Math.PI / 2);
  box(f, 1.04, 0.8, 0.06, C.woodDark, 0, 0, 0);
  printed(f, 0.92, 0.675, tex.framedPage(station, profile), 0, 0, 0.032, true);

  // Two small art prints beside it.
  const a1 = group(scene, -3.975, 2.38, 2.42, Math.PI / 2);
  box(a1, 0.42, 0.52, 0.05, C.cream, 0, 0, 0);
  printed(a1, 0.34, 0.43, tex.artPrint(0), 0, 0, 0.027, true);
  const a2 = group(scene, -3.975, 1.78, 2.48, Math.PI / 2);
  box(a2, 0.42, 0.52, 0.05, C.ink, 0, 0, 0);
  printed(a2, 0.34, 0.43, tex.artPrint(1), 0, 0, 0.027, true);
}

function buildBookshelf(scene) {
  const g = group(scene, -2.9, 0, -3.78);
  const W = 1.5;
  const D = 0.42;
  box(g, 0.06, 2.66, D, C.wood, -W / 2 + 0.03, 1.33, 0);
  box(g, 0.06, 2.66, D, C.wood, W / 2 - 0.03, 1.33, 0);
  box(g, W - 0.1, 2.6, 0.03, C.woodDark, 0, 1.33, -D / 2 + 0.02);
  const levels = [0.08, 0.72, 1.36, 2.0, 2.635];
  levels.forEach((y) => box(g, W - 0.1, 0.05, D, C.wood, 0, y, 0));

  const r = rng(42);
  const spines = [C.teal, C.mustard, C.blush, C.lavender, C.cream, C.sage, C.ink, C.terracotta, '#8fa4e8'];
  const fill = (level, from, to) => {
    const y0 = levels[level] + 0.025;
    let x = from;
    while (x < to) {
      const w = 0.05 + r() * 0.06;
      const h = 0.3 + r() * 0.2;
      if (x + w > to) break;
      const b = box(g, w, h, 0.26 + r() * 0.06, spines[Math.floor(r() * spines.length)], x + w / 2, y0 + h / 2, 0.02);
      if (r() > 0.86) {
        b.rotation.z = -0.16;
        b.position.x += 0.03;
        x += 0.05;
      }
      x += w + 0.004;
    }
  };
  const L = -W / 2 + 0.08;
  const R = W / 2 - 0.08;

  fill(0, L, R);
  fill(1, L, 0.15);
  bush(g, 0.42, levels[1] + 0.025, 0.02, 1.2, C.cream);
  fill(2, -0.2, R);
  // A small globe.
  cyl(g, 0.08, 0.1, 0.03, C.woodDark, -0.45, levels[2] + 0.04, 0.02, 10);
  cyl(g, 0.012, 0.012, 0.1, C.woodDark, -0.45, levels[2] + 0.1, 0.02, 6);
  add(g, new THREE.IcosahedronGeometry(0.14, 1), C.teal, -0.45, levels[2] + 0.28, 0.02);
  fill(3, L, -0.1);
  // A stack of books lying flat and a small framed card.
  box(g, 0.32, 0.05, 0.24, C.lavender, 0.3, levels[3] + 0.05, 0.02);
  box(g, 0.29, 0.05, 0.22, C.mustard, 0.31, levels[3] + 0.1, 0.02).rotation.y = 0.15;
  box(g, 0.27, 0.045, 0.2, C.teal, 0.3, levels[3] + 0.148, 0.02).rotation.y = -0.1;
  const card = box(g, 0.2, 0.26, 0.02, C.cream, 0.3, levels[3] + 0.31, 0.02);
  card.rotation.x = -0.15;
  // On top.
  bush(g, -0.4, levels[4] + 0.025, 0, 1.5);
  box(g, 0.34, 0.2, 0.26, C.sage, 0.3, levels[4] + 0.125, 0);
  box(g, 0.36, 0.03, 0.28, C.woodDark, 0.3, levels[4] + 0.24, 0);
}

function buildDesk(scene, station, profile) {
  const g = group(scene, 1.5, 0, -3.55);
  box(g, 3.4, 0.07, 0.9, C.woodLight, 0, 0.93, 0);

  // Drawer unit on the right, legs on the left.
  box(g, 0.75, 0.86, 0.8, C.cream, 1.25, 0.46, 0);
  [0.2, 0.47, 0.74].forEach((y) => {
    box(g, 0.65, 0.22, 0.02, C.trim, 1.25, y, 0.41);
    box(g, 0.16, 0.025, 0.03, C.woodDark, 1.25, y, 0.43);
  });
  box(g, 0.07, 0.9, 0.07, C.woodDark, -1.55, 0.45, 0.35);
  box(g, 0.07, 0.9, 0.07, C.woodDark, -1.55, 0.45, -0.35);
  box(g, 0.05, 0.05, 0.7, C.woodDark, -1.55, 0.25, 0);

  // PC tower under the desk.
  box(g, 0.26, 0.52, 0.56, C.ink, -1.1, 0.27, -0.05);
  add(g, new THREE.BoxGeometry(0.02, 0.4, 0.012), glow('#7fc4b0', 2), -1.02, 0.28, 0.232).castShadow = false;

  // Main monitor: shows the projects.
  box(g, 0.36, 0.02, 0.22, C.ink, -0.3, 0.975, -0.2);
  box(g, 0.05, 0.32, 0.05, C.ink, -0.3, 1.12, -0.22);
  box(g, 1.25, 0.72, 0.05, C.ink, -0.3, 1.56, -0.2);
  printed(g, 1.17, 0.64, tex.codeScreen(station, profile), -0.3, 1.56, -0.174);

  // Second monitor, angled in: a design tool.
  const m2 = group(g, 0.95, 0, -0.12, -0.4);
  box(m2, 0.3, 0.02, 0.2, C.ink, 0, 0.975, 0);
  box(m2, 0.05, 0.28, 0.05, C.ink, 0, 1.1, -0.02);
  box(m2, 1.0, 0.61, 0.05, C.ink, 0, 1.47, 0);
  printed(m2, 0.94, 0.556, tex.designScreen(), 0, 1.47, 0.026);

  // Desk mat, keyboard, mouse.
  box(g, 1.15, 0.008, 0.44, C.teal, -0.2, 0.969, 0.18).castShadow = false;
  box(g, 0.5, 0.024, 0.17, C.cream, -0.32, 0.985, 0.18);
  box(g, 0.46, 0.008, 0.13, '#d9cbbb', -0.32, 1.0, 0.18).castShadow = false;
  box(g, 0.065, 0.028, 0.11, C.cream, 0.1, 0.987, 0.2);

  // Drawing tablet and pen.
  const tablet = group(g, 0.78, 0.965, 0.2, -0.15);
  box(tablet, 0.44, 0.016, 0.3, C.ink, 0, 0.008, 0);
  box(tablet, 0.36, 0.004, 0.23, C.inkSoft, 0, 0.018, 0).castShadow = false;
  const pen = cyl(tablet, 0.008, 0.008, 0.2, C.cream, 0.08, 0.03, 0.02, 6);
  pen.rotation.set(0, 0.5, Math.PI / 2);

  // Desk lamp.
  const lamp = group(g, -1.45, 0.965, -0.22);
  cyl(lamp, 0.1, 0.11, 0.03, C.mustard, 0, 0.015, 0, 14);
  const arm = cyl(lamp, 0.014, 0.014, 0.5, C.mustard, 0.07, 0.26, 0, 6);
  arm.rotation.z = -0.28;
  const head = cyl(lamp, 0.05, 0.12, 0.15, C.mustard, 0.2, 0.5, 0, 12);
  head.rotation.z = 0.95;
  add(lamp, new THREE.SphereGeometry(0.045, 10, 8), glow('#ffe2b0', 2.5), 0.25, 0.46, 0).castShadow = false;
  const light = new THREE.PointLight('#ffc98f', 2.2, 4, 2);
  light.position.set(0.25, 1.4, -3.6);
  scene.add(light);

  // Pencil cup and a plant.
  cyl(g, 0.05, 0.045, 0.12, C.blush, 1.5, 1.025, 0.25, 10);
  [[-0.015, C.mustard], [0.015, C.teal], [0, C.cream]].forEach(([dx, c], i) => {
    const p = cyl(g, 0.007, 0.007, 0.2, c, 1.5 + dx, 1.1, 0.25 + (i - 1) * 0.015, 5);
    p.rotation.z = dx * 12;
  });
  bush(g, 1.52, 0.965, -0.24, 1.2);

  // Soft glow from the screens.
  const screenGlow = new THREE.PointLight('#a9a3e0', 1.2, 3, 2);
  screenGlow.position.set(1.4, 1.5, -3.0);
  scene.add(screenGlow);

  // Chair.
  const c = group(scene, 0.3, 0, -2.25, 0.55);
  cyl(c, 0.3, 0.3, 0.04, C.ink, 0, 0.04, 0, 5);
  cyl(c, 0.035, 0.035, 0.44, C.ink, 0, 0.28, 0, 8);
  box(c, 0.56, 0.09, 0.54, C.teal, 0, 0.54, 0);
  box(c, 0.06, 0.3, 0.05, C.ink, 0, 0.7, 0.27);
  const back = box(c, 0.54, 0.52, 0.08, C.teal, 0, 1.02, 0.29);
  back.rotation.x = 0.08;
}

function buildPhotoString(scene) {
  const A = new THREE.Vector3(0.0, 3.32, -3.97);
  const B = new THREE.Vector3(3.3, 3.32, -3.97);
  const mid = new THREE.Vector3(1.65, 2.96, -3.97);
  const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
  const string = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.008, 5), mat(C.woodDark));
  scene.add(string);
  cyl(scene, 0.02, 0.02, 0.05, C.woodDark, A.x, A.y, A.z + 0.01, 6).rotation.x = Math.PI / 2;
  cyl(scene, 0.02, 0.02, 0.05, C.woodDark, B.x, B.y, B.z + 0.01, 6).rotation.x = Math.PI / 2;

  const tilts = [0.07, -0.05, 0.03, -0.08, 0.05];
  tilts.forEach((tilt, i) => {
    const p = curve.getPoint(0.1 + i * 0.2);
    const g = group(scene, p.x, p.y, p.z + 0.012);
    g.rotation.z = tilt;
    box(g, 0.36, 0.44, 0.012, C.trim, 0, -0.2, 0);
    printed(g, 0.3, 0.3, tex.photo(i), 0, -0.165, 0.0075, true);
    box(g, 0.035, 0.08, 0.02, C.mustard, 0, 0.0, 0.01);
  });

  const bulbs = [];
  for (let i = 0; i <= 5; i++) {
    const p = curve.getPoint(i * 0.2);
    const material = glow('#ffd9a0', 2);
    const bulb = add(scene, new THREE.SphereGeometry(0.035, 8, 6), material, p.x, p.y - 0.05, p.z + 0.03);
    bulb.castShadow = false;
    bulbs.push(material);
  }
  return bulbs;
}

function buildDust(scene) {
  const count = 70;
  const positions = new Float32Array(count * 3);
  const r = rng(5);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = -3.4 + r() * 4;
    positions[i * 3 + 1] = 0.2 + r() * 2.7;
    positions[i * 3 + 2] = -2.9 + r() * 3.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: '#ffe1b8',
      size: 0.018,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(points);
  return points;
}

function buildLights(scene) {
  scene.add(new THREE.HemisphereLight('#ffe3cc', '#6a5578', 1.15));

  const sun = new THREE.DirectionalLight('#ffab6b', 4.2);
  sun.position.set(-12, 7.2, -5.3);
  sun.target.position.set(-0.7, 0, -1.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -7;
  sun.shadow.camera.right = 7;
  sun.shadow.camera.top = 7;
  sun.shadow.camera.bottom = -7;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight('#f3dcf0', 1.25);
  fill.position.set(6, 9, 8);
  scene.add(fill);
}

function buildHitboxes(scene) {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const make = (id, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.userData.station = id;
    scene.add(m);
    return m;
  };
  return [
    make('desk', 3.4, 1.15, 0.95, 1.5, 1.45, -3.5),
    make('photos', 3.5, 0.75, 0.25, 1.65, 2.95, -3.9),
    make('shelf', 1.6, 2.9, 0.6, -2.9, 1.45, -3.72),
    make('frame', 0.25, 0.95, 1.2, -3.92, 2.1, 1.4),
  ];
}

// Where the camera goes for each station, and where its label floats.
export const views = {
  desk: {
    pos: new THREE.Vector3(2.15, 2.1, 0.7),
    target: new THREE.Vector3(2.05, 1.38, -3.7),
    anchor: new THREE.Vector3(1.2, 2.12, -3.7),
  },
  photos: {
    pos: new THREE.Vector3(2.2, 2.8, 0.9),
    target: new THREE.Vector3(2.2, 2.86, -4),
    anchor: new THREE.Vector3(2.65, 3.42, -3.9),
  },
  shelf: {
    pos: new THREE.Vector3(-2.2, 1.6, 1.5),
    target: new THREE.Vector3(-2.2, 1.38, -4),
    anchor: new THREE.Vector3(-2.9, 3.1, -3.7),
  },
  frame: {
    pos: new THREE.Vector3(-0.7, 2.0, 0.85),
    target: new THREE.Vector3(-4, 1.95, 0.85),
    anchor: new THREE.Vector3(-3.9, 2.72, 1.4),
  },
};

export function buildRoom(scene, stations, profile) {
  buildShell(scene);
  const windowMaterial = buildWindow(scene);
  buildSofa(scene);
  buildLounge(scene);
  buildSideboard(scene, stations.frame, profile);
  buildBookshelf(scene);
  buildDesk(scene, stations.desk, profile);
  const bulbs = buildPhotoString(scene);
  const dust = buildDust(scene);
  buildLights(scene);
  const hitboxes = buildHitboxes(scene);

  const dustBase = dust.geometry.attributes.position.array.slice();

  function update(time, camera) {
    windowMaterial.uniforms.uTime.value = time;
    windowMaterial.uniforms.uPar.value.set(
      THREE.MathUtils.clamp((camera.position.z + 1.7) * -0.006, -0.06, 0.06),
      THREE.MathUtils.clamp((camera.position.y - 2) * -0.008, -0.07, 0.03)
    );
    bulbs.forEach((m, i) => {
      m.emissiveIntensity = 1.7 + Math.sin(time * 1.3 + i * 1.9) * 0.5;
    });
    const p = dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.array[i * 3] = dustBase[i * 3] + Math.sin(time * 0.15 + i) * 0.18;
      p.array[i * 3 + 1] = 0.2 + ((dustBase[i * 3 + 1] - 0.2 + time * 0.03) % 2.7);
    }
    p.needsUpdate = true;
  }

  return { update, hitboxes };
}
