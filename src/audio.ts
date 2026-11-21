// Musica ed effetti sonori sintetizzati con Web Audio: nessun file audio, tutto originale.
import { load, update } from './save';

let ctx: AudioContext | null = null;
let master: GainNode;
let musicBus: GainNode;
let sfxBus: GainNode;
let noise: AudioBuffer;
let muted = load().muted ?? false;

const MUSIC_VOLUME = 0.22;

/** Da chiamare dentro un gesto dell'utente: i browser avviano l'audio solo così. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC() as AudioContext;
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = MUSIC_VOLUME;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export const isMuted = () => muted;

export function setMuted(m: boolean) {
  muted = m;
  update((s) => (s.muted = m));
  if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.9, ctx.currentTime, 0.05);
}

/** Abbassa la musica mentre corrono i treni, così si sentono gli sbuffi. */
export function duckMusic(on: boolean) {
  if (ctx) musicBus.gain.setTargetAtTime(on ? MUSIC_VOLUME * 0.45 : MUSIC_VOLUME, ctx.currentTime, 0.3);
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function tone(midi: number, at: number, dur: number, type: OscillatorType, vol: number, bus: AudioNode) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = hz(midi);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus);
  o.start(at);
  o.stop(at + dur + 0.05);
}

// --- musica di sottofondo ---------------------------------------------------------
// Un motivetto in Fa maggiore, 8 battute che si ripetono, con basso e "spazzola" leggera.

const BPM = 100;
const EIGHTH = 60 / BPM / 2;
// Note della melodia in MIDI, una per ottavo; 0 = pausa.
const MELODY = [
  72, 0, 69, 72, 74, 0, 72, 0, 70, 69, 67, 0, 65, 0, 67, 69,
  70, 0, 74, 72, 70, 0, 69, 0, 67, 0, 69, 70, 72, 0, 0, 0,
  72, 0, 69, 72, 77, 0, 76, 74, 72, 0, 70, 69, 67, 0, 69, 0,
  70, 69, 67, 65, 64, 0, 67, 0, 65, 0, 0, 0, 0, 0, 0, 0,
];
// Basso: una nota per battuta (8 ottavi), su tempi 1 e 3.
const BASS = [53, 46, 48, 53, 53, 46, 48, 53];

let step = 0;
let nextTime = 0;
let musicTimer = 0;

function startMusic() {
  if (!ctx || musicTimer) return;
  nextTime = ctx.currentTime + 0.1;
  const schedule = () => {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.3) {
      const n = MELODY[step % MELODY.length];
      if (n) tone(n, nextTime, EIGHTH * 1.6, 'triangle', 0.32, musicBus);
      const bar = Math.floor(step / 8) % BASS.length;
      const inBar = step % 8;
      if (inBar === 0 || inBar === 4) tone(BASS[bar] - (inBar === 4 ? 0 : 12) + 12, nextTime, EIGHTH * 3, 'sine', 0.42, musicBus);
      if (inBar === 2 || inBar === 6) {
        // Accordo leggero sul levare: terza e quinta del basso.
        tone(BASS[bar] + 16, nextTime, EIGHTH * 1.2, 'sine', 0.1, musicBus);
        tone(BASS[bar] + 19, nextTime, EIGHTH * 1.2, 'sine', 0.1, musicBus);
      }
      brush(nextTime, inBar % 2 === 0 ? 0.05 : 0.025);
      nextTime += EIGHTH;
      step++;
    }
  };
  schedule();
  musicTimer = window.setInterval(schedule, 100);
}

function brush(at: number, vol: number) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  src.connect(f).connect(g).connect(musicBus);
  src.start(at, Math.random() * 0.5, 0.08);
}

// --- effetti --------------------------------------------------------------------

/** Uno sbuffo della locomotiva a vapore. */
function chuff(at: number, vol: number) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 700 + Math.random() * 250;
  f.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(at, Math.random() * 0.5, 0.2);
}

/**
 * Sbuffi per la durata di un tick: 4 per cella, più forti se corrono più treni.
 * `seconds` è la durata reale del tick (dipende dalla velocità ×1, ×2, ×4).
 */
export function trainChuffs(running: number, seconds: number) {
  if (!ctx || running <= 0) return;
  const vol = Math.min(0.5, 0.22 + running * 0.1);
  const n = seconds < 0.15 ? 2 : 4;
  for (let i = 0; i < n; i++) chuff(ctx.currentTime + (i * seconds) / n, i % 2 === 0 ? vol : vol * 0.6);
}

/** Fischio a due note quando un treno parte. */
export function whistle() {
  if (!ctx) return;
  const at = ctx.currentTime;
  for (const [f, v] of [[880, 0.12], [1046, 0.09], [1318, 0.05]] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 6;
    lg.gain.value = 6;
    lfo.connect(lg).connect(o.frequency);
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(v, at + 0.05);
    g.gain.setValueAtTime(v, at + 0.45);
    g.gain.linearRampToValueAtTime(0, at + 0.6);
    o.connect(g).connect(sfxBus);
    o.start(at);
    lfo.start(at);
    o.stop(at + 0.65);
    lfo.stop(at + 0.65);
  }
}

/** Campanella quando un treno consegna. */
export function bell() {
  if (!ctx) return;
  const at = ctx.currentTime;
  tone(88, at, 0.6, 'sine', 0.18, sfxBus);
  tone(95, at, 0.4, 'sine', 0.06, sfxBus);
}

/** Clac meccanico dello scambio. */
export function switchClack() {
  if (!ctx) return;
  const at = ctx.currentTime;
  tone(55, at, 0.08, 'square', 0.12, sfxBus);
  tone(67, at + 0.05, 0.08, 'square', 0.08, sfxBus);
}

/** Piccolo "tic" quando si posa un binario. */
export function placeTick() {
  if (!ctx) return;
  tone(79 + Math.floor(Math.random() * 3), ctx.currentTime, 0.06, 'triangle', 0.12, sfxBus);
}

export function successJingle(stars: number) {
  if (!ctx) return;
  const at = ctx.currentTime + 0.05;
  const notes = [65, 69, 72, 77];
  notes.forEach((n, i) => tone(n, at + i * 0.13, 0.35, 'triangle', 0.3, sfxBus));
  const end = at + notes.length * 0.13;
  for (const n of [77, 81, 84]) tone(n, end, 1.1, 'triangle', 0.18, sfxBus);
  // Un "ding" per ogni stella.
  for (let i = 0; i < stars; i++) tone(96, end + 0.35 + i * 0.22, 0.4, 'sine', 0.15, sfxBus);
}

export function failJingle() {
  if (!ctx) return;
  const at = ctx.currentTime + 0.05;
  [67, 66, 65].forEach((n, i) => tone(n, at + i * 0.28, 0.3, 'square', 0.1, sfxBus));
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(hz(64), at + 0.84);
  o.frequency.linearRampToValueAtTime(hz(58), at + 1.6);
  g.gain.setValueAtTime(0.1, at + 0.84);
  g.gain.linearRampToValueAtTime(0, at + 1.7);
  o.connect(g).connect(sfxBus);
  o.start(at + 0.84);
  o.stop(at + 1.75);
}

export function crashBang() {
  if (!ctx) return;
  const at = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
  src.connect(f).connect(g).connect(sfxBus);
  src.start(at, 0, 0.6);
}
