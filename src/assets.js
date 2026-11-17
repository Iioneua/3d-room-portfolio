import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Scanned models, surface textures and photos, all CC0 from Poly Haven
// (polyhaven.com). They live in public/assets and are loaded before the room is built.

const BASE = `${import.meta.env.BASE_URL}assets/`;

const MODELS = [
  'potted_plant_02',
  'potted_plant_04',
  'mid_century_lounge_chair',
  'desk_lamp_arm_01',
  'modern_ceiling_lamp_01',
  'modern_wooden_cabinet',
  'book_encyclopedia_set_01',
  'ceramic_vase_01',
  'ceramic_vase_02',
  'standing_picture_frame_01',
];

// Each surface: folder, real-world size of one tile in metres, and which maps it has.
const SURFACES = {
  floor: { dir: 'wood_floor', size: 1.7, maps: ['diffuse', 'nor_gl', 'rough'] },
  plaster: { dir: 'plastered_wall_04', size: 3.2, maps: ['nor_gl', 'rough'] },
  oak: { dir: 'oak_veneer_01', size: 1.83, maps: ['diffuse', 'nor_gl', 'rough'] },
  walnut: { dir: 'walnut_veneer', size: 1.8, maps: ['diffuse', 'nor_gl', 'rough'] },
  wool: { dir: 'poly_wool_herringbone', size: 0.27, maps: ['diffuse', 'nor_gl'] },
  linen: { dir: 'rough_linen', size: 0.27, maps: ['nor_gl'] },
  knit: { dir: 'knitted_fleece', size: 0.27, maps: ['nor_gl'] },
  velvet: { dir: 'velour_velvet', size: 0.28, maps: ['nor_gl'] },
};

const PHOTOS = ['photo-0', 'photo-1', 'photo-2', 'photo-3', 'photo-4', 'frame'];

export async function loadAssets(onProgress) {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => onProgress?.(loaded / total);
  const gltf = new GLTFLoader(manager);
  const images = new THREE.TextureLoader(manager);

  const texture = (url, srgb) =>
    images.loadAsync(url).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    });

  const models = {};
  const surfaces = {};
  const photos = {};
  const jobs = [];

  for (const id of MODELS) {
    jobs.push(
      gltf.loadAsync(`${BASE}models/${id}/${id}.gltf`).then((g) => {
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        models[id] = g.scene;
      })
    );
  }
  for (const [name, s] of Object.entries(SURFACES)) {
    surfaces[name] = { size: s.size };
    for (const map of s.maps) {
      jobs.push(
        texture(`${BASE}textures/${s.dir}/${map}.jpg`, map === 'diffuse').then((t) => {
          surfaces[name][map] = t;
        })
      );
    }
  }
  for (const id of PHOTOS) {
    jobs.push(texture(`${BASE}photos/${id}.jpg`, true).then((t) => (photos[id] = t)));
  }

  await Promise.all(jobs);
  return { models, surfaces, photos };
}

// A fresh copy of a loaded model. Materials are shared with the original.
export function placeModel(assets, id, parent, { x = 0, y = 0, z = 0, rotY = 0, scale = 1 } = {}) {
  const m = assets.models[id].clone(true);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  if (Array.isArray(scale)) m.scale.set(...scale);
  else m.scale.setScalar(scale);
  parent.add(m);
  return m;
}
