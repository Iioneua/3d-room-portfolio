import * as THREE from 'three';
import './style.css';
import { buildRoom, views } from './room.js';
import { createAmbience } from './audio.js';
import { profile, stations } from './content.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------- Scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const room = buildRoom(scene, stations, profile);

// ---------- Camera rig ----------
const rig = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
let tween = null;
let current = null; // id of the station in focus, or null for the overview

function overview() {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const dist = Math.max(11.2 / (2 * t), 15.6 / (2 * t * camera.aspect));
  const target = new THREE.Vector3(-0.25, 1.1, -0.25);
  const dir = new THREE.Vector3(1, 0.72, 1).normalize();
  return { pos: target.clone().addScaledVector(dir, dist), target };
}

function jumpTo(view) {
  rig.pos.copy(view.pos);
  rig.target.copy(view.target);
  tween = null;
}

function flyTo(view, seconds = 1.5) {
  tween = {
    fromPos: rig.pos.clone(),
    fromTarget: rig.target.clone(),
    toPos: view.pos.clone(),
    toTarget: view.target.clone(),
    start: performance.now(),
    ms: seconds * 1000,
  };
}

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (!current) {
    if (tween) flyTo(overview(), 0.6);
    else jumpTo(overview());
  }
}
window.addEventListener('resize', resize);

// ---------- Text on the page ----------
document.title = `${profile.name} · ${profile.role}`;
$('brand-name').textContent = profile.name;
$('brand-role').textContent = profile.role;
$('intro-role').textContent = profile.role;
$('intro-title').textContent = `Welcome to ${profile.name}'s room`;
$('intro-tagline').textContent = profile.tagline;

const card = $('card');
let cardTimer = null;

function fillCard(id) {
  const s = stations[id];
  $('card-kicker').textContent = s.kicker;
  $('card-title').textContent = s.title;
  $('card-body').textContent = s.body;
  const list = $('card-items');
  list.replaceChildren(
    ...s.items.map((item) => {
      const li = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = item.title;
      const text = document.createElement('span');
      text.textContent = item.tag ? `${item.text} · ${item.tag}` : item.text;
      li.append(title, text);
      return li;
    })
  );
  const link = $('card-link');
  link.textContent = `${s.link.label} ↗`;
  link.href = s.link.url;
  $('card-hint').textContent = s.objectHint || '';
}

function focus(id, instant = false) {
  current = id;
  document.body.classList.add('focused');
  card.classList.remove('open');
  clearTimeout(cardTimer);
  if (instant) {
    jumpTo(views[id]);
    fillCard(id);
    card.classList.add('open');
  } else {
    flyTo(views[id]);
    cardTimer = setTimeout(() => {
      fillCard(id);
      card.classList.add('open');
    }, 750);
  }
}

function back() {
  if (!current) return;
  current = null;
  clearTimeout(cardTimer);
  card.classList.remove('open');
  document.body.classList.remove('focused');
  flyTo(overview(), 1.4);
}

function openLink(id) {
  window.open(stations[id].link.url, '_blank', 'noopener');
}

$('back').addEventListener('click', back);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') back();
});

// ---------- Floating labels ----------
const labelLayer = $('labels');
const labels = Object.keys(views).map((id) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'hotspot';
  el.textContent = stations[id].label;
  el.addEventListener('click', () => focus(id));
  labelLayer.append(el);
  return { id, el };
});
const projected = new THREE.Vector3();

function placeLabels() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (const { id, el } of labels) {
    projected.copy(views[id].anchor).project(camera);
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
}

// ---------- Pointer: hover, click, gentle parallax ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const sway = new THREE.Vector2();
let hovered = null;
let downAt = null;

function pick(event) {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(room.hitboxes, false)[0];
  return hit ? hit.object.userData.station : null;
}

canvas.addEventListener('pointermove', (event) => {
  hovered = pick(event);
  canvas.style.cursor = hovered ? 'pointer' : 'default';
  for (const { id, el } of labels) el.classList.toggle('hover', id === hovered);
});
canvas.addEventListener('pointerdown', (event) => {
  downAt = { x: event.clientX, y: event.clientY };
});
canvas.addEventListener('pointerup', (event) => {
  if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 6) return;
  downAt = null;
  if (document.body.classList.contains('intro')) return;
  const id = pick(event);
  if (id && id === current) openLink(id);
  else if (id) focus(id);
  else back();
});
window.addEventListener('pointermove', (event) => {
  pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);
});

// ---------- Sound ----------
const ambience = createAmbience();
const soundButton = $('sound');
soundButton.addEventListener('click', () => {
  const muted = !ambience.muted;
  ambience.setMuted(muted);
  if (!muted) ambience.start();
  soundButton.setAttribute('aria-pressed', String(!muted));
  soundButton.textContent = muted ? 'Sound off' : 'Sound on';
});

// ---------- Welcome screen ----------
document.body.classList.add('intro');
$('enter').addEventListener('click', () => {
  document.body.classList.remove('intro');
  ambience.start();
});

// ---------- Loop ----------
const clock = new THREE.Clock();
let swayAmount = 0.6;

function frame() {
  const time = clock.getElapsedTime();

  if (tween) {
    const k = Math.min((performance.now() - tween.start) / tween.ms, 1);
    const e = ease(k);
    rig.pos.lerpVectors(tween.fromPos, tween.toPos, e);
    rig.target.lerpVectors(tween.fromTarget, tween.toTarget, e);
    if (k >= 1) tween = null;
  }

  // The camera drifts slightly with the mouse so the room feels three-dimensional.
  sway.lerp(pointer, 0.04);
  swayAmount += ((current ? 0.1 : 0.6) - swayAmount) * 0.05;
  camera.position.copy(rig.pos);
  camera.lookAt(rig.target);
  camera.translateX(sway.x * swayAmount);
  camera.translateY(sway.y * swayAmount * 0.5);
  camera.lookAt(rig.target);

  room.update(time, camera);
  renderer.render(scene, camera);
  placeLabels();
  requestAnimationFrame(frame);
}

resize();
jumpTo(overview());

// ?view=desk|photos|shelf|frame|room skips the welcome screen (handy for testing).
const startView = params.get('view');
if (startView) {
  document.body.classList.remove('intro');
  if (views[startView]) focus(startView, true);
}

frame();
