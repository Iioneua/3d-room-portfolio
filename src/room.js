import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as tex from './textures.js';
import { createMaterials, metricUVs, BOOK_COLUMNS, BOOK_ROWS } from './materials.js';
import { placeModel } from './assets.js';

// The room. Units are metres. The floor is 8 x 8, centred on the origin, with the
// window in the -x wall, the desk against the -z wall and the door in the +x wall.
// Scanned models (plants, lounge chair, lamps, sideboard, vases, books) come from
// assets.js; everything else is built here from simple shapes.

let M; // materials
let A; // loaded assets
let LIGHTS; // lights live outside the room group so hiding the room never changes them

const TRIM = '#f1ede6';
const BRASS = '#b8955a';
const SAGE = '#7f8f80';
const MUSTARD = '#c08a36';
const CLAY = '#a85c43';
const LINEN = '#e6dccb';
const CREAM = '#ece4d6';
const INK = '#26252b';

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
const ball = (p, r, m, x, y, z) => add(p, new THREE.SphereGeometry(r, 28, 18), m, x, y, z);
// A shape spun around the vertical axis. Profile points are [radius, height].
function lathe(p, profile, m, x, y, z, seg = 48) {
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

// An upholstered cushion: a rounded box whose faces bulge outwards like stuffing.
// `puff` is how far the middle of each face swells, in metres.
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

// A throw pillow: thick in the middle, pinched to a seam at the edges.
function pillowGeometry(w, h, thickness) {
  const g = new THREE.SphereGeometry(1, 40, 28);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // Push the sphere towards a square, then flatten it.
    const sx = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.55);
    const sy = Math.sign(v.y) * Math.pow(Math.abs(v.y), 0.55);
    const edge = (1 - sx * sx * 0.85) * (1 - sy * sy * 0.85);
    p.setXYZ(i, (sx * w) / 2, (sy * h) / 2, v.z * (thickness / 2) * Math.max(edge, 0.08));
  }
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

// Collects books and merges them into one mesh, so a full shelf is a single draw.
function bookPile(parent) {
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  return {
    add(w, h, d, cell, x, y, z, rx = 0, ry = 0, rz = 0) {
      const g = bookGeometry(w, h, d, cell % BOOK_CELLS);
      m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
      g.applyMatrix4(m);
      parts.push(g);
    },
    done() {
      if (!parts.length) return null;
      const mesh = new THREE.Mesh(mergeGeometries(parts), M.books);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
  };
}

// A flat surface showing a canvas texture, lit by the room (prints, photos).
function printed(parent, w, h, texture, x, y, z, rough = 0.6) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: rough });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// A monitor panel: content glows from underneath a slightly glossy coating.
function screen(parent, w, h, texture, x, y, z) {
  const material = new THREE.MeshStandardMaterial({
    color: '#050506',
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: 1.55,
    roughness: 0.32,
    metalness: 0,
    // Anti-glare coating: reflections are faint.
    envMapIntensity: 0.25,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z);
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
    light.shadow.radius = 6;
  }
  LIGHTS.add(light);
  return light;
}

function legs(parent, positions, height, top = 0.022, bottom = 0.014, material = M.walnut('#9a8f86')) {
  positions.forEach(([x, z]) => cyl(parent, top, bottom, height, material, x, height / 2, z, 16));
}

// A copy of a scanned model; its materials can be tweaked through `edit`.
function model(id, parent, options, edit) {
  const m = placeModel(A, id, parent, options);
  if (edit) m.traverse((o) => o.isMesh && edit(o));
  return m;
}

// Small pothos or succulent, scaled to fit.
const pothos = (parent, x, y, z, scale, rotY = 0) => model('potted_plant_02', parent, { x, y, z, scale, rotY });
const succulent = (parent, x, y, z, scale, rotY = 0) => model('potted_plant_04', parent, { x, y, z, scale, rotY });

// ---------- Room shell ----------

