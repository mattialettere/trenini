import { combine, connects, pieceFor, samePiece } from './pieces';
import {
  Cell,
  DX,
  DY,
  Dir,
  LevelDef,
  Piece,
  PieceKind,
  PlacedPiece,
  SwitchRoute,
  Terrain,
  cellKey,
  opposite,
} from './types';

const TERRAIN_CHARS: Record<string, Terrain> = {
  '.': 'grass',
  T: 'tree',
  '~': 'water',
  '^': 'hill',
  R: 'rock',
  ' ': 'void',
};

export function dirBetween(from: Cell, to: Cell): Dir | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return 0;
  if (dx === 1 && dy === 0) return 1;
  if (dx === 0 && dy === 1) return 2;
  if (dx === -1 && dy === 0) return 3;
  return null;
}

/** Stato della costruzione di un livello: terreno, pezzi posati e scorte. */
export class Board {
  readonly width: number;
  readonly height: number;
  readonly pieces = new Map<string, PlacedPiece>();
  private undoStack: string[] = [];

  constructor(readonly level: LevelDef) {
    this.height = level.terrain.length;
    this.width = Math.max(...level.terrain.map((r) => r.length));
    for (const p of level.fixed) this.pieces.set(cellKey(p.x, p.y), { ...p, fixed: true });
  }

  terrain(x: number, y: number): Terrain {
    if (x < 0 || y < 0 || y >= this.height || x >= this.width) return 'void';
    return TERRAIN_CHARS[this.level.terrain[y][x] ?? ' '] ?? 'void';
  }

  inside(x: number, y: number): boolean {
    return this.terrain(x, y) !== 'void';
  }

  depotAt(x: number, y: number) {
    return this.level.depots.find((d) => d.x === x && d.y === y);
  }

  stationAt(x: number, y: number) {
    return this.level.stations.find((s) => s.x === x && s.y === y);
  }

  pieceAt(x: number, y: number): PlacedPiece | undefined {
    return this.pieces.get(cellKey(x, y));
  }

  /** Si può posare un binario qui? (prato libero, oppure un pezzo non fisso). */
  buildable(x: number, y: number): boolean {
    if (this.terrain(x, y) !== 'grass') return false;
    if (this.depotAt(x, y) || this.stationAt(x, y)) return false;
    const p = this.pieceAt(x, y);
    return !p?.fixed;
  }

  /** La cella (x,y) ha un binario che esce dal lato `side`? Conta anche depositi e stazioni. */
  opensTo(x: number, y: number, side: Dir): boolean {
    const p = this.pieceAt(x, y);
    if (p && connects(p, side)) return true;
    const d = this.depotAt(x, y);
    if (d && d.dir === side) return true;
    const s = this.stationAt(x, y);
    if (s && opposite(s.dir) === side) return true;
    return false;
  }

  /** La cella vicina oltre il lato `side` ha un binario che torna verso (x,y)? */
  linkedAcross(x: number, y: number, side: Dir): boolean {
    return this.opensTo(x + DX[side], y + DY[side], opposite(side));
  }

  used(kind: PieceKind): number {
    let n = 0;
    for (const p of this.pieces.values()) if (!p.fixed && p.kind === kind) n++;
    return n;
  }

  available(kind: PieceKind): number {
    return (this.level.stock[kind] ?? 0) - this.used(kind);
  }

  piecesUsed(): number {
    let n = 0;
    for (const p of this.pieces.values()) if (!p.fixed) n++;
    return n;
  }

  // --- annulla ---------------------------------------------------------------

  private snapshot(): string {
    return JSON.stringify([...this.pieces.values()].filter((p) => !p.fixed));
  }

  private restore(json: string) {
    for (const [k, p] of this.pieces) if (!p.fixed) this.pieces.delete(k);
    for (const p of JSON.parse(json) as PlacedPiece[]) this.pieces.set(cellKey(p.x, p.y), p);
  }

