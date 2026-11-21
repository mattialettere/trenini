import * as THREE from 'three';
import { Board } from '../core/board';
import type { SimSnapshot, TrackStep } from '../core/sim';
import { Cargo, Cell, DX, DY, Dir, Piece, opposite } from '../core/types';
import { ModelGeo, bendTrack, centered, loadModel } from './assets';
import { cargoSprite, markerSprite, switchSprite } from './icons';

/** Lato di una cella in metri: quanto il binario dritto Polyfork. */
export const CELL = 4;
const MARGIN = 1;

const M = {
  straight: 'straight-track-d4cf38',
  crossing: 'diamond-crossing-436c20',
  buffer: 'buffer-stop-4871fc',
  lever: 'point-lever-5b61ca',
  shed: 'engine-shed-eff627',
  stationBuilding: 'country-station-building-2d8f5e',
  platform: 'platform-run-3738d0',
  canopy: 'platform-canopy-run-bc2275',
  lamp: 'station-bench-5f56b4',
  tree: 'lineside-tree-97e02a',
  apple: 'apple-tree-ef0ba0',
  rock: 'garden-rock-7f5d60',
  hay: 'hay-bale-079e8c',
  pier: 'pier-head-platform-63662b',
  hut: 'harbour-master-s-hut-226f34',
  crane: 'yard-crane-316e4a',
  boat: 'small-fishing-boat-4ac0e3',
  bollard: 'mooring-bollard-2d4bc9',
  loco: 'tank-steam-locomotive-314bb1',
} as const;

export const WAGON_MODEL: Record<Cargo, string> = {
  milk: 'tank-wagon-d860fa',
  coal: 'hopper-wagon-b4c486',
  timber: 'flatbed-wagon-53187a',
  passengers: 'passenger-carriage-de9d58',
};

/** Modelli che servono per disegnare un livello: si caricano solo questi. */
export function modelsFor(board: Board): string[] {
  const ids = new Set<string>(Object.values(M));
  for (const t of board.level.trains) ids.add(WAGON_MODEL[t.cargo]);
  for (const d of board.level.decorations ?? []) ids.add(d.model);
  return [...ids];
}

const DIR_VEC = (d: Dir) => new THREE.Vector3(DX[d], 0, DY[d]);
/** Rotazione attorno a y che porta il nord nella direzione d. */
const yawFor = (d: Dir) => (-d * Math.PI) / 2;

const COLORS = {
  sky: 0xbfe3f2,
  grass: new THREE.Color('#95aa5d'),
  grassDark: new THREE.Color('#87a052'),
  margin: new THREE.Color('#7f9a4c'),
  soil: new THREE.Color('#8d6741'),
  soilDark: new THREE.Color('#6e4f33'),
  rock: new THREE.Color('#8b8473'),
  rockDark: new THREE.Color('#6d675a'),
};

// Generatore pseudo-casuale con seme: le decorazioni restano uguali a ogni partita.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface VehicleView {
  mesh: THREE.Mesh;
  train: number;
  v: number;
}

