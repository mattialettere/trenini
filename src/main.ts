import { Board, dirBetween } from './core/board';
import { Result, SimSnapshot, Simulation, scoreRun } from './core/sim';
import { Cell, LevelDef, StockKind } from './core/types';
import { getLang, setLang, t } from './i18n';
import { LEVELS } from './levels';
import { GameScene } from './render/scene';
import { levelSave, load, update } from './save';
import credits from './assets/credits.json';
import {
  bell,
  crashBang,
  duckMusic,
  failJingle,
  isMuted,
  placeTick,
  setMuted,
  successJingle,
  switchClack,
  trainChuffs,
  unlockAudio,
  whistle,
} from './audio';
import { switchIconUrl } from './render/icons';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const scene = new GameScene(canvas);

type Mode = 'home' | 'build' | 'run' | 'result';
let mode: Mode = 'home';
let level: LevelDef = LEVELS[0];
let board = new Board(level);
let sim: Simulation | null = null;
let prevSnap: SimSnapshot | null = null;
let curSnap: SimSnapshot | null = null;
let tickTime = 0;
let speed = 1;
let endTimer = -1;
let tutorialStep = 0;
/** Strumento semaforo attivo: un tocco mette o toglie un semaforo invece di disegnare. */
let signalMode = false;
const TICKS_PER_SECOND = 3;

// --- piccoli aiuti DOM ---------------------------------------------------------

function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v !== false && v != null) el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid != null) el.append(kid);
  return el;
}

function starsHtml(n: number, total = 3) {
  return `<span class="stars">${Array.from({ length: total }, (_, i) => `<span class="${i < n ? 'on' : ''}">★</span>`).join('')}</span>`;
}

const PIECE_ICON: Record<StockKind, string> = {
  straight: '<svg viewBox="0 0 32 32"><g stroke="#7b5b3f" stroke-width="3"><path d="M9 6h14M9 12h14M9 18h14M9 24h14"/></g><g stroke="#3f4140" stroke-width="2.6"><path d="M12 3v26M20 3v26"/></g></svg>',
  curve: '<svg viewBox="0 0 32 32" fill="none"><g stroke="#3f4140" stroke-width="2.6"><path d="M12 30a18 18 0 0 1 18-18"/><path d="M20 30a10 10 0 0 1 10-10"/></g></svg>',
  switch: '<svg viewBox="0 0 32 32" fill="none"><g stroke="#3f4140" stroke-width="2.6"><path d="M12 30V2M20 30V2"/><path d="M12 30c0-9 6-14 18-16" stroke="#d9643a"/></g></svg>',
  crossing: '<svg viewBox="0 0 32 32" fill="none"><g stroke="#3f4140" stroke-width="2.6"><path d="M12 2v28M20 2v28M2 12h28M2 20h28"/></g></svg>',
  bridge: '<svg viewBox="0 0 32 32" fill="none"><path d="M0 24c4-3 6-3 10 0s6 3 10 0 6-3 12 0v8H0z" fill="#5aa6c8"/><g stroke="#8a4b2a" stroke-width="2.4"><path d="M3 14h26M3 14l5-7h16l5 7M8 7l5 7 5-7 5 7"/><path d="M6 14v12M26 14v12"/></g></svg>',
  tunnel: '<svg viewBox="0 0 32 32" fill="none"><path d="M1 30C4 12 10 4 16 4s12 8 15 26z" fill="#7d9a4f"/><path d="M9 30v-8a7 7 0 0 1 14 0v8z" fill="#3b2f25" stroke="#8b8473" stroke-width="2.4"/></svg>',
  signal: '<svg viewBox="0 0 32 32" fill="none"><path d="M16 22v9" stroke="#3f4140" stroke-width="2.6"/><rect x="10" y="2" width="12" height="21" rx="4" fill="#3f4140"/><circle cx="16" cy="8" r="3.4" fill="#e0322b"/><circle cx="16" cy="17" r="3.4" fill="#3fbf4a"/></svg>',
};

let toastTimer = 0;
function toast(msg: string, ms = 1800) {
  let el = ui.querySelector('.toast') as HTMLDivElement | null;
  if (!el) {
    el = h('div', { class: 'toast panel' });
    ui.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), ms);
}

