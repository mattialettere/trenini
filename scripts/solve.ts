// Strumento per chi crea i livelli: costruisce la soluzione di riferimento a partire dai tracciati
// in scripts/solutions.json (come se un giocatore li disegnasse col dito), la simula e
// con --write scrive soluzione e obiettivi nel JSON del livello.
// Uso: npx vite-node scripts/solve.ts [id...] [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { Board } from '../src/core/board';
import { Simulation, scoreRun } from '../src/core/sim';
import type { Cell, LevelDef, SwitchRoute } from '../src/core/types';

interface Spec {
  paths: string[];
  routes?: Record<string, SwitchRoute>;
  signals?: string[];
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const ids = args.filter((a) => !a.startsWith('--'));
const specs = JSON.parse(readFileSync('scripts/solutions.json', 'utf8')) as Record<string, Spec>;
const cell = (s: string): Cell => {
  const [x, y] = s.split(',').map(Number);
  return { x, y };
};

let bad = 0;
for (const [id, spec] of Object.entries(specs)) {
  if (ids.length && !ids.includes(id)) continue;
  const file = `src/levels/${id}.json`;
  const level = JSON.parse(readFileSync(file, 'utf8')) as LevelDef;
  const b = new Board(level);
  for (const p of spec.paths) {
    b.beginEdit();
    b.placePath(p.trim().split(/\s+/).map(cell));
    b.endEdit();
  }
  for (const [k, r] of Object.entries(spec.routes ?? {})) {
    const c = cell(k);
    const p = b.pieceAt(c.x, c.y);
    if (!p || p.kind !== 'switch') console.log(`✗ ${id}: nessuno scambio in ${k}`);
    else p.route = r;
  }
  for (const k of spec.signals ?? []) {
    const c = cell(k);
    if (!b.toggleSignal(c.x, c.y)) console.log(`✗ ${id}: semaforo impossibile in ${k}`);
  }
  const over = Object.keys(level.stock).filter((k) => b.available(k as any) < 0);
  const sim = new Simulation(b);
  sim.runToEnd();
  const r = scoreRun(b, sim);
  const used = Object.fromEntries(Object.keys(level.stock).map((k) => [k, b.used(k as any)]));
  const line = `${id} ${r.outcome} ticks=${r.ticks} pieces=${r.pieces} used=${JSON.stringify(used)} stock=${JSON.stringify(level.stock)}`;
  if (r.outcome !== 'won' || over.length) {
    bad++;
    console.log('✗', line, r.failure ? JSON.stringify(r.failure) : '', over.length ? `oltre le scorte: ${over}` : '');
    for (const t of sim.trains) console.log('   treno', t.index, t.status, 'testa', JSON.stringify(t.trail[0]), 'consegna', t.deliveredAt);
    continue;
  }
  console.log('✓', line, 'consegne', sim.trains.map((t) => t.deliveredAt).join(','));
  if (write) {
    level.solution = b.exportPieces().map(({ fixed, ...p }) => p);
    if (b.signals.size) level.solutionSignals = b.exportSignals();
    else delete level.solutionSignals;
    level.targets = { pieces: r.pieces, ticks: r.ticks };
    writeFileSync(file, JSON.stringify(level, null, 2) + '\n');
  }
}
process.exit(bad ? 1 : 0);
