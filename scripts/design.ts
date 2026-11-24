// Progettista automatico di livelli, per chi crea livelli.
// Dato un livello "bozza" (terreno, depositi, stazioni, carichi, treni) cerca un percorso per ogni treno,
// riusando i binari già posati quando conviene (così nascono scambi e incroci), imposta gli scambi
// secondo le merci, aggiunge semafori se servono contro scontri e trattori, e scrive nel JSON
// soluzione, obiettivi per le 3 stelle e scorte (pezzi usati + un piccolo margine).
// Uso: npx vite-node scripts/design.ts <id...>
import { readFileSync, writeFileSync } from 'node:fs';
import { Board } from '../src/core/board';
import { combine, connects } from '../src/core/pieces';
import { Simulation, scoreRun } from '../src/core/sim';
import { Cargo, Cell, DX, DY, Dir, LevelDef, PlacedPiece, StockKind, SwitchRoute, cellKey, opposite } from '../src/core/types';

interface Draft extends LevelDef {
  /** Pezzi in più nelle scorte oltre a quelli della soluzione. */
  slack?: Partial<Record<StockKind, number>>;
  /** Semafori al massimo da provare. */
  maxSignals?: number;
  /** Ordine in cui progettare i percorsi dei treni (indici); di base quello dei treni. */
  designOrder?: number[];
}

interface Node {
  x: number;
  y: number;
  entry: Dir;
  loaded: Cargo | null;
  /** Vagoni ancora da lasciare agli scarichi (si lasciano dalla coda). */
  drops: number;
  /** Ha già girato sulla piattaforma. */
  turned: boolean;
  cost: number;
  path: Cell[];
  seen: Set<string>;
}

function route(b: Board, ti: number, avoid: Set<string>, full: Set<string>): { path: Cell[]; cargo: Cargo; station: string } | null {
  const lvl = b.level;
  const tr = lvl.trains[ti] as LevelDef['trains'][number] & { via?: string };
  const d = lvl.depots[tr.depot];
  const drops = tr.drops ?? [];
  const L = 1 + tr.wagons + drops.length;
  const mustTurn = tr.via === 'turntable';
  const start: Node = {
    x: d.x + DX[d.dir],
    y: d.y + DY[d.dir],
    entry: opposite(d.dir),
    loaded: tr.cargo,
    drops: drops.length,
    turned: false,
    cost: 0,
    path: [{ x: d.x, y: d.y }],
    seen: new Set([cellKey(d.x, d.y)]),
  };
  const open: Node[] = [start];
  const best = new Map<string, number>();
  while (open.length) {
    open.sort((p, q) => p.cost - q.cost);
    const n = open.shift()!;
    const key = `${n.x},${n.y},${n.entry},${n.loaded},${n.drops},${n.turned}`;
    if ((best.get(key) ?? Infinity) <= n.cost) continue;
    best.set(key, n.cost);
    if (n.path.length > 60) continue;
    const st = b.stationAt(n.x, n.y);
    if (st) {
      if (opposite(st.dir) === n.entry && n.loaded && st.accepts.includes(n.loaded) && n.drops === 0 && (n.turned || !mustTurn) && !full.has(st.id)) {
        return { path: [...n.path, { x: n.x, y: n.y }], cargo: n.loaded, station: st.id };
      }
      continue;
    }
    const tt = b.turntableAt(n.x, n.y);
    if (tt) {
      // Piattaforma: il treno gira e riparte dalla sua coda, all'indietro.
      const len = n.path.length;
      if (tt.side !== n.entry || n.turned || !mustTurn || len - L < 1) continue;
      const tail = n.path[len - L + 1];
      const front = n.path[len - L];
      const back = n.path.slice(len - L + 1).reverse();
      const e = ([0, 1, 2, 3] as Dir[]).find((q) => front.x + DX[q] === tail.x && front.y + DY[q] === tail.y)!;
      open.push({ x: front.x, y: front.y, entry: e, loaded: n.loaded, drops: n.drops, turned: true, cost: n.cost + 0.5, path: [...n.path, { x: n.x, y: n.y }, ...back], seen: new Set() });
      continue;
    }
    if (!b.inside(n.x, n.y) || b.depotAt(n.x, n.y) || n.seen.has(cellKey(n.x, n.y)) || avoid.has(cellKey(n.x, n.y))) continue;
    const p = b.pieceAt(n.x, n.y);
    const pick = b.pickupAt(n.x, n.y);
    const loaded = pick && n.loaded === null ? pick.gives : n.loaded;
    const dr = b.dropAt(n.x, n.y);
    const left = dr && n.drops > 0 && !n.turned && drops[n.drops - 1] === dr.takes ? n.drops - 1 : n.drops;
    const tr0 = b.terrain(n.x, n.y);
    for (const x of [0, 1, 2, 3] as Dir[]) {
      if (x === n.entry) continue;
      let c: number | null = null;
      if (p) {
        const e = n.entry;
        const along =
          p.kind === 'crossing'
            ? x === opposite(e)
            : p.kind === 'switch'
              ? (e === p.a && (x === p.b || x === p.c)) || (x === p.a && (e === p.b || e === p.c))
              : connects(p, e) && connects(p, x);
        if (along) c = 0.2;
        else if (!p.fixed && (p.kind === 'straight' || p.kind === 'curve')) {
          const m = combine(p, e, x);
          if (m) c = m.kind === 'switch' ? 1.6 : 2.2;
        }
      } else if (b.buildable(n.x, n.y)) {
        if (tr0 === 'water' || tr0 === 'hill' || tr0 === 'gap') c = x === opposite(n.entry) ? 1.3 : null;
        else c = x === opposite(n.entry) ? 1 : 1.15;
      }
      if (c === null) continue;
      const seen = new Set(n.seen);
      seen.add(cellKey(n.x, n.y));
      open.push({ x: n.x + DX[x], y: n.y + DY[x], entry: opposite(x), loaded, drops: left, turned: n.turned, cost: n.cost + c, path: [...n.path, { x: n.x, y: n.y }], seen });
    }
  }
  return null;
}