function buildShell(root) {
  const floorGeometry = new THREE.PlaneGeometry(8, 8);
  const floor = add(root, floorGeometry, M.floor, 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  box(root, 8.6, 0.3, 8.6, M.black, 0, -0.152, 0);

  box(root, 8.3, 3.8, 0.3, M.wall, -0.15, 1.9, -4.15);
  box(root, 0.3, 1.15, 2.4, M.wall, -4.15, 0.575, -1.7);
  box(root, 0.3, 0.85, 2.4, M.wall, -4.15, 3.375, -1.7);
  box(root, 0.3, 3.8, 4.5, M.wall, -4.15, 1.9, 1.75);
  box(root, 0.3, 3.8, 1.1, M.wall, -4.15, 1.9, -3.45);
  box(root, 0.3, 3.8, 8.6, M.wall, 4.15, 1.9, 0);
  box(root, 8.6, 3.8, 0.3, M.wall, 0, 1.9, 4.15);
  const ceiling = box(root, 8.6, 0.2, 8.6, M.ceiling, 0, 3.9, 0);
  ceiling.castShadow = false;

  // Skirting boards with a rounded top edge.
  const trim = M.paint(TRIM, 0.4);
  rbox(root, 8, 0.12, 0.02, trim, 0, 0.06, -3.99, 0.006);
  rbox(root, 0.02, 0.12, 8, trim, -3.99, 0.06, 0, 0.006);
  rbox(root, 8, 0.12, 0.02, trim, 0, 0.06, 3.99, 0.006);
  rbox(root, 0.02, 0.12, 4.27, trim, 3.99, 0.06, -1.865, 0.006);
  rbox(root, 0.02, 0.12, 2.47, trim, 3.99, 0.06, 2.765, 0.006);

  // Sockets and a light switch.
  const plastic = M.paint('#f4f2ee', 0.35);
  const socket = (x, y, z, rotY) => {
    const s = group(root, x, y, z, rotY);
    rbox(s, 0.085, 0.085, 0.01, plastic, 0, 0, 0, 0.006);
    [-0.012, 0.012].forEach((dx) => cyl(s, 0.0035, 0.0035, 0.004, M.paint('#2a2a2a', 0.6), dx, 0, 0.006, 8).rotation.x = Math.PI / 2);
  };
  socket(0.55, 0.3, -3.995, 0);
  socket(-3.995, 0.3, 0.2, Math.PI / 2);
  socket(-1.6, 0.3, 3.995, Math.PI);
  const sw = group(root, 3.995, 1.1, 1.65, -Math.PI / 2);
  rbox(sw, 0.085, 0.085, 0.01, plastic, 0, 0, 0, 0.006);
  rbox(sw, 0.03, 0.05, 0.008, plastic, 0, 0, 0.008, 0.004);
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

  // Curtain rod and two linen curtains, gathered in soft folds.
  const iron = M.metal('#2a2622', 0.45);
  const rod = cyl(root, 0.012, 0.012, 3.7, iron, -3.9, 3.24, -1.7, 12);
  rod.rotation.x = Math.PI / 2;
  ball(root, 0.028, iron, -3.9, 3.24, -3.56);
  ball(root, 0.028, iron, -3.9, 3.24, 0.16);
  const linen = M.linen(LINEN, THREE.DoubleSide);
  [[-3.2, 4], [-0.2, 9]].forEach(([z, seed]) => {
    const width = 0.62;
    const height = 3.12;
    const g = new THREE.PlaneGeometry(width, height, 80, 16);
    const p = g.attributes.position;
    const r = rng(seed);
    const phase = r() * 6;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / width + 0.5;
      const v = p.getY(i) / height + 0.5;
      // Deep regular pleats at the top relax into looser folds near the floor.
      const pleat = Math.sin(u * Math.PI * 12 + phase) * (0.03 + 0.012 * (1 - v));
      const loose = Math.sin(u * 7.3 + phase + v * 1.4) * 0.018 * (1 - v);
      p.setZ(i, pleat + loose + Math.sin(u * 29 + phase) * 0.004);
      p.setX(i, p.getX(i) * (0.94 + 0.06 * v));
    }
    g.computeVertexNormals();
    const c = add(root, g, linen, -3.9, 1.66, z);
    c.rotation.y = Math.PI / 2;
  });

  succulent(root, -3.9, 1.1425, -2.45, 0.7);
}

// ---------- Furniture ----------

function buildSofa(root) {
  const g = group(root, -3.32, 0, -1.7);
  const cloth = M.wool(SAGE);
  legs(g, [[-0.38, -1.05], [0.38, -1.05], [-0.38, 1.05], [0.38, 1.05]], 0.13, 0.02, 0.012);
  // Frame, arms and back.
  cushion(g, 0.94, 0.2, 2.3, cloth, 0, 0.23, 0, 0.04, 0.006);
  cushion(g, 0.94, 0.5, 0.17, cloth, 0, 0.45, -1.065, 0.07, 0.01);
  cushion(g, 0.94, 0.5, 0.17, cloth, 0, 0.45, 1.065, 0.07, 0.01);
  cushion(g, 0.18, 0.62, 2.3, cloth, -0.38, 0.62, 0, 0.07, 0.01);
  // Seat and back cushions.
  [-0.49, 0.49].forEach((z) => {
    cushion(g, 0.74, 0.17, 0.97, cloth, 0.09, 0.41, z, 0.06, 0.03);
    const back = cushion(g, 0.2, 0.5, 0.95, cloth, -0.2, 0.74, z, 0.08, 0.04);
    back.rotation.z = 0.14;
  });
  // Throw pillows.
  // Turned to face the room, then leaning back against the cushions.
  const p1 = add(g, pillowGeometry(0.44, 0.44, 0.15), M.velvet(MUSTARD), -0.06, 0.72, -0.7);
  p1.rotation.order = 'ZYX';
  p1.rotation.set(0.05, Math.PI / 2 - 0.25, 0.32);
  const p2 = add(g, pillowGeometry(0.42, 0.42, 0.14), M.velvet(CLAY), -0.06, 0.71, 0.68);
  p2.rotation.order = 'ZYX';
  p2.rotation.set(-0.08, Math.PI / 2 + 0.2, 0.3);
  // A knitted throw folded over the arm.
  const knit = M.knit(CREAM);
  cushion(g, 0.52, 0.035, 0.22, knit, 0.08, 0.715, 1.07, 0.015, 0.008);
  cushion(g, 0.52, 0.36, 0.035, knit, 0.08, 0.53, 1.17, 0.015, 0.008);
}

