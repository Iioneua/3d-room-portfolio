import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as tex from './textures.js';
import { createMaterials, metricUVs, BOOK_COLUMNS, BOOK_ROWS } from './materials.js';
import { placeModel } from './assets.js';

// The room at dusk. Units are metres. The floor is 6 x 6, centred on the origin,
// and the ceiling is 2.8 high. The back wall (-z) holds the window and, behind the
// desk, a wall of wooden slats with two floating shelves lit by LED strips.

let M; // materials
let A; // loaded assets
let LIGHTS; // lights live outside the room group so hiding the room never changes them

const H = 2.8; // ceiling height
const BACK = -3; // inner face of the back wall
const RIGHT = 3; // inner face of the right wall
const LEFT = -3; // inner face of the left wall
const SLATS = { x0: -0.05, x1: 2.65, top: 2.72 };
const CX = (SLATS.x0 + SLATS.x1) / 2; // centre of the slat wall and the desk
const SHELVES = [1.66, 2.16]; // top surface of each floating shelf
const DESK_TOP = 0.76;

const TRIM = '#ecebe8';
const BRASS = '#b8955a';
const GOLD = '#c9a24e';

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
  if (material.userData?.metric) metricUVs(geometry);
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
const ball = (p, r, m, x, y, z) => add(p, new THREE.SphereGeometry(r, 32, 20), m, x, y, z);
// A shape spun around the vertical axis. Profile points are [radius, height].
function lathe(p, profile, m, x, y, z, seg = 48) {
  const points = profile.map(([r, h]) => new THREE.Vector2(r, h));
  return add(p, new THREE.LatheGeometry(points, seg), m, x, y, z);
}
// A round bar from point a to point b.
function rod(p, a, b, r, m, seg = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = add(p, new THREE.CylinderGeometry(r, r, dir.length(), seg), m, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function group(parent, x, y, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  parent.add(g);
  return g;
}

// Bends a shape around a vertical axis R metres in front of it, like a curved monitor.
function bend(geometry, R) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / R;
    const r = R - p.getZ(i);
    p.setX(i, r * Math.sin(a));
    p.setZ(i, R - r * Math.cos(a));
  }
  geometry.computeVertexNormals();
  return geometry;
}

// An upholstered cushion: a rounded box whose faces bulge outwards like stuffing.
function cushionGeometry(w, h, d, radius, puff) {
  const g = new RoundedBoxGeometry(w, h, d, 6, Math.min(radius, Math.min(w, h, d) * 0.45));
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const fx = 1 - Math.pow((2 * v.x) / w, 2);
    const fy = 1 - Math.pow((2 * v.y) / h, 2);
    const fz = 1 - Math.pow((2 * v.z) / d, 2);
    v.x += Math.sign(v.x) * puff * fy * fz * (w < h && w < d ? 1 : 0.35);
    v.y += Math.sign(v.y) * puff * fx * fz * (h < w && h < d ? 1 : 0.35);
    v.z += Math.sign(v.z) * puff * fx * fy * (d < w && d < h ? 1 : 0.35);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const cushion = (p, w, h, d, m, x, y, z, radius = 0.05, puff = 0.025) =>
  add(p, cushionGeometry(w, h, d, radius, puff), m, x, y, z);

// A gear: teeth around a rim, an axle hole and four lightening holes.
function gearGeometry(teeth, radius, toothDepth, thickness) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  const root = radius - toothDepth;
  const at = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [at(root, a), at(radius, a + step * 0.18), at(radius, a + step * 0.42), at(root, a + step * 0.6)];
    pts.forEach(([x, y], k) => (i === 0 && k === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    shape.absarc(0, 0, root, a + step * 0.6, a + step, false);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.16, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  for (let i = 0; i < 4; i++) {
    const h = new THREE.Path();
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    h.absarc(Math.cos(a) * root * 0.55, Math.sin(a) * root * 0.55, root * 0.2, 0, Math.PI * 2, true);
    shape.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.0015,
    bevelSize: 0.0015,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -thickness / 2);
  return g;
}

// The fabric body of a softbox: four panels tapering from the front to the back.
function softboxGeometry(fw, fh, bw, bh, depth) {
  const f = [[-fw / 2, -fh / 2, 0], [fw / 2, -fh / 2, 0], [fw / 2, fh / 2, 0], [-fw / 2, fh / 2, 0]];
  const b = [[-bw / 2, -bh / 2, -depth], [bw / 2, -bh / 2, -depth], [bw / 2, bh / 2, -depth], [-bw / 2, bh / 2, -depth]];
  const quads = [[f[0], f[1], b[1], b[0]], [f[1], f[2], b[2], b[1]], [f[2], f[3], b[3], b[2]], [f[3], f[0], b[0], b[3]], [b[0], b[1], b[2], b[3]]];
  const pos = [];
  for (const [p0, p1, p2, p3] of quads) pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// A book as a box whose faces read from the book texture: the spine faces +z,
// the page edges show at the top, bottom and back.
function bookGeometry(w, h, d, cell) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const cw = 1 / BOOK_COLUMNS;
  const ch = 1 / BOOK_ROWS;
  const col = cell % BOOK_COLUMNS;
  const row = Math.floor(cell / BOOK_COLUMNS);
  const u0 = col * cw;
  const v0 = 1 - (row + 1) * ch;
  const pagesU = (BOOK_COLUMNS - 1) * cw;
  const pagesV = 1 - BOOK_ROWS * ch;
  for (let face = 0; face < 6; face++) {
    for (let k = 0; k < 4; k++) {
      const i = face * 4 + k;
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (face === 4) uv.setXY(i, u0 + u * cw, v0 + v * ch);
      else if (face < 2) uv.setXY(i, u0 + cw * (0.22 + u * 0.04), v0 + ch * (0.5 + v * 0.04));
      else uv.setXY(i, pagesU + u * cw, pagesV + v * ch);
    }
  }
  return g;
}
const BOOK_CELLS = BOOK_COLUMNS * BOOK_ROWS - 1;

// Collects books and merges them into one mesh, so a pile is a single draw.
function bookPile(parent) {
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  return {
    add(w, h, d, cell, x, y, z, rx = 0, ry = 0, rz = 0) {
      const g = bookGeometry(w, h, d, cell % BOOK_CELLS);
      m.compose(v3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), v3(1, 1, 1));
      g.applyMatrix4(m);
      parts.push(g);
    },
    done() {
      const mesh = new THREE.Mesh(mergeGeometries(parts), M.books);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
  };
}

// A flat surface showing a texture, lit by the room (prints, photos).
function printed(parent, w, h, texture, x, y, z, rough = 0.6) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: rough });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// A display: the picture glows from underneath a matte anti-glare coating.
function displayMaterial(texture, strength) {
  return new THREE.MeshStandardMaterial({
    color: '#050506',
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: strength,
    roughness: 0.35,
    envMapIntensity: 0.25,
  });
}

