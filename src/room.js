import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import * as tex from './textures.js';
import { createMaterials } from './materials.js';

// The room, built in code. Units are metres. The floor is 8 x 8, centred on the
// origin, with the window in the -x wall and the desk against the -z wall.

let M; // materials
let LIGHTS; // lights live outside the room group so hiding the room never changes them

const OAK = '#c9a074';
const WALNUT = '#7d553a';
const DARKWOOD = '#4b3528';
const TRIM = '#f3eee6';
const BRASS = '#c9a25a';
const LINEN = '#e7dbc8';
const SAGE = '#8c9c8e';
const TEAL = '#4f7673';
const MUSTARD = '#c9953f';
const CLAY = '#b9694c';
const BLUSH = '#cf9a88';
const LAVENDER = '#8f86a8';
const INK = '#2b2a33';
const CREAM = '#efe6d8';
const GREENS = ['#4f7a4c', '#3f6a45', '#5f8a55'];

// Direction towards the sun used for the light itself. It sits higher than the
// sun drawn in the sky so the light lands on the floor instead of the far wall.
const sunLightDir = new THREE.Vector3().setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - 14),
  THREE.MathUtils.degToRad(-90 - 30)
);

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Shape helpers ----------

function add(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const box = (p, w, h, d, m, x, y, z) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z);
function rbox(p, w, h, d, m, x, y, z, r = 0.012, seg = 3) {
  const radius = Math.min(r, Math.min(w, h, d) * 0.45);
  return add(p, new RoundedBoxGeometry(w, h, d, seg, radius), m, x, y, z);
}
const cyl = (p, rt, rb, h, m, x, y, z, seg = 28) =>
  add(p, new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z);
const ball = (p, r, m, x, y, z) => add(p, new THREE.SphereGeometry(r, 28, 18), m, x, y, z);
// A shape spun around the vertical axis. Profile points are [radius, height],
// listed from the bottom centre, outwards and up.
function lathe(p, profile, m, x, y, z, seg = 40) {
  const points = profile.map(([r, h]) => new THREE.Vector2(r, h));
  return add(p, new THREE.LatheGeometry(points, seg), m, x, y, z);
}

function group(parent, x, y, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}

// A flat surface showing a canvas texture. Screens glow; prints are lit by the room.
function printed(parent, w, h, texture, x, y, z, lit = false) {
  const material = lit
    ? new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85 })
    : new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.7, 1.7, 1.7) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = lit;
  parent.add(mesh);
  return mesh;
}

function lamp(color, intensity, x, y, z, shadow = false, distance = 12) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.set(x, y, z);
  if (shadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.04;
    light.shadow.camera.far = 14;
    light.shadow.bias = -0.004;
    light.shadow.radius = 3;
  }
  LIGHTS.add(light);
  return light;
}

function legs(parent, positions, height, top = 0.024, bottom = 0.016, material = M.wood(DARKWOOD)) {
  positions.forEach(([x, z]) => cyl(parent, top, bottom, height, material, x, height / 2, z, 14));
}

// ---------- Plants ----------

function leafGeometry(length, width, bend, fold) {
  const g = new THREE.PlaneGeometry(1, 1, 4, 10);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) * 2;
    const t = p.getY(i) + 0.5;
    const profile = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.7);
    p.setXYZ(
      i,
      u * 0.5 * width * Math.max(profile, 0.03),
      t * length,
      bend * length * t * t - Math.abs(u) * fold * width * profile
    );
  }
  g.computeVertexNormals();
  return g;
}

function plant(parent, x, y, z, o = {}) {
  const {
    pot = 0.09, potH = 0.15, potMat = M.ceramic(CREAM), leaves = 14, length = 0.2, width = 0.08,
    spread = [0.25, 1.15], stem = 0, bend = 0.4, seed = 1,
  } = o;
  const g = group(parent, x, y, z);
  const r = rng(seed);
  lathe(g, [[0, 0], [pot * 0.72, 0], [pot, potH], [pot * 0.9, potH], [pot * 0.88, potH * 0.85]], potMat, 0, 0, 0, 32);
  cyl(g, pot * 0.88, pot * 0.88, 0.01, M.paint('#2e231b', 1), 0, potH * 0.86, 0, 24).castShadow = false;
  const stemMat = M.paint('#5d7a48', 0.7);
  for (let i = 0; i < leaves; i++) {
    const k = leaves > 1 ? i / (leaves - 1) : 0;
    const pivot = group(g, 0, potH * 0.86, 0, i * 2.399 + r() * 0.4);
    const holder = new THREE.Group();
    holder.rotation.x = THREE.MathUtils.lerp(spread[0], spread[1], k) + (r() - 0.5) * 0.15;
    pivot.add(holder);
    const s = stem * (0.75 + r() * 0.5);
    if (s > 0) cyl(holder, 0.005, 0.008, s, stemMat, 0, s / 2, 0, 6);
    const leaf = add(
      holder,
      leafGeometry(length * (0.7 + r() * 0.5), width * (0.8 + r() * 0.4), bend * (0.6 + r() * 0.7), 0.25),
      M.leaf(GREENS[Math.floor(r() * GREENS.length)]),
      0, s, 0
    );
    leaf.rotation.y = (r() - 0.5) * 0.5;
  }
  return g;
}

// ---------- Room shell ----------

