import * as THREE from 'three';
import { Board } from '../core/board';
import type { SimSnapshot, TrackStep } from '../core/sim';
import { Cargo, Cell, DX, DY, Dir, DropDef, LevelCrossingDef, Piece, Theme, TrainDef, TurntableDef, cellKey, opposite } from '../core/types';
import { ModelGeo, bendTrack, centered, loadModel } from './assets';
import { cargoSprite, emptySprite, lightSprite, markerSprite, scheduleSprite, textSprite } from './icons';

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

/** Modelli che servono solo ad alcuni livelli. */
const X = {
  bridge: 'steel-girder-bridge-d80bb4',
  portal: 'tunnel-portal-4ac9f3',
  levelCrossing: 'level-crossing-37d00b',
  signal: 'colour-light-signal-713276',
  gantry: 'loading-gantry-34460f',
  lane: 'country-lane-tile-65e8ee',
  tractor: 'compact-tractor-35b84b',
  barn: 'red-barn-d41683',
  silo: 'grain-silo-58ca67',
  churns: 'milk-churn-stand-130fe2',
  spoil: 'spoil-heap-9aaa11',
  excavator: 'tracked-excavator-8ebd3c',
  firewood: 'firewood-stack-810f49',
  stump: 'log-stump-1d65a5',
  viaduct: 'stone-viaduct-span-0bd731',
  turntable: 'turntable-6415d2',
  deck: 'boardwalk-deck-run-c1f678',
  sailboat: 'sailboat-3ee283',
  lighthouse: 'old-lighthouse-48ca6c',
  boatShed: 'boat-shed-74c94f',
  fishCrate: 'fish-crate-3c3f7b',
  lobster: 'lobster-pot-stack-d870f0',
} as const;


type Palette = Record<
  'grass' | 'grassDark' | 'margin' | 'soil' | 'soilDark' | 'rock' | 'rockDark' | 'water' | 'waterDeep' | 'fall' | 'lot' | 'hill' | 'hillDark',
  THREE.Color
>;
const pal = (o: Record<keyof Palette, string>): Palette =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, new THREE.Color(v)])) as Palette;

/** Un modello con la sua scala. */
interface Prop {
  id: string;
  scale: number;
}

/** Aspetto di un'ambientazione: colori, alberi, edifici e veicoli. Le regole restano le stesse. */
interface ThemeDef {
  sky: number;
  colors: Palette;
  /** Alberi sulle celle 'T' e sul bordo; la scala varia di ±10%. */
  trees: Prop[];
  rock: Prop;
  /** Piccoli decori sparsi sul bordo dell'isola. */
  scatter: Prop[];
  town: Prop;
  barn: Prop;
  silo: Prop | null;
  hay: Prop;
  spoil: Prop;
  digger: Prop;
  logs: Prop;
  stump: Prop;
  vehicle: Prop;
  /** Porto con molo e barca, o deposito merci (nel deserto). */
  port: 'harbour' | 'freight';
}