function pointLight(color, intensity, x, y, z, distance, shadow = false) {
  const light = new THREE.PointLight(color, intensity, distance, 2);
  light.position.set(x, y, z);
  if (shadow) {
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.near = 0.05;
    light.shadow.camera.far = 10;
    light.shadow.bias = -0.003;
    light.shadow.radius = 5;
  }
  LIGHTS.add(light);
  return light;
}

function areaLight(color, intensity, w, h, at, target) {
  const light = new THREE.RectAreaLight(color, intensity, w, h);
  light.position.copy(at);
  light.lookAt(target);
  LIGHTS.add(light);
  return light;
}

// A copy of a scanned model; its materials can be tweaked through `edit`.
function model(id, parent, options, edit) {
  const m = placeModel(A, id, parent, options);
  if (edit) m.traverse((o) => o.isMesh && edit(o));
  return m;
}
const pothos = (parent, x, y, z, scale, rotY = 0) => model('potted_plant_02', parent, { x, y, z, scale, rotY });

// ---------- Room shell ----------

const WIN = { x0: -2.75, x1: -1.15, y0: 0.7, y1: 2.5 };

function buildShell(root) {
  const floor = add(root, new THREE.PlaneGeometry(6, 6), M.floor, 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  box(root, 6.6, 0.3, 6.6, M.black, 0, -0.152, 0);

  // Back wall, with the window opening.
  const t = 0.3;
  const bz = BACK - t / 2;
  box(root, WIN.x0 + 3.3, H, t, M.wall, (-3.3 + WIN.x0) / 2, H / 2, bz);
  box(root, 3.3 - WIN.x1, H, t, M.wall, (WIN.x1 + 3.3) / 2, H / 2, bz);
  box(root, WIN.x1 - WIN.x0, WIN.y0, t, M.wall, (WIN.x0 + WIN.x1) / 2, WIN.y0 / 2, bz);
  box(root, WIN.x1 - WIN.x0, H - WIN.y1, t, M.wall, (WIN.x0 + WIN.x1) / 2, (H + WIN.y1) / 2, bz);
  // Side walls, front wall and ceiling.
  box(root, t, H, 6.6, M.wall, LEFT - t / 2, H / 2, 0);
  box(root, t, H, 6.6, M.wall, RIGHT + t / 2, H / 2, 0);
  box(root, 6.6, H, t, M.wall, 0, H / 2, 3 + t / 2);
  const ceiling = box(root, 6.6, 0.2, 6.6, M.ceiling, 0, H + 0.1, 0);
  ceiling.castShadow = false;

  // Skirting boards.
  const trim = M.paint(TRIM, 0.45);
  rbox(root, 6, 0.09, 0.016, trim, 0, 0.045, BACK + 0.008, 0.005);
  rbox(root, 0.016, 0.09, 6, trim, LEFT + 0.008, 0.045, 0, 0.005);
  rbox(root, 0.016, 0.09, 3.65, trim, RIGHT - 0.008, 0.045, -1.175, 0.005);
  rbox(root, 0.016, 0.09, 0.4, trim, RIGHT - 0.008, 0.045, 2.8, 0.005);
  rbox(root, 6, 0.09, 0.016, trim, 0, 0.045, 3 - 0.008, 0.005);

  // Recessed ceiling lights, switched off.
  const ring = M.paint('#f4f3f1', 0.4);
  const well = M.paint('#9c9a97', 0.6);
  [[0, 0.4], [CX, -1.7], [-1.9, -1.4], [1.6, 1.6], [-1.6, 1.6]].forEach(([x, z]) => {
    cyl(root, 0.06, 0.06, 0.006, ring, x, H - 0.003, z, 32).castShadow = false;
    cyl(root, 0.045, 0.045, 0.004, well, x, H - 0.006, z, 32).castShadow = false;
  });

  // Sockets.
  const plastic = M.paint('#f4f2ee', 0.35);
  const socket = (x, y, z, rotY) => {
    const s = group(root, x, y, z, rotY);
    rbox(s, 0.085, 0.085, 0.01, plastic, 0, 0, 0, 0.006);
    [-0.012, 0.012].forEach((dx) => (cyl(s, 0.0035, 0.0035, 0.004, M.paint('#2a2a2a', 0.6), dx, 0, 0.006, 8).rotation.x = Math.PI / 2));
  };
  socket(-0.4, 0.3, BACK + 0.005, 0);
  socket(LEFT + 0.005, 0.3, 1.5, Math.PI / 2);
}

function buildWindow(root, noAO) {
  const reveal = M.paint('#d3d0cd', 0.9);
  const frame = M.paint('#1a1a1c', 0.45);
  const cx = (WIN.x0 + WIN.x1) / 2;
  const cy = (WIN.y0 + WIN.y1) / 2;
  const w = WIN.x1 - WIN.x0;
  const h = WIN.y1 - WIN.y0;
  // The reveal of the opening through the wall.
  box(root, w, 0.02, 0.3, reveal, cx, WIN.y1 - 0.01, BACK - 0.15);
  box(root, 0.02, h, 0.3, reveal, WIN.x0 + 0.01, cy, BACK - 0.15);
  box(root, 0.02, h, 0.3, reveal, WIN.x1 - 0.01, cy, BACK - 0.15);
  // Slim black frame with one upright, set into the wall.
  const fz = BACK - 0.18;
  rbox(root, w, 0.05, 0.06, frame, cx, WIN.y1 - 0.045, fz, 0.004);
  rbox(root, w, 0.06, 0.06, frame, cx, WIN.y0 + 0.05, fz, 0.004);
  rbox(root, 0.05, h, 0.06, frame, WIN.x0 + 0.045, cy, fz, 0.004);
  rbox(root, 0.05, h, 0.06, frame, WIN.x1 - 0.045, cy, fz, 0.004);
  rbox(root, 0.04, h, 0.06, frame, cx, cy, fz, 0.004);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.glass);
  glass.position.set(cx, cy, fz);
  root.add(glass);
  noAO.push(glass);
  // Stone sill.
  rbox(root, w + 0.12, 0.03, 0.36, M.paint('#d9d6d1', 0.6), cx, WIN.y0 - 0.005, BACK - 0.14, 0.006);

  // Curtain rod and a heavy grey curtain gathered to the left.
  const iron = M.metal('#1e1e20', 0.45);
  const rod1 = cyl(root, 0.011, 0.011, 2.2, iron, -1.9, 2.66, BACK + 0.1, 12);
  rod1.rotation.z = Math.PI / 2;
  ball(root, 0.022, iron, -3.0 + 0.03, 2.66, BACK + 0.1);
  ball(root, 0.022, iron, -0.8, 2.66, BACK + 0.1);
  const width = 0.5;
  const height = 2.62;
  const g = new THREE.PlaneGeometry(width, height, 70, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / width + 0.5;
    const v = p.getY(i) / height + 0.5;
    const pleat = Math.sin(u * Math.PI * 11) * (0.045 + 0.01 * (1 - v));
    p.setZ(i, pleat + Math.sin(u * 5.1 + v * 1.3) * 0.015 * (1 - v));
    p.setX(i, p.getX(i) * (0.9 + 0.1 * v));
  }
  g.computeVertexNormals();
  add(root, g, M.linen('#8e8f94', THREE.DoubleSide), -2.72, height / 2 + 0.02, BACK + 0.12);

  // A tall money tree in a white pot in front of the window.
  const pot = group(root, -1.85, 0, -2.45);
  lathe(pot, [[0, 0], [0.15, 0], [0.18, 0.04], [0.2, 0.34], [0.205, 0.36], [0.19, 0.36], [0.185, 0.33], [0.18, 0.28], [0, 0.28]], M.ceramic('#efeeea'), 0, 0, 0, 48);
  cyl(pot, 0.182, 0.182, 0.01, M.paint('#2b231d', 1), 0, 0.315, 0, 32).castShadow = false;
  const tree = new THREE.Group();
  tree.position.set(0, 0.32, 0);
  tree.rotation.y = 0.6;
  pot.add(tree);
  A.models.pachira_aquatica_01.traverse((o) => {
    if (o.isMesh && /_d$/.test(o.name)) {
      const part = o.clone();
      part.position.set(0, 0, 0);
      tree.add(part);
    }
  });
}