function buildShell(root) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  box(root, 8.6, 0.3, 8.6, M.black, 0, -0.152, 0);

  box(root, 8.3, 3.8, 0.3, M.wall, -0.15, 1.9, -4.15);
  box(root, 0.3, 1.15, 2.4, M.wall, -4.15, 0.575, -1.7);
  box(root, 0.3, 0.85, 2.4, M.wall, -4.15, 3.375, -1.7);
  box(root, 0.3, 3.8, 4.5, M.wall, -4.15, 1.9, 1.75);
  box(root, 0.3, 3.8, 1.1, M.wall, -4.15, 1.9, -3.45);
  box(root, 0.3, 3.8, 8.6, M.wall, 4.15, 1.9, 0);
  box(root, 8.6, 3.8, 0.3, M.wall, 0, 1.9, 4.15);
  box(root, 8.6, 0.2, 8.6, M.ceiling, 0, 3.9, 0);

  const trim = M.paint(TRIM, 0.45);
  rbox(root, 8, 0.1, 0.018, trim, 0, 0.05, -3.991, 0.006);
  rbox(root, 0.018, 0.1, 8, trim, -3.991, 0.05, 0, 0.006);
  rbox(root, 8, 0.1, 0.018, trim, 0, 0.05, 3.991, 0.006);
  rbox(root, 0.018, 0.1, 4.27, trim, 3.991, 0.05, -1.865, 0.006);
  rbox(root, 0.018, 0.1, 2.47, trim, 3.991, 0.05, 2.765, 0.006);
}

function buildWindow(root, noAO) {
  const trim = M.paint(TRIM, 0.4);
  // Lining of the opening through the wall.
  box(root, 0.3, 0.02, 2.4, trim, -4.15, 1.16, -1.7);
  box(root, 0.3, 0.02, 2.4, trim, -4.15, 2.94, -1.7);
  box(root, 0.3, 1.8, 0.02, trim, -4.15, 2.05, -2.89);
  box(root, 0.3, 1.8, 0.02, trim, -4.15, 2.05, -0.51);
  // Sash, glazing bars and glass.
  const fx = -4.22;
  rbox(root, 0.05, 0.06, 2.36, trim, fx, 2.9, -1.7, 0.006);
  rbox(root, 0.05, 0.06, 2.36, trim, fx, 1.2, -1.7, 0.006);
  rbox(root, 0.05, 1.76, 0.06, trim, fx, 2.05, -2.86, 0.006);
  rbox(root, 0.05, 1.76, 0.06, trim, fx, 2.05, -0.54, 0.006);
  rbox(root, 0.035, 1.7, 0.035, trim, fx, 2.05, -1.7, 0.005);
  rbox(root, 0.035, 0.035, 2.3, trim, fx, 2.05, -1.7, 0.005);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.7), M.glass);
  glass.rotation.y = Math.PI / 2;
  glass.position.set(fx, 2.05, -1.7);
  root.add(glass);
  noAO.push(glass);
  // Casing on the wall and the sill.
  rbox(root, 0.025, 0.09, 2.6, trim, -3.99, 3.0, -1.7, 0.006);
  rbox(root, 0.025, 1.94, 0.09, trim, -3.99, 2.03, -2.945, 0.006);
  rbox(root, 0.025, 1.94, 0.09, trim, -3.99, 2.03, -0.455, 0.006);
  rbox(root, 0.2, 0.035, 2.72, trim, -3.92, 1.125, -1.7, 0.01);

  // Curtain rod and two linen curtains.
  const iron = M.metal('#2a2622', 0.45);
  const rod = cyl(root, 0.012, 0.012, 3.7, iron, -3.9, 3.24, -1.7, 12);
  rod.rotation.x = Math.PI / 2;
  ball(root, 0.028, iron, -3.9, 3.24, -3.56);
  ball(root, 0.028, iron, -3.9, 3.24, 0.16);
  const linen = M.fabric(LINEN, 30, THREE.DoubleSide);
  [[-3.2, 4], [-0.2, 9]].forEach(([z, seed]) => {
    const width = 0.62;
    const height = 3.12;
    const g = new THREE.PlaneGeometry(width, height, 64, 10);
    const p = g.attributes.position;
    const phase = rng(seed)() * 6;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / width + 0.5;
      const v = p.getY(i) / height + 0.5;
      p.setZ(i, Math.sin(u * Math.PI * 11 + phase) * 0.034 * (1.15 - 0.4 * v) + Math.sin(u * 23 + phase) * 0.008);
    }
    g.computeVertexNormals();
    const c = add(root, g, linen, -3.9, 1.66, z);
    c.rotation.y = Math.PI / 2;
  });

  plant(root, -3.9, 1.143, -2.5, { pot: 0.07, potH: 0.11, leaves: 16, length: 0.16, width: 0.06, seed: 3 });
}

// ---------- Furniture ----------

function buildSofa(root) {
  const g = group(root, -3.3, 0, -1.7);
  const cloth = M.fabric(SAGE, 26);
  legs(g, [[-0.38, -1.02], [0.38, -1.02], [-0.38, 1.02], [0.38, 1.02]], 0.14);
  rbox(g, 0.95, 0.2, 2.3, cloth, 0, 0.24, 0, 0.04);
  rbox(g, 0.16, 0.66, 2.3, cloth, -0.42, 0.6, 0, 0.06);
  rbox(g, 0.95, 0.44, 0.18, cloth, 0, 0.5, -1.07, 0.07);
  rbox(g, 0.95, 0.44, 0.18, cloth, 0, 0.5, 1.07, 0.07);
  [-0.49, 0.49].forEach((z) => {
    rbox(g, 0.72, 0.17, 0.95, cloth, 0.1, 0.42, z, 0.06);
    const back = rbox(g, 0.2, 0.48, 0.93, cloth, -0.27, 0.74, z, 0.08);
    back.rotation.z = 0.12;
  });
  const p1 = rbox(g, 0.13, 0.4, 0.4, M.fabric(MUSTARD, 18), -0.1, 0.72, -0.72, 0.055);
  p1.rotation.set(0.1, 0.25, -0.32);
  const p2 = rbox(g, 0.13, 0.38, 0.38, M.fabric(CLAY, 18), -0.1, 0.71, 0.68, 0.055);
  p2.rotation.set(-0.15, -0.2, -0.3);
  // A folded throw over the arm.
  rbox(g, 0.5, 0.03, 0.24, M.fabric(CREAM, 14), 0.1, 0.735, 1.07, 0.014);
  rbox(g, 0.5, 0.3, 0.03, M.fabric(CREAM, 14), 0.1, 0.6, 1.175, 0.014);
}