const THEMES: Record<Theme, ThemeDef> = {
  country: {
    sky: 0xbfe3f2,
    colors: pal({
      grass: '#95aa5d', grassDark: '#87a052', margin: '#7f9a4c', soil: '#8d6741', soilDark: '#6e4f33',
      rock: '#8b8473', rockDark: '#6d675a', water: '#4fa3c7', waterDeep: '#3f8fb5', fall: '#8fd0ea',
      lot: '#b59a6a', hill: '#7d9a4f', hillDark: '#6c8a43',
    }),
    trees: [{ id: M.tree, scale: 0.46 }, { id: M.tree, scale: 0.46 }, { id: M.apple, scale: 1 }],
    rock: { id: M.rock, scale: 2.6 },
    scatter: [{ id: M.rock, scale: 1.6 }, { id: M.hay, scale: 1 }],
    town: { id: M.stationBuilding, scale: 0.3 },
    barn: { id: 'red-barn-d41683', scale: 0.42 },
    silo: { id: 'grain-silo-58ca67', scale: 0.36 },
    hay: { id: M.hay, scale: 1.1 },
    spoil: { id: 'spoil-heap-9aaa11', scale: 1 },
    digger: { id: 'tracked-excavator-8ebd3c', scale: 0.36 },
    logs: { id: 'firewood-stack-810f49', scale: 0.9 },
    stump: { id: 'log-stump-1d65a5', scale: 1.3 },
    vehicle: { id: 'compact-tractor-35b84b', scale: 0.95 },
    port: 'harbour',
  },
  snow: {
    sky: 0xcfe4f0,
    colors: pal({
      grass: '#eef3f6', grassDark: '#e2eaf0', margin: '#d6e0e7', soil: '#8a7d72', soilDark: '#6f655d',
      rock: '#8c8f96', rockDark: '#6f727a', water: '#7fbfdc', waterDeep: '#6aaccd', fall: '#cdeaf6',
      lot: '#c9c1b5', hill: '#f4f7fa', hillDark: '#dfe7ee',
    }),
    trees: [{ id: 'snow-laden-spruce-36716e', scale: 0.62 }, { id: 'snow-laden-spruce-36716e', scale: 0.5 }, { id: 'windblown-larch-abb99c', scale: 0.42 }],
    rock: { id: 'rock-outcrop-158ac3', scale: 1.1 },
    scatter: [{ id: 'stone-cairn-a9bf48', scale: 1 }, { id: 'boulder-field-cluster-08e364', scale: 0.9 }, { id: 'alpine-ibex-2a288a', scale: 1 }],
    town: { id: 'alpine-chalet-47d59e', scale: 0.3 },
    barn: { id: 'alpine-hay-barn-3965e5', scale: 0.42 },
    silo: null,
    hay: { id: 'alpine-fingerpost-d47349', scale: 1 },
    spoil: { id: 'scree-heap-42cce5', scale: 1.3 },
    digger: { id: 'tracked-excavator-8ebd3c', scale: 0.36 },
    logs: { id: 'snow-capped-log-pile-8719e7', scale: 0.95 },
    stump: { id: 'mountain-hare-d9c64c', scale: 1.6 },
    vehicle: { id: 'piste-basher-snowcat-92fe8b', scale: 0.6 },
    port: 'harbour',
  },
  desert: {
    sky: 0xf3dcbc,
    colors: pal({
      grass: '#e2c089', grassDark: '#d8b47c', margin: '#cfa46d', soil: '#b9774a', soilDark: '#9a5f3a',
      rock: '#b06a42', rockDark: '#8f5435', water: '#3ea8b4', waterDeep: '#3497a3', fall: '#8fd6de',
      lot: '#c79a6c', hill: '#cf925b', hillDark: '#bb7f4c',
    }),
    trees: [{ id: 'saguaro-cactus-6b27eb', scale: 0.85 }, { id: 'saguaro-cactus-6b27eb', scale: 0.7 }, { id: 'joshua-tree-867a2c', scale: 0.5 }],
    rock: { id: 'sandstone-outcrop-75800b', scale: 0.8 },
    scatter: [{ id: 'sagebrush-700b03', scale: 1.3 }, { id: 'creosote-bush-5b17d5', scale: 1 }, { id: 'tumbleweed-2caa1a', scale: 1.4 }],
    town: { id: 'general-store-a2187a', scale: 0.4 },
    barn: { id: 'livery-stable-c01ee0', scale: 0.32 },
    silo: { id: 'windmill-pump-2993a4', scale: 0.42 },
    hay: { id: 'plank-trough-baf3d5', scale: 1 },
    spoil: { id: 'ore-chute-and-bin-8375ac', scale: 0.7 },
    digger: { id: 'mine-headframe-735cf4', scale: 0.42 },
    logs: { id: 'firewood-stack-810f49', scale: 0.9 },
    stump: { id: 'dead-cottonwood-edbde8', scale: 0.4 },
    vehicle: { id: 'stagecoach-94db88', scale: 0.75 },
    port: 'freight',
  },
  coast: {
    sky: 0xbfe8f0,
    colors: pal({
      grass: '#a9b56a', grassDark: '#9eaa60', margin: '#e8d5a5', soil: '#c9a46a', soilDark: '#a8834f',
      rock: '#9a9488', rockDark: '#7d776c', water: '#3fb3c9', waterDeep: '#2fa0b8', fall: '#9fe0ee',
      lot: '#e0cfa0', hill: '#a6b064', hillDark: '#97a058',
    }),
    trees: [{ id: 'olive-tree-3cb4a4', scale: 0.62 }, { id: 'tamarisk-bush-ba4337', scale: 1.3 }, { id: 'prickly-pear-cactus-57e065', scale: 1.1 }],
    rock: { id: 'rock-armour-revetment-aea1ca', scale: 0.8 },
    scatter: [{ id: 'beach-parasol-fd4530', scale: 1 }, { id: 'driftwood-log-89a68f', scale: 1 }, { id: 'marram-grass-tuft-8c7a99', scale: 1.4 }, { id: 'beach-hut-fc7649', scale: 0.55 }],
    town: { id: 'cube-house-module-a9b8e8', scale: 0.62 },
    barn: { id: 'beach-hut-fc7649', scale: 0.6 },
    silo: null,
    hay: { id: 'pack-donkey-c69029', scale: 1.2 },
    spoil: { id: 'net-pile-0bd489', scale: 1 },
    digger: { id: 'tracked-excavator-8ebd3c', scale: 0.36 },
    logs: { id: 'driftwood-log-89a68f', scale: 1.1 },
    stump: { id: 'lobster-pot-stack-d870f0', scale: 1.4 },
    vehicle: { id: 'three-wheeled-delivery-mini-744094', scale: 0.9 },
    port: 'harbour',
  },
};

const FREIGHT = { office: 'stage-and-freight-office-c5a38a', crates: 'freight-crate-and-sack-f49cbb' };
const themeOf = (b: Board): ThemeDef => THEMES[b.level.theme ?? 'country'];

export const WAGON_MODEL: Record<Cargo, string> = {
  milk: 'tank-wagon-d860fa',
  coal: 'hopper-wagon-b4c486',
  timber: 'flatbed-wagon-53187a',
  passengers: 'passenger-carriage-de9d58',
};

/** Modelli che servono per disegnare un livello: si caricano solo questi. */
export function modelsFor(board: Board): string[] {
  const th = themeOf(board);
  const lvl = board.level;
  const ids = new Set<string>([M.straight, M.crossing, M.buffer, M.lever, M.shed, M.platform, M.lamp, M.loco]);
  for (const p of [...th.trees, th.rock, ...th.scatter, th.town]) ids.add(p.id);
  if (lvl.stations.some((s) => s.kind === 'port')) {
    if (th.port === 'harbour') [M.pier, M.hut, M.crane, M.boat].forEach((id) => ids.add(id));
    else ids.add(FREIGHT.office).add(FREIGHT.crates).add(M.crane);
  }
  for (const t of lvl.trains) ids.add(WAGON_MODEL[wagonOf(t)]);
  const has = (tr: string) => lvl.terrain.some((r) => r.includes(tr));
  if (has('~') || (lvl.stock.bridge ?? 0) > 0) ids.add(X.bridge);
  if (has('^')) ids.add(X.portal);
  if (has('=')) ids.add(X.lane);
  const crossings = lvl.crossings ?? [];
  if (crossings.some((c) => c.kind !== 'boat')) ids.add(X.levelCrossing).add(th.vehicle.id).add(X.lane);
  if (crossings.some((c) => c.kind === 'boat')) ids.add(X.sailboat).add(X.bridge);
  if (has(':')) ids.add(X.viaduct);
  if (has('b')) ids.add(X.deck);
  if ((lvl.turntables ?? []).length) ids.add(X.turntable).add(M.buffer);
  if ((lvl.drops ?? []).length) ids.add(X.boatShed).add(X.fishCrate).add(X.lobster);
  for (const t of lvl.trains) for (const c of t.drops ?? []) ids.add(WAGON_MODEL[c]);
  if (lvl.theme === 'coast') ids.add(X.lighthouse);
  ids.add(X.signal); // anche per il bonus semaforo extra
  for (const p of lvl.pickups ?? []) {
    if (p.kind === 'farm') [th.barn, th.silo, th.hay].forEach((q) => q && ids.add(q.id)), ids.add(X.churns);
    if (p.kind === 'mine') ids.add(X.gantry).add(th.spoil.id).add(th.digger.id);
    if (p.kind === 'forest') ids.add(th.logs.id).add(th.stump.id).add(th.trees[0].id);
  }
  for (const d of board.level.decorations ?? []) ids.add(d.model);
  return [...ids];
}

