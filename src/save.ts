import type { Cell, PlacedPiece, StockKind } from './core/types';

const KEY = 'trainland.save.v1';

export interface LevelSave {
  stars: number;
  build?: PlacedPiece[];
  signals?: Cell[];
  /** Pezzi extra comprati per questo livello. */
  extra?: Partial<Record<StockKind, number>>;
  /** Tick in più per la stella del tempo. */
  timeBonus?: number;
}

export interface SaveData {
  version: 1;
  lang?: 'it' | 'en';
  muted?: boolean;
  /** Monete guadagnate con le stelle. */
  coins?: number;
  /** Bonus comprati nel negozio e non ancora usati. */
  bonuses?: Record<string, number>;
  levels: Record<string, LevelSave>;
}

let cache: SaveData | null = null;

export function load(): SaveData {
  if (cache) return cache;
  let data: SaveData = { version: 1, levels: {} };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1 && typeof parsed.levels === 'object') data = parsed;
    }
  } catch {
    // localStorage non disponibile (navigazione privata): si gioca senza salvare.
  }
  cache = data;
  return data;
}

export function update(fn: (s: SaveData) => void) {
  const s = load();
  fn(s);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // ignorato: vedi sopra
  }
}

export function levelSave(id: string): LevelSave {
  return load().levels[id] ?? { stars: 0 };
}