function buildLounge(root) {
  const rug = cyl(root, 2.0, 2.0, 0.012, M.rug, -0.5, 0.006, 0.1, 72);
  rug.castShadow = false;

  // Coffee table.
  const t = group(root, -1.3, 0, -0.5);
  lathe(t, [[0, 0.405], [0.5, 0.405], [0.52, 0.412], [0.524, 0.425], [0.52, 0.438], [0.5, 0.445], [0, 0.445]], M.wood(OAK, 0.42), 0, 0, 0, 64);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = cyl(t, 0.022, 0.014, 0.42, M.wood(WALNUT), Math.cos(a) * 0.36, 0.2, Math.sin(a) * 0.36, 14);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  const mug = M.ceramic('#f1ebe2');
  lathe(t, [[0, 0], [0.036, 0], [0.041, 0.09], [0.035, 0.09], [0.033, 0.01], [0, 0.01]], mug, 0.16, 0.445, 0.1, 28);
  const handle = add(t, new THREE.TorusGeometry(0.026, 0.006, 8, 20), mug, 0.205, 0.49, 0.1);
  handle.rotation.y = 0;
  cyl(t, 0.033, 0.033, 0.004, M.paint('#3a2418', 0.3), 0.16, 0.522, 0.1, 20).castShadow = false;
  rbox(t, 0.3, 0.032, 0.22, M.paint(LAVENDER, 0.7), -0.15, 0.461, -0.08, 0.004, 2).rotation.y = 0.4;
  rbox(t, 0.26, 0.028, 0.2, M.paint(MUSTARD, 0.7), -0.15, 0.491, -0.08, 0.004, 2).rotation.y = 0.2;

  // Floor lamp with a linen shade.
  const l = group(root, -3.45, 0, 0.1);
  const iron = M.metal('#2a2622', 0.45);
  lathe(l, [[0, 0], [0.16, 0], [0.165, 0.008], [0.16, 0.018], [0, 0.022]], iron, 0, 0, 0, 40);
  cyl(l, 0.011, 0.011, 1.56, iron, 0, 0.8, 0, 12);
  const shadeMat = new THREE.MeshStandardMaterial({
    color: LINEN, emissive: '#ffb469', emissiveIntensity: 1.1, roughness: 1, side: THREE.DoubleSide,
  });
  add(l, new THREE.CylinderGeometry(0.19, 0.25, 0.34, 40, 1, true), shadeMat, 0, 1.66, 0);
  ball(l, 0.035, M.glow('#ffd9a8', 12), 0, 1.62, 0).castShadow = false;
  lamp('#ffb873', 9, -3.45, 1.62, 0.1, true);
  lamp('#ffb873', 2.2, -3.45, 1.62, 0.1, false, 4);

  // Large plant by the front wall.
  plant(root, -3.35, 0, 3.3, {
    pot: 0.24, potH: 0.4, leaves: 13, length: 0.7, width: 0.24, stem: 0.5, spread: [0.12, 0.85], bend: 0.3, seed: 7,
  });
}

function buildSideboard(root, station, profile) {
  const g = group(root, -3.68, 0, 1.4);
  const wood = M.wood(WALNUT, 0.45);
  const brass = M.metal(BRASS, 0.3);
  legs(g, [[-0.19, -0.7], [0.19, -0.7], [-0.19, 0.7], [0.19, 0.7]], 0.2);
  rbox(g, 0.5, 0.56, 1.6, wood, 0, 0.48, 0, 0.012);
  [-0.4, 0.4].forEach((z) => rbox(g, 0.016, 0.5, 0.78, wood, 0.256, 0.48, z, 0.006));
  ball(g, 0.014, brass, 0.275, 0.52, -0.06);
  ball(g, 0.014, brass, 0.275, 0.52, 0.06);

  // Record player.
  rbox(g, 0.34, 0.05, 0.42, M.wood(DARKWOOD, 0.4), 0, 0.785, 0.42, 0.008);
  cyl(g, 0.145, 0.145, 0.012, M.metal('#8a8a8c', 0.4), -0.01, 0.816, 0.39, 40);
  cyl(g, 0.14, 0.14, 0.004, M.paint('#101012', 0.28), -0.01, 0.824, 0.39, 40);
  cyl(g, 0.045, 0.045, 0.005, M.paint(CLAY, 0.6), -0.01, 0.825, 0.39, 24);
  cyl(g, 0.014, 0.014, 0.03, M.metal('#b8b8ba', 0.3), 0.13, 0.825, 0.57, 12);
  const arm = cyl(g, 0.004, 0.004, 0.2, M.metal('#b8b8ba', 0.3), 0.1, 0.842, 0.48, 8);
  arm.rotation.set(Math.PI / 2, 0, 0.3);
  // Books and a plant.
  rbox(g, 0.3, 0.045, 0.22, M.paint(TEAL, 0.7), 0, 0.783, -0.08, 0.004, 2);
  rbox(g, 0.27, 0.04, 0.2, M.paint(BLUSH, 0.7), 0.01, 0.826, -0.08, 0.004, 2).rotation.y = 0.2;
  plant(g, 0, 0.76, -0.55, { pot: 0.085, potH: 0.14, leaves: 18, length: 0.22, width: 0.07, seed: 11 });

  // The framed page on the wall above.
  const f = group(root, -3.985, 2.1, 1.4, Math.PI / 2);
  rbox(f, 1.04, 0.8, 0.03, M.wood(WALNUT, 0.4), 0, 0, 0, 0.006);
  printed(f, 0.94, 0.7, tex.framedPage(station, profile), 0, 0, 0.0165, true);

  const a1 = group(root, -3.987, 2.38, 2.42, Math.PI / 2);
  rbox(a1, 0.42, 0.52, 0.026, M.wood(OAK, 0.45), 0, 0, 0, 0.005);
  printed(a1, 0.36, 0.46, tex.artPrint(0), 0, 0, 0.0145, true);
  const a2 = group(root, -3.987, 1.78, 2.48, Math.PI / 2);
  rbox(a2, 0.42, 0.52, 0.026, M.paint('#1c1b20', 0.4), 0, 0, 0, 0.005);
  printed(a2, 0.36, 0.46, tex.artPrint(1), 0, 0, 0.0145, true);
}

