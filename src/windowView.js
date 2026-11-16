import * as THREE from 'three';

// The view through the window: a painted sunset over the sea, animated in a shader.
export function createWindowMaterial(aspect) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPar: { value: new THREE.Vector2() },
      uAspect: { value: aspect },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uPar;
      uniform float uAspect;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      void main() {
        vec2 uv = vUv + uPar;
        float hor = 0.42;
        vec2 sun = vec2(0.6, hor + 0.085);
        vec3 col;

        if (uv.y > hor) {
          float t = (uv.y - hor) / (1.0 - hor);
          vec3 gold = vec3(1.0, 0.80, 0.50);
          vec3 coral = vec3(0.97, 0.55, 0.43);
          vec3 mauve = vec3(0.58, 0.38, 0.60);
          vec3 indigo = vec3(0.27, 0.24, 0.48);
          col = mix(gold, coral, smoothstep(0.0, 0.32, t));
          col = mix(col, mauve, smoothstep(0.25, 0.68, t));
          col = mix(col, indigo, smoothstep(0.6, 1.15, t));

          float cl = noise(vec2(uv.x * 3.0 + uTime * 0.012, uv.y * 15.0));
          cl = smoothstep(0.55, 0.82, cl) * smoothstep(0.08, 0.3, t) * (1.0 - smoothstep(0.6, 0.95, t));
          col = mix(col, vec3(1.0, 0.74, 0.62), cl * 0.6);

          float d = distance(vec2(uv.x * uAspect, uv.y), vec2(sun.x * uAspect, sun.y));
          col += vec3(1.0, 0.6, 0.3) * exp(-d * 5.5) * 0.55;
          col = mix(col, vec3(1.0, 0.96, 0.82), smoothstep(0.085, 0.075, d));

          // A distant headland on the horizon.
          float hill = hor + 0.05 * exp(-pow((uv.x - 0.14) * 7.0, 2.0)) + 0.025 * exp(-pow((uv.x - 0.3) * 9.0, 2.0));
          col = mix(col, vec3(0.36, 0.26, 0.42), step(uv.y, hill));
        } else {
          float t = (hor - uv.y) / hor;
          vec3 near = vec3(0.95, 0.62, 0.46);
          vec3 mid = vec3(0.36, 0.36, 0.55);
          vec3 deep = vec3(0.17, 0.21, 0.38);
          col = mix(near, mid, smoothstep(0.0, 0.35, t));
          col = mix(col, deep, smoothstep(0.3, 1.0, t));

          float w = 0.035 + t * 0.14;
          float refl = smoothstep(w, 0.0, abs(uv.x - sun.x));
          float ripple = noise(vec2(uv.x * 40.0, t * 60.0 / (t + 0.15) - uTime * 0.8));
          col += vec3(1.0, 0.8, 0.5) * refl * smoothstep(0.35, 0.75, ripple) * 0.9 * (1.0 - t * 0.6);

          float wl = noise(vec2(uv.x * 18.0, t * 45.0 / (t + 0.2) + uTime * 0.3));
          col += vec3(0.11, 0.08, 0.06) * smoothstep(0.6, 0.9, wl);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