function attempt(id: string, draft: Draft, order: number[], mask = 0): { out: LevelDef; line: string; ticks: number; pieces: number } | string {
  const big: Partial<Record<StockKind, number>> = { straight: 99, curve: 99, switch: 99, crossing: 99, bridge: 99, tunnel: 99, signal: 9 };
  const b = new Board({ ...draft, stock: big });
  const paths: Cell[][] = [];
  // Le passerelle reggono un solo treno: un altro treno non ci può passare.
  const avoid = new Set<string>();
  const timed = [...b.pieces.values()].filter((p) => p.timer).map((p) => cellKey(p.x, p.y));
  const got = new Map<string, number>();
  const full = new Set<string>();
  for (const ti of order) {
    // Con la maschera, alcuni treni evitano gli scambi a tempo e fanno un'altra strada.
    const av = mask & (1 << ti) ? new Set([...avoid, ...timed]) : avoid;
    const r = route(b, ti, av, full);
    if (!r) {
      return `nessun percorso per il treno ${ti}`;
    }
    b.placePath(r.path);
    paths[ti] = r.path;
    got.set(r.station, (got.get(r.station) ?? 0) + 1);
    const cap = b.stationAt(r.path[r.path.length - 1].x, r.path[r.path.length - 1].y)?.capacity;
    if (cap !== undefined && got.get(r.station)! >= cap) full.add(r.station);
    for (const c of r.path) if (b.terrain(c.x, c.y) === 'boardwalk') avoid.add(cellKey(c.x, c.y));
  }
  // Scambi: per ogni scambio, quali treni entrano dal tronco e quali deviano.
  const lvl = b.level;
  const routeCargo = (ti: number) => lvl.trains[ti].cargo ?? lvl.trains[ti].wagon ?? null;
  for (const p of b.pieces.values()) {
    if (p.kind !== 'switch' || p.fixed) continue;
    const div = new Set<Cargo | null>();
    const str = new Set<Cargo | null>();
    paths.forEach((path, ti) => {
      for (let i = 1; i < path.length - 1; i++) {
        if (path[i].x !== p.x || path[i].y !== p.y) continue;
        const from = path[i - 1];
        const to = path[i + 1];
        const e = ([0, 1, 2, 3] as Dir[]).find((d) => p.x + DX[d] === from.x && p.y + DY[d] === from.y)!;
        const x = ([0, 1, 2, 3] as Dir[]).find((d) => p.x + DX[d] === to.x && p.y + DY[d] === to.y)!;
        if (e !== p.a) continue;
        (x === p.c ? div : str).add(routeCargo(ti));
      }
    });
    let r: SwitchRoute = 'none';
    if (div.size && !str.size) r = 'all';
    else if (div.size === 1 && ![...div].some((c) => str.has(c)) && [...div][0]) r = [...div][0] as Cargo;
    else if (div.size) {
      return `lo scambio in ${p.x},${p.y} non riesce a separare ${[...div]} da ${[...str]}`;
    }
    p.route = r;
  }
  const pieces = b.exportPieces();
  // Semafori: prova da 0 al massimo, sceglie il tempo migliore e poi meno pezzi.
  const tryRun = (sigs: Cell[]) => {
    const bb = new Board({ ...draft, stock: big });
    bb.loadPieces(pieces, sigs);
    const sim = new Simulation(bb);
    sim.runToEnd();
    return { r: scoreRun(bb, sim), bb };
  };
  const cand = pieces.filter((p) => ['straight', 'curve', 'bridge'].includes(p.kind) && !b.pickupAt(p.x, p.y)).map((p) => ({ x: p.x, y: p.y }));
  let best: { r: ReturnType<typeof scoreRun>; sigs: Cell[]; bb: Board } | null = null;
  const maxS = draft.maxSignals ?? 0;
  const rec = (start: number, chosen: Cell[]) => {
    const { r, bb } = tryRun(chosen);
    if (r.outcome === 'won' && (!best || r.ticks < best.r.ticks || (r.ticks === best.r.ticks && r.pieces < best.r.pieces))) best = { r, sigs: chosen, bb };
    if (chosen.length >= maxS) return;
    for (let i = start; i < cand.length; i++) rec(i + 1, [...chosen, cand[i]]);
  };
  rec(0, []);
  if (!best) {
    const { r } = tryRun([]);
    return `la soluzione trovata non vince ${JSON.stringify(r.failure)}`;
  }
  const { r, sigs, bb } = best as { r: ReturnType<typeof scoreRun>; sigs: Cell[]; bb: Board };
  const stock: Partial<Record<StockKind, number>> = {};
  const slack = { straight: 2, curve: 1, ...(draft.slack ?? {}) };
  for (const k of ['straight', 'curve', 'switch', 'crossing', 'bridge', 'tunnel', 'signal'] as StockKind[]) {
    const n = bb.used(k) + (bb.used(k) > 0 || (slack as any)[k] ? ((slack as any)[k] ?? 0) : 0);
    if (n > 0) stock[k] = n;
  }
  const out: LevelDef = { ...draft, trains: draft.trains.map(({ via, ...t }: any) => t), stock, targets: { pieces: r.pieces, ticks: r.ticks }, solution: pieces.map(({ fixed, ...p }) => p as PlacedPiece) };
  if (sigs.length) out.solutionSignals = sigs;
  else delete out.solutionSignals;
  for (const k of ['slack', 'maxSignals', 'designOrder'] as const) delete (out as any)[k];
  return { out, ticks: r.ticks, pieces: r.pieces, line: `order=${order} mask=${mask} ticks=${r.ticks} pieces=${r.pieces} signals=${sigs.length} stock=${JSON.stringify(stock)}` };
}