function buildBookshelf(root) {
  const g = group(root, -2.9, 0, -3.78);
  const W = 1.5;
  const D = 0.4;
  const wood = M.wood(OAK, 0.5);
  rbox(g, 0.03, 2.66, D, wood, -W / 2 + 0.015, 1.33, 0, 0.004);
  rbox(g, 0.03, 2.66, D, wood, W / 2 - 0.015, 1.33, 0, 0.004);
  box(g, W - 0.06, 2.62, 0.012, wood, 0, 1.33, -D / 2 + 0.01);
  const levels = [0.08, 0.72, 1.36, 2.0, 2.645];
  levels.forEach((y) => rbox(g, W - 0.06, 0.03, D - 0.02, wood, 0, y, 0, 0.004));

  const r = rng(42);
  const spines = [TEAL, MUSTARD, BLUSH, LAVENDER, CREAM, SAGE, INK, CLAY, '#7f8fb5', '#d8cdbd', '#3f4a5a'];
  const fill = (level, from, to) => {
    const y0 = levels[level] + 0.015;
    let x = from;
    while (x < to) {
      const w = 0.028 + r() * 0.04;
      const h = 0.24 + r() * 0.2;
      if (x + w > to) break;
      const d = 0.2 + r() * 0.08;
      const b = rbox(g, w, h, d, M.paint(spines[Math.floor(r() * spines.length)], 0.72), x + w / 2, y0 + h / 2, D / 2 - d / 2 - 0.03, 0.004, 1);
      if (r() > 0.9) {
        b.rotation.z = -0.14;
        b.position.x += 0.025;
        x += 0.045;
      }
      x += w + 0.002;
    }
  };
  const L = -W / 2 + 0.05;
  const R = W / 2 - 0.05;

  fill(0, L, R);
  fill(1, L, 0.15);
  plant(g, 0.42, levels[1] + 0.015, 0.02, { pot: 0.09, potH: 0.13, leaves: 18, length: 0.2, width: 0.07, seed: 21 });
  fill(2, -0.2, R);
  // A small globe on a brass stand.
  const brass = M.metal(BRASS, 0.3);
  lathe(g, [[0, 0], [0.07, 0], [0.06, 0.012], [0.012, 0.02], [0.01, 0.1], [0, 0.1]], brass, -0.45, levels[2] + 0.015, 0.02, 24);
  ball(g, 0.13, M.ceramic('#4f7f86'), -0.45, levels[2] + 0.245, 0.02);
  fill(3, L, -0.1);
  rbox(g, 0.32, 0.045, 0.24, M.paint(LAVENDER, 0.7), 0.3, levels[3] + 0.038, 0.02, 0.004, 2);
  rbox(g, 0.29, 0.045, 0.22, M.paint(MUSTARD, 0.7), 0.31, levels[3] + 0.083, 0.02, 0.004, 2).rotation.y = 0.15;
  rbox(g, 0.27, 0.04, 0.2, M.paint(TEAL, 0.7), 0.3, levels[3] + 0.126, 0.02, 0.004, 2).rotation.y = -0.1;
  const card = rbox(g, 0.2, 0.26, 0.016, M.wood(WALNUT), 0.3, levels[3] + 0.28, -0.04, 0.004, 2);
  card.rotation.x = -0.16;
  // On top: a plant and a woven storage box.
  plant(g, -0.4, levels[4] + 0.015, 0, { pot: 0.11, potH: 0.17, leaves: 20, length: 0.3, width: 0.09, spread: [0.2, 1.3], seed: 31 });
  rbox(g, 0.36, 0.2, 0.26, M.fabric('#b9a184', 14), 0.3, levels[4] + 0.115, 0, 0.02);
  rbox(g, 0.37, 0.03, 0.27, M.wood(WALNUT), 0.3, levels[4] + 0.23, 0, 0.008);
}