  /** Salva lo stato per Annulla. Da chiamare all'inizio di ogni gesto. */
  beginEdit() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  /** Scarta il punto di annullamento se il gesto non ha cambiato nulla. */
  endEdit() {
    const last = this.undoStack[this.undoStack.length - 1];
    if (last !== undefined && last === this.snapshot()) this.undoStack.pop();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undo(): boolean {
    const s = this.undoStack.pop();
    if (s === undefined) return false;
    this.restore(s);
    return true;
  }

  clear() {
    this.beginEdit();
    this.restore('[]');
    this.endEdit();
  }

  exportPieces(): PlacedPiece[] {
    return [...this.pieces.values()].filter((p) => !p.fixed).map((p) => ({ ...p }));
  }

  loadPieces(list: PlacedPiece[]) {
    this.restore(JSON.stringify(list.filter((p) => this.buildable(p.x, p.y))));
  }

  // --- modifiche -------------------------------------------------------------

  private setPiece(x: number, y: number, piece: Piece): boolean {
    const old = this.pieceAt(x, y);
    if (old?.fixed) return false;
    if (old && samePiece(old, piece)) return true;
    const refund = old && old.kind === piece.kind ? 1 : 0;
    if (this.available(piece.kind) + refund <= 0) return false;
    this.pieces.set(cellKey(x, y), { ...piece, x, y });
    return true;
  }

  remove(x: number, y: number): boolean {
    const p = this.pieceAt(x, y);
    if (!p || p.fixed) return false;
    this.pieces.delete(cellKey(x, y));
    return true;
  }

  /** Lato "di partenza" per il primo o l'ultimo punto di un tracciato, guardando i vicini. */
  private endSide(c: Cell, towards: Dir): Dir {
    const straight = opposite(towards);
    const existing = this.pieceAt(c.x, c.y);
    const candidates: Dir[] = [straight, ((towards + 1) % 4) as Dir, ((towards + 3) % 4) as Dir];
    // Prima i lati del pezzo già posato che sono collegati: il più vicino a un deposito,
    // così un ramo nuovo diventa uno scambio rivolto nel verso di marcia.
    if (existing) {
      const linked = candidates.filter((s) => connects(existing, s) && this.linkedAcross(c.x, c.y, s));
      if (linked.length > 0) {
        const dist = this.depotDistances();
        const d = (s: Dir) => dist.get(cellKey(c.x + DX[s], c.y + DY[s])) ?? Infinity;
        return linked.reduce((best, s) => (d(s) < d(best) ? s : best), linked[0]);
      }
    }
    for (const s of candidates) if (this.linkedAcross(c.x, c.y, s)) return s;
    if (existing) for (const s of candidates) if (connects(existing, s)) return s;
    return straight;
  }

  /** Distanza in celle dai depositi lungo i binari collegati. */
  depotDistances(): Map<string, number> {
    const dist = new Map<string, number>();
    const queue: Cell[] = [];
    for (const d of this.level.depots) {
      dist.set(cellKey(d.x, d.y), 0);
      queue.push({ x: d.x, y: d.y });
    }
    while (queue.length > 0) {
      const c = queue.shift()!;
      const here = dist.get(cellKey(c.x, c.y))!;
      for (const side of [0, 1, 2, 3] as Dir[]) {
        if (!this.opensTo(c.x, c.y, side) || !this.linkedAcross(c.x, c.y, side)) continue;
        const n = { x: c.x + DX[side], y: c.y + DY[side] };
        const k = cellKey(n.x, n.y);
        if (dist.has(k)) continue;
        dist.set(k, here + 1);
        queue.push(n);
      }
    }
    return dist;
  }

  /** Posa un collegamento a-b nella cella, unendolo a quello che c'è già se serve. */
  private connect(x: number, y: number, a: Dir, b: Dir): boolean {
    if (!this.buildable(x, y)) return false;
    const old = this.pieceAt(x, y);
    if (!old) return this.setPiece(x, y, pieceFor(a, b));
    if (old.kind === 'straight' || old.kind === 'curve') {
      const oldSides = [old.a, old.b];
      if (oldSides.includes(a) && oldSides.includes(b)) return true;
      // Un lato del vecchio pezzo è "nel vuoto": lo rimodelliamo invece di fare uno scambio.
      const dangling = oldSides.filter((s) => !this.linkedAcross(x, y, s));
      const keeps = oldSides.filter((s) => s === a || s === b);
      if (dangling.length > 0 && keeps.length === 1 && dangling[0] !== keeps[0]) {
        return this.setPiece(x, y, pieceFor(a, b));
      }
      if (dangling.length === 2) return this.setPiece(x, y, pieceFor(a, b));
      const merged = combine(old, a, b);
      if (merged && this.setPiece(x, y, merged)) return true;
      return false;
    }
    // Scambio o incrocio: già contiene il collegamento?
    if (connects(old, a) && connects(old, b)) return true;
    return false;
  }

  /**
   * Posa binari lungo un tracciato di celle vicine (trascinamento del dito).
   * Restituisce quante celle sono state modificate.
   */
  placePath(path: Cell[]): number {
    if (path.length < 2) return 0;
    let changed = 0;
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      if (!this.buildable(c.x, c.y)) continue;
      const prev = i > 0 ? dirBetween(c, path[i - 1]) : null;
      const next = i < path.length - 1 ? dirBetween(c, path[i + 1]) : null;
      let a: Dir;
      let b: Dir;
      if (prev !== null && next !== null) {
        if (prev === next) continue;
        a = prev;
        b = next;
      } else if (next !== null) {
        a = this.endSide(c, next);
        b = next;
      } else if (prev !== null) {
        a = prev;
        b = this.endSide(c, prev);
      } else continue;
      const before = JSON.stringify(this.pieceAt(c.x, c.y) ?? null);
      if (!this.connect(c.x, c.y, a, b)) break; // pezzi finiti o forma impossibile
      if (JSON.stringify(this.pieceAt(c.x, c.y) ?? null) !== before) changed++;
    }
    return changed;
  }

  /** Cambia l'instradamento di uno scambio, ciclando tra le opzioni utili al livello. */
  cycleSwitch(x: number, y: number): SwitchRoute | null {
    const p = this.pieceAt(x, y);
    if (!p || p.kind !== 'switch' || p.fixed) return null;
    const cargos = [...new Set(this.level.trains.map((t) => t.cargo))];
    const options: SwitchRoute[] = ['none', 'all', ...(cargos.length > 1 ? cargos : [])];
    const i = options.indexOf(p.route ?? 'none');
    p.route = options[(i + 1) % options.length];
    return p.route;
  }
}