// ---------- Slat wall, shelves and what is on them ----------

function buildSlatWall(root, noAO) {
  const width = SLATS.x1 - SLATS.x0;
  // Black felt behind the slats.
  box(root, width, SLATS.top, 0.012, M.paint('#121110', 1), CX, SLATS.top / 2, BACK + 0.006);
  // Wooden slats, merged into one mesh.
  const pitch = 0.04;
  const count = Math.floor(width / pitch);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.BoxGeometry(0.026, SLATS.top, 0.022);
    metricUVs(g);
    g.translate(SLATS.x0 + pitch / 2 + i * pitch, SLATS.top / 2, BACK + 0.012 + 0.011);
    parts.push(g);
  }
  const slats = new THREE.Mesh(mergeGeometries(parts), M.walnut('#e6cdb8', 0.8));
  slats.castShadow = true;
  slats.receiveShadow = true;
  root.add(slats);

  // Two floating shelves with warm LED strips underneath.
  const shelfMat = M.paint('#1b1a19', 0.55);
  const front = BACK + 0.034 + 0.24;
  const glow = M.glow('#ffb36b', 7);
  for (const top of SHELVES) {
    rbox(root, 2.5, 0.035, 0.24, shelfMat, CX, top - 0.0175, BACK + 0.034 + 0.12, 0.004);
    const strip = add(root, new THREE.BoxGeometry(2.44, 0.004, 0.012), glow, CX, top - 0.037, front - 0.03);
    strip.castShadow = false;
    noAO.push(strip);
    // The strip washes the slats below it with light.
    areaLight('#ffa457', 38, 2.42, 0.03, v3(CX, top - 0.04, front - 0.05), v3(CX, top - 1.2, BACK + 0.05));
  }
  // A soft wash from the ceiling along the wall, so the top shelf is not in the dark.
  areaLight('#ffd9b0', 3, 2.4, 0.15, v3(CX, H - 0.02, BACK + 0.45), v3(CX, SHELVES[1], BACK));

  // Upper shelf: a globe, brass gears, a small glowing light, books and a speaker.
  const s2 = SHELVES[1];
  const globe = group(root, CX - 0.88, s2, BACK + 0.16);
  lathe(globe, [[0, 0], [0.06, 0], [0.058, 0.008], [0.012, 0.016], [0.009, 0.06], [0, 0.06]], M.metal(GOLD, 0.3), 0, 0, 0, 32);
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.155, 0);
  tilt.rotation.z = 0.41;
  globe.add(tilt);
  const earth = add(tilt, new THREE.SphereGeometry(0.085, 48, 32), new THREE.MeshStandardMaterial({ map: tex.globeTexture(), roughness: 0.45 }), 0, 0, 0);
  earth.rotation.y = 2.2;
  add(tilt, new THREE.TorusGeometry(0.095, 0.0028, 8, 64, Math.PI * 1.25), M.metal(GOLD, 0.3), 0, 0, 0).rotation.z = -Math.PI * 0.62;

  const gold = M.metal(GOLD, 0.32);
  const big = add(root, gearGeometry(14, 0.085, 0.016, 0.018), gold, CX - 0.38, s2 + 0.088, BACK + 0.15);
  big.rotation.z = 0.1;
  const small = add(root, gearGeometry(10, 0.05, 0.012, 0.016), M.metal('#a7a39c', 0.3), CX - 0.27, s2 + 0.052, BACK + 0.18);
  small.rotation.z = 0.3;

  const light = group(root, CX + 0.15, s2, BACK + 0.15);
  rbox(light, 0.06, 0.012, 0.04, M.paint('#d8d6d2', 0.4), 0, 0.006, 0, 0.004);
  const panel = new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: tex.glowPanel(), emissiveIntensity: 2.2 });
  rbox(light, 0.05, 0.16, 0.022, panel, 0, 0.092, 0, 0.008).castShadow = false;
  pointLight('#ff7fd1', 0.35, CX + 0.15, s2 + 0.1, BACK + 0.24, 1.2);

  const books = bookPile(root);
  [[0.035, 0.28, 0.21, 3, 0], [0.03, 0.25, 0.19, 9, 0.12], [0.032, 0.27, 0.2, 21, -0.08], [0.028, 0.23, 0.17, 14, 0.2]].reduce((y, [w, h, d, cell, ry]) => {
    books.add(w, h, d, cell, CX + 0.72, y + w / 2, BACK + 0.15, 0, ry, Math.PI / 2);
    return y + w;
  }, s2);

  const speaker = group(root, CX + 1.06, s2, BACK + 0.14, -0.15);
  rbox(speaker, 0.13, 0.21, 0.15, M.paint('#141414', 0.6), 0, 0.105, 0, 0.008);
  cyl(speaker, 0.045, 0.045, 0.004, M.paint('#262626', 0.4), 0, 0.075, 0.076, 32).rotation.x = Math.PI / 2;
  cyl(speaker, 0.03, 0.018, 0.012, M.paint('#0d0d0d', 0.7), 0, 0.075, 0.072, 32).rotation.x = Math.PI / 2;
  cyl(speaker, 0.016, 0.016, 0.004, M.metal('#555555', 0.4), 0, 0.16, 0.076, 24).rotation.x = Math.PI / 2;

  // Lower shelf: a trailing plant, books, a framed print, headphones and a small vase.
  const s1 = SHELVES[0];
  pothos(root, CX - 1.03, s1, BACK + 0.15, 0.42, 0.8);
  const standing = bookPile(root);
  [[0.032, 0.24, 0.17, 1], [0.028, 0.22, 0.16, 6], [0.036, 0.26, 0.18, 11]].reduce((x, [w, h, d, cell]) => {
    standing.add(w, h, d, cell, x + w / 2, s1 + h / 2, BACK + 0.15);
    return x + w + 0.002;
  }, CX - 0.68);
  standing.done();
  books.done();
  const print = tex.orangePrint();
  print.flipY = false;
  // The frame model faces +x; turn it to face the room. Its glass reads its opacity
  // from a JPEG (no alpha), so it would cover the print; use clear glass instead.
  model('standing_picture_frame_01', root, { x: CX - 0.1, y: s1, z: BACK + 0.15, rotY: -Math.PI / 2 + 0.1 }, (o) => {
    if (o.material.name === 'standing_picture_frame_01_artwork') {
      o.material = o.material.clone();
      o.material.map = print;
    } else if (o.material.name === 'standing_picture_frame_01_glass') {
      o.material = M.glass;
      o.castShadow = false;
    }
  });

  // Headphones on a stand.
  const hp = group(root, CX + 0.45, s1, BACK + 0.15);
  const dark = M.paint('#232624', 0.5);
  cyl(hp, 0.05, 0.055, 0.012, dark, 0, 0.006, 0, 32);
  cyl(hp, 0.007, 0.007, 0.2, M.metal('#3a3a3c', 0.35), 0, 0.11, 0, 12);
  add(hp, new THREE.TorusGeometry(0.075, 0.009, 10, 32, Math.PI), dark, 0, 0.17, 0);
  [-1, 1].forEach((s) => {
    const cup = cyl(hp, 0.038, 0.038, 0.03, M.paint('#3e4b40', 0.55), s * 0.075, 0.15, 0, 32);
    cup.rotation.z = Math.PI / 2;
    const pad = cyl(hp, 0.034, 0.034, 0.014, M.paint('#1a1a1a', 0.9), s * 0.056, 0.15, 0, 32);
    pad.rotation.z = Math.PI / 2;
  });

  model('ceramic_vase_01', root, { x: CX + 0.98, y: s1, z: BACK + 0.15, scale: 0.4 });
}