function buildDesk(root, station, profile) {
  const g = group(root, 1.5, 0, -3.55);
  const iron = M.metal('#232226', 0.42);
  const brass = M.metal(BRASS, 0.3);
  const white = M.paint('#f0ebe3', 0.38);
  rbox(g, 3.4, 0.04, 0.9, M.wood(OAK, 0.42), 0, 0.945, 0, 0.01);

  // Drawer unit on the right.
  rbox(g, 0.75, 0.9, 0.8, white, 1.25, 0.47, 0, 0.012);
  [0.18, 0.47, 0.76].forEach((y) => {
    rbox(g, 0.69, 0.265, 0.016, white, 1.25, y, 0.404, 0.006);
    const bar = cyl(g, 0.006, 0.006, 0.18, brass, 1.25, y + 0.06, 0.43, 10);
    bar.rotation.z = Math.PI / 2;
    cyl(g, 0.004, 0.004, 0.02, brass, 1.18, y + 0.06, 0.42, 8).rotation.x = Math.PI / 2;
    cyl(g, 0.004, 0.004, 0.02, brass, 1.32, y + 0.06, 0.42, 8).rotation.x = Math.PI / 2;
  });
  // Steel trestle on the left.
  [0.33, -0.33].forEach((z) => {
    const leg = cyl(g, 0.016, 0.016, 0.94, iron, -1.55, 0.46, z * 1.05, 12);
    leg.rotation.x = z > 0 ? 0.07 : -0.07;
  });
  cyl(g, 0.012, 0.012, 0.64, iron, -1.55, 0.3, 0, 10).rotation.x = Math.PI / 2;

  // PC tower under the desk.
  rbox(g, 0.22, 0.46, 0.48, M.black, -1.1, 0.24, -0.05, 0.012);
  add(g, new THREE.BoxGeometry(0.004, 0.36, 0.01), M.glow('#6fd6c0', 5), -1.04, 0.24, 0.192).castShadow = false;

  // Main monitor: shows the projects.
  rbox(g, 0.32, 0.012, 0.2, iron, -0.3, 0.971, -0.22, 0.005);
  rbox(g, 0.05, 0.32, 0.018, iron, -0.3, 1.12, -0.25, 0.005);
  rbox(g, 1.25, 0.72, 0.03, M.black, -0.3, 1.56, -0.2, 0.012);
  printed(g, 1.215, 0.664, tex.codeScreen(station, profile), -0.3, 1.565, -0.184);

  // Second monitor, angled in: a design tool.
  const m2 = group(g, 0.95, 0, -0.12, -0.4);
  rbox(m2, 0.28, 0.012, 0.18, iron, 0, 0.971, -0.02, 0.005);
  rbox(m2, 0.05, 0.28, 0.018, iron, 0, 1.1, -0.04, 0.005);
  rbox(m2, 1.0, 0.61, 0.03, M.black, 0, 1.47, 0, 0.012);
  printed(m2, 0.965, 0.571, tex.designScreen(), 0, 1.473, 0.016);

  // Desk mat, keyboard and mouse.
  rbox(g, 1.15, 0.004, 0.44, M.fabric('#5e7673', 40), -0.2, 0.967, 0.18, 0.002, 1).castShadow = false;
  rbox(g, 0.45, 0.016, 0.152, M.paint('#d6d1c9', 0.4), -0.32, 0.977, 0.18, 0.006);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.436, 0.14), M.keyboardTop);
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(-0.32, 0.9856, 0.18);
  keys.receiveShadow = true;
  g.add(keys);
  const mouse = ball(g, 1, M.paint('#ebe6de', 0.35), 0.1, 0.972, 0.2);
  mouse.scale.set(0.032, 0.018, 0.054);

  // Drawing tablet and pen.
  const tablet = group(g, 0.78, 0.965, 0.2, -0.15);
  rbox(tablet, 0.44, 0.01, 0.3, M.black, 0, 0.005, 0, 0.005);
  rbox(tablet, 0.36, 0.002, 0.23, M.paint('#2a2a31', 0.6), 0, 0.011, 0, 0.001, 1).castShadow = false;
  const pen = cyl(tablet, 0.005, 0.004, 0.16, M.paint('#e9e4dc', 0.4), 0.08, 0.018, 0.02, 10);
  pen.rotation.set(0, 0.5, Math.PI / 2);

  // Desk lamp with a jointed arm.
  const lampGroup = group(g, -1.45, 0.965, -0.22);
  const enamel = M.paint(MUSTARD, 0.35);
  lathe(lampGroup, [[0, 0], [0.085, 0], [0.09, 0.008], [0.08, 0.02], [0, 0.024]], enamel, 0, 0, 0, 32);
  const arm1 = cyl(lampGroup, 0.007, 0.007, 0.34, brass, -0.035, 0.18, 0, 10);
  arm1.rotation.z = 0.2;
  const arm2 = cyl(lampGroup, 0.007, 0.007, 0.36, brass, 0.07, 0.42, 0, 10);
  arm2.rotation.z = -0.95;
  ball(lampGroup, 0.014, brass, -0.07, 0.345, 0);
  const head = add(lampGroup, new THREE.CylinderGeometry(0.03, 0.085, 0.13, 28, 1, true),
    new THREE.MeshStandardMaterial({ color: MUSTARD, roughness: 0.35, side: THREE.DoubleSide }), 0.24, 0.47, 0);
  head.rotation.z = 0.75;
  ball(lampGroup, 0.03, M.glow('#ffdcb0', 10), 0.255, 0.455, 0).castShadow = false;
  const spot = new THREE.SpotLight('#ffbe85', 26, 5, 0.95, 0.75, 2);
  spot.position.set(0.33, 1.38, -3.77);
  spot.target.position.set(0.75, 0.96, -3.5);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.05;
  spot.shadow.bias = -0.002;
  spot.shadow.radius = 3;
  LIGHTS.add(spot, spot.target);

  // Mug, pencil cup and a plant.
  const mugMat = M.ceramic('#d8b9a6');
  lathe(g, [[0, 0], [0.036, 0], [0.04, 0.09], [0.034, 0.09], [0.032, 0.01], [0, 0.01]], mugMat, 0.42, 0.965, 0.28, 28);
  add(g, new THREE.TorusGeometry(0.025, 0.006, 8, 20), mugMat, 0.465, 1.01, 0.28);
  lathe(g, [[0, 0], [0.042, 0], [0.046, 0.11], [0.041, 0.11], [0.039, 0.01], [0, 0.01]], M.ceramic('#c98d78'), 1.5, 0.965, 0.25, 28);
  [[-0.014, MUSTARD], [0.016, TEAL], [0.002, '#e9e4dc'], [-0.004, CLAY]].forEach(([dx, c], i) => {
    const p = cyl(g, 0.0045, 0.0045, 0.19, M.paint(c, 0.6), 1.5 + dx, 1.07, 0.25 + (i - 1.5) * 0.012, 6);
    p.rotation.set((i - 1.5) * 0.08, 0, dx * 9);
  });
  plant(g, 1.52, 0.965, -0.24, { pot: 0.085, potH: 0.13, potMat: M.ceramic('#b86a4e'), leaves: 20, length: 0.24, width: 0.075, seed: 41 });

  // Soft glow from the screens.
  lamp('#b3b8ff', 1.1, 1.4, 1.5, -3.1, false, 3.5);

  // Office chair.
  const c = group(root, 0.3, 0, -2.25, 0.55);
  const plastic = M.paint('#1d1c21', 0.5);
  const cloth = M.fabric(TEAL, 22);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = rbox(c, 0.3, 0.028, 0.045, plastic, Math.cos(a) * 0.15, 0.075, Math.sin(a) * 0.15, 0.01, 2);
    spoke.rotation.y = -a;
    ball(c, 0.028, plastic, Math.cos(a) * 0.3, 0.028, Math.sin(a) * 0.3);
  }
  cyl(c, 0.024, 0.03, 0.34, M.metal('#9a9a9e', 0.3), 0, 0.26, 0, 16);
  rbox(c, 0.5, 0.085, 0.5, cloth, 0, 0.5, 0, 0.04);
  rbox(c, 0.3, 0.03, 0.3, plastic, 0, 0.45, 0, 0.01, 2);
  const spine = rbox(c, 0.06, 0.4, 0.03, plastic, 0, 0.68, 0.27, 0.01, 2);
  spine.rotation.x = 0.1;
  const back = rbox(c, 0.46, 0.5, 0.07, cloth, 0, 1.02, 0.29, 0.035);
  back.rotation.x = 0.1;
}