function buildLounge(root) {
  // Flat-woven wool rug.
  const rug = M.rug;
  const r = add(root, new THREE.BoxGeometry(rug.width, 0.008, rug.height), rug.material, -1.6, 0.004, -0.75);
  r.castShadow = false;
  // Fringe on the short ends, one instanced mesh for all strands.
  const strands = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.0025, 0.0025, 0.07, 5),
    M.paint('#e2d7c3', 0.95),
    140
  );
  strands.receiveShadow = true;
  const sm = new THREE.Matrix4();
  const sq = new THREE.Quaternion();
  const se = new THREE.Euler();
  const fr = rng(19);
  let s = 0;
  for (const end of [-1, 1]) {
    for (let i = 0; i < 70; i++) {
      const x = -1.6 - rug.width / 2 + 0.04 + (i / 69) * (rug.width - 0.08);
      sq.setFromEuler(se.set(Math.PI / 2, 0, (fr() - 0.5) * 0.4));
      sm.compose(new THREE.Vector3(x, 0.003, -0.75 + end * (rug.height / 2 + 0.032)), sq, new THREE.Vector3(1, 1, 1));
      strands.setMatrixAt(s++, sm);
    }
  }
  root.add(strands);

  // Coffee table: oak top on three walnut legs.
  const t = group(root, -1.35, 0, -0.65);
  lathe(t, [[0, 0.405], [0.5, 0.405], [0.515, 0.41], [0.522, 0.425], [0.515, 0.44], [0.5, 0.445], [0, 0.445]], M.oak('#ffffff', 0.9), 0, 0, 0, 64);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const leg = cyl(t, 0.022, 0.014, 0.42, M.walnut(), Math.cos(a) * 0.34, 0.2, Math.sin(a) * 0.34, 16);
    leg.rotation.set(Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12);
  }
  const mugMat = M.ceramic('#f1ebe2');
  lathe(t, [[0, 0], [0.034, 0], [0.04, 0.004], [0.041, 0.09], [0.037, 0.09], [0.035, 0.01], [0, 0.01]], mugMat, 0.16, 0.445, 0.12, 32);
  add(t, new THREE.TorusGeometry(0.025, 0.006, 10, 24), mugMat, 0.204, 0.49, 0.12);
  cyl(t, 0.034, 0.034, 0.003, M.paint('#2c1a10', 0.15), 0.16, 0.52, 0.12, 24).castShadow = false;
  const books = bookPile(t);
  books.add(0.03, 0.22, 0.3, 5, -0.14, 0.461, -0.1, 0, 0.4, Math.PI / 2);
  books.add(0.026, 0.2, 0.27, 12, -0.14, 0.489, -0.1, 0, 0.15, Math.PI / 2);
  books.done();

  // Floor lamp with a linen shade.
  const l = group(root, -3.5, 0, 0.02);
  const iron = M.metal('#232120', 0.45);
  lathe(l, [[0, 0], [0.16, 0], [0.165, 0.008], [0.16, 0.018], [0, 0.022]], iron, 0, 0, 0, 48);
  cyl(l, 0.011, 0.011, 1.56, iron, 0, 0.8, 0, 12);
  const shadeMat = new THREE.MeshStandardMaterial({
    color: LINEN,
    emissive: '#ffb873',
    emissiveIntensity: 0.9,
    roughness: 1,
    side: THREE.DoubleSide,
    normalMap: A.surfaces.linen.nor_gl,
  });
  add(l, new THREE.CylinderGeometry(0.19, 0.25, 0.34, 48, 1, true), shadeMat, 0, 1.66, 0);
  ball(l, 0.035, M.glow('#ffd9a8', 10), 0, 1.62, 0).castShadow = false;
  // Most of the light escapes through the open top and bottom of the shade; some
  // glows through the linen, so part of it ignores the shade's shadow.
  lamp('#ffb36b', 1.5, -3.5, 1.62, 0.02, true);
  lamp('#ffb36b', 3.6, -3.5, 1.62, 0.02, false, 2.6);

  // Mid-century lounge chair in the corner, turned towards the table.
  model('mid_century_lounge_chair', root, { x: -2.55, z: 2.45, rotY: 2.72, scale: 0.9 });

  // Large pothos by the front wall.
  pothos(root, -3.45, 0, 3.45, 1.35, 0.6);
}