// ---------- Desk ----------

// A low-profile keyboard with real keycaps, drawn as one instanced mesh.
function keyboard(parent, x, y, z) {
  const k = group(parent, x, y, z);
  const U = 0.019;
  const rows = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, 1],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25, 1],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.75, 1, 1],
    [1.25, 1.25, 1.25, 6.25, 1, 1, 1, 1, 1, 1],
  ];
  const width = 16 * U;
  const depth = rows.length * U;
  rbox(k, width + 0.016, 0.012, depth + 0.016, M.metal('#2a2a2d', 0.4), 0, 0.006, 0, 0.005);
  const caps = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 2, 0.12), M.paint('#ffffff', 0.6), rows.flat().length);
  caps.castShadow = true;
  caps.receiveShadow = true;
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  let i = 0;
  rows.forEach((row, ri) => {
    let cx = -width / 2;
    row.forEach((units, ci) => {
      const w = units * U - 0.0028;
      const accent = ri === 0 && ci === 0;
      m.makeRotationX((ri - 2.5) * 0.03);
      m.scale(v3(w, 0.006, U - 0.0028));
      m.setPosition(cx + (units * U) / 2, 0.015, -depth / 2 + ri * U + U / 2);
      caps.setMatrixAt(i, m);
      caps.setColorAt(i, color.set(accent ? '#c9873a' : '#2f2f33'));
      cx += units * U;
      i++;
    });
  });
  k.add(caps);
  return k;
}