const SOUND_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const SOUND_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';

function muteButton() {
  const b = h('button', { 'aria-label': 'audio', html: isMuted() ? SOUND_OFF : SOUND_ON });
  b.addEventListener('click', () => {
    setMuted(!isMuted());
    b.innerHTML = isMuted() ? SOUND_OFF : SOUND_ON;
  });
  return b;
}

// --- pulsanti degli scambi ---------------------------------------------------------
// Ogni scambio ha un grande cartello toccabile che segue lo scambio sullo schermo.

let switchLayer: HTMLDivElement | null = null;

function renderSwitchButtons() {
  if (!switchLayer) return;
  switchLayer.innerHTML = '';
  const teach = levelSave(level.id).stars === 0;
  for (const p of board.pieces.values()) {
    if (p.kind !== 'switch' || p.fixed) continue;
    const btn = h(
      'button',
      { class: `switch-btn${teach ? ' pulse' : ''}`, 'data-x': p.x, 'data-y': p.y, 'aria-label': t('switch') },
      h('img', { src: switchIconUrl(p.route ?? 'none'), alt: '' }),
    );
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', () => {
      if (mode !== 'build') return;
      board.beginEdit();
      board.cycleSwitch(p.x, p.y);
      board.endEdit();
      switchClack();
      afterEdit();
      const route = board.pieceAt(p.x, p.y)?.route ?? 'none';
      toast(t(`route.${route}` as any));
    });
    switchLayer.append(btn);
  }
  placeSwitchButtons();
}

function placeSwitchButtons() {
  if (!switchLayer) return;
  for (const el of switchLayer.children as HTMLCollectionOf<HTMLElement>) {
    const pos = scene.screenPos(Number(el.dataset.x), Number(el.dataset.y), 2.2);
    el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
  }
}

// --- schermate -----------------------------------------------------------------

function unlocked(i: number) {
  return i === 0 || levelSave(LEVELS[i - 1].id).stars > 0;
}

function showHome() {
  mode = 'home';
  ui.innerHTML = '';
  switchLayer = null;
  duckMusic(false);
  scene.setGridVisible(false);
  const grid = h('div', { class: 'level-grid' });
  LEVELS.forEach((l, i) => {
    const s = levelSave(l.id).stars;
    const open = unlocked(i);
    grid.append(
      h(
        'button',
        { class: 'level-btn', disabled: !open, title: open ? '' : t('locked'), onclick: () => startLevel(i) },
        h('span', { class: 'num' }, String(i + 1)),
        h('span', { class: 'name' }, l.name[getLang()]),
        h('span', { html: starsHtml(s) }),
      ),
    );
  });
  ui.append(
    h(
      'div',
      { class: 'home' },
      h('h1', {}, 'Trainland'),
      h('p', { class: 'tagline' }, t('tagline')),
      grid,
      h(
        'div',
        { class: 'home-row' },
        h('button', { onclick: () => { setLang(getLang() === 'it' ? 'en' : 'it'); showHome(); } }, getLang() === 'it' ? 'English' : 'Italiano'),
        h('button', { onclick: showCredits }, t('credits')),
        muteButton(),
      ),
      h('p', { class: 'small' }, t('prototype', { n: LEVELS.length })),
    ),
  );
}

function showCredits() {
  const list = h('ul', { class: 'credits' });
  for (const c of credits as { credit: string; id: string }[]) {
    const m = c.credit.match(/^(.*) by Polyfork \((https:[^)]+)\), CC BY 4\.0$/);
    if (m) {
      list.append(h('li', {}, h('a', { href: m[2], target: '_blank', rel: 'noopener' }, m[1]), ' by Polyfork, ', h('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener' }, 'CC BY 4.0')));
    } else list.append(h('li', {}, c.credit));
  }
  const back = h('div', { class: 'modal-back' });
  back.append(h('div', { class: 'modal panel' }, h('h2', {}, t('credits')), h('p', {}, t('creditsIntro')), list, h('button', { class: 'primary', onclick: () => back.remove() }, t('back'))));
  ui.append(back);
}

