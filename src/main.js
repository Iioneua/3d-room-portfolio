import * as THREE from 'three';
import './style.css';
import { buildRoom, views, home } from './room.js';
import { createAmbience } from './audio.js';
import { profile, stations } from './content.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const HOME_FOV = 62;
const FOCUS_FOV = 50;
const MAX_PITCH = 0.7;
// How far you can turn your head from where you are facing (radians).
const TURN_HOME = 0.9;
const TURN_FOCUS = 0.8;

// ---------- Scene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#2b2647');
const camera = new THREE.PerspectiveCamera(HOME_FOV, 1, 0.05, 60);
camera.rotation.order = 'YXZ';
const room = buildRoom(scene, stations, profile);

// ---------- First-person rig ----------
// You stand at `pos` and look along `yaw` (left/right) and `pitch` (up/down).
const rig = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: HOME_FOV, facing: 0 };
let tween = null;
let current = null; // id of the station in focus, or null when standing at the entrance

function pose(view, fov) {
  const d = view.target.clone().sub(view.pos);
  return {
    pos: view.pos.clone(),
    yaw: Math.atan2(-d.x, -d.z),
    pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)),
    fov,
  };
}

function jumpTo(p) {
  rig.pos.copy(p.pos);
  rig.yaw = p.yaw;
  rig.pitch = p.pitch;
  rig.fov = p.fov;
  rig.facing = p.yaw;
  tween = null;
}

function walkTo(p, seconds = 1.6) {
  // Turn the short way round.
  const turn = THREE.MathUtils.euclideanModulo(p.yaw - rig.yaw + Math.PI, Math.PI * 2) - Math.PI;
  tween = {
    from: { pos: rig.pos.clone(), yaw: rig.yaw, pitch: rig.pitch, fov: rig.fov },
    to: { pos: p.pos, yaw: rig.yaw + turn, pitch: p.pitch, fov: p.fov },
    start: performance.now(),
    ms: seconds * 1000,
  };
  rig.facing = tween.to.yaw;
}

function turnBy(amount) {
  const limit = current ? TURN_FOCUS : TURN_HOME;
  rig.yaw = THREE.MathUtils.clamp(rig.yaw + amount, rig.facing - limit, rig.facing + limit);
}

const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
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
  $('card-items').replaceChildren(
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
  const p = pose(views[id], FOCUS_FOV);
  if (instant) {
    jumpTo(p);
    fillCard(id);
    card.classList.add('open');
  } else {
    walkTo(p);
    cardTimer = setTimeout(() => {
      fillCard(id);
      card.classList.add('open');
    }, 850);
  }
}

function back() {
  if (!current) return;
  current = null;
  clearTimeout(cardTimer);
  card.classList.remove('open');
  document.body.classList.remove('focused');
  walkTo(pose(home, HOME_FOV), 1.5);
}

function openLink(id) {
  window.open(stations[id].link.url, '_blank', 'noopener');
}

$('back').addEventListener('click', back);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') back();
  if (tween) return;
  if (e.key === 'ArrowLeft') turnBy(0.12);
  if (e.key === 'ArrowRight') turnBy(-0.12);
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
    const behind = projected.z > 1;
    el.style.visibility = behind ? 'hidden' : 'visible';
    if (behind) continue;
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  }
}

// ---------- Pointer: drag to look around, click to walk over ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const sway = new THREE.Vector2();
let drag = null;

function pick(event) {
  const p = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(p, camera);
  const hit = raycaster.intersectObjects(room.hitboxes, false)[0];
  return hit ? hit.object.userData.station : null;
}

canvas.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener('pointermove', (event) => {
  if (drag) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (drag.moved && !tween) {
      const speed = (0.0042 * rig.fov) / HOME_FOV;
      turnBy((event.clientX - drag.x) * speed);
      rig.pitch = THREE.MathUtils.clamp(rig.pitch + (event.clientY - drag.y) * speed, -MAX_PITCH, MAX_PITCH);
      canvas.style.cursor = 'grabbing';
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    return;
  }
  const hovered = pick(event);
  canvas.style.cursor = hovered ? 'pointer' : 'grab';
  for (const { id, el } of labels) el.classList.toggle('hover', id === hovered);
});

canvas.addEventListener('pointerup', (event) => {
  const wasClick = drag && !drag.moved;
  drag = null;
  canvas.style.cursor = 'grab';
  if (!wasClick || document.body.classList.contains('intro')) return;
  const id = pick(event);
  if (id && id === current) openLink(id);
  else if (id) focus(id);
  else back();
});
canvas.addEventListener('pointercancel', () => {
  drag = null;
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

function frame() {
  const time = clock.getElapsedTime();
  let step = 0;

  if (tween) {
    const k = Math.min((performance.now() - tween.start) / tween.ms, 1);
    const e = ease(k);
    rig.pos.lerpVectors(tween.from.pos, tween.to.pos, e);
    rig.yaw = THREE.MathUtils.lerp(tween.from.yaw, tween.to.yaw, e);
    rig.pitch = THREE.MathUtils.lerp(tween.from.pitch, tween.to.pitch, e);
    rig.fov = THREE.MathUtils.lerp(tween.from.fov, tween.to.fov, e);
    // A slight bob while walking.
    step = Math.sin(k * Math.PI * 5) * Math.sin(k * Math.PI) * 0.022;
    if (k >= 1) tween = null;
  }

  if (camera.fov !== rig.fov) {
    camera.fov = rig.fov;
    camera.updateProjectionMatrix();
  }

  // The head leans a little with the mouse, plus slow breathing.
  sway.lerp(pointer, 0.04);
  camera.position.copy(rig.pos);
  camera.position.y += step + Math.sin(time * 0.9) * 0.006;
  camera.rotation.set(rig.pitch, rig.yaw, 0);
  camera.translateX(sway.x * 0.05);
  camera.translateY(sway.y * 0.03);

  room.update(time, camera);
  renderer.render(scene, camera);
  placeLabels();
  requestAnimationFrame(frame);
}

resize();
jumpTo(pose(home, HOME_FOV));

// For testing: ?view=desk|photos|shelf|frame|room skips the welcome screen,
// and &turn=90 turns you that many degrees to the left.
const startView = params.get('view');
if (startView) {
  document.body.classList.remove('intro');
  if (views[startView]) focus(startView, true);
  turnBy(THREE.MathUtils.degToRad(Number(params.get('turn')) || 0));
}

frame();