function buildDesk(root, station, profile, noAO) {
  const g = group(root, CX, 0, BACK + 0.4);
  const black = M.paint('#19191b', 0.4);
  const alu = M.metal('#b9b8b6', 0.3);
  // Dark walnut top on a black standing-desk frame.
  rbox(g, 1.8, 0.035, 0.72, M.walnut('#6b5a50', 0.75), 0, DESK_TOP - 0.0175, 0, 0.006);
  [-0.78, 0.78].forEach((x) => {
    rbox(g, 0.07, DESK_TOP - 0.08, 0.05, black, x, (DESK_TOP - 0.08) / 2 + 0.03, -0.05, 0.006);
    rbox(g, 0.07, 0.03, 0.66, black, x, 0.015, -0.03, 0.006);
  });
  rbox(g, 1.5, 0.05, 0.05, black, 0, DESK_TOP - 0.06, -0.05, 0.006);

  // Curved ultrawide monitor.
  const R = 1.8;
  const mon = group(g, 0, DESK_TOP, -0.2);
  rbox(mon, 0.34, 0.01, 0.2, black, 0, 0.005, -0.03, 0.004);
  rbox(mon, 0.06, 0.3, 0.025, black, 0, 0.16, -0.1, 0.006);
  const head = group(mon, 0, 0.31, 0);
  add(head, bend(new THREE.BoxGeometry(1.18, 0.37, 0.03, 64, 1, 1), R), M.paint('#1c1c1f', 0.45), 0, 0, -0.016);
  const desktop = tex.desktopScreen(station, profile);
  const screen = new THREE.Mesh(bend(new THREE.PlaneGeometry(1.15, 0.34, 64, 1), R), displayMaterial(desktop.texture, 1.5));
  head.add(screen);
  rbox(head, 0.08, 0.1, 0.05, black, 0, 0, -0.05, 0.01);
  areaLight('#9d8cff', 2.2, 1.12, 0.32, v3(CX, DESK_TOP + 0.31, BACK + 0.21), v3(CX, DESK_TOP + 0.2, 0));

  // Camera clipped on top of the monitor.
  const cam = group(mon, 0, 0.51, -0.02);
  rbox(cam, 0.11, 0.065, 0.055, M.paint('#151517', 0.5), 0, 0.03, 0, 0.008);
  const lens = cyl(cam, 0.025, 0.027, 0.045, M.paint('#0c0c0d', 0.3), 0, 0.03, 0.045, 32);
  lens.rotation.x = Math.PI / 2;
  cyl(cam, 0.018, 0.018, 0.002, M.metal('#20252e', 0.05), 0, 0.03, 0.068, 32).rotation.x = Math.PI / 2;
  const tally = ball(cam, 0.004, M.glow('#ff3b30', 4), 0.04, 0.05, 0.028);
  tally.castShadow = false;
  rbox(cam, 0.06, 0.012, 0.06, black, 0, -0.008, -0.01, 0.003);

  // Microphone on a boom arm, clamped to the back edge.
  const mic = M.paint('#141416', 0.45);
  const a0 = v3(-0.72, DESK_TOP, -0.32);
  const a1 = v3(-0.72, DESK_TOP + 0.2, -0.32);
  const a2 = v3(-0.62, DESK_TOP + 0.55, -0.12);
  const a3 = v3(-0.44, DESK_TOP + 0.36, 0.14);
  rbox(g, 0.05, 0.08, 0.06, mic, a0.x, DESK_TOP - 0.02, a0.z, 0.006);
  rod(g, a0, a1, 0.009, mic);
  rod(g, a1, a2, 0.008, mic);
  rod(g, a2, a3, 0.008, mic);
  ball(g, 0.014, mic, a1.x, a1.y, a1.z);
  ball(g, 0.014, mic, a2.x, a2.y, a2.z);
  const micBody = group(g, a3.x, a3.y - 0.04, a3.z);
  micBody.lookAt(new THREE.Vector3(-0.25, DESK_TOP + 0.3, 0.6).add(g.position));
  micBody.rotateX(Math.PI / 2);
  cyl(micBody, 0.027, 0.024, 0.16, mic, 0, 0, 0, 32);
  cyl(micBody, 0.028, 0.028, 0.05, M.metal('#2c2c2e', 0.6), 0, 0.07, 0, 32);
  add(micBody, new THREE.TorusGeometry(0.04, 0.004, 8, 32), mic, 0, -0.01, 0).rotation.x = Math.PI / 2;

  // Laptop on the right, turned towards the chair.
  const lap = group(g, 0.66, DESK_TOP, 0.1, -0.35);
  rbox(lap, 0.31, 0.012, 0.215, alu, 0, 0.006, 0, 0.006);
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.1), M.paint('#2a2a2e', 0.7));
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, 0.0125, -0.03);
  lap.add(keys);
  const hinge = group(lap, 0, 0.012, -0.105);
  hinge.rotation.x = -1.92;
  rbox(hinge, 0.31, 0.006, 0.21, alu, 0, 0.003, 0.105, 0.004);
  const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.29, 0.185), displayMaterial(tex.laptopScreen(), 1.2));
  lapScreen.rotation.x = Math.PI / 2;
  lapScreen.position.set(0, -0.0005, 0.105);
  hinge.add(lapScreen);

  // Desk mat, keyboard, mouse, a mug and a notepad.
  rbox(g, 0.9, 0.003, 0.36, M.wool('#2c2d30'), -0.02, DESK_TOP + 0.0015, 0.13, 0.0015, 1).castShadow = false;
  keyboard(g, -0.06, DESK_TOP + 0.003, 0.14);
  const mouse = add(g, new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.paint('#d8d6d2', 0.45), 0.3, DESK_TOP + 0.003, 0.15);
  mouse.scale.set(0.031, 0.02, 0.055);
  const mugMat = M.ceramic('#f2f1ee');
  lathe(g, [[0, 0], [0.036, 0], [0.042, 0.004], [0.043, 0.095], [0.039, 0.095], [0.037, 0.01], [0, 0.01]], mugMat, -0.56, DESK_TOP, 0.14, 32);
  add(g, new THREE.TorusGeometry(0.026, 0.006, 10, 24), mugMat, -0.51, DESK_TOP + 0.05, 0.14);
  cyl(g, 0.037, 0.037, 0.003, M.paint('#2c1a10', 0.15), -0.56, DESK_TOP + 0.08, 0.14, 24).castShadow = false;
  const pad = group(g, -0.34, DESK_TOP, 0.17, 0.18);
  rbox(pad, 0.15, 0.008, 0.21, M.paint('#f3f1ec', 0.85), 0, 0.004, 0, 0.002);
  const pen = cyl(pad, 0.004, 0.004, 0.14, M.paint('#1d1d1f', 0.4), 0.05, 0.012, 0, 10);
  pen.rotation.set(Math.PI / 2, 0, 0.1);

  // Office chair, pushed back to the left of the desk and turned towards the window.
  const c = group(root, 0.15, 0, BACK + 1.25, 1.1);
  const plastic = M.paint('#232326', 0.5);
  const seat = M.wool('#a8a6a2');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = rbox(c, 0.3, 0.03, 0.045, alu, Math.cos(a) * 0.15, 0.09, Math.sin(a) * 0.15, 0.01, 2);
    spoke.rotation.y = -a;
    const caster = cyl(c, 0.026, 0.026, 0.022, plastic, Math.cos(a) * 0.3, 0.026, Math.sin(a) * 0.3, 16);
    caster.rotation.set(Math.PI / 2, 0, -a);
    cyl(c, 0.008, 0.008, 0.04, plastic, Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3, 8);
  }
  cyl(c, 0.032, 0.032, 0.04, plastic, 0, 0.1, 0, 20);
  cyl(c, 0.022, 0.022, 0.3, M.metal('#c9c9cb', 0.2), 0, 0.27, 0, 20);
  rbox(c, 0.32, 0.04, 0.3, plastic, 0, 0.44, 0, 0.012, 2);
  cushion(c, 0.5, 0.08, 0.5, seat, 0, 0.5, 0, 0.035, 0.018);
  const spine = rbox(c, 0.06, 0.46, 0.03, plastic, 0, 0.7, 0.27, 0.012, 2);
  spine.rotation.x = 0.1;
  const back = cushion(c, 0.47, 0.66, 0.07, seat, 0, 1.08, 0.32, 0.04, 0.02);
  back.rotation.x = 0.1;
  [-0.27, 0.27].forEach((x) => {
    rbox(c, 0.03, 0.2, 0.03, plastic, x, 0.58, 0.05, 0.008, 2);
    rbox(c, 0.07, 0.025, 0.26, plastic, x, 0.69, 0.02, 0.01, 2);
  });

  // Light grey rug under the chair.
  const rug = box(root, 2.6, 0.008, 1.9, M.wool('#c9c6c1'), CX - 0.3, 0.004, BACK + 1.45);
  rug.castShadow = false;
  noAO.push(rug);

  return desktop;
}

