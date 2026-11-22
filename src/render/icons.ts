import * as THREE from 'three';
import type { Cargo, SwitchRoute } from '../core/types';

/** Colore di ogni merce: lo stesso nell'interfaccia e nella scena. */
export const CARGO_COLOR: Record<Cargo, string> = {
  milk: '#4f8fd6',
  coal: '#3b3b3f',
  timber: '#a0632f',
  passengers: '#d4513a',
};

/** Disegna l'icona di una merce in un canvas 2D, centrata in (cx,cy) con raggio r. */
export function drawCargo(ctx: CanvasRenderingContext2D, cargo: Cargo, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.fillStyle = CARGO_COLOR[cargo];
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  const s = r * 0.55;
  ctx.beginPath();
  switch (cargo) {
    case 'milk': // bidone del latte
      ctx.roundRect(cx - s * 0.55, cy - s * 0.55, s * 1.1, s * 1.35, s * 0.2);
      ctx.fill();
      ctx.fillRect(cx - s * 0.35, cy - s * 0.85, s * 0.7, s * 0.35);
      break;
    case 'coal': // tre pezzi di carbone
      for (const [dx, dy] of [[-0.45, 0.3], [0.45, 0.3], [0, -0.35]]) {
        ctx.moveTo(cx + dx * s + s * 0.45, cy + dy * s);
        ctx.arc(cx + dx * s, cy + dy * s, s * 0.45, 0, Math.PI * 2);
      }
      ctx.fill();
      break;
    case 'timber': // due tronchi
      ctx.roundRect(cx - s, cy - s * 0.55, s * 2, s * 0.45, s * 0.22);
      ctx.roundRect(cx - s, cy + s * 0.1, s * 2, s * 0.45, s * 0.22);
      ctx.fill();
      break;
    case 'passengers': // una persona
      ctx.arc(cx, cy - s * 0.45, s * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.6, cy, s * 1.2, s * 0.85, [s * 0.5, s * 0.5, 0, 0]);
      ctx.fill();
      break;
  }
  ctx.restore();
}

const spriteCache = new Map<string, THREE.SpriteMaterial>();

function spriteMaterial(key: string, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  let m = spriteCache.get(key);
  if (!m) {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d')!, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    spriteCache.set(key, m);
  }
  return m;
}

export function cargoSprite(cargo: Cargo, scale = 1.6): THREE.Sprite {
  const s = new THREE.Sprite(spriteMaterial(`cargo-${cargo}`, (ctx, n) => drawCargo(ctx, cargo, n / 2, n / 2, n * 0.42)));
  s.scale.set(scale, scale, 1);
  s.renderOrder = 10;
  return s;
}

/** Disegna il cartello di uno scambio: freccia dritta, freccia deviata o icona della merce deviata. */
export function drawSwitch(ctx: CanvasRenderingContext2D, n: number, route: SwitchRoute) {
  ctx.fillStyle = '#fffaf0';
  ctx.strokeStyle = '#d9643a';
  ctx.lineWidth = n * 0.07;
  ctx.beginPath();
  ctx.arc(n / 2, n / 2, n * 0.44, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (route === 'none' || route === 'all') {
    ctx.strokeStyle = '#3b2f25';
    ctx.lineWidth = n * 0.09;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(n * 0.45, n * 0.78);
    if (route === 'none') {
      ctx.moveTo(n * 0.5, n * 0.78);
      ctx.lineTo(n * 0.5, n * 0.25);
      ctx.moveTo(n * 0.33, n * 0.4);
      ctx.lineTo(n * 0.5, n * 0.23);
      ctx.lineTo(n * 0.67, n * 0.4);
    } else {
      ctx.quadraticCurveTo(n * 0.45, n * 0.38, n * 0.76, n * 0.32);
      ctx.moveTo(n * 0.6, n * 0.2);
      ctx.lineTo(n * 0.77, n * 0.32);
      ctx.lineTo(n * 0.64, n * 0.47);
    }
    ctx.stroke();
  } else {
    drawCargo(ctx, route, n / 2, n / 2, n * 0.3);
  }
}

const switchUrls = new Map<SwitchRoute, string>();

/** Immagine del cartello di uno scambio, per i pulsanti dell'interfaccia. */
export function switchIconUrl(route: SwitchRoute): string {
  let url = switchUrls.get(route);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    drawSwitch(c.getContext('2d')!, 128, route);
    url = c.toDataURL();
    switchUrls.set(route, url);
  }
  return url;
}

