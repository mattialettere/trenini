// Tipi di base della logica di gioco. Nessuna dipendenza dal rendering.

/** Direzioni sulla griglia: 0 nord (y-1), 1 est (x+1), 2 sud (y+1), 3 ovest (x-1). */
export type Dir = 0 | 1 | 2 | 3;
export const N: Dir = 0;
export const E: Dir = 1;
export const S: Dir = 2;
export const W: Dir = 3;
export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export const opposite = (d: Dir): Dir => ((d + 2) % 4) as Dir;
export const turnRight = (d: Dir): Dir => ((d + 1) % 4) as Dir;
export const turnLeft = (d: Dir): Dir => ((d + 3) % 4) as Dir;

export type Cargo = 'milk' | 'coal' | 'timber' | 'passengers';
export const CARGOS: Cargo[] = ['milk', 'coal', 'timber', 'passengers'];

export interface Cell {
  x: number;
  y: number;
}

export const cellKey = (x: number, y: number): string => `${x},${y}`;

/** Terreno di una cella. */
export type Terrain = 'grass' | 'tree' | 'water' | 'hill' | 'rock' | 'void';

/** Pezzi che il giocatore può posare. */
export type PieceKind = 'straight' | 'curve' | 'switch' | 'crossing';

/** Come instrada uno scambio: nessuno = tutti dritti, all = tutti deviati, oppure solo una merce deviata. */
export type SwitchRoute = 'none' | 'all' | Cargo;

export interface Piece {
  kind: PieceKind;
  /**
   * straight: a = un lato, b = lato opposto.
   * curve: a, b = due lati vicini.
   * switch: a = tronco (ingresso), b = uscita dritta (opposta ad a), c = uscita deviata (vicina ad a).
   * crossing: collega N-S ed E-W.
   */
  a: Dir;
  b: Dir;
  c?: Dir;
  route?: SwitchRoute;
  /** Pezzo già presente nel livello: non si può togliere né cambiare. */
  fixed?: boolean;
}

export interface DepotDef {
  x: number;
  y: number;
  /** Direzione in cui escono i treni. */
  dir: Dir;
}

export type StationKind = 'town' | 'port' | 'farm' | 'mine';

export interface StationDef {
  id: string;
  kind: StationKind;
  x: number;
  y: number;
  /** Direzione di marcia dei treni che entrano (la stazione si apre sul lato opposto). */
  dir: Dir;
  accepts: Cargo[];
}

export type LocoModel = 'tank-steam' | 'tender-steam' | 'diesel-shunter' | 'mainline-diesel' | 'railbus' | 'handcar';

export interface TrainDef {
  cargo: Cargo;
  /** Numero di vagoni dietro la locomotiva. */
  wagons: number;
  /** Tick di partenza dal deposito. */
  depart: number;
  depot: number;
}

export interface Decoration {
  model: string;
  x: number;
  y: number;
  rot?: number;
  scale?: number;
}

export interface PlacedPiece extends Piece {
  x: number;
  y: number;
}

export interface LevelDef {
  id: string;
  name: { it: string; en: string };
  /** Righe del terreno: '.' prato, 'T' alberi, '~' acqua, '^' collina, 'R' roccia, ' ' vuoto. */
  terrain: string[];
  fixed: PlacedPiece[];
  depots: DepotDef[];
  stations: StationDef[];
  trains: TrainDef[];
  stock: Partial<Record<PieceKind, number>>;
  targets: { pieces: number; ticks: number };
  tutorial?: { it: string; en: string }[];
  decorations?: Decoration[];
  /** Soluzione di riferimento da 3 stelle, usata dai test. */
  solution: PlacedPiece[];
}
