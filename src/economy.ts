// Monete e bonus. Le monete si guadagnano solo giocando (mai con soldi veri) e si spendono nel negozio.
import { load, levelSave, update } from './save';

/** Monete per le stelle di un livello. */
export const COINS_FOR_STARS = [0, 10, 20, 50] as const;

export type BonusId = 'piece' | 'signal' | 'hint' | 'clock';

export interface BonusDef {
  id: BonusId;
  price: number;
}

/** Cosa si compra nel negozio, in ordine. */
export const SHOP: BonusDef[] = [
  { id: 'piece', price: 30 },
  { id: 'signal', price: 40 },
  { id: 'clock', price: 40 },
  { id: 'hint', price: 60 },
];

/** Tick in più per la stella del tempo che dà un orologio. */
export const CLOCK_TICKS = 3;

export const coins = () => load().coins ?? 0;
export const owned = (id: BonusId) => load().bonuses?.[id] ?? 0;

/**
 * Registra il risultato di un livello e paga solo le stelle nuove: rifare un livello già da 3 stelle
 * non dà altre monete, passare da 1 a 3 stelle dà la differenza (50 - 10 = 40).
 */
export function awardStars(levelId: string, stars: number): number {
  const before = levelSave(levelId).stars;
  if (stars <= before) return 0;
  const gain = COINS_FOR_STARS[stars] - COINS_FOR_STARS[before];
  update((s) => {
    s.coins = (s.coins ?? 0) + gain;
    s.levels[levelId] = { ...levelSave(levelId), stars };
  });
  return gain;
}

export function buy(id: BonusId): boolean {
  const def = SHOP.find((b) => b.id === id)!;
  if (coins() < def.price) return false;
  update((s) => {
    s.coins = (s.coins ?? 0) - def.price;
    s.bonuses = { ...(s.bonuses ?? {}), [id]: (s.bonuses?.[id] ?? 0) + 1 };
  });
  return true;
}

/** Consuma un bonus posseduto. */
export function spend(id: BonusId): boolean {
  if (owned(id) <= 0) return false;
  update((s) => {
    s.bonuses = { ...(s.bonuses ?? {}), [id]: (s.bonuses?.[id] ?? 0) - 1 };
  });
  return true;
}
