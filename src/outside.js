import * as THREE from 'three';

// What you see through the window: a lake at dusk. The sun has just set behind the
// mountains; the sky fades from peach at the horizon to lavender and deep blue, town
// lights twinkle along the far shore and the calm water mirrors it all.
//
// Everything is drawn by one shader on a huge sphere, from the direction you look
// in, so it sits infinitely far away like real scenery.

const vertexShader = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vDir = world.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * world;
    gl_Position.z = gl_Position.w; // always behind everything else
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uBrightness;
  varying vec3 vDir;

  float hash(float n) { return fract(sin(n) * 43758.5453123); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(float x) {
    float i = floor(x); float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  float noise2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
  }
  float ridge(float x, float seed) {
    float v = 0.0; float a = 0.5; float f = 1.0;
    for (int i = 0; i < 5; i++) { v += a * noise(x * f + seed); f *= 2.03; a *= 0.5; }
    return v;
  }
  float fbm2(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise2(p); p = p * 2.02 + vec2(3.1, 1.7); a *= 0.5; }
    return v;
  }

  // Sky colour for an elevation e (radians above the horizon) and azimuth a.
  vec3 sky(float e, float a) {
    vec3 c0 = vec3(1.00, 0.62, 0.45);  // peach at the horizon
    vec3 c1 = vec3(0.95, 0.48, 0.62);  // pink
    vec3 c2 = vec3(0.66, 0.44, 0.72);  // mauve
    vec3 c3 = vec3(0.36, 0.34, 0.62);  // lavender blue
    vec3 c4 = vec3(0.16, 0.17, 0.38);  // deep evening blue
    float t = max(e, 0.0);
    vec3 c = mix(c0, c1, smoothstep(0.0, 0.08, t));
    c = mix(c, c2, smoothstep(0.06, 0.22, t));
    c = mix(c, c3, smoothstep(0.18, 0.45, t));
    c = mix(c, c4, smoothstep(0.4, 0.9, t));
    // Brighter where the sun went down (to the left of the window).
    c += vec3(0.35, 0.16, 0.08) * exp(-pow((a + 0.35) * 2.2, 2.0)) * exp(-t * 9.0);
    // Long soft clouds, lit pink and orange from below.
    vec2 q = vec2(a * 2.2, e * 13.0);
    float n = fbm2(q + vec2(uTime * 0.004, 0.0));
    float band = smoothstep(0.03, 0.12, t) * (1.0 - smoothstep(0.22, 0.42, t));
    float cloud = smoothstep(0.48, 0.78, n) * band;
    vec3 cloudCol = mix(vec3(1.0, 0.68, 0.62), vec3(0.62, 0.48, 0.66), smoothstep(0.08, 0.3, t));
    c = mix(c, cloudCol, cloud * 0.55);
    // Dusk colours are rich; keep them from washing out to grey.
    float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luma), c, 1.3);
  }

  // Mountains in three hazy layers. Returns the colour and how much of it covers the sky.
  vec4 mountains(float e, float a) {
    vec4 result = vec4(0.0);
    // far, middle, near
    float h3 = 0.045 + 0.06 * ridge(a * 3.0, 11.0);
    float h2 = 0.02 + 0.075 * pow(ridge(a * 4.2, 37.0), 1.4);
    float h1 = 0.008 + 0.05 * pow(ridge(a * 6.5 + 2.0, 73.0), 1.8);
    vec3 far = vec3(0.64, 0.46, 0.66);
    vec3 mid = vec3(0.45, 0.34, 0.54);
    vec3 near = vec3(0.28, 0.23, 0.40);
    float aa = 0.0015;
    float m3 = 1.0 - smoothstep(h3 - aa, h3 + aa, e);
    float m2 = 1.0 - smoothstep(h2 - aa, h2 + aa, e);
    float m1 = 1.0 - smoothstep(h1 - aa, h1 + aa, e);
    // Haze thickens towards the foot of each range.
    vec3 c = far * (0.92 + 0.08 * smoothstep(0.0, h3, e));
    c = mix(c, mid * (0.9 + 0.12 * smoothstep(0.0, h2, e)), m2);
    c = mix(c, near * (0.88 + 0.15 * smoothstep(0.0, h1, e)), m1);
    return vec4(c, max(m3, max(m2, m1)));
  }

  // Town lights along the far shore.
  vec3 lights(float e, float a, float stretch) {
    vec3 col = vec3(0.0);
    float cell = 0.006;
    float id = floor(a / cell);
    for (int k = -1; k <= 1; k++) {
      float i = id + float(k);
      float r = hash(i * 7.31);
      if (r < 0.45) continue;
      float x = (i + hash(i * 1.7)) * cell;
      float y = 0.0025 + hash(i * 3.9) * 0.006;
      float s = 0.00065 + hash(i * 5.3) * 0.0005;
      float twinkle = 0.75 + 0.25 * sin(uTime * (1.0 + r * 2.0) + i);
      vec2 d = vec2((a - x) / s, (e - y) / (s * stretch));
      float g = exp(-dot(d, d) * 0.5);
      vec3 tint = mix(vec3(1.0, 0.78, 0.5), vec3(1.0, 0.92, 0.8), hash(i * 2.1));
      col += tint * g * twinkle * (2.2 + 2.0 * r);
    }
    return col;
  }

  vec3 scene(float e, float a) {
    vec3 c = sky(e, a);
    vec4 m = mountains(e, a);
    c = mix(c, m.rgb, m.a);
    return c;
  }

  void main() {
    vec3 d = normalize(vDir);
    float e = asin(clamp(d.y, -1.0, 1.0)) + 0.012; // horizon a little below eye level
    float a = atan(d.x, -d.z);
    vec3 col;
    if (e >= 0.0) {
      col = scene(e, a) + lights(e, a, 1.0);
    } else {
      // The lake: a mirror image broken up by slow ripples.
      float depth = -e;
      float w = noise2(vec2(a * 40.0, depth * 260.0 - uTime * 0.6)) - 0.5;
      float w2 = noise2(vec2(a * 140.0, depth * 900.0 - uTime * 1.3)) - 0.5;
      float ripple = (w * 0.012 + w2 * 0.004) * smoothstep(0.0, 0.08, depth);
      float re = depth * 0.92 + ripple * 0.4;
      float ra = a + ripple;
      col = scene(re, ra) * vec3(0.78, 0.76, 0.86);
      // Light streaks under the town lights.
      col += lights(re * 0.3, a, 1.0) * 0.25 * smoothstep(0.06, 0.0, depth);
      // Glints where the ripples catch the bright sky.
      float glint = smoothstep(0.42, 0.5, w2 + 0.5) * smoothstep(0.12, 0.0, depth);
      col += vec3(1.0, 0.75, 0.65) * glint * 0.25;
      // The near water is darker.
      col *= mix(1.0, 0.55, smoothstep(0.0, 0.5, depth));
    }
    gl_FragColor = vec4(col * uBrightness, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function buildOutside(scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBrightness: { value: 1.05 } },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), material);
  sky.frustumCulled = false;
  scene.add(sky);
  return {
    sky,
    update(time) {
      material.uniforms.uTime.value = time;
    },
  };
}
