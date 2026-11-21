import { load, update } from '../save';

export type Lang = 'it' | 'en';

const DICT = {
  it: {
    play: 'Gioca',
    levels: 'Livelli',
    credits: 'Crediti',
    back: 'Indietro',
    go: 'Via!',
    stop: 'Ferma',
    undo: 'Annulla',
    clear: 'Svuota',
    straight: 'Dritti',
    curve: 'Curve',
    switch: 'Scambi',
    crossing: 'Incroci',
    loading: 'Carico l\'isola…',
    targetPieces: 'pezzi',
    targetTime: 'tempo',
    won: 'Consegne completate!',
    retry: 'Riprova',
    next: 'Livello successivo',
    edit: 'Torna a costruire',
    piecesUsed: 'Pezzi usati',
    time: 'Tempo',
    ok: 'Ok',
    'fail.collision': 'Scontro! Due treni sono finiti sulla stessa cella.',
    'fail.derail': 'Deragliamento: il binario finisce nel vuoto.',
    'fail.wrong-station': 'Consegna sbagliata: quella stazione non vuole questa merce.',
    'fail.timeout': 'Tempo scaduto: un treno non arriva a destinazione.',
    starAll: 'Tutte le consegne',
    starPieces: 'Pezzi ≤ {n}',
    starTime: 'Tempo ≤ {n}',
    creditsIntro: 'I modelli 3D sono di Polyfork, sotto licenza CC BY 4.0. Curve e scambi sono il binario dritto piegato; i veicoli sono accorciati. Grazie!',
    tagline: 'Binari tra le isole sospese',
    locked: 'Completa il livello precedente',
    hintTap: 'Tocca uno scambio per cambiarlo. Tieni premuto per togliere un pezzo.',
    noPieces: 'Pezzi finiti',
    prototype: 'Prototipo · 3 livelli',
  },
  en: {
    play: 'Play',
    levels: 'Levels',
    credits: 'Credits',
    back: 'Back',
    go: 'Go!',
    stop: 'Stop',
    undo: 'Undo',
    clear: 'Clear',
    straight: 'Straights',
    curve: 'Curves',
    switch: 'Switches',
    crossing: 'Crossings',
    loading: 'Loading the island…',
    targetPieces: 'pieces',
    targetTime: 'time',
    won: 'All deliveries done!',
    retry: 'Retry',
    next: 'Next level',
    edit: 'Back to building',
    piecesUsed: 'Pieces used',
    time: 'Time',
    ok: 'Ok',
    'fail.collision': 'Crash! Two trains ended up on the same cell.',
    'fail.derail': 'Derailed: the track ends in thin air.',
    'fail.wrong-station': 'Wrong delivery: that station does not want this cargo.',
    'fail.timeout': 'Out of time: a train never reaches its destination.',
    starAll: 'All deliveries',
    starPieces: 'Pieces ≤ {n}',
    starTime: 'Time ≤ {n}',
    creditsIntro: '3D models by Polyfork, licensed CC BY 4.0. Curves and switches are the straight track bent; vehicles are shortened. Thank you!',
    tagline: 'Rails across floating islands',
    locked: 'Finish the previous level',
    hintTap: 'Tap a switch to change it. Press and hold to remove a piece.',
    noPieces: 'Out of pieces',
    prototype: 'Prototype · 3 levels',
  },
} as const;

export type Key = keyof (typeof DICT)['it'];

let lang: Lang = load().lang ?? (navigator.language?.toLowerCase().startsWith('it') ? 'it' : 'en');

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  update((s) => (s.lang = l));
  document.documentElement.lang = l;
}
document.documentElement.lang = lang;

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  let s: string = DICT[lang][key] ?? DICT.it[key];
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