/** Merce da disegnare sui vagoni: quella a bordo, o quella che il treno vuoto andrà a prendere. */
const wagonOf = (t: TrainDef): Cargo => t.wagon ?? t.cargo ?? 'coal';

const DIR_VEC = (d: Dir) => new THREE.Vector3(DX[d], 0, DY[d]);
/** Rotazione attorno a y che porta il nord nella direzione d. */
const yawFor = (d: Dir) => (-d * Math.PI) / 2;


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
  private tagCargo: (Cargo | null | undefined)[] = [];
  private signalGroup = new THREE.Group();
  private signalLights = new Map<string, THREE.Sprite>();
  private tractors: { mesh: THREE.Mesh; center: THREE.Vector3; road: THREE.Vector3; offset: number; period: number; lift?: string }[] = [];
  private turntables: { mesh: THREE.Mesh; key: string; base: number }[] = [];
  /** Meshes dei binari per cella, per sollevare i ponti levatoi e far cedere le passerelle. */
  private cellMeshes = new Map<string, THREE.Mesh[]>();
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
    this.scene.background = new THREE.Color(THEMES.country.sky);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 400);

    this.scene.add(new THREE.HemisphereLight(0xfff6e0, 0x6b7f8f, 1.6));
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.sun, this.sun.target);

    this.scene.add(this.levelGroup, this.trackGroup, this.signalGroup, this.trainGroup, this.overlayGroup);
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

  /** Ambientazione del livello corrente. */
  private th: ThemeDef = THEMES.country;

  setBoard(board: Board) {
    this.board = board;
    this.th = themeOf(board);
    (this.scene.background as THREE.Color).set(this.th.sky);
    for (const g of [this.levelGroup, this.trackGroup, this.trainGroup, this.signalGroup]) g.clear();
    this.vehicles = [];
    this.cargoTags = [];
    this.tagCargo = [];
    this.tractors = [];
    this.turntables = [];
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
    // Acqua: le celle '~' e, sul bordo, la cella di margine subito fuori (il fiume esce dall'isola).
    // Le passerelle di legno stanno sopra il mare: sotto si disegna l'acqua.
    const isWater = (cx: number, cy: number): boolean => {
      if (b.terrain(cx, cy) === 'water' || b.terrain(cx, cy) === 'boardwalk') return true;
      if (b.inside(cx, cy)) return false;
      const inX = cx >= 0 && cx < b.width;
      const inY = cy >= 0 && cy < b.height;
      if (inX && cy === -1) return b.terrain(cx, 0) === 'water';
      if (inX && cy === b.height) return b.terrain(cx, b.height - 1) === 'water';
      if (inY && cx === -1) return b.terrain(0, cy) === 'water';
      if (inY && cx === b.width) return b.terrain(b.width - 1, cy) === 'water';
      return false;
    };
    // Crepaccio tra due isole: le celle ':' e il loro prolungamento sul bordo.
    const isGap = (cx: number, cy: number): boolean => {
      if (b.terrain(cx, cy) === 'gap') return true;
      if (b.inside(cx, cy)) return false;
      const inX = cx >= 0 && cx < b.width;
      const inY = cy >= 0 && cy < b.height;
      if (inX && cy === -1) return b.terrain(cx, 0) === 'gap';
      if (inX && cy === b.height) return b.terrain(cx, b.height - 1) === 'gap';
      if (inY && cx === -1) return b.terrain(0, cy) === 'gap';
      if (inY && cx === b.width) return b.terrain(b.width - 1, cy) === 'gap';
      return false;
    };
    const GAP_Y = -9;
    const gapFloor: number[] = [];
    const WATER_Y = -0.55;
    const wall = (ax: number, az: number, bx: number, bz: number, y1: number, y2: number, c: THREE.Color) => {
      // Due facce, così si vede da entrambi i lati.
      pos.push(ax, y1, az, bx, y1, bz, bx, y2, bz, ax, y1, az, bx, y2, bz, ax, y2, az);
      pos.push(ax, y1, az, bx, y2, bz, bx, y1, bz, ax, y1, az, ax, y2, az, bx, y2, bz);
      for (let i = 0; i < 12; i++) col.push(c.r, c.g, c.b);
    };
    for (let gy = 0; gy < H; gy++) {
      for (let gx = 0; gx < W; gx++) {
        const cx = gx - MARGIN;
        const cy = gy - MARGIN;
        const inGrid = b.inside(cx, cy);
        const tr = b.terrain(cx, cy);
        const ax = x0 + gx * CELL;
        const az = z0 + gy * CELL;
        if (isGap(cx, cy)) {
          // Niente terreno: pareti di roccia giù fino al fondo, che ha il colore del cielo.
          gapFloor.push(ax, GAP_Y, az, ax, GAP_Y, az + CELL, ax + CELL, GAP_Y, az + CELL, ax, GAP_Y, az, ax + CELL, GAP_Y, az + CELL, ax + CELL, GAP_Y, az);
          for (const d of [0, 1, 2, 3] as Dir[]) {
            const nx = cx + DX[d];
            const ny = cy + DY[d];
            const outside = nx < -MARGIN || ny < -MARGIN || nx >= b.width + MARGIN || ny >= b.height + MARGIN;
            if (outside || isGap(nx, ny)) continue;
            const e = [
              [ax, az, ax + CELL, az],
              [ax + CELL, az, ax + CELL, az + CELL],
              [ax, az + CELL, ax + CELL, az + CELL],
              [ax, az, ax, az + CELL],
            ][d];
            wall(e[0], e[1], e[2], e[3], 0, -1.2, this.th.colors.soil);
            wall(e[0], e[1], e[2], e[3], -1.2, GAP_Y, (cx + cy + d) % 2 ? this.th.colors.rock : this.th.colors.rockDark);
          }
          continue;
        }
        if (isWater(cx, cy)) {
          const c = ((cx + cy) % 2 === 0 ? this.th.colors.water : this.th.colors.waterDeep).clone();
          quad(ax, az, ax + CELL, az + CELL, WATER_Y, c);
          // Sponde di terra verso le celle vicine asciutte.
          for (const d of [0, 1, 2, 3] as Dir[]) {
            const nx = cx + DX[d];
            const ny = cy + DY[d];
            const outside = nx < -MARGIN || ny < -MARGIN || nx >= b.width + MARGIN || ny >= b.height + MARGIN;
            if (outside) {
              // Cascata giù dal bordo dell'isola.
              const ex = d === 1 ? ax + CELL + 0.05 : d === 3 ? ax - 0.05 : null;
              const ez = d === 2 ? az + CELL + 0.05 : d === 0 ? az - 0.05 : null;
              if (ex !== null) wall(ex, az + 0.4, ex, az + CELL - 0.4, WATER_Y, -5, this.th.colors.fall);
              if (ez !== null) wall(ax + 0.4, ez, ax + CELL - 0.4, ez, WATER_Y, -5, this.th.colors.fall);
              continue;
            }
            if (isWater(nx, ny)) continue;
            const e = [
              [ax, az, ax + CELL, az],
              [ax + CELL, az, ax + CELL, az + CELL],
              [ax, az + CELL, ax + CELL, az + CELL],
              [ax, az, ax, az + CELL],
            ][d];
            wall(e[0], e[1], e[2], e[3], 0, WATER_Y, this.th.colors.soil);
          }
          continue;
        }
        let c: THREE.Color;
        if (!inGrid) c = this.th.colors.margin.clone();
        else if (tr === 'lot') c = this.th.colors.lot.clone();
        else if (tr === 'boardwalk') c = this.th.colors.margin.clone();
        else c = ((cx + cy) % 2 === 0 ? this.th.colors.grass : this.th.colors.grassDark).clone();
        c.offsetHSL(0, 0, (rand() - 0.5) * 0.02);
        quad(ax, az, ax + CELL, az + CELL, 0, c);
      }
    }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    top.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    top.computeVertexNormals();
    this.levelGroup.add(this.mesh(top, false, true));
    if (gapFloor.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(gapFloor, 3));
      this.levelGroup.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: this.th.sky })));
    }

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
        const c = r === 0 ? (shade > 0.5 ? this.th.colors.soil : this.th.colors.soilDark) : shade > 0.5 ? this.th.colors.rock : this.th.colors.rockDark;
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
    this.buildHills(rand);
    for (let y = 0; y < b.height; y++) {
      for (let x = 0; x < b.width; x++) {
        const tr = b.terrain(x, y);
        if (tr === 'rock') {
          for (let i = 0; i < 2; i++) {
            const rk = this.th.rock;
            const r = this.prop(rk.id, null, rk.scale * (i === 0 ? 1 + rand() * 0.2 : 0.55 + rand() * 0.15));
            r.position.copy(this.cellCenter(x, y)).add(new THREE.Vector3((rand() - 0.5) * 1.6, 0, (rand() - 0.5) * 1.6));
            r.rotation.y = rand() * Math.PI * 2;
            this.levelGroup.add(r);
          }
          continue;
        }
        if (tr === 'road') {
          if (!b.levelCrossingAt(x, y)) this.addRoad(x, y);
          continue;
        }
        if (tr === 'boardwalk') {
          // Passerella di legno: il binario ci passa sopra, ma regge un solo treno.
          const deck = this.mesh(this.geo(X.deck), false, true);
          const sz = new THREE.Vector3();
          this.models.get(X.deck)!.box.getSize(sz);
          deck.scale.set(CELL / sz.x, 0.6, CELL / sz.z);
          deck.position.copy(this.cellCenter(x, y)).setY(-sz.y * 0.6 + 0.1);
          this.levelGroup.add(deck);
          continue;
        }
        if (tr !== 'tree') continue;
        const tp = this.th.trees[Math.floor(rand() * this.th.trees.length)];
        const t = this.prop(tp.id, null, tp.scale * (0.9 + rand() * 0.2));
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
        if (b.inside(gx, gy) || reserved.has(`${gx},${gy}`) || isWater(gx, gy) || isGap(gx, gy)) continue;
        const r = rand();
        if (r > 0.45) continue;
        const pick = r < 0.32 ? this.th.trees[Math.floor((r / 0.32) * this.th.trees.length)] : this.th.scatter[Math.floor(((r - 0.32) / 0.13) * this.th.scatter.length) % this.th.scatter.length];
        const isTree = r < 0.32;
        const p = this.prop(pick.id, null, pick.scale * (isTree ? 0.85 + rand() * 0.15 : 1));
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
      if (s.kind === 'port' && this.th.port === 'freight') {
        // Deposito merci nel deserto: ufficio, gru e casse oltre il paraurti.
        const office = this.prop(FREIGHT.office, null, 0.36);
        office.position.copy(c).addScaledVector(fwd, CELL * 1.25);
        office.rotation.y = yawFor(s.dir) + Math.PI;
        this.levelGroup.add(office);
        const crane = this.prop(M.crane, null, 0.7);
        crane.position.copy(c).addScaledVector(right, CELL * 0.48);
        crane.rotation.y = yawFor(s.dir);
        this.levelGroup.add(crane);
        for (const k of [-0.5, 0.5]) {
          const cr = this.prop(FREIGHT.crates, null, 1.1);
          cr.position.copy(c).addScaledVector(right, -CELL * 0.45).addScaledVector(fwd, k * 1.4);
          cr.rotation.y = yawFor(s.dir) + k;
          this.levelGroup.add(cr);
        }
      } else if (s.kind === 'port') {
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
        const bld = this.prop(this.th.town.id, null, this.th.town.scale);
        bld.position.copy(c).addScaledVector(fwd, CELL * 1.2);
        bld.rotation.y = yawFor(s.dir) + Math.PI / 2;
        this.levelGroup.add(bld);
      }
      const tag = new THREE.Group();
      // Con un ordine di arrivo si vede la fila delle merci numerate, altrimenti cosa accetta.
      const list = s.order ?? s.accepts;
      list.forEach((cg, i) => {
        const sp = cargoSprite(cg, 2.2);
        sp.position.set((i - (list.length - 1) / 2) * 2.4, 0, 0);
        tag.add(sp);
        if (s.order) {
          const n = textSprite(String(i + 1), 1.3);
          n.position.set((i - (list.length - 1) / 2) * 2.4 + 0.8, -0.9, 0);
          tag.add(n);
        }
      });
      if (s.capacity !== undefined) {
        const cap = textSprite(`max ${s.capacity}`, 2.6, '#c2492b');
        cap.position.set(0, 1.7, 0);
        tag.add(cap);
      }
      tag.position.copy(c).add(new THREE.Vector3(0, 6.5, 0)).addScaledVector(fwd, CELL * 0.6);
      this.levelGroup.add(tag);
    }
    for (const pk of b.level.pickups ?? []) this.buildPickup(pk);
    for (const lc of b.level.crossings ?? []) this.buildLevelCrossing(lc);
    for (const d of b.level.drops ?? []) this.buildDrop(d);
    for (const t of b.level.turntables ?? []) this.buildTurntable(t);
    if (b.level.theme === 'coast') {
      // Un faro su un angolo dell'isola.
      const lh = this.prop(X.lighthouse, null, 0.42);
      lh.position.copy(this.cellCenter(b.width, -1));
      lh.rotation.y = -0.6;
      this.levelGroup.add(lh);
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
    this.signalGroup.clear();
    this.signalLights.clear();
    for (const k of b.signals) {
      const [x, y] = k.split(',').map(Number);
      const p = b.pieceAt(x, y);
      if (p) this.addSignal(p);
    }
    this.cellMeshes.clear();
    for (const p of b.pieces.values()) {
      const lc = b.levelCrossingAt(p.x, p.y);
      if (lc && lc.kind !== 'boat') continue; // il modello del passaggio a livello ha già i binari
      const c = this.cellCenter(p.x, p.y);
      const list: THREE.Mesh[] = [];
      for (const mesh of this.pieceMeshes(p)) {
        mesh.position.add(c);
        mesh.userData.y = mesh.position.y;
        this.trackGroup.add(mesh);
        list.push(mesh);
      }
      this.cellMeshes.set(cellKey(p.x, p.y), list);
    }
  }

  private pieceMeshes(p: Piece & Cell): THREE.Mesh[] {
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
      case 'bridge': {
        if (this.board!.terrain(p.x, p.y) === 'gap') {
          // Viadotto di pietra sul crepaccio.
          const v = this.mesh(this.geo(X.viaduct, false), true, true);
          const sz = new THREE.Vector3();
          this.models.get(X.viaduct)!.box.getSize(sz);
          v.scale.set(0.62, 0.8, CELL / sz.z);
          v.position.y = -sz.y * 0.8 - 0.02;
          v.rotation.y = yawFor(p.a);
          const t = straight(p.a);
          t.position.y = 0.02;
          return [v, t];
        }
        const deck = this.mesh(this.geo(X.bridge), true, true);
        deck.scale.set(0.62, 0.55, CELL / 12);
        deck.rotation.y = yawFor(p.a);
        const t = straight(p.a);
        t.position.y = 0.04;
        return [deck, t];
      }
      case 'tunnel': {
        // Dentro la collina non si vede nulla: solo i portali dove il binario entra ed esce.
        const out: THREE.Mesh[] = [];
        for (const side of [p.a, p.b]) {
          if (this.board!.terrain(p.x + DX[side], p.y + DY[side]) === 'hill') continue;
          const portal = this.prop(X.portal, null, 1);
          portal.scale.set(0.34, 0.34, 0.2);
          portal.position.copy(DIR_VEC(side).multiplyScalar(CELL * 0.42));
          portal.rotation.y = yawFor(side) + Math.PI;
          out.push(portal, (() => {
            const t = straight(p.a);
            t.scale.set(1, 1, 0.3);
            t.position.copy(DIR_VEC(side).multiplyScalar(CELL * 0.4));
            return t;
          })());
        }
        return out;
      }
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

  // --- terreni e luoghi speciali ---------------------------------------------------

  /** Colline: un cumulo a gradini per cella, alto abbastanza da nascondere il treno in galleria. */
  private buildHills(rand: () => number) {
    const b = this.board!;
    const pos: number[] = [];
    const col: number[] = [];
    for (let y = 0; y < b.height; y++) {
      for (let x = 0; x < b.width; x++) {
        if (b.terrain(x, y) !== 'hill') continue;
        const c = this.cellCenter(x, y);
        const hillAt = (d: Dir) => b.terrain(x + DX[d], y + DY[d]) === 'hill';
        // Anelli: base quadrata (si allarga verso le colline vicine), poi sempre più stretti.
        const rings: { r: number; y: number }[] = [
          { r: 1, y: 0 },
          { r: 0.8, y: 2.1 + rand() * 0.4 },
          { r: 0.45, y: 3.6 + rand() * 0.6 },
        ];
        const n = 8;
        const ringPts = rings.map((rg, ri) =>
          Array.from({ length: n }, (_, i) => {
            const ang = (i / n) * Math.PI * 2 + Math.PI / 4;
            const dx = Math.cos(ang);
            const dz = Math.sin(ang);
            // Sul quadrato della cella per la base, altrimenti un ottagono che si gonfia verso le colline vicine.
            const sq = 1 / Math.max(Math.abs(dx), Math.abs(dz));
            let k = ri === 0 ? sq : rg.r * (1 + (sq - 1) * 0.5);
            const toward = (Math.abs(dx) > 0.5 && hillAt(dx > 0 ? 1 : 3)) || (Math.abs(dz) > 0.5 && hillAt(dz > 0 ? 2 : 0));
            if (ri > 0 && toward) k = Math.min(sq, k * 1.25);
            const j = ri === 0 ? 0 : (rand() - 0.5) * 0.25;
            return new THREE.Vector3(c.x + dx * k * (CELL / 2) * (1 + j), rg.y, c.z + dz * k * (CELL / 2) * (1 + j));
          }),
        );
        const tri = (a: THREE.Vector3, b2: THREE.Vector3, c2: THREE.Vector3, cc: THREE.Color) => {
          pos.push(a.x, a.y, a.z, b2.x, b2.y, b2.z, c2.x, c2.y, c2.z);
          for (let i = 0; i < 3; i++) col.push(cc.r, cc.g, cc.b);
        };
        for (let r = 0; r < rings.length - 1; r++) {
          for (let i = 0; i < n; i++) {
            const a1 = ringPts[r][i];
            const a2 = ringPts[r][(i + 1) % n];
            const b1 = ringPts[r + 1][i];
            const b2 = ringPts[r + 1][(i + 1) % n];
            const cc = rand() > 0.5 ? this.th.colors.hill : this.th.colors.hillDark;
            tri(a1, b1, a2, cc);
            tri(a2, b1, b2, cc);
          }
        }
        const topC = new THREE.Vector3(c.x, rings[2].y + 0.5, c.z);
        for (let i = 0; i < n; i++) tri(ringPts[2][i], topC, ringPts[2][(i + 1) % n], this.th.colors.hill);
      }
    }
    if (pos.length === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = this.mesh(g, true, true);
    m.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    this.levelGroup.add(m);
  }

  /** Tratto di strada di campagna; si orienta verso le strade e i passaggi a livello vicini. */
  private addRoad(x: number, y: number) {
    const b = this.board!;
    const roadish = (xx: number, yy: number) => b.terrain(xx, yy) === 'road' || !!b.levelCrossingAt(xx, yy) || !b.inside(xx, yy);
    const ew = (roadish(x - 1, y) && b.inside(x - 1, y)) || (roadish(x + 1, y) && b.inside(x + 1, y));
    const ns = (roadish(x, y - 1) && b.inside(x, y - 1)) || (roadish(x, y + 1) && b.inside(x, y + 1));
    const lane = this.mesh(this.geo(X.lane), false, true);
    lane.position.copy(this.cellCenter(x, y)).setY(0.01);
    lane.rotation.y = ew && !ns ? Math.PI / 2 : 0;
    this.levelGroup.add(lane);
  }

  /** Stazione di carico passante: fattoria, miniera o bosco, con la merce sopra. */
  private buildPickup(pk: { x: number; y: number; axis: 0 | 1; gives: Cargo; kind: 'farm' | 'mine' | 'forest' }) {
    const b = this.board!;
    const c = this.cellCenter(pk.x, pk.y);
    const along = pk.axis === 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const across = pk.axis === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const yaw = pk.axis === 0 ? 0 : Math.PI / 2;
    const sides = pk.axis === 0 ? ([1, 3] as Dir[]) : ([2, 0] as Dir[]);
    const lots = sides.filter((d) => b.terrain(pk.x + DX[d], pk.y + DY[d]) === 'lot');
    const add = (m: THREE.Mesh, at: THREE.Vector3, rot = yaw) => {
      m.position.copy(at);
      m.rotation.y = rot;
      this.levelGroup.add(m);
      return m;
    };
    const lotCenter = (d: Dir) => this.cellCenter(pk.x + DX[d], pk.y + DY[d]);
    const sideVec = (d: Dir) => DIR_VEC(d);
    if (pk.kind === 'farm') {
      add(this.prop(X.churns, null, 0.55), c.clone().addScaledVector(sideVec(sides[0]), 1.55), yaw + Math.PI / 2);
      if (lots[0] !== undefined) {
        const th = this.th;
        add(this.prop(th.barn.id, null, th.barn.scale), lotCenter(lots[0]).addScaledVector(along, -0.4), yaw + (lots[0] === sides[0] ? -Math.PI / 2 : Math.PI / 2));
        if (th.silo) add(this.prop(th.silo.id, null, th.silo.scale), lotCenter(lots[0]).addScaledVector(along, 1.35).addScaledVector(sideVec(lots[0]), 0.6));
      }
      if (lots[1] !== undefined) add(this.prop(this.th.hay.id, null, this.th.hay.scale), lotCenter(lots[1]));
    } else if (pk.kind === 'mine') {
      add(this.prop(X.gantry, null, 0.95), c.clone());
      if (lots[0] !== undefined) {
        add(this.prop(this.th.spoil.id, null, this.th.spoil.scale), lotCenter(lots[0]).addScaledVector(along, -0.6));
        add(this.prop(this.th.digger.id, null, this.th.digger.scale), lotCenter(lots[0]).addScaledVector(along, 1.2), yaw + 0.6);
      }
      if (lots[1] !== undefined) add(this.prop(this.th.spoil.id, null, this.th.spoil.scale * 0.7), lotCenter(lots[1]), 1.3);
    } else {
      const { logs, stump, trees } = this.th;
      add(this.prop(logs.id, null, logs.scale * 0.83), c.clone().addScaledVector(sideVec(sides[0]), 1.55));
      for (const d of lots) {
        add(this.prop(logs.id, null, logs.scale), lotCenter(d).addScaledVector(along, -0.8));
        add(this.prop(logs.id, null, logs.scale), lotCenter(d).addScaledVector(along, 0.5).setY(0.55), yaw + 0.1);
        add(this.prop(stump.id, null, stump.scale), lotCenter(d).addScaledVector(along, 1.4).addScaledVector(sideVec(d), 0.8));
        add(this.prop(trees[0].id, null, trees[0].scale), lotCenter(d).addScaledVector(sideVec(d), 1.2).addScaledVector(along, -1.5));
      }
    }
    void across;
    const tag = cargoSprite(pk.gives, 2.2);
    tag.position.copy(c).add(new THREE.Vector3(0, 6.5, 0));
    this.levelGroup.add(tag);
  }

  /** Scarico: capanno e casse sul cortile accanto al binario, con la merce che prende. */
  private buildDrop(d: DropDef) {
    const b = this.board!;
    const c = this.cellCenter(d.x, d.y);
    const sides = d.axis === 0 ? ([1, 3] as Dir[]) : ([2, 0] as Dir[]);
    const lot = sides.find((s) => b.terrain(d.x + DX[s], d.y + DY[s]) === 'lot') ?? sides[0];
    const lc = this.cellCenter(d.x + DX[lot], d.y + DY[lot]);
    const shed = this.prop(X.boatShed, null, 0.42);
    shed.position.copy(lc);
    shed.rotation.y = yawFor(opposite(lot));
    this.levelGroup.add(shed);
    const along = d.axis === 0 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    for (const k of [-1, 1]) {
      const cr = this.prop(X.fishCrate, null, 2.2);
      cr.position.copy(c).addScaledVector(DIR_VEC(lot), 1.6).addScaledVector(along, k * 1.1);
      cr.rotation.y = k * 0.4;
      this.levelGroup.add(cr);
    }
    const pots = this.prop(X.lobster, null, 1.3);
    pots.position.copy(c).addScaledVector(DIR_VEC(opposite(lot)), 1.6);
    this.levelGroup.add(pots);
    const tag = new THREE.Group();
    const arrow = textSprite('↓', 1.4);
    arrow.position.set(0, -1.6, 0);
    tag.add(cargoSprite(d.takes, 2.2), arrow);
    tag.position.copy(c).add(new THREE.Vector3(0, 6.5, 0));
    this.levelGroup.add(tag);
  }

  /** Piattaforma girevole in fondo al binario morto. */
  private buildTurntable(t: TurntableDef) {
    const c = this.cellCenter(t.x, t.y);
    const plate = this.prop(X.turntable, CELL * 0.98);
    plate.position.copy(c);
    this.levelGroup.add(plate);
    const track = this.mesh(this.straightGeo!, false, true);
    track.position.copy(c).setY(0.12);
    track.rotation.y = yawFor(t.side);
    this.levelGroup.add(track);
    this.turntables.push({ mesh: track, key: cellKey(t.x, t.y), base: yawFor(t.side) });
  }

  private buildLevelCrossing(lc: LevelCrossingDef) {
    const c = this.cellCenter(lc.x, lc.y);
    if (lc.kind === 'boat') {
      // Ponte levatoio: la barca a vela passa sull'acqua e il ponte si solleva.
      const water = lc.axis === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
      const boat = this.prop(X.sailboat, null, 11);
      boat.position.y = -0.55;
      this.levelGroup.add(boat);
      this.tractors.push({ mesh: boat, center: c.clone().setY(-0.55), road: water, offset: lc.offset, period: lc.period, lift: cellKey(lc.x, lc.y) });
      const times = [0, 1, 2].map((k) => lc.offset + k * lc.period);
      const sign = scheduleSprite(times);
      sign.position.copy(c).addScaledVector(water, CELL * 1.1).add(new THREE.Vector3(0, 4.5, 0));
      this.levelGroup.add(sign);
      this.drawTractors(null, 0);
      return;
    }
    const m = this.mesh(this.geo(X.levelCrossing), false, true);
    m.scale.set(CELL / 12, 1, 1);
    // Il modello ha la strada lungo x e i binari lungo z.
    m.rotation.y = lc.axis === 0 ? 0 : Math.PI / 2;
    m.position.copy(c);
    this.levelGroup.add(m);
    const road = lc.axis === 0 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    const tractor = this.prop(this.th.vehicle.id, null, this.th.vehicle.scale);
    this.levelGroup.add(tractor);
    this.tractors.push({ mesh: tractor, center: c, road, offset: lc.offset, period: lc.period });
    const times = [0, 1, 2].map((k) => lc.offset + k * lc.period);
    const sign = scheduleSprite(times);
    sign.position.copy(c).addScaledVector(road, CELL * 1.1).add(new THREE.Vector3(0, 4.5, 0));
    this.levelGroup.add(sign);
    this.drawTractors(null, 0);
  }

  /** Semaforo accanto al binario, con la luce verde (o rossa se un treno aspetta). */
  private addSignal(p: Piece & Cell) {
    const c = this.cellCenter(p.x, p.y);
    const pole = this.prop(X.signal, null, 0.85);
    let offset: THREE.Vector3;
    if (p.a === opposite(p.b)) {
      offset = DIR_VEC(((p.a + 1) % 4) as Dir).multiplyScalar(1.7);
      pole.rotation.y = yawFor(p.a);
    } else {
      offset = DIR_VEC(p.a).add(DIR_VEC(p.b)).multiplyScalar(-1.2);
      pole.rotation.y = yawFor(p.a);
    }
    pole.position.copy(c).add(offset);
    this.signalGroup.add(pole);
    const light = lightSprite('green');
    light.position.copy(pole.position).add(new THREE.Vector3(0, 4.4, 0));
    this.signalGroup.add(light);
    this.signalLights.set(`${p.x},${p.y}`, light);
  }

  // --- treni -----------------------------------------------------------------

  private ensureVehicles(snap: SimSnapshot) {
    const b = this.board!;
    if (this.vehicles.length > 0) return;
    for (const t of snap.trains) {
      const def = b.level.trains[t.index];
      const ids = [M.loco, ...Array.from({ length: def.wagons }, () => WAGON_MODEL[wagonOf(def)]), ...(def.drops ?? []).map((c) => WAGON_MODEL[c])];
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
      const tag = def.cargo ? cargoSprite(def.cargo, 1.7) : emptySprite(1.7);
      tag.visible = false;
      this.trainGroup.add(tag);
      this.cargoTags[t.index] = tag;
      this.tagCargo[t.index] = def.cargo;
    }
  }

  resetTrains() {
    for (const v of this.vehicles) this.trainGroup.remove(v.mesh);
    for (const t of this.cargoTags) if (t) this.trainGroup.remove(t);
    this.vehicles = [];
    this.cargoTags = [];
    this.tagCargo = [];
    for (const k of this.signalLights.keys()) this.setSignalLight(k, 'green');
    this.drawTractors(null, 0);
    this.drawBroken(null);
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
      // Dentro una galleria il treno sparisce.
      const b = this.board!;
      const inHill = b.terrain(Math.floor(p.x / CELL + b.width / 2), Math.floor(p.z / CELL + b.height / 2)) === 'hill';
      view.mesh.visible = !inHill;
      if (view.v === 0) {
        const tag = this.cargoTags[view.train];
        const cargo = cur.trains[view.train].cargo;
        if (this.tagCargo[view.train] !== cargo) {
          // Il treno vuoto ha caricato: cambia l'etichetta.
          tag.material = (cargo ? cargoSprite(cargo) : emptySprite()).material;
          this.tagCargo[view.train] = cargo;
        }
        tag.visible = !inHill;
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

  /** Rosso ai semafori dove un treno aspetta. */
  drawSignals(cur: SimSnapshot) {
    const red = new Set<string>();
    for (const t of cur.trains) {
      if (!t.held) continue;
      const head = t.vehicles.find((v) => v.v === 0);
      if (head) red.add(`${head.step.x + DX[head.step.exit]},${head.step.y + DY[head.step.exit]}`);
    }
    for (const k of this.signalLights.keys()) this.setSignalLight(k, red.has(k) ? 'red' : 'green');
  }

  private setSignalLight(key: string, color: 'red' | 'green') {
    const s = this.signalLights.get(key);
    if (s) s.material = lightSprite(color).material;
  }

  /**
   * Trattori dei passaggi a livello. `tick` può essere frazionario (tra due stati della simulazione).
   * Senza simulazione (cur = null) il trattore aspetta parcheggiato.
   */
  drawTractors(cur: SimSnapshot | null, tick: number) {
    this.tractors.forEach((tr, i) => {
      const w = cur?.tractors[i];
      const side = CELL * 0.95;
      const from = (k: number) => (k % 2 === 0 ? -side : side);
      let off = from(0);
      let dir = 1;
      if (w && w.start >= 0) {
        const k = Math.round((w.start - tr.offset) / tr.period);
        const a = from(k);
        const z = -a;
        dir = a < 0 ? 1 : -1;
        if (tick < w.start - 1) off = a;
        else if (tick < w.start) off = a * (w.start - tick);
        else if (tick <= w.until) off = 0;
        else if (tick < w.until + 1) off = z * (tick - w.until);
        else off = z;
      }
      tr.mesh.position.copy(tr.center).addScaledVector(tr.road, off);
      tr.mesh.rotation.y = Math.atan2(tr.road.x * dir, tr.road.z * dir) + (tr.lift ? Math.PI / 2 : 0);
      if (tr.lift) {
        // Il ponte si alza mentre la barca è vicina.
        const up = Math.max(0, 1 - Math.abs(off) / (CELL * 0.95)) * 3.2;
        for (const m of this.cellMeshes.get(tr.lift) ?? []) m.position.y = (m.userData.y ?? 0) + up;
      }
    });
  }

  /** Passerelle rotte: il binario sprofonda. */
  drawBroken(cur: SimSnapshot | null) {
    const broken = new Set(cur?.broken ?? []);
    const b = this.board!;
    for (const [k, list] of this.cellMeshes) {
      const [x, y] = k.split(',').map(Number);
      if (b.terrain(x, y) !== 'boardwalk') continue;
      for (const m of list) {
        m.position.y = (m.userData.y ?? 0) - (broken.has(k) ? 0.9 : 0);
        m.rotation.z = broken.has(k) ? 0.18 : 0;
      }
    }
  }

  showFailure(x: number, y: number) {
    const m = markerSprite('#e0322b');
    m.position.copy(this.cellCenter(x, y)).add(new THREE.Vector3(0, 3, 0));
    this.overlayGroup.add(m);
  }

  /** Posizione sullo schermo (pixel CSS) di un punto sopra una cella. */
  screenPos(x: number, y: number, height = 0): { x: number; y: number } {
    const v = this.cellCenter(x, y).setY(height).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
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
    const halfW = span * 0.58;
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