async function startLevel(i: number) {
  level = LEVELS[i];
  board = new Board(level);
  const saved = levelSave(level.id).build;
  if (saved) board.loadPieces(saved, levelSave(level.id).signals ?? []);
  signalMode = false;
  ui.innerHTML = '';
  const loading = h('div', { class: 'loading panel' }, t('loading'));
  ui.append(loading);
  await scene.load(board, (d, n) => (loading.textContent = `${t('loading')} ${Math.round((d / n) * 100)}%`));
  scene.resetTrains();
  scene.setBoard(board);
  scene.resize();
  tutorialStep = levelSave(level.id).stars > 0 ? 99 : 0;
  enterBuild();
}

function enterBuild() {
  mode = 'build';
  duckMusic(false);
  sim = null;
  prevSnap = curSnap = null;
  scene.resetTrains();
  scene.setGridVisible(true);
  renderGameUi();
}

function goalsHtml() {
  const s = levelSave(level.id).stars;
  return `${starsHtml(s)} <span>★ ${t('starPieces', { n: level.targets.pieces })}</span><span>★ ${t('starTime', { n: level.targets.ticks })}</span>`;
}

function renderGameUi() {
  ui.innerHTML = '';
  switchLayer = h('div', { class: `switch-layer${mode === 'build' ? '' : ' locked'}` });
  ui.append(switchLayer);
  const idx = LEVELS.indexOf(level);
  ui.append(
    h(
      'div',
      { class: 'topbar' },
      h('button', { onclick: () => { scene.resetTrains(); showHome(); }, 'aria-label': t('back') }, '‹'),
      h(
        'div',
        { class: 'level-info panel' },
        h('div', { class: 'title' }, `${idx + 1}. ${level.name[getLang()]}`),
        h('div', { class: 'goals', html: goalsHtml() + (mode === 'build' ? '' : ` <span class="tick-count">⏱ ${curSnap?.tick ?? 0}</span>`) }),
      ),
      muteButton(),
    ),
    h(
      'div',
      { class: 'cam' },
      h('button', { onclick: () => scene.rotate(1), 'aria-label': 'rotate left' }, '⟲'),
      h('button', { onclick: () => scene.rotate(-1), 'aria-label': 'rotate right' }, '⟳'),
      h('button', { onclick: () => scene.zoomBy(1.25), 'aria-label': 'zoom in' }, '+'),
      h('button', { onclick: () => scene.zoomBy(0.8), 'aria-label': 'zoom out' }, '−'),
    ),
  );
  const toolbar = h('div', { class: 'toolbar' });
  if (mode === 'build') {
    const stock = h('div', { class: 'stock panel' });
    for (const k of Object.keys(level.stock) as StockKind[]) {
      const n = board.available(k);
      const kids = [h('span', { html: PIECE_ICON[k] }), h('span', { class: 'count' }, String(n))];
      if (k === 'signal') {
        // Il semaforo è uno strumento: si tocca l'icona e poi i binari.
        stock.append(
          h('button', { class: `item tool${n <= 0 ? ' empty' : ''}${signalMode ? ' active' : ''}`, title: t(k), 'aria-pressed': signalMode, onclick: () => { signalMode = !signalMode; if (signalMode) toast(t('signalMode'), 3500); renderGameUi(); } }, ...kids),
        );
      } else stock.append(h('div', { class: `item${n <= 0 ? ' empty' : ''}`, title: t(k) }, ...kids));
    }
    toolbar.append(
      stock,
      h(
        'div',
        { class: 'actions' },
        h('button', { onclick: doUndo, disabled: !board.canUndo(), 'aria-label': t('undo'), title: t('undo') }, '↶'),
        h('button', { onclick: () => { board.clear(); afterEdit(); }, disabled: board.piecesUsed() === 0, title: t('clear') }, '✕'),
        h('button', { class: 'go', onclick: startRun }, t('go')),
      ),
    );
  } else if (mode === 'run') {
    toolbar.append(
      h('div', {}),
      h(
        'div',
        { class: 'actions' },
        h('button', { onclick: () => { speed = speed >= 4 ? 1 : speed * 2; renderGameUi(); } }, `×${speed}`),
        h('button', { class: 'primary', onclick: enterBuild }, t('stop')),
      ),
    );
  }
  ui.append(toolbar);
  renderSwitchButtons();
  const tut = level.tutorial;
  if (mode === 'build' && tut && tutorialStep < tut.length) {
    ui.append(
      h('div', { class: 'tutorial panel' }, h('p', {}, tut[tutorialStep][getLang()]), h('button', { class: 'primary', onclick: () => { tutorialStep++; renderGameUi(); } }, t('ok'))),
    );
  }
}

