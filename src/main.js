import * as THREE from 'three';
import './style.css';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildRoom, views, home, screen } from './room.js';
import { buildOutside } from './outside.js';
import { createAmbience } from './audio.js';
import { loadAssets } from './assets.js';
import { profile, stations, projects } from './content.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const HOME_FOV = 58;
const FOCUS_FOV = 48;
const MAX_PITCH = 0.7;
// How far you can turn your head from where you are facing (radians).
const TURN_HOME = 1.3;
const TURN_FOCUS = 0.8;
// Camera exposure: lower is darker.
const EXPOSURE = 0.9;

// ---------- Text on the page ----------
document.title = `${profile.name} · ${profile.role}`;
$('brand-name').textContent = profile.name;
$('brand-tagline').textContent = profile.tagline;
$('intro-role').textContent = profile.role;
$('intro-title').textContent = `Welcome to ${profile.name}'s room`;
$('intro-tagline').textContent = profile.tagline;
document.body.classList.add('intro');

// Text drawn onto the screens and the plaque needs the web fonts, so wait for them
// (but never more than a few seconds).
function fontsReady() {
  const fonts = ['400 40px "Instrument Serif"', '500 16px Inter', '600 16px Inter', '700 16px Inter', '400 16px "JetBrains Mono"'];
  const loaded = Promise.all(fonts.map((f) => document.fonts.load(f))).catch(() => {});
  return Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

// The room needs its models and textures before it can be built.
const enter = $('enter');
enter.disabled = true;
enter.textContent = 'Setting up the room…';
const [assets] = await Promise.all([
  loadAssets((share) => {
    enter.textContent = `Setting up the room… ${Math.round(share * 100)}%`;
  }),
  fontsReady(),
]);

// ---------- Scene ----------
// ?quality=high or ?quality=low fixes the quality; otherwise it adapts to the computer.
const fixedQuality = params.get('quality');
let pixelRatio = Math.min(window.devicePixelRatio, fixedQuality === 'low' ? 1 : 1.5);

const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Nothing that casts a shadow ever moves, so the shadows are drawn once.
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
// AgX keeps bright windows and lamps from turning orange or clipping to flat white,
// the way a camera sensor would.
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = EXPOSURE;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(HOME_FOV, 1, 0.05, 6000);
camera.rotation.order = 'YXZ';
const room = buildRoom(scene, assets, stations, profile);
const outside = buildOutside(scene);

// Photograph the lit room from its centre and use that picture as ambient light.
// It gives every surface soft bounced light and reflections that match the room.
const pmrem = new THREE.PMREMGenerator(renderer);
const baked = pmrem.fromScene(scene, 0.02, 0.05, 6000, { position: new THREE.Vector3(0.3, 1.5, -0.8) });
scene.environment = baked.texture;
scene.environmentIntensity = 1.0;
room.bounce.intensity = 0.2;
pmrem.dispose();

// ---------- Camera effects ----------
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
);
composer.addPass(new RenderPass(scene, camera));

// Contact shadows where surfaces meet (corners, under furniture, between books).
const occlusion = new GTAOPass(scene, camera, 1, 1);
occlusion.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.5, thickness: 1.2, scale: 1.2, samples: 12 });
const drawOcclusion = occlusion.render.bind(occlusion);
const skipOcclusion = [...room.noAO, outside.sky];
occlusion.render = (...args) => {
  for (const o of skipOcclusion) o.visible = false;
  drawOcclusion(...args);
  for (const o of skipOcclusion) o.visible = true;
};
occlusion.enabled = fixedQuality !== 'low';
composer.addPass(occlusion);

// Glow around the lamps, LED strips and screens.
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.2, 0.7, 1.3));
composer.addPass(new OutputPass());