// ---------- The plaque between the window and the slats ----------

function buildPlaque(root, profile) {
  const p = group(root, -0.62, 1.62, BACK + 0.024);
  rbox(p, 0.44, 0.58, 0.045, M.paint('#111113', 0.5), 0, 0, 0, 0.006);
  box(p, 0.39, 0.53, 0.004, M.paint('#1c1c1f', 0.95), 0, 0, 0.0215);
  const logo = rbox(p, 0.17, 0.17, 0.018, M.metal('#c9cace', 0.28), 0, 0.06, 0.031, 0.02);
  logo.castShadow = true;
  printed(p, 0.15, 0.15, tex.plaqueLogo(), 0, 0.06, 0.0405, 0.3);
  rbox(p, 0.16, 0.035, 0.004, M.metal('#bdbec2', 0.3), 0, -0.15, 0.025, 0.002);
  printed(p, 0.155, 0.03, tex.nameplate(profile), 0, -0.15, 0.0275, 0.3);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.41, 0.55), M.glass);
  glass.position.set(0, 0, 0.0455);
  p.add(glass);
}

// ---------- Right side: softbox, globe lamp, photo ledge, door ----------

function buildRightSide(root) {
  const black = M.paint('#161618', 0.5);
  const metal = M.metal('#2a2a2c', 0.4);

  // Softbox on a tripod, aimed at the desk chair.
  const base = v3(2.1, 0, -1.65);
  const head = v3(2.1, 1.78, -1.65);
  const aim = v3(CX - 0.6, 1.1, BACK + 0.9);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const foot = v3(base.x + Math.cos(a) * 0.48, 0.01, base.z + Math.sin(a) * 0.48);
    rod(root, v3(base.x, 0.62, base.z), foot, 0.008, metal);
    rod(root, v3(base.x, 0.42, base.z), v3(base.x + Math.cos(a) * 0.2, 0.34, base.z + Math.sin(a) * 0.2), 0.005, metal);
  }
  rod(root, v3(base.x, 0.3, base.z), head, 0.013, metal);
  const box1 = new THREE.Group();
  box1.position.copy(head).add(v3(0, 0.1, 0));
  root.add(box1);
  box1.lookAt(aim);
  add(box1, softboxGeometry(0.62, 0.82, 0.16, 0.16, 0.36), M.paint('#111112', 0.85), 0, 0, 0);
  const diffuser = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.8),
    new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#fff6ec', emissiveIntensity: 1.5 })
  );
  diffuser.position.z = 0.002;
  box1.add(diffuser);
  cyl(box1, 0.06, 0.06, 0.05, black, 0, 0, -0.38, 24).rotation.x = Math.PI / 2;
  const at = diffuser.getWorldPosition(new THREE.Vector3());
  areaLight('#fff1e2', 2.5, 0.6, 0.8, at, aim);
  const key = new THREE.SpotLight('#fff1e2', 4, 9, 0.75, 1, 2);
  key.position.copy(at);
  key.target.position.copy(aim);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 0.2;
  key.shadow.bias = -0.002;
  key.shadow.radius = 8;
  LIGHTS.add(key, key.target);

  // Globe floor lamp in the corner.
  const lampX = 2.68;
  const lampZ = -2.55;
  cyl(root, 0.14, 0.15, 0.02, black, lampX, 0.01, lampZ, 40);
  cyl(root, 0.009, 0.009, 1.42, M.metal(BRASS, 0.3), lampX, 0.73, lampZ, 12);
  const globe = ball(root, 0.16, new THREE.MeshStandardMaterial({ color: '#fff7ee', emissive: '#ffe2bf', emissiveIntensity: 1.25, roughness: 0.4 }), lampX, 1.6, lampZ);
  globe.castShadow = false;
  pointLight('#ffcf98', 2.6, lampX, 1.6, lampZ, 6, true);

  // Photo ledge: framed prints leaning against the wall.
  const ledgeZ = 0.25;
  rbox(root, 0.1, 0.025, 1.7, M.oak('#ffffff', 0.85), RIGHT - 0.05, 1.3, ledgeZ, 0.004);
  rbox(root, 0.012, 0.03, 1.7, M.oak('#ffffff', 0.85), RIGHT - 0.098, 1.322, ledgeZ, 0.003);
  const frames = [
    [0.36, 0.46, -0.58, 'photo-0', '#141416'],
    [0.44, 0.34, -0.15, 'photo-1', 'oak'],
    [0.32, 0.32, 0.25, 'photo-2', '#141416'],
    [0.34, 0.44, 0.62, 'photo-3', 'oak'],
  ];
  frames.forEach(([w, h, z, photo, finish], i) => {
    const f = group(root, RIGHT - 0.06, 1.3125 + h / 2, ledgeZ + z);
    f.rotation.order = 'YXZ';
    f.rotation.y = -Math.PI / 2;
    f.rotation.x = -0.07 - i * 0.01;
    rbox(f, w, h, 0.022, finish === 'oak' ? M.oak('#ffffff', 0.8) : M.paint(finish, 0.45), 0, 0, 0, 0.003);
    box(f, w - 0.03, h - 0.03, 0.002, M.paint('#f2f0ec', 0.9), 0, 0, 0.011);
    const side = Math.min(w, h) - 0.1;
    printed(f, side, side, M.photos[photo], 0, 0, 0.0125, 0.5);
  });

  // Door near the front of the right wall.
  const trim = M.paint(TRIM, 0.4);
  const doorPaint = M.paint('#3a3a3d', 0.4);
  const brass = M.metal(BRASS, 0.3);
  const dz = 2.1;
  rbox(root, 0.03, 2.16, 0.07, trim, RIGHT - 0.015, 1.08, dz - 0.5, 0.005);
  rbox(root, 0.03, 2.16, 0.07, trim, RIGHT - 0.015, 1.08, dz + 0.5, 0.005);
  rbox(root, 0.03, 0.07, 1.07, trim, RIGHT - 0.015, 2.16, dz, 0.005);
  rbox(root, 0.04, 2.12, 0.93, doorPaint, RIGHT - 0.01, 1.06, dz, 0.004);
  cyl(root, 0.025, 0.025, 0.012, brass, RIGHT - 0.035, 1.02, dz - 0.36, 24).rotation.z = Math.PI / 2;
  cyl(root, 0.008, 0.008, 0.11, brass, RIGHT - 0.055, 1.02, dz - 0.31, 12).rotation.x = Math.PI / 2;
  const sw = group(root, RIGHT - 0.005, 1.1, dz - 0.7, -Math.PI / 2);
  rbox(sw, 0.085, 0.085, 0.01, M.paint('#f4f2ee', 0.35), 0, 0, 0, 0.006);
}