function afterEdit() {
  scene.updateTracks();
  update((s) => {
    s.levels[level.id] = { ...levelSave(level.id), build: board.exportPieces(), signals: board.exportSignals() };
  });
  renderGameUi();
}

function doUndo() {
  if (board.undo()) afterEdit();
}

function startRun() {
  if (mode !== 'build') return;
  if (level.tutorial && tutorialStep < level.tutorial.length) tutorialStep = level.tutorial.length;
  mode = 'run';
  duckMusic(true);
  scene.setGridVisible(false);
  scene.setHighlight(null);
  sim = new Simulation(board);
  prevSnap = null;
  curSnap = sim.snapshot();
  tickTime = 0;
  endTimer = -1;
  renderGameUi();
}

function showResult(r: Result) {
  mode = 'result';
  const idx = LEVELS.indexOf(level);
  const back = h('div', { class: 'modal-back' });
  const modal = h('div', { class: 'modal panel' });
  if (r.outcome === 'won') successJingle(r.stars);
  else failJingle();
  if (r.outcome === 'won') {
    const best = Math.max(r.stars, levelSave(level.id).stars);
    update((s) => {
      s.levels[level.id] = { ...levelSave(level.id), stars: best };
    });
    const li = (ok: boolean, text: string) => h('li', { html: `${ok ? '<span class="stars"><span class="on">★</span></span>' : '<span class="stars">★</span>'} ${text}` });
    modal.append(
      h('h2', {}, t('won')),
      h('div', { class: 'big-stars', html: starsHtml(r.stars) }),
      h(
        'ul',
        {},
        li(true, t('starAll')),
        li(r.starPieces, `${t('starPieces', { n: level.targets.pieces })} · ${t('piecesUsed')}: ${r.pieces}`),
        li(r.starTime, `${t('starTime', { n: level.targets.ticks })} · ${t('time')}: ${r.ticks}`),
      ),
    );
    const buttons = h('div', { class: 'buttons' });
    if (idx + 1 < LEVELS.length) buttons.append(h('button', { class: 'primary', onclick: () => startLevel(idx + 1) }, t('next')));
    buttons.append(h('button', { onclick: () => { back.remove(); enterBuild(); } }, t('retry')), h('button', { onclick: () => { scene.resetTrains(); showHome(); } }, t('levels')));
    modal.append(buttons);
  } else {
    const reason = r.failure?.reason ?? 'derail';
    modal.append(h('h2', {}, '!'), h('p', {}, t(`fail.${reason}` as any)), h('div', { class: 'buttons' }, h('button', { class: 'primary', onclick: () => { back.remove(); enterBuild(); } }, t('edit'))));
  }
  back.append(modal);
  ui.append(back);
}

// --- input: dito, mouse, tastiera ---------------------------------------------------

interface Pointer {
  x: number;
  y: number;
}
const pointers = new Map<number, Pointer>();
let drawPath: Cell[] | null = null;
let drawStart: { x: number; y: number; time: number; cell: Cell | null } | null = null;
let gestureChanged = false;
let longPressTimer = 0;
let pinchDist = 0;
let panMode = false;

