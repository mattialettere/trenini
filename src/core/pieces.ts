import { Cargo, Dir, Piece, opposite } from './types';

/** Lati della cella collegati dal pezzo. */
export function sides(p: Piece): Dir[] {
  switch (p.kind) {
    case 'straight':
    case 'curve':
      return [p.a, p.b];
    case 'switch':
      return [p.a, p.b, p.c as Dir];
    case 'crossing':
      return [0, 1, 2, 3];
  }
}

export function connects(p: Piece, side: Dir): boolean {
  return sides(p).includes(side);
}

/** Lo scambio manda questa merce sull'uscita deviata? */
export function switchDiverts(p: Piece, cargo: Cargo | null): boolean {
  const r = p.route ?? 'none';
  if (r === 'none') return false;
  if (r === 'all') return true;
  return cargo === r;
}

/**
 * Lato da cui esce un treno entrato dal lato `entry`, o null se il pezzo non lo accetta.
 * Gli scambi si percorrono anche in convergenza (da b o c verso a).
 */
export function exitSide(p: Piece, entry: Dir, cargo: Cargo | null): Dir | null {
  switch (p.kind) {
    case 'straight':
    case 'curve':
      if (entry === p.a) return p.b;
      if (entry === p.b) return p.a;
      return null;
    case 'crossing':
      return opposite(entry);
    case 'switch':
      if (entry === p.a) return switchDiverts(p, cargo) ? (p.c as Dir) : p.b;
      if (entry === p.b || entry === p.c) return p.a;
      return null;
  }
}

/** Costruisce il pezzo giusto (dritto o curva) che collega due lati. */
export function pieceFor(a: Dir, b: Dir): Piece {
  return { kind: a === opposite(b) ? 'straight' : 'curve', a, b };
}

/**
 * Unisce un pezzo esistente con un nuovo collegamento a-b.
 * Restituisce uno scambio o un incrocio se la forma lo permette, altrimenti null.
 */
export function combine(old: Piece, a: Dir, b: Dir): Piece | null {
  if (old.kind !== 'straight' && old.kind !== 'curve') return null;
  const oldSet = new Set([old.a, old.b]);
  if (oldSet.has(a) && oldSet.has(b)) return null; // stesso collegamento
  // Due dritti perpendicolari: incrocio.
  if (old.kind === 'straight' && a === opposite(b)) return { kind: 'crossing', a: 0, b: 2 };
  // Serve un lato in comune: il tronco.
  const common = oldSet.has(a) ? a : oldSet.has(b) ? b : null;
  if (common === null) return null;
  const otherOld = old.a === common ? old.b : old.a;
  const otherNew = a === common ? b : a;
  const straightSide = opposite(common);
  if (otherOld === straightSide && otherNew !== straightSide) {
    return { kind: 'switch', a: common, b: straightSide, c: otherNew, route: 'none' };
  }
  if (otherNew === straightSide && otherOld !== straightSide) {
    return { kind: 'switch', a: common, b: straightSide, c: otherOld, route: 'none' };
  }
  return null; // due curve dallo stesso lato: non è un pezzo valido
}

export function samePiece(p: Piece, q: Piece): boolean {
  if (p.kind !== q.kind) return false;
  if (p.kind === 'crossing') return true;
  if (p.kind === 'switch') return p.a === q.a && p.b === q.b && p.c === q.c;
  return (p.a === q.a && p.b === q.b) || (p.a === q.b && p.b === q.a);
}