// ---------- Left side: sideboard, lamp, lounge chair ----------

function buildLeftSide(root) {
  const g = group(root, LEFT + 0.27, 0, 0.35, Math.PI / 2);
  model('modern_wooden_cabinet', g, { scale: [0.75, 1, 1] });
  const top = 0.68;
  // Record player.
  const rp = group(g, -0.45, top, 0.0);
  rbox(rp, 0.42, 0.06, 0.34, M.walnut('#8d7f75', 0.6), 0, 0.03, 0, 0.008);
  cyl(rp, 0.15, 0.15, 0.012, M.metal('#9a9a9c', 0.35), -0.04, 0.069, 0, 48);
  cyl(rp, 0.145, 0.145, 0.004, M.paint('#0d0d0f', 0.32), -0.04, 0.077, 0, 48);
  cyl(rp, 0.045, 0.045, 0.005, M.paint('#a85c43', 0.6), -0.04, 0.078, 0, 32);
  const arm = cyl(rp, 0.004, 0.004, 0.22, M.metal('#c0c0c2', 0.3), 0.1, 0.098, 0.02, 10);
  arm.rotation.set(Math.PI / 2, 0, 0.45);
  model('ceramic_vase_02', g, { x: 0.15, y: top, z: 0.02, scale: 0.7 });
  // Table lamp.
  lathe(g, [[0, 0], [0.06, 0], [0.085, 0.07], [0.07, 0.16], [0.025, 0.24], [0.015, 0.3], [0, 0.3]], M.ceramic('#d9d4cc'), 0.6, top, 0, 48);
  const shade = new THREE.MeshStandardMaterial({
    color: '#e8e1d4',
    emissive: '#ffb873',
    emissiveIntensity: 1.1,
    roughness: 1,
    side: THREE.DoubleSide,
    normalMap: A.surfaces.linen.nor_gl,
  });
  add(g, new THREE.CylinderGeometry(0.1, 0.15, 0.19, 48, 1, true), shade, 0.6, top + 0.38, 0);
  pointLight('#ffb36b', 1.6, LEFT + 0.27, top + 0.38, 0.35 - 0.6, 3.5);

  // Two prints above it.
  const a1 = group(root, LEFT + 0.013, 1.55, 0.05, Math.PI / 2);
  rbox(a1, 0.42, 0.52, 0.026, M.oak('#ffffff', 0.8), 0, 0, 0, 0.004);
  printed(a1, 0.36, 0.46, tex.artPrint(0), 0, 0, 0.0135, 0.8);
  const a2 = group(root, LEFT + 0.013, 1.55, 0.6, Math.PI / 2);
  rbox(a2, 0.42, 0.52, 0.026, M.paint('#1c1b20', 0.4), 0, 0, 0, 0.004);
  printed(a2, 0.36, 0.46, tex.artPrint(1), 0, 0, 0.0135, 0.8);

  // Lounge chair and a large plant towards the front.
  model('mid_century_lounge_chair', root, { x: -2.15, z: 1.75, rotY: 2.45, scale: 0.9 });
  pothos(root, -2.55, 0, 2.55, 1.3, 0.4);
}