function extendPath(cell: Cell) {
  if (!drawPath) return;
  const last = drawPath[drawPath.length - 1];
  if (last.x === cell.x && last.y === cell.y) return;
  // Riempie i salti (dito veloce) muovendosi una cella alla volta.
  let cur = { ...last };
  let guard = 0;
  while ((cur.x !== cell.x || cur.y !== cell.y) && guard++ < 50) {
    const dx = cell.x - cur.x;
    const dy = cell.y - cur.y;
    if (Math.abs(dx) >= Math.abs(dy)) cur = { x: cur.x + Math.sign(dx), y: cur.y };
    else cur = { x: cur.x, y: cur.y + Math.sign(dy) };
    // Tornare indietro sulla cella precedente accorcia il tracciato.
    const prev = drawPath[drawPath.length - 2];
    if (prev && prev.x === cur.x && prev.y === cur.y) drawPath.pop();
    else drawPath.push({ ...cur });
  }
  const before = board.piecesUsed() + JSON.stringify(board.exportPieces());
  board.placePath(drawPath);
  const after = board.piecesUsed() + JSON.stringify(board.exportPieces());
  if (before !== after) {
    gestureChanged = true;
    placeTick();
    scene.updateTracks();
    renderStockOnly();
    renderSwitchButtons();
  } else if (drawPath.length > 1 && (Object.keys(level.stock) as StockKind[]).every((k) => board.available(k) <= 0)) {
    toast(t('noPieces'));
  }
}

function renderStockOnly() {
  const stock = ui.querySelector('.stock');
  if (!stock) return;
  const items = stock.querySelectorAll('.item');
  (Object.keys(level.stock) as StockKind[]).forEach((k, i) => {
    const n = board.available(k);
    items[i]?.classList.toggle('empty', n <= 0);
    const c = items[i]?.querySelector('.count');
    if (c) c.textContent = String(n);
  });
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    // Secondo dito: il gesto diventa zoom/spostamento; annulla il tracciato appena iniziato.
    if (drawPath && gestureChanged) {
      board.undo();
      scene.updateTracks();
      renderStockOnly();
    } else if (drawPath) board.endEdit();
    drawPath = null;
    drawStart = null;
    clearTimeout(longPressTimer);
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    return;
  }
  panMode = e.button === 1 || e.button === 2 || mode !== 'build';
  if (panMode) return;
  const cell = scene.pick(e.clientX, e.clientY);
  drawStart = { x: e.clientX, y: e.clientY, time: performance.now(), cell };
  gestureChanged = false;
  if (cell && board.inside(cell.x, cell.y)) {
    board.beginEdit();
    drawPath = [cell];
    scene.setHighlight(cell, true);
    longPressTimer = window.setTimeout(() => {
      if (drawPath && drawPath.length === 1 && board.remove(cell.x, cell.y)) {
        gestureChanged = true;
        navigator.vibrate?.(15);
        afterEdit();
        board.endEdit();
        drawPath = null;
      }
    }, 550);
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (mode === 'build' && e.pointerType === 'mouse') {
      const c = scene.pick(e.clientX, e.clientY);
      scene.setHighlight(c && board.buildable(c.x, c.y) ? c : null);
    }
    return;
  }
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  if (pointers.size === 2) {
    const before = [...pointers.values()];
    const cx0 = (before[0].x + before[1].x) / 2;
    const cy0 = (before[0].y + before[1].y) / 2;
    p.x = e.clientX;
    p.y = e.clientY;
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) scene.zoomBy(d / pinchDist);
    pinchDist = d;
    scene.pan((a.x + b.x) / 2 - cx0, (a.y + b.y) / 2 - cy0);
    return;
  }
  p.x = e.clientX;
  p.y = e.clientY;
  if (panMode) {
    scene.pan(dx, dy);
    return;
  }
  if (drawPath && drawStart && !signalMode) {
    if (Math.hypot(e.clientX - drawStart.x, e.clientY - drawStart.y) > 8) clearTimeout(longPressTimer);
    const c = scene.pick(e.clientX, e.clientY);
    if (c && board.inside(c.x, c.y) || (c && board.stationAt(c.x, c.y))) {
      extendPath(c);
      scene.setHighlight(c, board.buildable(c.x, c.y) || !!board.stationAt(c.x, c.y));
    }
  }
});