function buildPhotoString(root) {
  const A = new THREE.Vector3(0.0, 3.32, -3.975);
  const B = new THREE.Vector3(3.3, 3.32, -3.975);
  const mid = new THREE.Vector3(1.65, 2.96, -3.975);
  const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
  add(root, new THREE.TubeGeometry(curve, 40, 0.004, 6), M.paint('#6b5440', 0.9), 0, 0, 0);
  const brass = M.metal(BRASS, 0.35);
  ball(root, 0.012, brass, A.x, A.y, A.z);
  ball(root, 0.012, brass, B.x, B.y, B.z);

  const paper = M.paint('#f6f2ea', 0.75);
  const peg = M.wood(OAK, 0.6);
  [0.07, -0.05, 0.03, -0.08, 0.05].forEach((tilt, i) => {
    const p = curve.getPoint(0.1 + i * 0.2);
    const g = group(root, p.x, p.y, p.z + 0.008);
    g.rotation.z = tilt;
    rbox(g, 0.36, 0.44, 0.004, paper, 0, -0.2, 0, 0.002, 1);
    printed(g, 0.3, 0.3, tex.photo(i), 0, -0.165, 0.0025, true);
    rbox(g, 0.022, 0.075, 0.012, peg, 0, 0.0, 0.004, 0.003, 1);
  });

  const bulbs = [];
  for (let i = 0; i <= 5; i++) {
    const p = curve.getPoint(i * 0.2);
    const material = M.glow('#ffcf96', 6);
    const bulb = ball(root, 0.016, material, p.x, p.y - 0.035, p.z + 0.02);
    bulb.castShadow = false;
    bulbs.push(material);
  }
  lamp('#ffc68a', 1.4, 1.65, 3.0, -3.6, false, 4);
  return bulbs;
}

