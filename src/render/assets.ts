import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Un modello Polyfork ridotto a una sola geometria con colori per vertice. */
export interface ModelGeo {
  geometry: THREE.BufferGeometry;
  box: THREE.Box3;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<ModelGeo>>();

export const modelUrl = (id: string) => `${import.meta.env.BASE_URL}models/${id}.glb`;

/** Carica un GLB e unisce tutte le sue mesh (con le trasformazioni dei nodi) in una geometria. */
export function loadModel(id: string): Promise<ModelGeo> {
  let p = cache.get(id);
  if (!p) {
    p = loader.loadAsync(modelUrl(id)).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: THREE.BufferGeometry[] = [];
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        let g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        if (g.index) g = g.toNonIndexed();
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'color'].includes(name)) g.deleteAttribute(name);
        }
        if (!g.attributes.color) {
          const c = new Float32Array(g.attributes.position.count * 3).fill(0.8);
          g.setAttribute('color', new THREE.BufferAttribute(c, 3));
        }
        // Alcuni GLB hanno colori RGBA o normalizzati: li portiamo tutti a RGB float.
        const col = g.attributes.color as THREE.BufferAttribute;
        if (col.itemSize !== 3 || !(col.array instanceof Float32Array)) {
          const out = new Float32Array(col.count * 3);
          for (let i = 0; i < col.count; i++) {
            out[i * 3] = col.getX(i);
            out[i * 3 + 1] = col.getY(i);
            out[i * 3 + 2] = col.getZ(i);
          }
          g.setAttribute('color', new THREE.BufferAttribute(out, 3));
        }
        if (!g.attributes.normal) g.computeVertexNormals();
        parts.push(g);
      });
      const geometry = mergeGeometries(parts, false)!;
      geometry.computeBoundingBox();
      return { geometry, box: geometry.boundingBox!.clone() };
    });
    cache.set(id, p);
  }
  return p;
}

/** Spezza i triangoli finché nessun lato supera `maxLen` sul piano xz (serve per piegare i binari). */
export function subdivide(src: THREE.BufferGeometry, maxLen: number): THREE.BufferGeometry {
  const pos = src.attributes.position;
  const col = src.attributes.color;
  type V = { p: THREE.Vector3; c: THREE.Color };
  const out: V[] = [];
  const lenXZ = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
  const mid = (a: V, b: V): V => ({ p: a.p.clone().lerp(b.p, 0.5), c: a.c.clone().lerp(b.c, 0.5) });
  const split = (a: V, b: V, c: V, depth: number) => {
    const ab = lenXZ(a.p, b.p);
    const bc = lenXZ(b.p, c.p);
    const ca = lenXZ(c.p, a.p);
    const m = Math.max(ab, bc, ca);
    if (m <= maxLen || depth > 8) {
      out.push(a, b, c);
      return;
    }
    if (m === ab) {
      const d = mid(a, b);
      split(a, d, c, depth + 1);
      split(d, b, c, depth + 1);
    } else if (m === bc) {
      const d = mid(b, c);
      split(a, b, d, depth + 1);
      split(a, d, c, depth + 1);
    } else {
      const d = mid(c, a);
      split(a, b, d, depth + 1);
      split(d, b, c, depth + 1);
    }
  };
  for (let i = 0; i < pos.count; i += 3) {
    const v = (k: number): V => ({
      p: new THREE.Vector3().fromBufferAttribute(pos, k),
      c: new THREE.Color(col.getX(k), col.getY(k), col.getZ(k)),
    });
    split(v(i), v(i + 1), v(i + 2), 0);
  }
  const P = new Float32Array(out.length * 3);
  const C = new Float32Array(out.length * 3);
  out.forEach((v, i) => {
    P.set([v.p.x, v.p.y, v.p.z], i * 3);
    C.set([v.c.r, v.c.g, v.c.b], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  return g;
}

/**
 * Piega un binario dritto (centrato, lungo z da +2 a -2, cioè da sud a nord)
 * in una curva di 90 gradi che va dal lato sud al lato est della cella.
 */
export function bendTrack(straight: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = subdivide(straight, 0.5);
  const pos = g.attributes.position;
  const R = 2;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = Math.min(1, Math.max(0, (2 - z) / 4));
    const th = (u * Math.PI) / 2;
    const r = R - x;
    pos.setX(i, 2 - r * Math.cos(th));
    pos.setZ(i, 2 - r * Math.sin(th));
  }
  g.computeVertexNormals();
  return g;
}

/** Copia una geometria centrandola sul piano xz (y resta com'è). */
export function centered(m: ModelGeo): THREE.BufferGeometry {
  const g = m.geometry.clone();
  const c = new THREE.Vector3();
  m.box.getCenter(c);
  g.translate(-c.x, 0, -c.z);
  return g;
}
