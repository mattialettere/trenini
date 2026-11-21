import { describe, expect, it } from 'vitest';
import { Board } from '../src/core/board';
import { combine, exitSide } from '../src/core/pieces';
import { Simulation, scoreRun } from '../src/core/sim';
import { Cell, LevelDef } from '../src/core/types';
import { LEVELS } from '../src/levels';

const lvl = (id: string) => LEVELS.find((l) => l.id === id)!;

function solved(level: LevelDef) {
  const b = new Board(level);
  b.loadSolution();
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
      expect(b.signals.size).toBe(level.solutionSignals?.length ?? 0);
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

const cells = (pts: number[][]): Cell[] => pts.map(([x, y]) => ({ x, y }));
const run = (b: Board) => {
  const s = new Simulation(b);
  s.runToEnd();
  return s;
};

describe('ponti e gallerie', () => {
  it('sull\'acqua un dritto diventa un ponte, una curva non si può posare', () => {
    const b = new Board(lvl('05'));
    b.placePath(cells([[3, 1], [4, 1], [5, 1]]));
    expect(b.pieceAt(4, 1)?.kind).toBe('bridge');
    expect(b.available('bridge')).toBe(0);
    const c = new Board(lvl('05'));
    c.placePath(cells([[3, 1], [4, 1], [4, 2]]));
    expect(c.pieceAt(4, 1)?.kind).not.toBe('curve');
  });
  it('nella collina un dritto diventa una galleria', () => {
    const b = new Board(lvl('07'));
    b.placePath(cells([[1, 2], [2, 2], [3, 2], [4, 2]]));
    expect(b.pieceAt(2, 2)?.kind).toBe('tunnel');
    expect(b.pieceAt(3, 2)?.kind).toBe('tunnel');
  });
});

describe('carico merci', () => {
  it('un treno vuoto carica alla fattoria', () => {
    const s = run(solved(lvl('06')));
    expect(s.outcome).toBe('won');
    expect(s.trains[0].cargo).toBe('milk');
  });
  it('un treno vuoto che non passa dalla fattoria è rifiutato in stazione', () => {
    const level = lvl('06');
    const b = new Board({ ...level, pickups: [], fixed: [{ x: 3, y: 2, kind: 'straight', a: 3, b: 1 }] });
    b.loadSolution();
    const s = run(b);
    expect(s.failure?.reason).toBe('wrong-station');
  });
});

describe('semafori', () => {
  it('senza semaforo i due treni si scontrano allo scambio', () => {
    const b = new Board(lvl('10'));
    b.loadPieces(lvl('10').solution);
    expect(run(b).failure?.reason).toBe('collision');
  });
  it('il semaforo trattiene un treno finché il tratto è libero', () => {
    const b = solved(lvl('10'));
    const s = new Simulation(b);
    let held = 0;
    while (s.step() === 'running') if (s.trains.some((t) => t.held)) held++;
    expect(s.outcome).toBe('won');
    expect(held).toBeGreaterThan(0);
  });
  it('si mette solo su binari semplici e conta come pezzo', () => {
    const b = solved(lvl('10'));
    expect(b.canHoldSignal(3, 2)).toBe(false); // scambio
    expect(b.piecesUsed()).toBe(lvl('10').targets.pieces);
    b.toggleSignal(2, 2);
    expect(b.signals.size).toBe(0);
  });
});

describe('passaggi a livello', () => {
  it('il treno che arriva col trattore sul binario fa incidente', () => {
    const b = new Board(lvl('11'));
    b.loadPieces(lvl('11').solution);
    expect(run(b).failure?.reason).toBe('level-crossing');
  });
  it('il trattore passa agli orari del livello', () => {
    const s = new Simulation(solved(lvl('11')));
    const c = lvl('11').crossings![0];
    for (let i = 0; i < c.offset; i++) s.step();
    expect(s.snapshot().tractors[0]).toEqual({ start: c.offset, until: c.offset + c.duration - 1 });
  });
});

describe('mondi', () => {
  it('20 livelli per ogni ambientazione', async () => {
    const { WORLDS } = await import('../src/levels');
    expect(WORLDS.map((w) => [w.id, w.levels.length])).toEqual([
      ['country', 20],
      ['snow', 20],
      ['desert', 20],
    ]);
  });
});

describe('suggerimenti', () => {
  it('a forza di suggerimenti il livello si risolve, anche senza scorte', () => {
    for (const id of ['N10', 'D17', '20']) {
      const b = new Board(lvl(id));
      let n = 0;
      while (b.hint()) n++;
      expect(n).toBe(lvl(id).targets.pieces);
      expect(run(b).outcome).toBe('won');
    }
  });
  it('il bonus pezzo e il bonus tempo cambiano scorte e obiettivo', () => {
    const b = new Board(lvl('N01'));
    const before = b.available('switch');
    b.extra.switch = 1;
    expect(b.available('switch')).toBe(before + 1);
    b.timeBonus = 3;
    expect(b.targetTicks()).toBe(lvl('N01').targets.ticks + 3);
  });
});

describe('monete', () => {
  it('3 stelle 50, 2 stelle 20, 1 stella 10, e paga solo la differenza', async () => {
    const mem: Record<string, string> = {};
    (globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => (mem[k] = v) };
    const e = await import('../src/economy');
    expect(e.awardStars('x1', 1)).toBe(10);
    expect(e.awardStars('x2', 2)).toBe(20);
    expect(e.awardStars('x3', 3)).toBe(50);
    expect(e.awardStars('x1', 3)).toBe(40);
    expect(e.awardStars('x3', 3)).toBe(0);
    expect(e.coins()).toBe(120);
    expect(e.buy('hint')).toBe(true);
    expect(e.coins()).toBe(60);
    expect(e.spend('hint')).toBe(true);
    expect(e.spend('hint')).toBe(false);
  });
});
