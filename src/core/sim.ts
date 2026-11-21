import { Board } from './board';
import { exitSide } from './pieces';
import { Cargo, DX, DY, Dir, cellKey, opposite } from './types';

/** Una cella occupata da un veicolo, con il lato da cui è entrato e quello da cui uscirà. */
export interface TrackStep {
  x: number;
  y: number;
  entry: Dir;
  exit: Dir;
}

export type TrainStatus = 'waiting' | 'running' | 'arriving' | 'done' | 'crashed';

export interface TrainState {
  index: number;
  cargo: Cargo;
  /** Locomotiva + vagoni. */
  length: number;
  status: TrainStatus;
  /** Celle percorse, la più recente per prima. trail[i] è la cella del veicolo i. */
  trail: TrackStep[];
  /** Quanti veicoli sono già usciti dal deposito. */
  emerged: number;
  /** Quanti veicoli sono già entrati nella stazione di arrivo. */
  absorbed: number;
  stationId?: string;
  deliveredAt?: number;
  doneAt?: number;
}

export type FailReason = 'collision' | 'derail' | 'wrong-station' | 'timeout';

export interface Failure {
  reason: FailReason;
  tick: number;
  x: number;
  y: number;
  trains: number[];
}

export interface SimSnapshot {
  tick: number;
  trains: {
    index: number;
    status: TrainStatus;
    /** Veicoli visibili: indice del veicolo e cella. */
    vehicles: { v: number; step: TrackStep; inside?: boolean }[];
  }[];
}

export type Outcome = 'running' | 'won' | 'failed';

/**
 * Simulazione deterministica a tick. Ogni tick ogni treno avanza di una cella.
 * Non sa nulla di grafica: il renderer legge gli snapshot e interpola.
 */
export class Simulation {
  tick = 0;
  outcome: Outcome = 'running';
  failure: Failure | null = null;
  readonly trains: TrainState[];
  readonly maxTicks: number;

  constructor(private board: Board) {
    const lvl = board.level;
    this.trains = lvl.trains.map((t, index) => ({
      index,
      cargo: t.cargo,
      length: 1 + t.wagons,
      status: 'waiting',
      trail: [],
      emerged: 0,
      absorbed: 0,
    }));
    this.maxTicks = Math.max(60, lvl.targets.ticks * 3);
  }

  /** Celle occupate dai veicoli visibili di ogni treno. */
  private occupied(t: TrainState): TrackStep[] {
    if (t.status === 'waiting' || t.status === 'done') return [];
    return t.trail.slice(t.absorbed, t.emerged);
  }

  /**
   * Stato da disegnare. Include anche il veicolo appena entrato in stazione (`inside`),
   * così il renderer lo può far scivolare dentro prima di nasconderlo.
   */
  snapshot(): SimSnapshot {
    return {
      tick: this.tick,
      trains: this.trains.map((t) => {
        const vehicles: { v: number; step: TrackStep; inside?: boolean }[] = [];
        if (t.status !== 'waiting' && t.trail.length > 0) {
          const justDone = t.status === 'done' && t.doneAt === this.tick;
          if (t.status !== 'done' || justDone) {
            const start = Math.max(0, t.absorbed - 1);
            for (let i = start; i < t.emerged; i++) {
              vehicles.push({ v: i, step: t.trail[i], inside: i < t.absorbed });
            }
          }
        }
        return { index: t.index, status: t.status, vehicles };
      }),
    };
  }

  private fail(reason: FailReason, x: number, y: number, trains: number[]) {
    this.outcome = 'failed';
    this.failure = { reason, tick: this.tick, x, y, trains };
    for (const i of trains) this.trains[i].status = 'crashed';
  }

