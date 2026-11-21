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