function permutations(n: number): number[][] {
  if (n <= 1) return [[0].slice(0, n)];
  const out: number[][] = [];
  for (const p of permutations(n - 1)) for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)]);
  return out;
}

/** Prova i treni in ordini diversi e tiene la soluzione più veloce (poi con meno pezzi). */
function design(id: string): boolean {
  const file = `src/levels/${id}.json`;
  const draft = JSON.parse(readFileSync(file, 'utf8')) as Draft;
  const n = new Board(draft).level.trains.length;
  const orders = draft.designOrder ? [draft.designOrder] : permutations(n).slice(0, 24);
  let best: Exclude<ReturnType<typeof attempt>, string> | null = null;
  const why = new Set<string>();
  const hasTimed = draft.fixed.some((p) => p.timer);
  const masks = hasTimed ? Array.from({ length: 1 << Math.min(n, 4) }, (_, i) => i) : [0];
  for (const o of orders) for (const m of masks) {
    const r = attempt(id, draft, o, m);
    if (typeof r === 'string') why.add(r);
    else if (!best || r.ticks < best.ticks || (r.ticks === best.ticks && r.pieces < best.pieces)) best = r;
  }
  if (!best) {
    console.log(`✗ ${id}: ${[...why].join(' | ')}`);
    return false;
  }
  writeFileSync(file, JSON.stringify(best.out, null, 2) + '\n');
  console.log(`✓ ${id} ${best.line}`);
  return true;
}


const ids = process.argv.slice(2);
let ok = true;
for (const id of ids) ok = design(id) && ok;
process.exit(ok ? 0 : 1);