  /** Avanza di un tick. */
  step(): Outcome {
    if (this.outcome !== 'running') return this.outcome;
    this.tick++;
    const lvl = this.board.level;
    const prevHeads = new Map<number, string>();
    for (const t of this.trains) if (t.trail[0] && t.status === 'running') prevHeads.set(t.index, cellKey(t.trail[0].x, t.trail[0].y));

    for (const t of this.trains) {
      if (t.status === 'waiting') {
        if (this.tick < lvl.trains[t.index].depart) continue;
        const d = lvl.depots[lvl.trains[t.index].depot];
        // Il deposito deve essere libero.
        const busy = this.trains.some((o) => o !== t && this.occupied(o).some((s) => s.x === d.x && s.y === d.y));
        if (busy) continue;
        t.status = 'running';
        t.trail = [{ x: d.x, y: d.y, entry: opposite(d.dir), exit: d.dir }];
        t.emerged = 1;
        continue;
      }
      if (t.status === 'arriving') {
        // Il treno sta entrando in stazione: ogni tick sparisce un veicolo in più.
        t.trail.unshift(t.trail[0]);
        t.absorbed++;
        if (t.emerged < t.length) t.emerged++;
        if (t.absorbed >= t.length) {
          t.status = 'done';
          t.doneAt = this.tick;
        }
        continue;
      }
      if (t.status !== 'running') continue;
      const head = t.trail[0];
      const nx = head.x + DX[head.exit];
      const ny = head.y + DY[head.exit];
      const entry = opposite(head.exit);
      const station = this.board.stationAt(nx, ny);
      if (station && opposite(station.dir) === entry) {
        if (!station.accepts.includes(t.cargo)) {
          this.fail('wrong-station', nx, ny, [t.index]);
          return this.outcome;
        }
        t.trail.unshift({ x: nx, y: ny, entry, exit: station.dir });
        t.absorbed = 1;
        if (t.emerged < t.length) t.emerged++;
        t.status = t.length <= 1 ? 'done' : 'arriving';
        if (t.status === 'done') t.doneAt = this.tick;
        t.stationId = station.id;
        t.deliveredAt = this.tick;
        continue;
      }
      const piece = this.board.pieceAt(nx, ny);
      const exit = piece ? exitSide(piece, entry, t.cargo) : null;
      if (exit === null) {
        this.fail('derail', nx, ny, [t.index]);
        return this.outcome;
      }
      t.trail.unshift({ x: nx, y: ny, entry, exit });
      if (t.emerged < t.length) t.emerged++;
      if (t.trail.length > t.length + 1) t.trail.length = t.length + 1;
    }

    // Scontri: due treni nella stessa cella, o due teste che si scambiano di posto.
    const owner = new Map<string, number>();
    for (const t of this.trains) {
      for (const s of this.occupied(t)) {
        const k = cellKey(s.x, s.y);
        const o = owner.get(k);
        if (o !== undefined && o !== t.index) {
          this.fail('collision', s.x, s.y, [o, t.index]);
          return this.outcome;
        }
        owner.set(k, t.index);
      }
    }
    for (const t of this.trains) {
      if (t.status !== 'running' || !t.trail[0]) continue;
      const before = prevHeads.get(t.index);
      for (const o of this.trains) {
        if (o.index <= t.index || o.status !== 'running' || !o.trail[0]) continue;
        const ob = prevHeads.get(o.index);
        if (before && ob && cellKey(t.trail[0].x, t.trail[0].y) === ob && cellKey(o.trail[0].x, o.trail[0].y) === before) {
          this.fail('collision', t.trail[0].x, t.trail[0].y, [t.index, o.index]);
          return this.outcome;
        }
      }
    }

    if (this.trains.every((t) => t.status === 'done')) this.outcome = 'won';
    else if (this.tick >= this.maxTicks) {
      const t = this.trains.find((x) => x.status !== 'done')!;
      const h = t.trail[0] ?? { x: lvl.depots[0].x, y: lvl.depots[0].y };
      this.fail('timeout', h.x, h.y, [t.index]);
    }
    return this.outcome;
  }

  /** Tick dell'ultima consegna: è il "tempo" che conta per le stelle. */
  finishTick(): number {
    return Math.max(...this.trains.map((t) => t.deliveredAt ?? Infinity));
  }

  runToEnd(): Outcome {
    while (this.step() === 'running');
    return this.outcome;
  }
}

export interface Result {
  outcome: Outcome;
  stars: 0 | 1 | 2 | 3;
  starPieces: boolean;
  starTime: boolean;
  pieces: number;
  ticks: number;
  failure: Failure | null;
}

/** Stelle: 1 per aver finito, +1 se i pezzi sono entro l'obiettivo, +1 se il tempo lo è. */
export function scoreRun(board: Board, sim: Simulation): Result {
  const pieces = board.piecesUsed();
  if (sim.outcome !== 'won') {
    return { outcome: sim.outcome, stars: 0, starPieces: false, starTime: false, pieces, ticks: sim.tick, failure: sim.failure };
  }
  const ticks = sim.finishTick();
  const starPieces = pieces <= board.level.targets.pieces;
  const starTime = ticks <= board.level.targets.ticks;
  const stars = (1 + (starPieces ? 1 : 0) + (starTime ? 1 : 0)) as 1 | 2 | 3;
  return { outcome: 'won', stars, starPieces, starTime, pieces, ticks, failure: null };
}