export class GameScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private models = new Map<string, ModelGeo>();
  private curveGeo: THREE.BufferGeometry | null = null;
  private straightGeo: THREE.BufferGeometry | null = null;

  private levelGroup = new THREE.Group();
  private trackGroup = new THREE.Group();
  private trainGroup = new THREE.Group();
  private overlayGroup = new THREE.Group();
  private highlight: THREE.Mesh;
  private gridLines: THREE.LineSegments | null = null;
  private board: Board | null = null;
  private vehicles: VehicleView[] = [];
  private cargoTags: THREE.Sprite[] = [];
  private sun: THREE.DirectionalLight;

  // Camera isometrica: angolo a scatti di 90 gradi, zoom e spostamento.
  private yawStep = 0;
  private yaw = Math.PI / 4;
  private zoom = 1;
  private target = new THREE.Vector3();
  private extent = 20;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(COLORS.sky);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 400);

    this.scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6b7f8f, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.levelGroup, this.trackGroup, this.trainGroup, this.overlayGroup);
    this.highlight = new THREE.Mesh(
      new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.highlight.position.y = 0.06;
    this.highlight.visible = false;
    this.overlayGroup.add(this.highlight);
  }

  async load(board: Board, onProgress?: (done: number, total: number) => void) {
    const ids = modelsFor(board).filter((id) => !this.models.has(id));
    let done = 0;
    await Promise.all(
      ids.map(async (id) => {
        this.models.set(id, await loadModel(id));
        onProgress?.(++done, ids.length);
      }),
    );
    if (!this.straightGeo) {
      this.straightGeo = centered(this.models.get(M.straight)!);
      this.curveGeo = bendTrack(this.straightGeo);
    }
  }

  private geo(id: string, center = true): THREE.BufferGeometry {
    const m = this.models.get(id);
    if (!m) throw new Error(`modello non caricato: ${id}`);
    return center ? centered(m) : m.geometry;
  }

  private mesh(geometry: THREE.BufferGeometry, cast = true, receive = true): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    return mesh;
  }

  /** Un modello, ridimensionato perché stia in `fit` metri sul lato più lungo. */
  private prop(id: string, fit: number | null, scale = 1): THREE.Mesh {
    const m = this.models.get(id)!;
    const mesh = this.mesh(this.geo(id));
    const size = new THREE.Vector3();
    m.box.getSize(size);
    const s = fit ? Math.min(fit / Math.max(size.x, size.z), 1) * scale : scale;
    mesh.scale.setScalar(s);
    return mesh;
  }

  /** Centro di una cella in coordinate del mondo. */
  cellCenter(x: number, y: number): THREE.Vector3 {
    const b = this.board!;
    return new THREE.Vector3((x + 0.5 - b.width / 2) * CELL, 0, (y + 0.5 - b.height / 2) * CELL);
  }

  // --- livello ---------------------------------------------------------------

  setBoard(board: Board) {
    this.board = board;
    for (const g of [this.levelGroup, this.trackGroup, this.trainGroup]) g.clear();
    this.vehicles = [];
    this.buildIsland();
    this.buildFeatures();
    this.updateTracks();
    this.extent = Math.max(board.width, board.height) * CELL * 0.62 + CELL;
    this.target.set(0, 0, 0);
    this.zoom = 1;
    this.layoutSun();
  }

  private buildIsland() {
    const b = this.board!;
    const W = b.width + MARGIN * 2;
    const H = b.height + MARGIN * 2;
    const x0 = (-b.width / 2 - MARGIN) * CELL;
    const z0 = (-b.height / 2 - MARGIN) * CELL;
    const rand = rng(b.width * 31 + b.height * 7 + b.level.id.charCodeAt(1));

    // Piano superiore: un quadrato per cella, prato a scacchi tenue, bordo più scuro.
    const pos: number[] = [];
    const col: number[] = [];
    const quad = (ax: number, az: number, bx: number, bz: number, y: number, c: THREE.Color) => {
      pos.push(ax, y, az, ax, y, bz, bx, y, bz, ax, y, az, bx, y, bz, bx, y, az);
      for (let i = 0; i < 6; i++) col.push(c.r, c.g, c.b);
    };
    for (let gy = 0; gy < H; gy++) {
      for (let gx = 0; gx < W; gx++) {
        const cx = gx - MARGIN;
        const cy = gy - MARGIN;
        const inGrid = b.inside(cx, cy);
        const c = (inGrid ? ((cx + cy) % 2 === 0 ? COLORS.grass : COLORS.grassDark) : COLORS.margin).clone();
        c.offsetHSL(0, 0, (rand() - 0.5) * 0.02);
        quad(x0 + gx * CELL, z0 + gy * CELL, x0 + (gx + 1) * CELL, z0 + (gy + 1) * CELL, 0, c);
      }
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    top.computeVertexNormals();
    this.levelGroup.add(this.mesh(top, false, true));

    // Fianchi di terra e roccia sotto l'isola, a punta, irregolari.
    const ring = (inset: number, y: number, jitter: number) => {
      const pts: THREE.Vector3[] = [];
      const x1 = x0 + inset;
      const z1 = z0 + inset;
      const x2 = x0 + W * CELL - inset;
      const z2 = z0 + H * CELL - inset;
      const step = CELL / 2;
      const along = (ax: number, az: number, bx: number, bz: number) => {
        const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / step));
        for (let i = 0; i < n; i++) {
          const t = i / n;
          pts.push(new THREE.Vector3(ax + (bx - ax) * t, y + (rand() - 0.5) * jitter, az + (bz - az) * t));
        }
      };
      along(x1, z1, x2, z1);
      along(x2, z1, x2, z2);
      along(x2, z2, x1, z2);
      along(x1, z2, x1, z1);
      return pts;
    };
    const minSide = Math.min(W, H) * CELL;
    const rings = [
      ring(0, 0, 0),
      ring(0, -1.2, 0),
      ring(minSide * 0.12, -4, 1.5),
      ring(minSide * 0.27, -8, 2),
      ring(minSide * 0.42, -12, 2),
    ];
    const tip = new THREE.Vector3(0, -17, 0);
    const sp: number[] = [];
    const sc: number[] = [];
    const tri = (a: THREE.Vector3, b2: THREE.Vector3, c2: THREE.Vector3, c: THREE.Color) => {
      sp.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, c2.x, c2.y, c2.z);
      for (let i = 0; i < 3; i++) sc.push(c.r, c.g, c.b);
    };
    for (let r = 0; r < rings.length; r++) {
      const A = rings[r];
      const B = rings[r + 1];
      const n = A.length;
      for (let i = 0; i < n; i++) {
        const a1 = A[i];
        const a2 = A[(i + 1) % n];
        const shade = rand();
        const c = r === 0 ? (shade > 0.5 ? COLORS.soil : COLORS.soilDark) : shade > 0.5 ? COLORS.rock : COLORS.rockDark;
        if (B && B.length === n) {
          const b1 = B[i];
          const b2 = B[(i + 1) % n];
          tri(a1, b1, a2, c);
          tri(a2, b1, b2, c);
        } else if (B) {
          // Anelli con un numero diverso di punti: proiettiamo sul più vicino.
          const j = Math.floor((i / n) * B.length);
          const j2 = Math.floor(((i + 1) / n) * B.length) % B.length;
          tri(a1, B[j], a2, c);
          if (j2 !== j) tri(a2, B[j], B[j2], c);
        } else {
          tri(a1, tip, a2, c);
        }
      }
    }
    const under = new THREE.BufferGeometry();
    under.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    under.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3));
    under.computeVertexNormals();
    this.levelGroup.add(this.mesh(under, false, false));

    // Alberi sulle celle "T" e qualche decoro sul bordo.
    for (let y = 0; y < b.height; y++) {
      for (let x = 0; x < b.width; x++) {
        if (b.terrain(x, y) !== 'tree') continue;
        const isLineside = rand() > 0.35;
        const t = this.prop(isLineside ? M.tree : M.apple, null, isLineside ? rand() * 0.12 + 0.42 : 0.9 + rand() * 0.2);
        t.position.copy(this.cellCenter(x, y)).add(new THREE.Vector3((rand() - 0.5) * 1.2, 0, (rand() - 0.5) * 1.2));
        t.rotation.y = rand() * Math.PI * 2;
        this.levelGroup.add(t);
      }
    }
    const reserved = new Set<string>();
    for (const d of b.level.depots) reserved.add(`${d.x - DX[d.dir]},${d.y - DY[d.dir]}`);
    for (const s of b.level.stations) {
      reserved.add(`${s.x + DX[s.dir]},${s.y + DY[s.dir]}`);
      reserved.add(`${s.x + DX[s.dir] - DY[s.dir]},${s.y + DY[s.dir] + DX[s.dir]}`);
      reserved.add(`${s.x + DX[s.dir] + DY[s.dir]},${s.y + DY[s.dir] - DX[s.dir]}`);
    }
    for (let gy = -MARGIN; gy < b.height + MARGIN; gy++) {
      for (let gx = -MARGIN; gx < b.width + MARGIN; gx++) {
        if (b.inside(gx, gy) || reserved.has(`${gx},${gy}`)) continue;
        const r = rand();
        if (r > 0.45) continue;
        const id = r < 0.22 ? M.tree : r < 0.32 ? M.apple : r < 0.4 ? M.rock : M.hay;
        const p = this.prop(id, null, id === M.tree ? 0.38 + rand() * 0.1 : id === M.rock ? 1.6 : 1);
        p.position.copy(this.cellCenter(gx, gy)).add(new THREE.Vector3((rand() - 0.5) * 2, 0, (rand() - 0.5) * 2));
        p.rotation.y = rand() * Math.PI * 2;
        this.levelGroup.add(p);
      }
    }

    // Griglia leggera sulle celle costruibili.
    const lp: number[] = [];
    for (let y = 0; y < b.height; y++) {
      for (let x = 0; x < b.width; x++) {
        if (!b.inside(x, y)) continue;
        const c = this.cellCenter(x, y);
        const h = CELL / 2 - 0.15;
        const yy = 0.03;
        lp.push(c.x - h, yy, c.z - h, c.x + h, yy, c.z - h, c.x + h, yy, c.z - h, c.x + h, yy, c.z + h);
        lp.push(c.x + h, yy, c.z + h, c.x - h, yy, c.z + h, c.x - h, yy, c.z + h, c.x - h, yy, c.z - h);
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.gridLines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
    this.levelGroup.add(this.gridLines);
  }

  private buildFeatures() {
    const b = this.board!;
    for (const d of b.level.depots) {
      const c = this.cellCenter(d.x, d.y);
      const t = this.mesh(this.straightGeo!);
      t.position.copy(c);
      t.rotation.y = yawFor(d.dir);
      this.levelGroup.add(t);
      // Rimessa dietro il deposito, con la porta verso il binario.
      const shed = this.prop(M.shed, null, 0.3);
      shed.position.copy(c).addScaledVector(DIR_VEC(d.dir), -CELL * 0.95);
      shed.rotation.y = yawFor(d.dir);
      this.levelGroup.add(shed);
    }
    for (const s of b.level.stations) {
      const c = this.cellCenter(s.x, s.y);
      const fwd = DIR_VEC(s.dir);
      const right = DIR_VEC(((s.dir + 1) % 4) as Dir);
      const t = this.mesh(this.straightGeo!);
      t.position.copy(c);
      t.rotation.y = yawFor(s.dir);
      this.levelGroup.add(t);
      const stop = this.mesh(this.geo(M.buffer));
      stop.position.copy(c).addScaledVector(fwd, CELL);
      stop.rotation.y = yawFor(s.dir);
      this.levelGroup.add(stop);
      if (s.kind === 'port') {
        // Porto: molo oltre il paraurti, gru accanto al binario, capanno e barca sul lato destro.
        const pier = this.prop(M.pier, null, 1);
        pier.position.copy(c).addScaledVector(fwd, CELL * 1.1);
        this.levelGroup.add(pier);
        const hut = this.prop(M.hut, null, 0.6);
        hut.position.copy(c).addScaledVector(fwd, CELL * 1.05).addScaledVector(right, CELL * 0.95);
        hut.rotation.y = yawFor(s.dir) + Math.PI;
        this.levelGroup.add(hut);
        const crane = this.prop(M.crane, null, 0.7);
        crane.position.copy(c).addScaledVector(right, CELL * 0.48);
        crane.rotation.y = yawFor(s.dir);
        this.levelGroup.add(crane);
        const boat = this.prop(M.boat, null, 0.55);
        boat.position.copy(c).addScaledVector(fwd, CELL * 1.95).addScaledVector(right, CELL * 0.3);
        boat.position.y = -0.4;
        boat.rotation.y = yawFor(s.dir) + 0.3;
        this.levelGroup.add(boat);
      } else {
        const plat = this.mesh(this.geo(M.platform, false));
        plat.geometry = plat.geometry.clone().translate(0, 0, -2);
        plat.scale.set(0.55, 0.6, 1);
        plat.position.copy(c);
        plat.rotation.y = yawFor(s.dir);
        this.levelGroup.add(plat);
        const bld = this.prop(M.stationBuilding, null, 0.3);
        bld.position.copy(c).addScaledVector(fwd, CELL * 1.2);
        bld.rotation.y = yawFor(s.dir) + Math.PI / 2;
        this.levelGroup.add(bld);
      }
      const tag = new THREE.Group();
      s.accepts.forEach((cg, i) => {
        const sp = cargoSprite(cg, 2.2);
        sp.position.set((i - (s.accepts.length - 1) / 2) * 2.4, 0, 0);
        tag.add(sp);
      });
      tag.position.copy(c).add(new THREE.Vector3(0, 6.5, 0)).addScaledVector(fwd, CELL * 0.6);
      this.levelGroup.add(tag);
    }
    for (const d of b.level.decorations ?? []) {
      const p = this.prop(d.model, null, d.scale ?? 1);
      p.position.copy(this.cellCenter(d.x, d.y));
      p.rotation.y = ((d.rot ?? 0) * Math.PI) / 2;
      this.levelGroup.add(p);
    }
  }

  /** Ridisegna i binari posati. Da chiamare dopo ogni modifica della griglia. */
  updateTracks() {
    const b = this.board!;
    this.trackGroup.clear();
    for (const p of b.pieces.values()) {
      const c = this.cellCenter(p.x, p.y);
      for (const mesh of this.pieceMeshes(p)) {
        mesh.position.add(c);
        this.trackGroup.add(mesh);
      }
      if (p.kind === 'switch') {
        const sign = switchSprite(p.route ?? 'none');
        sign.position.copy(c).add(new THREE.Vector3(0, 3.2, 0));
        this.trackGroup.add(sign);
      }
    }
  }

  private pieceMeshes(p: Piece): THREE.Mesh[] {
    const straight = (a: Dir) => {
      const m = this.mesh(this.straightGeo!, false, true);
      m.rotation.y = yawFor(a);
      return m;
    };
    const curve = (a: Dir, bb: Dir) => {
      // La curva base va da sud (2) a est (1); troviamo la rotazione k che la porta su {a,b}.
      for (let k = 0; k < 4; k++) {
        const s1 = (2 + k) % 4;
        const s2 = (1 + k) % 4;
        if ((s1 === a && s2 === bb) || (s1 === bb && s2 === a)) {
          const m = this.mesh(this.curveGeo!, false, true);
          m.rotation.y = yawFor(k as Dir);
          return m;
        }
      }
      throw new Error('curva impossibile');
    };
    switch (p.kind) {
      case 'straight':
        return [straight(p.a)];
      case 'curve':
        return [curve(p.a, p.b)];
      case 'crossing': {
        const m = this.mesh(this.geo(M.crossing), false, true);
        return [m];
      }
      case 'switch': {
        const s = straight(p.a);
        const cv = curve(p.a, p.c as Dir);
        cv.position.y = 0.012;
        const lever = this.prop(M.lever, null, 1.2);
        const side = DIR_VEC(opposite(p.c as Dir));
        lever.position.copy(DIR_VEC(p.a).multiplyScalar(CELL * 0.3)).addScaledVector(side, CELL * 0.42);
        lever.rotation.y = yawFor(p.a);
        return [s, cv, lever];
      }
    }
  }

  // --- treni -----------------------------------------------------------------

  private ensureVehicles(snap: SimSnapshot) {
    const b = this.board!;
    if (this.vehicles.length > 0) return;
    for (const t of snap.trains) {
      const def = b.level.trains[t.index];
      const ids = [M.loco, ...Array.from({ length: def.wagons }, () => WAGON_MODEL[def.cargo])];
      ids.forEach((id, v) => {
        const m = this.models.get(id)!;
        const size = new THREE.Vector3();
        m.box.getSize(size);
        // Veicoli in versione "giocattolo": più corti e un po' più bassi, per stare in una cella.
        const len = v === 0 ? 3.3 : 3.0;
        const mesh = this.mesh(this.geo(id));
        mesh.scale.set(0.82, 0.78, len / size.z);
        mesh.visible = false;
        this.trainGroup.add(mesh);
        this.vehicles.push({ mesh, train: t.index, v });
      });
      const tag = cargoSprite(def.cargo, 1.7);
      tag.visible = false;
      this.trainGroup.add(tag);
      this.cargoTags[t.index] = tag;
    }
  }

  resetTrains() {
    for (const v of this.vehicles) this.trainGroup.remove(v.mesh);
    for (const t of this.cargoTags) if (t) this.trainGroup.remove(t);
    this.vehicles = [];
    this.cargoTags = [];
    this.overlayGroup.children.filter((c) => c !== this.highlight).forEach((c) => this.overlayGroup.remove(c));
  }

  /** Punto sul binario di una cella: t=0 lato di ingresso, 0.5 centro, 1 lato di uscita. */
  private pointOn(step: TrackStep, t: number, out: THREE.Vector3): THREE.Vector3 {
    const c = this.cellCenter(step.x, step.y);
    const ein = DIR_VEC(step.entry);
    const eout = DIR_VEC(step.exit);
    if (step.entry === opposite(step.exit)) {
      return out.copy(c).addScaledVector(ein, (CELL / 2) * (1 - 2 * t));
    }
    const R = CELL / 2;
    const corner = c.clone().addScaledVector(ein, R).addScaledVector(eout, R);
    const th = (t * Math.PI) / 2;
    return out.copy(corner).addScaledVector(eout, -R * Math.cos(th)).addScaledVector(ein, -R * Math.sin(th));
  }

  /** Disegna i treni tra due stati della simulazione; alpha va da 0 a 1. */
  drawTrains(prev: SimSnapshot | null, cur: SimSnapshot, alpha: number) {
    this.ensureVehicles(cur);
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (const view of this.vehicles) {
      const ct = cur.trains[view.train].vehicles.find((x) => x.v === view.v);
      const pt = prev?.trains[view.train].vehicles.find((x) => x.v === view.v);
      if (!ct || (pt?.inside && ct.inside)) {
        view.mesh.visible = false;
        continue;
      }
      let step: TrackStep;
      let t: number;
      if (!pt) {
        step = ct.step;
        t = alpha * 0.5; // esce dal deposito
      } else if (pt.step.x === ct.step.x && pt.step.y === ct.step.y) {
        step = ct.step;
        t = 0.5 + (ct.inside ? alpha * 0.5 : 0);
      } else if (alpha < 0.5) {
        step = pt.step;
        t = 0.5 + alpha;
      } else {
        step = ct.step;
        t = alpha - 0.5;
      }
      if (ct.inside && alpha > 0.85) {
        view.mesh.visible = false;
        continue;
      }
      this.pointOn(step, t, p);
      this.pointOn(step, Math.min(1, t + 0.02), q);
      if (t + 0.02 > 1) this.pointOn(step, t - 0.02, q).sub(p).negate().add(p);
      view.mesh.position.copy(p);
      view.mesh.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
      view.mesh.visible = true;
      if (view.v === 0) {
        const tag = this.cargoTags[view.train];
        tag.visible = true;
        tag.position.copy(p).add(new THREE.Vector3(0, 4.6, 0));
      }
    }
    for (const t of cur.trains) {
      const loco = t.vehicles.find((x) => x.v === 0);
      if (!loco || (loco.inside && alpha > 0.85) || t.status === 'done') {
        const tag = this.cargoTags[t.index];
        if (tag && !this.vehicles.some((v) => v.train === t.index && v.v === 0 && v.mesh.visible)) tag.visible = false;
      }
    }
  }

  showFailure(x: number, y: number) {
    const m = markerSprite('#e0322b');
    m.position.copy(this.cellCenter(x, y)).add(new THREE.Vector3(0, 3, 0));
    this.overlayGroup.add(m);
  }

  setGridVisible(v: boolean) {
    if (this.gridLines) this.gridLines.visible = v;
  }

  // --- input -----------------------------------------------------------------

  private raycaster = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  /** Cella sotto un punto dello schermo (anche fuori dalla griglia). */
  pick(clientX: number, clientY: number): Cell | null {
    const b = this.board;
    if (!b) return null;
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null;
    return {
      x: Math.floor(hit.x / CELL + b.width / 2),
      y: Math.floor(hit.z / CELL + b.height / 2),
    };
  }

  setHighlight(cell: Cell | null, ok = true) {
    if (!cell || !this.board?.inside(cell.x, cell.y)) {
      this.highlight.visible = false;
      return;
    }
    this.highlight.visible = true;
    this.highlight.position.copy(this.cellCenter(cell.x, cell.y)).setY(0.06);
    (this.highlight.material as THREE.MeshBasicMaterial).color.set(ok ? 0xffffff : 0xff6b5e);
  }

  // --- camera ----------------------------------------------------------------

  rotate(steps: number) {
    this.yawStep += steps;
  }

  zoomBy(f: number) {
    this.zoom = Math.min(3.5, Math.max(0.6, this.zoom * f));
  }

  /** Sposta la vista di dx,dy pixel. */
  pan(dx: number, dy: number) {
    const r = this.canvas.getBoundingClientRect();
    const worldPerPx = (this.camera.right - this.camera.left) / this.camera.zoom / r.width;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
    const fwd = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).setY(0).normalize();
    this.target.addScaledVector(right, -dx * worldPerPx);
    this.target.addScaledVector(fwd, dy * worldPerPx * 1.6);
    const lim = this.extent;
    this.target.x = Math.max(-lim, Math.min(lim, this.target.x));
    this.target.z = Math.max(-lim, Math.min(lim, this.target.z));
  }

  private layoutSun() {
    const e = this.extent;
    this.sun.position.set(e * 0.6, e * 2, e * 0.9);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -e * 1.2;
    cam.right = cam.top = e * 1.2;
    cam.near = 1;
    cam.far = e * 5;
    cam.updateProjectionMatrix();
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    // La vista inquadra sempre tutta l'isola, sia in verticale sia in orizzontale.
    const b = this.board;
    const span = b ? (b.width + b.height + MARGIN * 2) * CELL * 0.7071 : this.extent * 2;
    const halfW = span * 0.5;
    const halfH = span * 0.34 + 6;
    const half = Math.max(halfW / aspect, halfH);
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number) {
    const goal = Math.PI / 4 + (this.yawStep * Math.PI) / 2;
    this.yaw += (goal - this.yaw) * Math.min(1, dt * 8);
    const dist = 120;
    const pitch = 0.62;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * dist,
      this.target.y + Math.sin(pitch) * dist,
      this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * dist,
    );
    this.camera.lookAt(this.target);
    this.camera.zoom += (this.zoom - this.camera.zoom) * Math.min(1, dt * 10);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }
}