export function markerSprite(color: string): THREE.Sprite {
  const s = new THREE.Sprite(
    spriteMaterial(`marker-${color}`, (ctx, n) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = n * 0.1;
      ctx.beginPath();
      ctx.arc(n / 2, n / 2, n * 0.38, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = `bold ${n * 0.5}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', n / 2, n / 2 + n * 0.02);
    }),
  );
  s.scale.set(3, 3, 1);
  s.renderOrder = 11;
  return s;
}

/** Treno vuoto: un cerchio tratteggiato, la merce arriverà al carico. */
export function emptySprite(scale = 1.6): THREE.Sprite {
  const s = new THREE.Sprite(
    spriteMaterial('cargo-empty', (ctx, n) => {
      ctx.fillStyle = 'rgba(255,250,240,0.9)';
      ctx.strokeStyle = '#8b7a62';
      ctx.lineWidth = n * 0.06;
      ctx.setLineDash([n * 0.08, n * 0.06]);
      ctx.beginPath();
      ctx.arc(n / 2, n / 2, n * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#8b7a62';
      ctx.font = `bold ${n * 0.42}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('?', n / 2, n / 2 + n * 0.02);
    }),
  );
  s.scale.set(scale, scale, 1);
  s.renderOrder = 10;
  return s;
}

/** Luce del semaforo, verde o rossa, sopra il palo. */
export function lightSprite(color: 'red' | 'green'): THREE.Sprite {
  const c = color === 'red' ? '#ff3b2f' : '#3fdc55';
  const s = new THREE.Sprite(
    spriteMaterial(`light-${color}`, (ctx, n) => {
      const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.25, c);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, n, n);
    }),
  );
  s.scale.set(1.8, 1.8, 1);
  s.renderOrder = 9;
  return s;
}

/** Cartello con gli orari del trattore: un orologio e i primi tempi in cui passa. */
export function scheduleSprite(times: number[]): THREE.Sprite {
  const text = `${times.join(' · ')} …`;
  const key = `sched-${text}`;
  const s = new THREE.Sprite(
    spriteMaterial(key, (ctx, n) => {
      const h = n * 0.36;
      const y0 = (n - h) / 2;
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = '#e0a21b';
      ctx.lineWidth = n * 0.03;
      ctx.beginPath();
      ctx.roundRect(n * 0.02, y0, n * 0.96, h, h / 2);
      ctx.fill();
      ctx.stroke();
      // orologio
      const cx = n * 0.02 + h / 2;
      const cy = n / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, h * 0.3, 0, Math.PI * 2);
      ctx.strokeStyle = '#3b2f25';
      ctx.lineWidth = n * 0.025;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.2);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + h * 0.15, cy);
      ctx.stroke();
      ctx.fillStyle = '#3b2f25';
      ctx.font = `bold ${h * 0.5}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const maxW = n * 0.96 - h * 1.05;
      const w = ctx.measureText(text).width;
      if (w > maxW) ctx.font = `bold ${(h * 0.5 * maxW) / w}px sans-serif`;
      ctx.fillText(text, n * 0.02 + h * 0.95, cy + n * 0.005);
    }),
  );
  s.scale.set(7, 7, 1);
  s.renderOrder = 10;
  return s;
}

/** Etichetta tonda con un breve testo (numeri d'ordine, capienza). */
export function textSprite(text: string, scale = 2.2, color = '#3b2f25'): THREE.Sprite {
  const s = new THREE.Sprite(
    spriteMaterial(`text-${text}-${color}`, (ctx, n) => {
      const h = n * 0.5;
      const y0 = (n - h) / 2;
      ctx.font = `bold ${h * 0.62}px sans-serif`;
      const w = Math.min(n * 0.96, Math.max(h, ctx.measureText(text).width + h * 0.6));
      ctx.fillStyle = '#fffaf0';
      ctx.strokeStyle = color;
      ctx.lineWidth = n * 0.035;
      ctx.beginPath();
      ctx.roundRect((n - w) / 2, y0, w, h, h / 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, n / 2, n / 2 + n * 0.01);
    }),
  );
  s.scale.set(scale, scale, 1);
  s.renderOrder = 10;
  return s;
}