function buildSideboard(root, station, profile) {
  // Walnut sideboard with slatted doors, along the window wall.
  const g = group(root, -3.73, 0, 1.4, Math.PI / 2);
  model('modern_wooden_cabinet', g, { scale: [0.85, 1, 1] });
  const top = 0.68;

  // Record player.
  const rp = group(g, -0.62, top, 0.0);
  rbox(rp, 0.42, 0.06, 0.34, M.walnut('#8d7f75', 0.6), 0, 0.03, 0, 0.008);
  rbox(rp, 0.4, 0.004, 0.32, M.paint('#1b1b1d', 0.25), 0, 0.062, 0, 0.002, 1);
  cyl(rp, 0.15, 0.15, 0.012, M.metal('#9a9a9c', 0.35), -0.04, 0.069, 0, 48);
  cyl(rp, 0.145, 0.145, 0.004, M.paint('#0d0d0f', 0.32), -0.04, 0.077, 0, 48);
  cyl(rp, 0.045, 0.045, 0.005, M.paint(CLAY, 0.6), -0.04, 0.078, 0, 32);
  cyl(rp, 0.016, 0.016, 0.03, M.metal('#c0c0c2', 0.3), 0.155, 0.08, 0.11, 16);
  const arm = cyl(rp, 0.004, 0.004, 0.22, M.metal('#c0c0c2', 0.3), 0.1, 0.098, 0.02, 10);
  arm.rotation.set(Math.PI / 2, 0, 0.45);
  // A few records leaning against it.
  const sleeves = [['#d9c9a8', -0.04], ['#2f4a5a', 0.0], ['#b0543b', 0.04]];
  sleeves.forEach(([c, dz], i) => {
    const s = rbox(g, 0.31, 0.31, 0.006, M.paint(c, 0.7), -0.98 + i * 0.012, top + 0.154, 0.02 + dz, 0.002, 1);
    s.rotation.order = 'ZYX';
    s.rotation.set(0, Math.PI / 2, -0.12);
  });

  // Books, a vase and a plant.
  const books = bookPile(g);
  books.add(0.035, 0.24, 0.3, 3, 0.05, top + 0.0175, 0.02, 0, 0.1, Math.PI / 2);
  books.add(0.03, 0.22, 0.28, 17, 0.06, top + 0.05, 0.02, 0, -0.12, Math.PI / 2);
  books.done();
  model('ceramic_vase_01', g, { x: 0.38, y: top, z: 0.02, scale: 0.75 });
  pothos(g, 0.78, top, 0.0, 0.42, 1.2);

  // The framed page on the wall above.
  const f = group(root, -3.985, 2.1, 1.4, Math.PI / 2);
  rbox(f, 1.04, 0.8, 0.03, M.walnut('#ffffff', 0.7), 0, 0, 0, 0.005);
  rbox(f, 0.98, 0.74, 0.004, M.paint('#f3eee4', 0.85), 0, 0, 0.015, 0.001, 1);
  printed(f, 0.9, 0.66, tex.framedPage(station, profile), 0, 0, 0.0175, 0.75);
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.74), M.glass);
  fg.position.set(0, 0, 0.019);
  f.add(fg);

  const a1 = group(root, -3.987, 2.38, 2.42, Math.PI / 2);
  rbox(a1, 0.42, 0.52, 0.026, M.oak('#ffffff', 0.8), 0, 0, 0, 0.004);
  printed(a1, 0.36, 0.46, tex.artPrint(0), 0, 0, 0.0135, 0.8);
  const a2 = group(root, -3.987, 1.78, 2.48, Math.PI / 2);
  rbox(a2, 0.42, 0.52, 0.026, M.paint('#1c1b20', 0.4), 0, 0, 0, 0.004);
  printed(a2, 0.36, 0.46, tex.artPrint(1), 0, 0, 0.0135, 0.8);
}

function buildBookshelf(root) {
  const g = group(root, -2.9, 0, -3.78);
  const W = 1.5;
  const D = 0.4;
  const wood = M.oak('#f4ece2', 0.85);
  rbox(g, 0.03, 2.66, D, wood, -W / 2 + 0.015, 1.33, 0, 0.003);
  rbox(g, 0.03, 2.66, D, wood, W / 2 - 0.015, 1.33, 0, 0.003);
  box(g, W - 0.06, 2.62, 0.012, wood, 0, 1.33, -D / 2 + 0.01);
  const levels = [0.08, 0.72, 1.36, 2.0, 2.645];
  levels.forEach((y) => rbox(g, W - 0.06, 0.03, D - 0.02, wood, 0, y, 0, 0.003));

  const r = rng(42);
  const books = bookPile(g);
  let cell = 0;
  const fill = (level, from, to) => {
    const y0 = levels[level] + 0.015;
    let x = from;
    while (x < to) {
      const w = 0.022 + r() * 0.035;
      const h = 0.21 + r() * 0.17;
      if (x + w > to) break;
      const d = 0.15 + r() * 0.08;
      const z = D / 2 - d / 2 - 0.025 - r() * 0.015;
      if (r() > 0.92 && x + 0.06 < to) {
        // A book leaning on its neighbour.
        books.add(w, h, d, cell++, x + w / 2 + 0.03, y0 + h / 2 - 0.004, z, 0, 0, 0.16);
        x += w + 0.05;
        continue;
      }
      books.add(w, h, d, cell++, x + w / 2, y0 + h / 2, z);
      x += w + 0.0015;
    }
  };
  const L = -W / 2 + 0.04;
  const R = W / 2 - 0.04;

  fill(0, L, R);
  fill(1, L, 0.2);
  succulent(g, 0.45, levels[1] + 0.015, 0.02, 0.95, 0.4);
  // The encyclopedia set takes the left half of the middle shelf.
  model('book_encyclopedia_set_01', g, { x: L + 0.02, y: levels[2] + 0.015, z: 0.04, scale: 1 });
  fill(2, L + 0.6, R);
  fill(3, L, -0.12);
  // A stack lying flat with a ceramic vase.
  books.add(0.04, 0.3, 0.24, 7, 0.22, levels[3] + 0.035, 0.02, 0, 0, Math.PI / 2);
  books.add(0.035, 0.27, 0.22, 21, 0.23, levels[3] + 0.0725, 0.02, 0, 0.12, Math.PI / 2);
  books.add(0.03, 0.25, 0.2, 9, 0.22, levels[3] + 0.105, 0.02, 0, -0.08, Math.PI / 2);
  model('ceramic_vase_02', g, { x: 0.5, y: levels[3] + 0.015, z: 0.02, scale: 0.75 });
  books.done();

  // On top: a trailing plant and a woven storage box.
  pothos(g, -0.38, levels[4] + 0.015, 0.0, 0.5, 2.2);
  cushion(g, 0.36, 0.2, 0.26, M.linen('#b39c7f'), 0.3, levels[4] + 0.115, 0, 0.02, 0.006);
  rbox(g, 0.37, 0.025, 0.27, M.walnut(), 0.3, levels[4] + 0.226, 0, 0.006);
}