function buildFarSide(root) {
  const trim = M.paint(TRIM, 0.4);
  const brass = M.metal(BRASS, 0.3);
  const doorPaint = M.paint('#93a394', 0.42);

  // Door on the right wall.
  rbox(root, 0.03, 2.26, 0.09, trim, 3.985, 1.13, 0.335, 0.006);
  rbox(root, 0.03, 2.26, 0.09, trim, 3.985, 1.13, 1.465, 0.006);
  rbox(root, 0.03, 0.09, 1.22, trim, 3.985, 2.305, 0.9, 0.006);
  rbox(root, 0.03, 2.24, 1.04, doorPaint, 3.99, 1.125, 0.9, 0.004);
  [[1.62, 0.9], [0.6, 0.72]].forEach(([y, h]) => {
    rbox(root, 0.014, h, 0.74, doorPaint, 3.972, y, 0.9, 0.006);
    rbox(root, 0.01, h - 0.12, 0.62, doorPaint, 3.964, y, 0.9, 0.004);
  });
  cyl(root, 0.026, 0.026, 0.012, brass, 3.966, 1.08, 0.5, 20).rotation.z = Math.PI / 2;
  cyl(root, 0.008, 0.008, 0.05, brass, 3.945, 1.08, 0.5, 10).rotation.z = Math.PI / 2;
  cyl(root, 0.008, 0.008, 0.12, brass, 3.925, 1.08, 0.555, 10).rotation.x = Math.PI / 2;

  // Coat hooks with a tote bag.
  rbox(root, 0.022, 0.09, 0.95, M.wood(OAK, 0.5), 3.988, 1.9, -0.5, 0.006);
  [-0.82, -0.5, -0.18].forEach((z) => {
    cyl(root, 0.008, 0.008, 0.07, brass, 3.95, 1.9, z, 10).rotation.z = Math.PI / 2;
    ball(root, 0.014, brass, 3.915, 1.9, z);
  });
  const canvasCloth = M.fabric('#d9c9a8', 16);
  rbox(root, 0.07, 0.44, 0.38, canvasCloth, 3.935, 1.46, -0.82, 0.03);
  [-0.94, -0.7].forEach((z) => {
    const strap = rbox(root, 0.012, 0.26, 0.026, canvasCloth, 3.935, 1.78, z, 0.005, 1);
    strap.rotation.x = z < -0.82 ? -0.45 : 0.45;
  });

  // Large poster between the desk and the door.
  const p = group(root, 3.987, 2.1, -2.05, -Math.PI / 2);
  rbox(p, 0.95, 1.27, 0.026, M.paint('#1c1b20', 0.4), 0, 0, 0, 0.005);
  printed(p, 0.89, 1.21, tex.poster(), 0, 0, 0.0145, true);

  // Dresser on the front wall, with a round mirror above it.
  const d = group(root, -1.0, 0, 3.7);
  const oak = M.wood(OAK, 0.45);
  legs(d, [[-0.8, -0.18], [0.8, -0.18], [-0.8, 0.18], [0.8, 0.18]], 0.16);
  rbox(d, 1.8, 0.76, 0.5, oak, 0, 0.54, 0, 0.012);
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 3; row++) {
      const x = -0.44 + col * 0.88;
      const y = 0.3 + row * 0.24;
      rbox(d, 0.85, 0.215, 0.016, oak, x, y, -0.256, 0.006);
      ball(d, 0.013, brass, x, y, -0.275);
    }
  }
  // Table lamp.
  lathe(d, [[0, 0], [0.06, 0], [0.085, 0.07], [0.07, 0.16], [0.025, 0.24], [0.015, 0.3], [0, 0.3]], M.ceramic(LAVENDER), -0.6, 0.92, 0, 32);
  const shade = new THREE.MeshStandardMaterial({
    color: LINEN, emissive: '#ffb469', emissiveIntensity: 1.0, roughness: 1, side: THREE.DoubleSide,
  });
  add(d, new THREE.CylinderGeometry(0.1, 0.16, 0.2, 32, 1, true), shade, -0.6, 1.3, 0);
  ball(d, 0.028, M.glow('#ffd9a8', 10), -0.6, 1.28, 0).castShadow = false;
  lamp('#ffb873', 4.5, -1.6, 1.3, 3.7, true, 8);
  rbox(d, 0.3, 0.045, 0.22, M.paint(BLUSH, 0.7), 0.1, 0.943, 0.02, 0.004, 2).rotation.y = 0.2;
  rbox(d, 0.27, 0.04, 0.2, M.paint(TEAL, 0.7), 0.1, 0.986, 0.02, 0.004, 2);
  plant(d, 0.6, 0.92, 0, { pot: 0.1, potH: 0.16, leaves: 20, length: 0.3, width: 0.09, spread: [0.2, 1.25], seed: 51 });
  const ring = add(root, new THREE.TorusGeometry(0.5, 0.022, 12, 64), brass, -1.0, 2.05, 3.975);
  ring.rotation.y = Math.PI;
  const glass = add(root, new THREE.CircleGeometry(0.49, 64), M.mirror, -1.0, 2.05, 3.972);
  glass.rotation.y = Math.PI;
  glass.castShadow = false;

  // Wall shelf and a pouf.
  rbox(root, 1.3, 0.03, 0.24, M.wood(OAK, 0.5), 1.7, 1.95, 3.87, 0.006);
  [1.2, 2.2].forEach((x) => rbox(root, 0.02, 0.14, 0.02, M.metal('#232226', 0.45), x, 1.87, 3.975, 0.004, 1));
  plant(root, 1.25, 1.965, 3.86, { pot: 0.085, potH: 0.13, leaves: 18, length: 0.24, width: 0.08, spread: [0.3, 1.5], seed: 61 });
  [[1.62, 0.3, TEAL], [1.665, 0.26, BLUSH], [1.71, 0.32, CREAM]].forEach(([x, h, c]) =>
    rbox(root, 0.036, h, 0.2, M.paint(c, 0.72), x, 1.965 + h / 2, 3.86, 0.004, 1)
  );
  plant(root, 2.15, 1.965, 3.86, { pot: 0.07, potH: 0.1, leaves: 14, length: 0.15, width: 0.06, seed: 71 });
  lathe(root, [[0, 0], [0.34, 0], [0.4, 0.06], [0.41, 0.2], [0.38, 0.33], [0.3, 0.37], [0, 0.38]], M.fabric(BLUSH, 30), 1.5, 0, 3.3, 40);

  // Pendant light over the rug.
  cyl(root, 0.004, 0.004, 0.7, M.black, -0.5, 3.45, 0.1, 6).castShadow = false;
  const pendantShade = new THREE.MeshStandardMaterial({ color: '#e9e2d6', roughness: 0.55, side: THREE.DoubleSide });
  lathe(root, [[0.03, 0.26], [0.05, 0.25], [0.16, 0.12], [0.3, 0]], pendantShade, -0.5, 2.84, 0.1, 48);
  ball(root, 0.04, M.glow('#ffdcae', 9), -0.5, 2.93, 0.1).castShadow = false;
  const pool = new THREE.SpotLight('#ffc58c', 16, 9, 1.05, 1, 2);
  pool.position.set(-0.5, 2.9, 0.1);
  pool.target.position.set(-0.5, 0, 0.1);
  pool.castShadow = true;
  pool.shadow.mapSize.set(1024, 1024);
  pool.shadow.camera.near = 0.2;
  pool.shadow.bias = -0.002;
  pool.shadow.radius = 4;
  LIGHTS.add(pool, pool.target);
  lamp('#ffc58c', 1.2, -0.5, 2.6, 0.1, false, 6);
}

