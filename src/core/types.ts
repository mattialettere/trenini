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
export type Terrain = 'grass' | 'tree' | 'water' | 'hill' | 'rock' | 'road' | 'lot' | 'void' | 'boardwalk' | 'gap';

/** Pezzi che il giocatore può posare. */
export type PieceKind = 'straight' | 'curve' | 'switch' | 'crossing' | 'bridge' | 'tunnel';

/** Cose che il livello dà al giocatore: pezzi di binario e semafori. */
export type StockKind = PieceKind | 'signal';

/** Come instrada uno scambio: nessuno = tutti dritti, all = tutti deviati, oppure solo una merce deviata. */
export type SwitchRoute = 'none' | 'all' | Cargo;

export interface Piece {
  kind: PieceKind;
  /**
   * straight: a = un lato, b = lato opposto.
   * curve: a, b = due lati vicini.
   * switch: a = tronco (ingresso), b = uscita dritta (opposta ad a), c = uscita deviata (vicina ad a).
   * crossing: collega N-S ed E-W.
   * bridge / tunnel: come un dritto, ma sull'acqua o dentro una collina.
   */
  a: Dir;
  b: Dir;
  c?: Dir;
  route?: SwitchRoute;
  /** Scambio a tempo (solo pezzi fissi): dal tick offset cambia da solo tra dritto e deviato ogni `period` tick. */
  timer?: { period: number; offset: number };
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
  /** Le merci devono arrivare in quest'ordine (una per treno). */
  order?: Cargo[];
  /** Quanti treni al massimo può ricevere. */
  capacity?: number;
}

export type LocoModel = 'tank-steam' | 'tender-steam' | 'diesel-shunter' | 'mainline-diesel' | 'railbus' | 'handcar';

export interface TrainDef {
  /** Merce a bordo alla partenza; null = treno vuoto che caricherà in una stazione di carico. */
  cargo: Cargo | null;
  /** Tipo di vagone da disegnare per un treno vuoto (la merce che andrà a prendere). */
  wagon?: Cargo;
  /** Numero di vagoni dietro la locomotiva. */
  wagons: number;
  /** Tick di partenza dal deposito. */
  depart: number;
  depot: number;
  /** Vagoni in più da lasciare lungo la strada, ognuno al suo scarico. */
  drops?: Cargo[];
  /** Il deposito manda `count` treni uguali, uno ogni `every` tick. */
  repeat?: { count: number; every: number };
}

/** Stazione di carico passante: un treno vuoto che la attraversa prende la merce. */
export interface PickupDef {
  x: number;
  y: number;
  /** 0 = binario nord-sud, 1 = binario est-ovest. */
  axis: 0 | 1;
  gives: Cargo;
  kind: 'farm' | 'mine' | 'forest';
}

/** Scarico passante: un treno che lo attraversa lascia qui il vagone di questa merce. */
export interface DropDef {
  x: number;
  y: number;
  axis: 0 | 1;
  takes: Cargo;
}

/** Piattaforma girevole in fondo a un binario morto: il treno entra, gira e torna indietro. */
export interface TurntableDef {
  x: number;
  y: number;
  /** Lato aperto verso il binario. */
  side: Dir;
}

/** Passaggio a livello: una strada attraversa il binario e un trattore passa a orari fissi. */
export interface LevelCrossingDef {
  x: number;
  y: number;
  /** Asse del binario: 0 = nord-sud, 1 = est-ovest. La strada è perpendicolare. */
  axis: 0 | 1;
  /** Il trattore arriva al tick offset, offset+period, ... e resta sul binario per `duration` tick. */
  period: number;
  offset: number;
  duration: number;
  /** road = trattore sulla strada; boat = ponte levatoio che si alza per una barca. */
  kind?: 'road' | 'boat';
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

/** Ambientazione di un livello: cambia solo l'aspetto, non le regole. */
export type Theme = 'country' | 'snow' | 'desert' | 'coast';

export interface LevelDef {
  id: string;
  theme?: Theme;
  name: { it: string; en: string };
  /** Righe del terreno: '.' prato, 'T' alberi, '~' acqua, '^' collina, 'R' roccia, '=' strada, 'o' cortile (edifici di carico), 'b' passerella di legno (regge un solo treno), ':' crepaccio tra due isole (solo viadotti), ' ' vuoto. */
  terrain: string[];
  fixed: PlacedPiece[];
  depots: DepotDef[];
  stations: StationDef[];
  pickups?: PickupDef[];
  crossings?: LevelCrossingDef[];
  drops?: DropDef[];
  turntables?: TurntableDef[];
  trains: TrainDef[];
  stock: Partial<Record<StockKind, number>>;
  targets: { pieces: number; ticks: number };
  tutorial?: { it: string; en: string }[];
  decorations?: Decoration[];
  /** Soluzione di riferimento da 3 stelle, usata dai test. */
  solution: PlacedPiece[];
  /** Celle dove la soluzione di riferimento mette i semafori. */
  solutionSignals?: Cell[];
}