function endPointer(e: PointerEvent) {
  pointers.delete(e.pointerId);
  clearTimeout(longPressTimer);
  if (pointers.size > 0) return;
  pinchDist = 0;
  if (drawPath && drawStart) {
    const moved = Math.hypot(e.clientX - drawStart.x, e.clientY - drawStart.y);
    if (drawPath.length === 1 && moved < 10 && performance.now() - drawStart.time < 500) {
      const c = drawPath[0];
      const p = board.pieceAt(c.x, c.y);
      if (signalMode) {
        if (board.toggleSignal(c.x, c.y)) {
          gestureChanged = true;
          switchClack();
        } else if (board.available('signal') <= 0) toast(t('noPieces'));
        else toast(t('signalNo'));
      } else if (p?.kind === 'switch' && board.cycleSwitch(c.x, c.y)) {
        gestureChanged = true;
        switchClack();
      }
      else if (!p) toast(t('hintTap'));
    }
    board.endEdit();
    if (gestureChanged) afterEdit();
  }
  drawPath = null;
  drawStart = null;
  if (e.pointerType !== 'mouse') scene.setHighlight(null);
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    scene.zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
  },
  { passive: false },
);

window.addEventListener('keydown', (e) => {
  if (mode === 'home') return;
  if (e.key === 'q' || e.key === 'Q') scene.rotate(1);
  else if (e.key === 'e' || e.key === 'E') scene.rotate(-1);
  else if (e.key === '+' || e.key === '=') scene.zoomBy(1.2);
  else if (e.key === '-') scene.zoomBy(0.83);
  else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (mode === 'build') startRun();
    else if (mode === 'run') enterBuild();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && mode === 'build') doUndo();
  else if (e.key === 'Escape' && mode === 'run') enterBuild();
});

window.addEventListener('resize', () => scene.resize());

// Evita che il dito rimbalzi la pagina su iOS.
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// --- ciclo principale --------------------------------------------------------------

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode === 'run' || mode === 'result') {
    if (sim && curSnap) {
      if (sim.outcome === 'running') {
        tickTime += dt * TICKS_PER_SECOND * speed;
        while (tickTime >= 1 && sim.outcome === 'running') {
          tickTime -= 1;
          prevSnap = curSnap;
          const before = sim.trains.map((tr) => tr.status);
          sim.step();
          curSnap = sim.snapshot();
          const tc = ui.querySelector('.tick-count');
          if (tc) tc.textContent = `⏱ ${curSnap.tick}`;
          sim.trains.forEach((tr, i) => {
            if (before[i] === 'waiting' && tr.status === 'running') whistle();
            if (before[i] === 'running' && (tr.status === 'arriving' || tr.status === 'done')) bell();
          });
          const moving = sim.trains.filter((tr) => tr.status === 'running' || tr.status === 'arriving').length;
          trainChuffs(moving, 1 / (TICKS_PER_SECOND * speed));
        }
        if (sim.outcome !== 'running') {
          endTimer = 0;
          if (sim.failure) {
            scene.showFailure(sim.failure.x, sim.failure.y);
            if (sim.failure.reason === 'collision' || sim.failure.reason === 'derail') crashBang();
          }
        }
      } else if (endTimer >= 0) {
        tickTime = Math.min(1, tickTime + dt * TICKS_PER_SECOND * speed);
        endTimer += dt;
        if (endTimer > 0.9 && mode === 'run') {
          endTimer = -1;
          showResult(scoreRun(board, sim));
        }
      }
      // In caso di scontro i treni restano fermi dove sono.
      const alpha = sim.outcome === 'failed' ? 0.5 : Math.min(1, tickTime);
      scene.drawTrains(prevSnap, curSnap, alpha);
      scene.drawSignals(curSnap);
      scene.drawTractors(curSnap, curSnap.tick - 1 + alpha);
    }
  }
  scene.render(dt);
  placeSwitchButtons();
  requestAnimationFrame(frame);
}

// Avvio: mostra l'isola del primo livello dietro il menu.
(async () => {
  load();
  await scene.load(board);
  scene.setBoard(board);
  scene.resize();
  showHome();
  requestAnimationFrame(frame);
  // Utile per i test automatici e per il debug da console.
  (window as any).trainland = { board: () => board, sim: () => sim, startLevel, startRun, scene, dirBetween };
})();