function buildDust(root) {
  const count = 120;
  const positions = new Float32Array(count * 3);
  const r = rng(5);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = -2.6 + r() * 5.2;
    positions[i * 3 + 1] = 0.3 + r() * 2.3;
    positions[i * 3 + 2] = -2.7 + r() * 3.4;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      map: M.dot,
      color: new THREE.Color(1.6, 1.5, 1.7),
      size: 0.01,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  root.add(points);
  return points;
}

function buildLights() {
  RectAreaLightUniformsLib.init();
  // Cool evening light from the window.
  const cx = (WIN.x0 + WIN.x1) / 2;
  areaLight('#b6a5dc', 2.4, WIN.x1 - WIN.x0, WIN.y1 - WIN.y0, v3(cx, (WIN.y0 + WIN.y1) / 2, BACK - 0.05), v3(cx, 1.0, 1));
  // A base level of bounced light; mostly replaced by the baked room light.
  const bounce = new THREE.HemisphereLight('#8a86ad', '#3a2e28', 0.25);
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
    make('desk', 1.9, 0.8, 0.8, CX, 1.05, BACK + 0.4),
    make('shelf', 2.5, 0.75, 0.35, CX, 2.0, BACK + 0.17),
    make('frame', 0.5, 0.65, 0.2, -0.62, 1.62, BACK + 0.05),
    make('photos', 0.3, 0.6, 1.8, RIGHT - 0.15, 1.55, 0.25),
  ];
}

// Where you stand and what you look at for each station, and where its marker floats.
export const home = {
  pos: v3(0, 1.6, 0.6),
  target: v3(0.15, 1.38, BACK),
};

export const views = {
  desk: {
    pos: v3(CX, 1.28, -1.2),
    target: v3(CX, 1.02, BACK),
    anchor: v3(CX, 1.42, BACK + 0.2),
  },
  shelf: {
    pos: v3(CX, 1.9, -0.8),
    target: v3(CX, 1.92, BACK),
    anchor: v3(CX, 2.52, BACK + 0.15),
  },
  frame: {
    pos: v3(-0.62, 1.62, -1.65),
    target: v3(-0.62, 1.62, BACK),
    anchor: v3(-0.62, 1.98, BACK + 0.05),
  },
  photos: {
    pos: v3(1.15, 1.58, -0.2),
    target: v3(RIGHT, 1.52, -0.2),
    anchor: v3(RIGHT - 0.1, 1.9, 0.25),
  },
};

export function buildRoom(scene, assets, stations, profile) {
  A = assets;
  M = createMaterials(assets);
  LIGHTS = scene;
  const root = new THREE.Group();
  scene.add(root);
  const noAO = [];

  buildShell(root);
  buildWindow(root, noAO);
  buildSlatWall(root, noAO);
  const desktop = buildDesk(root, stations.desk, profile, noAO);
  buildPlaque(root, profile);
  buildRightSide(root);
  buildLeftSide(root);
  const dust = buildDust(root);
  noAO.push(dust);
  const { bounce } = buildLights();
  const hitboxes = buildHitboxes(root);
  hitboxes.forEach((h) => noAO.push(h));

  const dustBase = dust.geometry.attributes.position.array.slice();

  function update(time) {
    desktop.tick();
    const p = dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.array[i * 3] = dustBase[i * 3] + Math.sin(time * 0.1 + i) * 0.12;
      p.array[i * 3 + 1] = 0.3 + ((dustBase[i * 3 + 1] - 0.3 + time * 0.015) % 2.3);
    }
    p.needsUpdate = true;
  }

  return { root, update, hitboxes, noAO, bounce };
}
