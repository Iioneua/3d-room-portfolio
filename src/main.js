import * as THREE from 'three';
import './style.css';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildRoom, views, home } from './room.js';
import { buildOutside } from './outside.js';
import { createAmbience } from './audio.js';
import { loadAssets } from './assets.js';
import { profile, stations } from './content.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const HOME_FOV = 62;
const FOCUS_FOV = 50;
const MAX_PITCH = 0.7;
// How far you can turn your head from where you are facing (radians).
const TURN_HOME = 0.9;
const TURN_FOCUS = 0.8;
// Camera exposure: lower is darker. The sky outside is far brighter than the room.
const EXPOSURE = 0.85;

// ---------- Text on the page ----------
document.title = `${profile.name} · ${profile.role}`;
$('brand-name').textContent = profile.name;
$('brand-role').textContent = profile.role;
$('intro-role').textContent = profile.role;
$('intro-title').textContent = `Welcome to ${profile.name}'s room`;
$('intro-tagline').textContent = profile.tagline;
document.body.classList.add('intro');

// The room needs its models and textures before it can be built.
const enter = $('enter');
enter.disabled = true;
enter.textContent = 'Setting up the room…';
const assets = await loadAssets((share) => {
  enter.textContent = `Setting up the room… ${Math.round(share * 100)}%`;
});

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
const outside = buildOutside(scene, room.root);

// Photograph the lit room from its centre and use that picture as ambient light.
// It gives every surface soft bounced light and reflections that match the room.
const pmrem = new THREE.PMREMGenerator(renderer);
const baked = pmrem.fromScene(scene, 0.02, 0.05, 6000, { position: new THREE.Vector3(-0.4, 1.7, 0.4) });
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
const skipOcclusion = [...room.noAO, outside.sky, outside.water];
occlusion.render = (...args) => {
  for (const o of skipOcclusion) o.visible = false;
  drawOcclusion(...args);
  for (const o of skipOcclusion) o.visible = true;
};
occlusion.enabled = fixedQuality !== 'low';
composer.addPass(occlusion);

// Glow around the sun, lamps and screens.
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
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- Info card ----------
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
enter.disabled = false;
enter.textContent = 'Enter the room';
enter.addEventListener('click', () => {
  document.body.classList.remove('intro');
  ambience.start();
});

// ---------- Loop ----------
const timer = new THREE.Timer();
let frames = 0;

function frame(now) {
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

  room.update(time);
  outside.update(time);
  finish.uniforms.uTime.value = time;
  composer.render();
  placeLabels();
  watchSpeed();
  requestAnimationFrame(frame);
}

// If the computer struggles, trade some sharpness and the contact shadows for speed.
const speed = { since: 0, frames: 0, last: 0, step: 0 };
function watchSpeed() {
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

// For testing: ?view=desk|photos|shelf|frame|room skips the welcome screen,
// and &turn=90 turns you that many degrees to the left.
const startView = params.get('view');
if (startView) {
  document.body.classList.remove('intro');
  if (views[startView]) focus(startView, true);
  turnBy(THREE.MathUtils.degToRad(Number(params.get('turn')) || 0));
}

frame();