// A keyboard with real keycaps, drawn as one instanced mesh.
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
  rbox(k, width + 0.018, 0.016, depth + 0.018, M.paint('#d3cec6', 0.45), 0, 0.008, 0, 0.006);
  const cap = new RoundedBoxGeometry(1, 1, 1, 2, 0.12);
  const caps = new THREE.InstancedMesh(cap, M.paint('#ffffff', 0.55), rows.flat().length);
  caps.castShadow = true;
  caps.receiveShadow = true;
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  let i = 0;
  rows.forEach((row, ri) => {
    let cx = -width / 2;
    row.forEach((units, ci) => {
      const w = units * U - 0.0028;
      const accent = (ri === 0 && ci === 0) || (ri === 3 && ci === row.length - 2);
      const tilt = (ri - 2.5) * 0.04;
      m.makeRotationX(tilt);
      m.scale(new THREE.Vector3(w, 0.008, U - 0.0028));
      m.setPosition(cx + (units * U) / 2, 0.02, -depth / 2 + ri * U + U / 2);
      caps.setMatrixAt(i, m);
      caps.setColorAt(i, color.set(accent ? '#c9873a' : units > 1.2 && ri > 0 ? '#c9c4bc' : '#f2eee8'));
      cx += units * U;
      i++;
    });
  });
  k.add(caps);
  return k;
}

function buildDesk(root, station, profile) {
  const g = group(root, 1.5, 0, -3.55);
  const black = M.metal('#1d1d20', 0.45);
  const alu = M.metal('#b9b8b6', 0.3);
  const brass = M.metal(BRASS, 0.3);
  const white = M.paint('#efebe5', 0.4);
  rbox(g, 3.4, 0.035, 0.9, M.oak('#ffffff', 0.85), 0, 0.9475, 0, 0.006);

  // Drawer unit on the right.
  rbox(g, 0.75, 0.9, 0.8, white, 1.25, 0.465, 0, 0.008);
  [0.18, 0.47, 0.76].forEach((y) => {
    rbox(g, 0.71, 0.27, 0.016, white, 1.25, y, 0.404, 0.004);
    const bar = cyl(g, 0.006, 0.006, 0.18, brass, 1.25, y + 0.07, 0.43, 12);
    bar.rotation.z = Math.PI / 2;
    cyl(g, 0.004, 0.004, 0.02, brass, 1.18, y + 0.07, 0.42, 8).rotation.x = Math.PI / 2;
    cyl(g, 0.004, 0.004, 0.02, brass, 1.32, y + 0.07, 0.42, 8).rotation.x = Math.PI / 2;
  });
  // Steel trestle on the left.
  [0.33, -0.33].forEach((z) => {
    const leg = rbox(g, 0.03, 0.93, 0.03, black, -1.55, 0.465, z * 1.05, 0.004);
    leg.rotation.x = z > 0 ? 0.07 : -0.07;
  });
  rbox(g, 0.03, 0.03, 0.64, black, -1.55, 0.3, 0, 0.004);

  // PC tower under the desk.
  rbox(g, 0.22, 0.46, 0.46, M.paint('#18181b', 0.35), -1.1, 0.24, -0.06, 0.008);
  add(g, new THREE.BoxGeometry(0.004, 0.36, 0.008), M.glow('#6fd6c0', 4), -1.035, 0.24, 0.172).castShadow = false;

  // Main 32" monitor on a slim aluminium stand: shows the projects.
  const m1 = group(g, -0.25, 0.965, -0.2);
  rbox(m1, 0.24, 0.008, 0.17, alu, 0, 0.004, -0.02, 0.004);
  const neck1 = rbox(m1, 0.045, 0.3, 0.012, alu, 0, 0.15, -0.075, 0.004);
  neck1.rotation.x = -0.12;
  rbox(m1, 0.73, 0.425, 0.022, M.paint('#26262a', 0.5), 0, 0.335, -0.035, 0.008);
  rbox(m1, 0.725, 0.42, 0.006, M.black, 0, 0.335, -0.022, 0.004);
  screen(m1, 0.712, 0.398, tex.codeScreen(station, profile), 0, 0.337, -0.0185);

  // Second 27" monitor, angled in: a design tool.
  const m2 = group(g, 0.82, 0.965, -0.13, -0.38);
  rbox(m2, 0.22, 0.008, 0.16, alu, 0, 0.004, -0.02, 0.004);
  const neck2 = rbox(m2, 0.045, 0.28, 0.012, alu, 0, 0.14, -0.07, 0.004);
  neck2.rotation.x = -0.12;
  rbox(m2, 0.62, 0.365, 0.022, M.paint('#26262a', 0.5), 0, 0.31, -0.03, 0.008);
  rbox(m2, 0.615, 0.36, 0.006, M.black, 0, 0.31, -0.017, 0.004);
  screen(m2, 0.603, 0.34, tex.designScreen(), 0, 0.312, -0.0135);

  // Desk mat, keyboard and mouse.
  rbox(g, 0.9, 0.003, 0.4, M.wool('#4d5f5d'), -0.2, 0.9665, 0.17, 0.0015, 1).castShadow = false;
  keyboard(g, -0.28, 0.968, 0.17);
  const mouse = add(g, new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI / 2), M.paint('#cfcac2', 0.5), 0.06, 0.968, 0.19);
  mouse.scale.set(0.031, 0.02, 0.055);

  // Drawing tablet and pen.
  const tablet = group(g, 0.62, 0.965, 0.2, -0.15);
  rbox(tablet, 0.36, 0.009, 0.24, M.paint('#1c1c1f', 0.45), 0, 0.0045, 0, 0.004);
  rbox(tablet, 0.28, 0.0015, 0.18, M.paint('#2a2a2f', 0.7), 0.02, 0.0095, 0, 0.0007, 1).castShadow = false;
  const pen = cyl(tablet, 0.0045, 0.0035, 0.16, M.paint('#2b2b2f', 0.4), -0.14, 0.014, 0.02, 12);
  pen.rotation.set(0, 0.1, Math.PI / 2);

  // Architect lamp clamped to the back edge, bending over the desk.
  const lampModel = model('desk_lamp_arm_01', g, { x: -1.32, y: 0.965, z: -0.2, rotY: -2.21 }, (o) => {
    if (o.material.name === 'desk_lamp_arm_01_light') {
      o.material.emissiveIntensity = 14;
      o.castShadow = false;
    }
  });

  // Coffee, a photo frame and a small plant.
  const mugMat = M.ceramic('#d6b6a2');
  lathe(g, [[0, 0], [0.034, 0], [0.04, 0.004], [0.041, 0.09], [0.037, 0.09], [0.035, 0.01], [0, 0.01]], mugMat, 0.34, 0.965, 0.3, 32);
  add(g, new THREE.TorusGeometry(0.025, 0.006, 10, 24), mugMat, 0.384, 1.01, 0.3);
  const framePhoto = M.photos.frame.clone();
  framePhoto.flipY = false;
  framePhoto.needsUpdate = true;
  model('standing_picture_frame_01', g, { x: 1.38, y: 0.965, z: -0.05, rotY: -0.45 }, (o) => {
    if (o.material.name === 'standing_picture_frame_01_artwork') {
      o.material = o.material.clone();
      o.material.map = framePhoto;
    }
  });
  succulent(g, 1.5, 0.965, -0.28, 0.95, 0.8);

  // Soft glow from the screens.
  lamp('#c9d0ff', 0.9, 1.6, 1.35, -3.3, false, 3);

  // Office chair, pushed back from the desk.
  const c = group(root, 0.55, 0, -2.45, 0.5);
  const plastic = M.paint('#1d1c21', 0.5);
  const seat = M.wool('#3d3f45');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = rbox(c, 0.3, 0.03, 0.045, alu, Math.cos(a) * 0.15, 0.09, Math.sin(a) * 0.15, 0.01, 2);
    spoke.rotation.y = -a;
    const caster = cyl(c, 0.026, 0.026, 0.022, plastic, Math.cos(a) * 0.3, 0.026, Math.sin(a) * 0.3, 16);
    caster.rotation.set(Math.PI / 2, 0, -a);
    cyl(c, 0.008, 0.008, 0.04, plastic, Math.cos(a) * 0.3, 0.06, Math.sin(a) * 0.3, 8);
  }
  cyl(c, 0.032, 0.032, 0.04, plastic, 0, 0.1, 0, 20);
  cyl(c, 0.022, 0.022, 0.3, M.metal('#2a2a2c', 0.25), 0, 0.27, 0, 20);
  rbox(c, 0.32, 0.04, 0.3, plastic, 0, 0.44, 0, 0.012, 2);
  cushion(c, 0.5, 0.08, 0.5, seat, 0, 0.5, 0, 0.035, 0.018);
  const spine = rbox(c, 0.06, 0.42, 0.03, plastic, 0, 0.68, 0.27, 0.012, 2);
  spine.rotation.x = 0.12;
  const back = cushion(c, 0.46, 0.52, 0.07, seat, 0, 1.0, 0.31, 0.035, 0.02);
  back.rotation.x = 0.12;
  [-0.27, 0.27].forEach((x) => {
    rbox(c, 0.03, 0.2, 0.03, plastic, x, 0.58, 0.05, 0.008, 2);
    rbox(c, 0.07, 0.025, 0.26, plastic, x, 0.69, 0.02, 0.01, 2);
  });

  return lampModel;
}

