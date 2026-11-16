import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';

// What you see through the window: a physically based sunset sky over open sea.

// Direction towards the sun as drawn in the sky (low, just above the horizon).
export const sunInSky = new THREE.Vector3().setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - 5.5),
  THREE.MathUtils.degToRad(-90 - 30)
);

// Wave normals built from a handful of sine waves, so the texture tiles.
function waveNormals() {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const g = canvas.getContext('2d');
  const img = g.createImageData(S, S);
  const waves = [
    [1, 2, 1.0, 0.3], [3, -1, 0.7, 1.7], [-2, 4, 0.5, 4.1], [5, 3, 0.35, 2.2],
    [-6, 5, 0.25, 0.9], [8, -7, 0.18, 5.3], [11, 6, 0.12, 3.4], [-13, 10, 0.09, 1.1],
    [17, -15, 0.06, 2.9], [23, 19, 0.04, 0.2],
  ];
  const k = (Math.PI * 2) / S;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let dx = 0;
      let dy = 0;
      for (const [fx, fy, amp, phase] of waves) {
        const c = Math.cos((fx * x + fy * y) * k + phase) * amp;
        dx += c * fx;
        dy += c * fy;
      }
      const nx = -dx * 0.09;
      const ny = -dy * 0.09;
      const len = Math.hypot(nx, ny, 1);
      const i = (y * S + x) * 4;
      img.data[i] = (nx / len) * 127 + 128;
      img.data[i + 1] = (ny / len) * 127 + 128;
      img.data[i + 2] = (1 / len) * 127 + 128;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function buildOutside(scene, room) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 9;
  u.rayleigh.value = 2.6;
  u.mieCoefficient.value = 0.006;
  u.mieDirectionalG.value = 0.82;
  u.sunPosition.value.copy(sunInSky);
  u.cloudCoverage.value = 0.42;
  u.cloudDensity.value = 0.45;
  // The sun disc is thousands of times brighter than anything else in the picture,
  // and the sky itself far brighter than the room. Dim the sky and cap the sun so
  // the sunset stays visible through the window, as a camera exposed for it would show.
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'gl_FragColor = vec4( texColor, 1.0 );',
    'gl_FragColor = vec4( min( texColor * 0.3, vec3( 5.0, 4.2, 3.2 ) ), 1.0 );'
  );
  scene.add(sky);

  const water = new Water(new THREE.PlaneGeometry(8000, 8000), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: waveNormals(),
    sunDirection: sunInSky.clone(),
    sunColor: 0xffb070,
    waterColor: 0x0b2733,
    distortionScale: 3.2,
    fog: false,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = -7;
  water.material.uniforms.size.value = 0.6;
  scene.add(water);

  // The sea only needs to mirror the sky, so hide the room while it draws its reflection.
  const drawReflection = water.onBeforeRender;
  water.onBeforeRender = function (...args) {
    room.visible = false;
    drawReflection.apply(this, args);
    room.visible = true;
  };

  return {
    sky,
    water,
    update(time) {
      water.material.uniforms.time.value = time * 0.45;
    },
  };
}
