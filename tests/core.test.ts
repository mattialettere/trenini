import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { combine, exitSide } from '../src/core/pieces';
import { Simulation, scoreRun } from '../src/core/sim';
import { LevelDef } from '../src/core/types';
import { LEVELS } from '../src/levels';

const lvl = (id: string) => LEVELS.find((l) => l.id === id)!;

function solved(level: LevelDef) {
  const b = new Board(level);
  b.loadPieces(level.solution);
  return b;
}

describe('pezzi', () => {
  it('un dritto collega i lati opposti', () => {
    expect(exitSide({ kind: 'straight', a: 3, b: 1 }, 3, null)).toBe(1);
    expect(exitSide({ kind: 'straight', a: 3, b: 1 }, 0, null)).toBeNull();
  });
  it('lo scambio devia solo la merce scelta e accetta la convergenza', () => {
    const sw = { kind: 'switch' as const, a: 3 as const, b: 1 as const, c: 0 as const, route: 'milk' as const };
    expect(exitSide(sw, 3, 'milk')).toBe(0);
    expect(exitSide(sw, 3, 'coal')).toBe(1);
    expect(exitSide(sw, 0, 'coal')).toBe(3);
    expect(exitSide(sw, 1, 'milk')).toBe(3);
  });
  it('un ramo da un dritto diventa uno scambio, uno perpendicolare un incrocio', () => {
    expect(combine({ kind: 'straight', a: 3, b: 1 }, 3, 0)).toMatchObject({ kind: 'switch', a: 3, b: 1, c: 0 });
    expect(combine({ kind: 'straight', a: 3, b: 1 }, 0, 2)).toMatchObject({ kind: 'crossing' });
    expect(combine({ kind: 'curve', a: 3, b: 0 }, 3, 2)).toBeNull();
  });
});

describe('livelli', () => {
  for (const level of LEVELS) {
    it(`il livello ${level.id} con la soluzione di riferimento dà 3 stelle`, () => {
      const b = solved(level);
      expect(b.exportPieces().length).toBe(level.solution.length);
      for (const k of Object.keys(level.stock) as (keyof typeof level.stock)[]) expect(b.available(k)).toBeGreaterThanOrEqual(0);
      const sim = new Simulation(b);
      expect(sim.runToEnd()).toBe('won');
      const r = scoreRun(b, sim);
      expect(r.stars).toBe(3);
      expect(r.ticks).toBe(level.targets.ticks);
    });
    it(`il livello ${level.id} senza binari non si vince`, () => {
      const sim = new Simulation(new Board(level));
      expect(sim.runToEnd()).toBe('failed');
      expect(sim.failure?.reason).toBe('derail');
    });
  }
});

describe('simulazione', () => {
  it('è deterministica', () => {
    const run = () => {
      const s = new Simulation(solved(lvl('03')));
      const frames: string[] = [];
      while (s.step() === 'running') frames.push(JSON.stringify(s.snapshot()));
      return frames.join('|');
    };
    expect(run()).toBe(run());
  });
  it('consegna sbagliata se lo scambio manda il latte al porto', () => {
    const b = solved(lvl('03'));
    b.pieceAt(5, 1)!.route = 'coal';
    const sim = new Simulation(b);
    expect(sim.runToEnd()).toBe('failed');
    expect(sim.failure?.reason).toBe('wrong-station');
  });
  it('scontro se due treni si incontrano', () => {
    const level: LevelDef = {
      ...lvl('01'),
      depots: [
        { x: 0, y: 1, dir: 1 },
        { x: 6, y: 1, dir: 3 },
      ],
      stations: [{ id: 'x', kind: 'town', x: 6, y: 0, dir: 0, accepts: ['milk'] }],
      trains: [
        { cargo: 'milk', wagons: 0, depart: 1, depot: 0 },
        { cargo: 'milk', wagons: 0, depart: 1, depot: 1 },
      ],
    };
    const b = new Board(level);
    b.loadPieces(lvl('01').solution);
    const sim = new Simulation(b);
    expect(sim.runToEnd()).toBe('failed');
    expect(sim.failure?.reason).toBe('collision');
  });
});

describe('costruzione col dito', () => {
  it('trascinare dal binario alla stazione posa i dritti del livello 1', () => {
    const b = new Board(lvl('01'));
    b.placePath([1, 2, 3, 4, 5, 6].map((x) => ({ x, y: 1 })));
    expect(b.piecesUsed()).toBe(4);
    const sim = new Simulation(b);
    expect(sim.runToEnd()).toBe('won');
  });
  it('trascinare attorno agli alberi posa le curve del livello 2', () => {
    const b = new Board(lvl('02'));
    const path = [
      [1, 1], [2, 1], [2, 2], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3],
    ].map(([x, y]) => ({ x, y }));
    b.placePath(path);
    expect(b.used('curve')).toBe(2);
    expect(scoreRun(b, (() => { const s = new Simulation(b); s.runToEnd(); return s; })()).stars).toBe(3);
  });
  it('un ramo trascinato da una linea crea uno scambio (livello 3)', () => {
    const b = new Board(lvl('03'));
    b.placePath([[2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [6, 2], [7, 2]].map(([x, y]) => ({ x, y })));
    b.placePath([[5, 1], [5, 0], [6, 0], [7, 0]].map(([x, y]) => ({ x, y })));
    const sw = b.pieceAt(5, 1)!;
    expect(sw.kind).toBe('switch');
    b.cycleSwitch(5, 1); // all
    b.cycleSwitch(5, 1); // milk
    expect(sw.route).toBe('milk');
    const sim = new Simulation(b);
    expect(sim.runToEnd()).toBe('won');
    expect(scoreRun(b, sim).stars).toBe(3);
  });
  it('allungare un binario lo piega invece di creare uno scambio', () => {
    const b = new Board(lvl('02'));
    b.placePath([[1, 1], [2, 1], [3, 1]].map(([x, y]) => ({ x, y }))); // (3,1) è un albero
    expect(b.pieceAt(2, 1)?.kind).toBe('straight');
    b.placePath([[2, 1], [2, 2]].map(([x, y]) => ({ x, y })));
    expect(b.pieceAt(2, 1)).toMatchObject({ kind: 'curve' });
    expect(b.used('switch')).toBe(0);
  });
  it('annulla ripristina lo stato precedente', () => {
    const b = new Board(lvl('01'));
    b.beginEdit();
    b.placePath([1, 2, 3].map((x) => ({ x, y: 1 })));
    b.endEdit();
    expect(b.piecesUsed()).toBe(2);
    b.undo();
    expect(b.piecesUsed()).toBe(0);
  });
  it('non si posano più pezzi di quelli disponibili', () => {
    const b = new Board(lvl('01'));
    b.placePath([[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0]].map(([x, y]) => ({ x, y })));
    b.placePath([[1, 2], [2, 2], [3, 2]].map(([x, y]) => ({ x, y })));
    expect(b.piecesUsed()).toBe(4);
  });
});