// A gentle contrast curve and a little extra colour (the tone mapping is soft on its
// own), slight darkening towards the corners and a touch of film grain.
const finish = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 s = clamp(c.rgb, 0.0, 1.0);
      c.rgb = mix(s, s * s * (3.0 - 2.0 * s), 0.22);
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(luma), c.rgb, 1.1);
      vec2 d = (vUv - 0.5) * vec2(1.0, 0.85);
      c.rgb *= mix(0.8, 1.0, smoothstep(0.8, 0.25, length(d)));
      c.rgb += (hash(vUv * 900.0 + fract(uTime) * 37.0) - 0.5) * 0.016;
      gl_FragColor = c;
    }
  `,
});
composer.addPass(finish);

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

function walkTo(p, seconds = 1.6, smooth = false) {
  // Turn the short way round.
  const turn = THREE.MathUtils.euclideanModulo(p.yaw - rig.yaw + Math.PI, Math.PI * 2) - Math.PI;
  tween = {
    from: { pos: rig.pos.clone(), yaw: rig.yaw, pitch: rig.pitch, fov: rig.fov },
    to: { pos: p.pos, yaw: rig.yaw + turn, pitch: p.pitch, fov: p.fov },
    start: performance.now(),
    ms: seconds * 1000,
    smooth, // no walking bob
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
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // At the computer, keep the screen framed the same way in the new window size.
  if (inComputer) {
    const { pose } = computerLayout();
    if (tween) tween.to.pos = pose.pos;
    else rig.pos.copy(pose.pos);
    sizeComputer();
  }
}
window.addEventListener('resize', resize);

// ---------- Info card ----------
const card = $('card');
let cardTimer = null;

function fillCard(id) {
  const s = stations[id];
  $('card-kicker').textContent = s.where || s.kicker;
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

function markPill(id) {
  for (const [key, el] of Object.entries(pills)) el.classList.toggle('active', key === id);
}

function focus(id, instant = false) {
  current = id;
  markPill(id);
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
  markPill(null);
  clearTimeout(cardTimer);
  card.classList.remove('open');
  document.body.classList.remove('focused');
  walkTo(pose(home, HOME_FOV), 1.5);
}

function openLink(id) {
  window.open(stations[id].link.url, '_blank', 'noopener');
}

$('back').addEventListener('click', () => (inComputer ? leaveComputer() : back()));
$('card-close').addEventListener('click', back);
window.addEventListener('keydown', (e) => {
  if (inComputer) return;
  if (e.key === 'Escape') back();
  if (tween) return;
  if (e.key === 'ArrowLeft') turnBy(0.12);
  if (e.key === 'ArrowRight') turnBy(-0.12);
});

// ---------- Places: pills at the top and markers over the objects ----------
const pills = {};
for (const id of Object.keys(stations)) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'pill';
  el.textContent = stations[id].label;
  el.addEventListener('click', () => {
    if (current === id) back();
    else focus(id);
  });
  $('pills').append(el);
  pills[id] = el;
}

const labelLayer = $('labels');
const labels = Object.keys(views).map((id) => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'hotspot';
  el.setAttribute('aria-label', stations[id].label);
  const text = document.createElement('span');
  text.className = 'hotspot-label';
  text.textContent = stations[id].label;
  el.append(text);
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
  // The "Go into the computer" button, under the monitor, from the middle of the room or the desk.
  const showPill = !inComputer && !tween && (current === null || current === 'desk') && !document.body.classList.contains('intro');
  pill.classList.toggle('show', showPill);
  if (showPill) {
    projected.copy(screen.button).project(camera);
    pill.style.transform = `translate(${((projected.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-projected.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -50%)`;
  }
}

// ---------- The computer ----------
// The button walks you up to the monitor. The camera stops in front of it with the room
// still around it, and a working desktop is laid exactly over the screen.
const pill = $('computer-pill');
let inComputer = false;
let showingComputer = false; // the desktop is on the screen (also while it fades out)
let computer = null;
let computerModule = null;
const loadComputer = () => (computerModule ??= import('./computer/index.js'));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Room left around the screen: wall above, a strip of desk and the hint below.
const AROUND_SCREEN = { top: 84, bottom: 56, sides: 0.06 };
const hint = $('hint');
const ROOM_HINT = hint.textContent;
const COMPUTER_HINT = 'Click anywhere around the screen to step back';
// The desktop is laid out for a screen about this tall (in CSS pixels), then scaled.
const DESKTOP_HEIGHT = 640;

// Where the screen should sit on the page, and where the camera stands for that.
function computerLayout() {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const aspect = screen.width / screen.height;
  const room = { w: W * (1 - 2 * AROUND_SCREEN.sides), h: H - AROUND_SCREEN.top - AROUND_SCREEN.bottom };
  let width = room.w;
  let height = width / aspect;
  if (height > room.h) {
    height = room.h;
    width = height * aspect;
  }
  const top = AROUND_SCREEN.top + (room.h - height) / 2;
  const t = Math.tan(THREE.MathUtils.degToRad(FOCUS_FOV / 2));
  // Close enough that the screen is `height` pixels tall...
  const distance = (screen.height * H) / (2 * t * height);
  // ...and the camera raised a little so the screen sits at `top`, not dead centre.
  const lift = ((top + height / 2 - H / 2) * 2 * distance * t) / H;
  const pos = screen.center.clone().add(new THREE.Vector3(0, lift, distance));
  return { pose: { pos, yaw: 0, pitch: 0, fov: FOCUS_FOV }, width, height };
}

function sizeComputer() {
  const { width, height } = computerLayout();
  const scale = THREE.MathUtils.clamp(height / DESKTOP_HEIGHT, 0.75, 1.12);
  computer?.setSize(Math.round(width / scale), Math.round(height / scale), scale);
}

// Keeps the desktop glued to the screen as the camera sees it this frame.
const corner = new THREE.Vector3();
function trackScreen() {
  if (!showingComputer || !computer) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const { center } = screen;
  corner.set(center.x - screen.width / 2, center.y + screen.height / 2, center.z).project(camera);
  const x0 = (corner.x * 0.5 + 0.5) * W;
  const y0 = (-corner.y * 0.5 + 0.5) * H;
  corner.set(center.x + screen.width / 2, center.y - screen.height / 2, center.z).project(camera);
  computer.track({ x: x0, y: y0, width: (corner.x * 0.5 + 0.5) * W - x0 });
}

async function enterComputer(instant = false) {
  if (inComputer) return;
  inComputer = true;
  current = 'desk';
  markPill('desk');
  clearTimeout(cardTimer);
  card.classList.remove('open');
  hint.textContent = COMPUTER_HINT;
  document.body.classList.add('focused', 'computer');
  const { pose } = computerLayout();
  if (instant) jumpTo(pose);
  else walkTo(pose, 1.4, true);
  const [mod] = await Promise.all([loadComputer(), wait(instant ? 0 : 950)]);
  if (!inComputer) return;
  computer ??= mod.createComputer({ profile, projects, stations, onLeave: leaveComputer });
  sizeComputer();
  showingComputer = true;
  trackScreen();
  computer.show();
}

function leaveComputer() {
  if (!inComputer) return;
  inComputer = false;
  computer?.hide();
  document.body.classList.remove('computer');
  // The desktop fades out on the screen while the camera steps back.
  setTimeout(() => {
    if (inComputer) return;
    showingComputer = false;
    hint.textContent = ROOM_HINT;
  }, 500);
  focus('desk');
}

pill.addEventListener('click', () => enterComputer());

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
  if (inComputer) {
    // At the computer the view holds still; a click around the screen steps back.
    canvas.style.cursor = 'zoom-out';
    if (drag && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    return;
  }
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
  canvas.style.cursor = inComputer ? 'zoom-out' : 'grab';
  if (!wasClick || document.body.classList.contains('intro')) return;
  if (inComputer) {
    if (showingComputer && !tween) leaveComputer();
    return;
  }
  const id = pick(event);
  if (id === 'desk' && current === 'desk') enterComputer();
  else if (id && id === current) openLink(id);
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
enter.disabled = false;
enter.textContent = 'Enter the room';
enter.addEventListener('click', () => {
  document.body.classList.remove('intro');
  ambience.start();
  // Fetch the computer's code in the background so going in is instant.
  setTimeout(loadComputer, 2500);
});

// ---------- Loop ----------
const timer = new THREE.Timer();
let frames = 0;
let steady = 0; // 1 holds the head still (at the computer)
let lastDraw = 0;

function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  // While someone works at the computer the camera holds still, so the room around
  // the screen (dust, a flicker of light) only needs redrawing ten times a second.
  if (inComputer && showingComputer && !tween && steady > 0.995 && now - lastDraw < 100) return;
  lastDraw = now;
  timer.update(now);
  const time = timer.getElapsed();
  // Lets automated screenshots know the room has been drawn.
  if (++frames === 5) window.__ready = true;
  let step = 0;

  if (tween) {
    const k = Math.min((performance.now() - tween.start) / tween.ms, 1);
    const e = ease(k);
    rig.pos.lerpVectors(tween.from.pos, tween.to.pos, e);
    rig.yaw = THREE.MathUtils.lerp(tween.from.yaw, tween.to.yaw, e);
    rig.pitch = THREE.MathUtils.lerp(tween.from.pitch, tween.to.pitch, e);
    rig.fov = THREE.MathUtils.lerp(tween.from.fov, tween.to.fov, e);
    // A slight bob while walking.
    if (!tween.smooth) step = Math.sin(k * Math.PI * 5) * Math.sin(k * Math.PI) * 0.022;
    if (k >= 1) tween = null;
  }

  if (camera.fov !== rig.fov) {
    camera.fov = rig.fov;
    camera.updateProjectionMatrix();
  }

  // The head leans a little with the mouse, plus slow breathing (held still at the
  // computer, so the desktop stays put on the screen).
  steady += ((inComputer ? 1 : 0) - steady) * 0.08;
  const loose = 1 - steady;
  sway.lerp(pointer, 0.04);
  camera.position.copy(rig.pos);
  camera.position.y += step + Math.sin(time * 0.9) * 0.006 * loose;
  camera.rotation.set(rig.pitch, rig.yaw, 0);
  camera.translateX(sway.x * 0.05 * loose);
  camera.translateY(sway.y * 0.03 * loose);

  room.update(time);
  outside.update(time);
  finish.uniforms.uTime.value = time;
  composer.render();
  placeLabels();
  trackScreen();
  watchSpeed();
}

// If the computer struggles, trade some sharpness and the contact shadows for speed.
const speed = { since: 0, frames: 0, last: 0, step: 0 };
function watchSpeed() {
  if (inComputer) {
    // Drawing is slowed on purpose at the desk computer; measure again afterwards.
    speed.last = 0;
    return;
  }
  if (fixedQuality || speed.step >= 2 || document.body.classList.contains('intro')) return;
  const now = performance.now();
  if (now - speed.last > 400) {
    // The tab was in the background or just started: begin a fresh measurement.
    speed.since = now;
    speed.frames = 0;
  }
  speed.last = now;
  speed.frames++;
  if (now - speed.since < 3000) return;
  const fps = (speed.frames * 1000) / (now - speed.since);
  speed.since = now;
  speed.frames = 0;
  if (fps >= 30) return;
  speed.step++;
  if (speed.step === 1) pixelRatio = 1;
  else occlusion.enabled = false;
  resize();
}

resize();
jumpTo(pose(home, HOME_FOV));

// For testing: ?view=desk|photos|shelf|frame|room|computer skips the welcome screen,
// and &turn=90 turns you that many degrees to the left.
const startView = params.get('view');
if (startView) {
  document.body.classList.remove('intro');
  if (views[startView]) focus(startView, true);
  if (startView === 'computer') enterComputer(true);
  turnBy(THREE.MathUtils.degToRad(Number(params.get('turn')) || 0));
}

frame();