function buildPhotoString(root) {
  const A0 = new THREE.Vector3(0.0, 3.32, -3.975);
  const B0 = new THREE.Vector3(3.3, 3.32, -3.975);
  const mid = new THREE.Vector3(1.65, 2.96, -3.975);
  const curve = new THREE.QuadraticBezierCurve3(A0, mid, B0);
  add(root, new THREE.TubeGeometry(curve, 48, 0.0018, 6), M.paint('#2a2622', 0.7), 0, 0, 0).castShadow = false;
  const brass = M.metal(BRASS, 0.35);
  ball(root, 0.008, brass, A0.x, A0.y, A0.z);
  ball(root, 0.008, brass, B0.x, B0.y, B0.z);

  // Instant-film style prints: white border, wider at the bottom.
  const paper = M.paint('#f5f2ec', 0.8);
  const peg = M.oak('#ffffff', 0.9);
  [0.05, -0.04, 0.03, -0.06, 0.04].forEach((tilt, i) => {
    const p = curve.getPoint(0.1 + i * 0.2);
    const g = group(root, p.x, p.y, p.z + 0.008);
    g.rotation.z = tilt;
    rbox(g, 0.3, 0.36, 0.003, paper, 0, -0.19, 0, 0.0015, 1);
    printed(g, 0.26, 0.26, M.photos[`photo-${i}`], 0, -0.16, 0.0018, 0.45);
    rbox(g, 0.018, 0.07, 0.01, peg, 0, -0.008, 0.004, 0.002, 1);
  });

  const bulbs = [];
  for (let i = 0; i <= 10; i++) {
    const p = curve.getPoint(i * 0.1);
    const material = M.glow('#ffcf96', 5);
    const bulb = ball(root, 0.011, material, p.x, p.y - 0.02, p.z + 0.016);
    bulb.castShadow = false;
    bulbs.push(material);
  }
  lamp('#ffc68a', 1.1, 1.65, 3.0, -3.6, false, 3.5);
  return bulbs;
}

