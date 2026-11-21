import type { PlacedPiece } from './core/types';

const KEY = 'trainland.save.v1';

export interface LevelSave {
  stars: number;
  build?: PlacedPiece[];
}

export interface SaveData {
  version: 1;
  lang?: 'it' | 'en';
  muted?: boolean;
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