function buildDust(root) {
  const count = 90;
  const positions = new Float32Array(count * 3);
  const r = rng(5);
  for (let i = 0; i < count; i++) {
    const t = r();
    // Scattered along the sunbeam that crosses the room.
    positions[i * 3] = -3.6 + t * 6.5;
    positions[i * 3 + 1] = 0.3 + r() * 2.3;
    positions[i * 3 + 2] = -2.6 + t * 3.8 + r() * 2.2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: M.dot,
      color: new THREE.Color(2.2, 1.6, 1.0),
      size: 0.016,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  root.add(points);
  return points;
}

function buildLights() {
  RectAreaLightUniformsLib.init();

  // Low golden sun through the window.
  const sun = new THREE.DirectionalLight('#ffa866', 10);
  const aim = new THREE.Vector3(0.5, 0.5, 0.8);
  sun.position.copy(aim).addScaledVector(sunLightDir, 18);
  sun.target.position.copy(aim);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = -7.5;
  sun.shadow.camera.right = 7.5;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 36;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 2.5;
  LIGHTS.add(sun, sun.target);

  // Soft light from the sky, spilling in through the window.
  const skylight = new THREE.RectAreaLight('#ffc39c', 7, 2.4, 1.8);
  skylight.position.set(-3.98, 2.05, -1.7);
  skylight.lookAt(0, 1.6, -1.2);
  LIGHTS.add(skylight);

  // A base level of bounced light; replaced mostly by the baked room light.
  const bounce = new THREE.HemisphereLight('#ffdcc0', '#b08a6a', 0.55);
  LIGHTS.add(bounce);
  return { bounce };
}

function buildHitboxes(root) {
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const make = (id, w, h, d, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.userData.station = id;
    root.add(m);
    return m;
  };
  return [
    make('desk', 3.4, 1.15, 0.95, 1.5, 1.45, -3.5),
    make('photos', 3.5, 0.75, 0.25, 1.65, 2.95, -3.9),
    make('shelf', 1.6, 2.9, 0.6, -2.9, 1.45, -3.72),
    make('frame', 0.25, 0.95, 1.2, -3.92, 2.1, 1.4),
  ];
}

// Where you stand and what you look at for each station, and where its label floats.
export const home = {
  pos: new THREE.Vector3(2.9, 1.7, 3.0),
  target: new THREE.Vector3(-0.6, 1.3, -1.8),
};

export const views = {
  desk: {
    pos: new THREE.Vector3(2.1, 1.72, -1.2),
    target: new THREE.Vector3(2.05, 1.38, -3.7),
    anchor: new THREE.Vector3(1.2, 2.12, -3.7),
  },
  photos: {
    pos: new THREE.Vector3(2.2, 1.7, -1.5),
    target: new THREE.Vector3(2.2, 2.92, -3.97),
    anchor: new THREE.Vector3(2.65, 3.42, -3.9),
  },
  shelf: {
    pos: new THREE.Vector3(-2.2, 1.6, -0.85),
    target: new THREE.Vector3(-2.2, 1.4, -4),
    anchor: new THREE.Vector3(-2.9, 3.0, -3.6),
  },
  frame: {
    pos: new THREE.Vector3(-2.1, 1.75, 0.85),
    target: new THREE.Vector3(-4, 2.0, 0.85),
    anchor: new THREE.Vector3(-3.9, 2.72, 1.4),
  },
};

export function buildRoom(scene, stations, profile) {
  M = createMaterials();
  LIGHTS = scene;
  const root = new THREE.Group();
  scene.add(root);
  const noAO = [];

  buildShell(root);
  buildWindow(root, noAO);
  buildFarSide(root);
  buildSofa(root);
  buildLounge(root);
  buildSideboard(root, stations.frame, profile);
  buildBookshelf(root);
  buildDesk(root, stations.desk, profile);
  const bulbs = buildPhotoString(root);
  const dust = buildDust(root);
  noAO.push(dust);
  const { bounce } = buildLights();
  const hitboxes = buildHitboxes(root);
  hitboxes.forEach((h) => noAO.push(h));

  const dustBase = dust.geometry.attributes.position.array.slice();

  function update(time) {
    bulbs.forEach((m, i) => {
      m.emissiveIntensity = 6 + Math.sin(time * 1.1 + i * 1.9) * 0.8;
    });
    const p = dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.array[i * 3] = dustBase[i * 3] + Math.sin(time * 0.12 + i) * 0.15;
      p.array[i * 3 + 1] = 0.3 + ((dustBase[i * 3 + 1] - 0.3 + time * 0.02) % 2.3);
    }
    p.needsUpdate = true;
  }

  return { root, update, hitboxes, noAO, bounce };
}