function buildFarSide(root) {
  const trim = M.paint(TRIM, 0.4);
  const brass = M.metal(BRASS, 0.3);
  const doorPaint = M.paint('#8e9e90', 0.38);

  // Door on the right wall.
  rbox(root, 0.03, 2.26, 0.09, trim, 3.985, 1.13, 0.335, 0.006);
  rbox(root, 0.03, 2.26, 0.09, trim, 3.985, 1.13, 1.465, 0.006);
  rbox(root, 0.03, 0.09, 1.22, trim, 3.985, 2.305, 0.9, 0.006);
  rbox(root, 0.04, 2.24, 1.04, doorPaint, 3.99, 1.125, 0.9, 0.004);
  [[1.62, 0.9], [0.6, 0.72]].forEach(([y, h]) => {
    rbox(root, 0.014, h, 0.74, doorPaint, 3.968, y, 0.9, 0.006);
    rbox(root, 0.01, h - 0.12, 0.62, doorPaint, 3.96, y, 0.9, 0.004);
  });
  cyl(root, 0.026, 0.026, 0.012, brass, 3.962, 1.08, 0.5, 24).rotation.z = Math.PI / 2;
  cyl(root, 0.008, 0.008, 0.05, brass, 3.94, 1.08, 0.5, 12).rotation.z = Math.PI / 2;
  cyl(root, 0.009, 0.009, 0.12, brass, 3.92, 1.08, 0.555, 12).rotation.x = Math.PI / 2;

  // Coat hooks with a canvas tote bag.
  rbox(root, 0.022, 0.09, 0.95, M.oak('#ffffff', 0.85), 3.988, 1.9, -0.5, 0.005);
  [-0.82, -0.5, -0.18].forEach((z) => {
    cyl(root, 0.007, 0.007, 0.07, brass, 3.95, 1.9, z, 12).rotation.z = Math.PI / 2;
    ball(root, 0.012, brass, 3.915, 1.9, z);
  });
  const canvasCloth = M.linen('#d6c6a4');
  cushion(root, 0.06, 0.42, 0.37, canvasCloth, 3.94, 1.46, -0.82, 0.02, 0.02);
  [-0.93, -0.71].forEach((z) => {
    const strap = rbox(root, 0.006, 0.26, 0.026, canvasCloth, 3.935, 1.78, z, 0.003, 1);
    strap.rotation.x = z < -0.82 ? -0.42 : 0.42;
  });

  // Large poster between the desk and the door.
  const p = group(root, 3.987, 2.1, -2.05, -Math.PI / 2);
  rbox(p, 0.95, 1.27, 0.026, M.paint('#1c1b20', 0.4), 0, 0, 0, 0.004);
  printed(p, 0.89, 1.21, tex.poster(), 0, 0, 0.0135, 0.8);
  const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.91, 1.23), M.glass);
  pg.position.set(0, 0, 0.015);
  p.add(pg);

  // Oak dresser on the front wall, with a round mirror above it.
  const d = group(root, -1.0, 0, 3.7, Math.PI);
  const oak = M.oak('#f6eee4', 0.85);
  legs(d, [[-0.82, -0.17], [0.82, -0.17], [-0.82, 0.17], [0.82, 0.17]], 0.16, 0.02, 0.014, M.walnut());
  rbox(d, 1.8, 0.76, 0.48, oak, 0, 0.54, 0, 0.006);
  for (let col = 0; col < 2; col++) {
    for (let row = 0; row < 3; row++) {
      const x = -0.445 + col * 0.89;
      const y = 0.3 + row * 0.245;
      rbox(d, 0.875, 0.235, 0.016, oak, x, y, 0.246, 0.003);
      const pull = rbox(d, 0.14, 0.012, 0.014, brass, x, y + 0.07, 0.262, 0.004, 1);
      pull.castShadow = false;
    }
  }
  // Table lamp.
  lathe(d, [[0, 0], [0.06, 0], [0.085, 0.07], [0.07, 0.16], [0.025, 0.24], [0.015, 0.3], [0, 0.3]], M.ceramic('#8f86a8'), 0.6, 0.92, 0, 48);
  const shade = new THREE.MeshStandardMaterial({
    color: LINEN,
    emissive: '#ffb873',
    emissiveIntensity: 0.85,
    roughness: 1,
    side: THREE.DoubleSide,
    normalMap: A.surfaces.linen.nor_gl,
  });
  add(d, new THREE.CylinderGeometry(0.1, 0.16, 0.2, 48, 1, true), shade, 0.6, 1.3, 0);
  ball(d, 0.028, M.glow('#ffd9a8', 8), 0.6, 1.28, 0).castShadow = false;
  lamp('#ffb36b', 3, -1.6, 1.3, 3.7, true, 7);
  const books = bookPile(d);
  books.add(0.04, 0.24, 0.3, 26, -0.1, 0.94, -0.02, 0, 0.2, Math.PI / 2);
  books.add(0.03, 0.22, 0.27, 14, -0.1, 0.975, -0.02, 0, 0, Math.PI / 2);
  books.done();
  pothos(d, -0.6, 0.92, 0, 0.45, 0.5);
  const ring = add(root, new THREE.TorusGeometry(0.5, 0.018, 16, 96), brass, -1.0, 2.05, 3.975);
  ring.rotation.y = Math.PI;
  const glass = add(root, new THREE.CircleGeometry(0.49, 64), M.mirror, -1.0, 2.05, 3.973);
  glass.rotation.y = Math.PI;
  glass.castShadow = false;

  // Wall shelf with books and a plant, and a knitted pouf.
  rbox(root, 1.3, 0.03, 0.24, M.oak('#ffffff', 0.85), 1.7, 1.95, 3.87, 0.004);
  [1.2, 2.2].forEach((x) => rbox(root, 0.02, 0.14, 0.02, M.metal('#232226', 0.45), x, 1.87, 3.975, 0.004, 1));
  succulent(root, 1.25, 1.965, 3.86, 0.75, 1.1);
  const shelfBooks = bookPile(root);
  [[1.6, 0.27, 0.034], [1.636, 0.24, 0.03], [1.668, 0.29, 0.038]].forEach(([x, h, w], i) =>
    shelfBooks.add(w, h, 0.19, 19 + i, x, 1.965 + h / 2, 3.86, 0, Math.PI, 0)
  );
  shelfBooks.done();
  model('ceramic_vase_02', root, { x: 2.1, y: 1.965, z: 3.86, scale: 0.6 });
  lathe(root, [[0, 0], [0.34, 0], [0.4, 0.06], [0.41, 0.2], [0.38, 0.33], [0.3, 0.37], [0, 0.38]], M.knit('#c79b8a'), 1.5, 0, 3.3, 48);

  // Pendant light over the coffee table.
  const px = -1.35;
  const pz = -0.65;
  const drop = 2.12;
  cyl(root, 0.06, 0.06, 0.02, M.paint('#f2f0eb', 0.4), px, 3.79, pz, 32);
  cyl(root, 0.003, 0.003, 3.8 - (drop + 1.17), M.black, px, (3.8 + drop + 1.17) / 2, pz, 6).castShadow = false;
  model('modern_ceiling_lamp_01', root, { x: px, y: drop, z: pz }, (o) => {
    const name = o.material.name;
    if (name === 'modern_ceiling_lamp_01_glass') {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color('#ffd7ad');
      o.material.emissiveIntensity = 0.55;
      o.castShadow = false;
    } else if (name === 'modern_ceiling_globe') {
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color('#ffdcae');
      o.material.emissiveIntensity = 10;
      o.castShadow = false;
    }
  });
  const pool = new THREE.SpotLight('#ffc28a', 14, 9, 1.0, 0.9, 2);
  pool.position.set(px, drop + 0.36, pz);
  pool.target.position.set(px, 0, pz);
  pool.castShadow = true;
  pool.shadow.mapSize.set(1024, 1024);
  pool.shadow.camera.near = 0.1;
  pool.shadow.bias = -0.002;
  pool.shadow.radius = 5;
  LIGHTS.add(pool, pool.target);
  lamp('#ffc58c', 1.4, px, drop + 0.6, pz, false, 5);
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
      size: 0.012,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  root.add(points);
  return points;
}

function buildLights(deskLamp) {
  RectAreaLightUniformsLib.init();

  // Low golden sun through the window.
  const sun = new THREE.DirectionalLight('#ffad70', 9);
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

  // Light from the evening sky through the window: cooler than the sun, so shaded
  // parts of the room turn slightly blue the way they do at dusk.
  const skylight = new THREE.RectAreaLight('#d4d6ef', 6, 2.4, 1.8);
  skylight.position.set(-3.98, 2.05, -1.7);
  skylight.lookAt(0, 1.6, -1.2);
  LIGHTS.add(skylight);

  // Desk lamp: a spot from the bulb inside the shade, pointing down onto the desk.
  let bulb = null;
  deskLamp.updateWorldMatrix(true, true);
  deskLamp.traverse((o) => {
    if (o.isMesh && o.material.name === 'desk_lamp_arm_01_light') bulb = o;
  });
  if (bulb) {
    const at = new THREE.Box3().setFromObject(bulb).getCenter(new THREE.Vector3());
    const spot = new THREE.SpotLight('#ffcf98', 5, 4, 0.75, 0.7, 2);
    spot.position.copy(at);
    spot.target.position.set(at.x + 0.35, 0.96, at.z + 0.3);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.near = 0.04;
    spot.shadow.bias = -0.002;
    spot.shadow.radius = 3;
    LIGHTS.add(spot, spot.target);
    lamp('#ffcf98', 0.5, at.x, at.y + 0.03, at.z, false, 1.5);
  }

  // A base level of bounced light; mostly replaced by the baked room light.
  const bounce = new THREE.HemisphereLight('#f0e2d2', '#8c6c55', 0.5);
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
    make('desk', 3.4, 0.9, 0.95, 1.5, 1.35, -3.5),
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
    pos: new THREE.Vector3(1.85, 1.52, -1.85),
    target: new THREE.Vector3(1.95, 1.2, -3.7),
    anchor: new THREE.Vector3(1.25, 1.72, -3.75),
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

export function buildRoom(scene, assets, stations, profile) {
  A = assets;
  M = createMaterials(assets);
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
  const deskLamp = buildDesk(root, stations.desk, profile);
  const bulbs = buildPhotoString(root);
  const dust = buildDust(root);
  noAO.push(dust);
  const { bounce } = buildLights(deskLamp);
  const hitboxes = buildHitboxes(root);
  hitboxes.forEach((h) => noAO.push(h));

  const dustBase = dust.geometry.attributes.position.array.slice();

  function update(time) {
    bulbs.forEach((m, i) => {
      m.emissiveIntensity = 5 + Math.sin(time * 1.1 + i * 1.9) * 0.6;
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
