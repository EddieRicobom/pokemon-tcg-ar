import type { PokemonType } from '../core/pokemon-data';
import type { SurvivorFx, SurvivorPlayer } from '../core/survivor';
import { SURVIVOR_CONE_HALF_ANGLE, survivorAimAngle, survivorOrbiterHitRadius, survivorOrbiters, survivorOrbitRadius } from '../core/survivor-shapes';

/**
 * Arte elemental dos golpes da Torre: cada tipo tem forma própria (chama, gota, faísca, cristal, folha…) e um
 * movimento próprio (a chama sobe, a água espirra em arco, o raio cai do céu, a pedra racha o chão), em vez de
 * só trocar a cor de um círculo. Tudo é desenhado por código, sem texturas novas.
 *
 * O mesmo desenho serve à Torre (vista de cima) e ao BONK (perspectiva): quem chama passa `WorldToScreen`, que leva
 * um ponto do mundo (com altura `z`) para a tela. As posições vêm do motor (`core/survivor-shapes.ts`): o cone
 * desenhado é o cone que acerta e cada orbital desenhado é um orbital que acerta.
 *
 * `detailed` falso (efeitos leves ou Modo Rotom) corta partículas, gradientes e rastros pela metade ou mais.
 */

export interface ScreenPoint {
  x: number;
  y: number;
  /** Pixels de tela por unidade do mundo naquele ponto. */
  s: number;
}
export type WorldToScreen = (x: number, y: number, z?: number) => ScreenPoint | null;

interface Palette {
  /** Centro claro do efeito. */
  core: string;
  /** Corpo do efeito. */
  body: string;
  /** Contorno ou detalhe escuro. */
  edge: string;
}

const PALETTE: Record<PokemonType, Palette> = {
  fire: { core: '#fff3a0', body: '#ff7a2f', edge: '#c0301b' },
  water: { core: '#e8f8ff', body: '#4aa8ff', edge: '#1e5fb8' },
  electric: { core: '#ffffff', body: '#ffe23d', edge: '#e0a000' },
  rock: { core: '#e6d3a6', body: '#b89a5e', edge: '#6e5530' },
  ice: { core: '#ffffff', body: '#9fe8ff', edge: '#4fb4d8' },
  dragon: { core: '#ffd27a', body: '#8a6cff', edge: '#4b2fb8' },
  steel: { core: '#ffffff', body: '#c3ccd6', edge: '#6d7a88' },
  poison: { core: '#f0c8ff', body: '#b45cdc', edge: '#6a2590' },
  ghost: { core: '#e6dcff', body: '#7d66c2', edge: '#3d2c70' },
  psychic: { core: '#ffe2f0', body: '#ff6fae', edge: '#c23279' },
  fairy: { core: '#ffffff', body: '#ffb3e0', edge: '#e36fb5' },
  grass: { core: '#d8ffb8', body: '#5ccf5c', edge: '#2a7d32' },
  dark: { core: '#ff8a8a', body: '#4a3a54', edge: '#1a1220' },
  flying: { core: '#ffffff', body: '#cfe6ff', edge: '#7fa8d8' },
  ground: { core: '#f0cf96', body: '#c9924a', edge: '#7a5226' },
  fighting: { core: '#fff0c8', body: '#ff6a4a', edge: '#a8261c' },
  bug: { core: '#f2ff9a', body: '#a8c43a', edge: '#5d7418' },
  normal: { core: '#ffffff', body: '#f2efe6', edge: '#a8a294' },
};

/** Para onde as partículas de cada tipo vão numa explosão. */
type Motion = 'burst' | 'arc' | 'rise' | 'spiral';
const BLAST_MOTION: Record<PokemonType, Motion> = {
  fire: 'rise', water: 'arc', electric: 'burst', rock: 'arc', ground: 'arc', ice: 'burst', grass: 'spiral', bug: 'spiral',
  poison: 'rise', ghost: 'spiral', psychic: 'burst', fairy: 'burst', dragon: 'spiral', dark: 'burst', steel: 'burst',
  flying: 'spiral', fighting: 'burst', normal: 'burst',
};
/** Partículas que apontam na direção em que andam (chama, cristal, vento); as outras giram. */
const POINTED: ReadonlySet<PokemonType> = new Set(['fire', 'ice', 'dragon', 'flying', 'electric', 'water', 'ghost']);

const TAU = Math.PI * 2;
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Número estável (0–1) por efeito e índice, para as partículas não "pularem" de um quadro para o outro. */
function hash(a: number, b: number, i: number): number {
  let h = Math.imul(Math.round(a * 7) ^ Math.imul(Math.round(b * 13), 0x45d9f3b) ^ Math.imul(i + 1, 0x27d4eb2d), 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 0x1_0000_0000;
}

/** Rotação que faz o "topo" da partícula (−y) apontar para o ângulo de tela `angle`. */
const pointing = (angle: number): number => angle + Math.PI / 2;

function flamePath(ctx: CanvasRenderingContext2D, k: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -1.25 * k);
  ctx.bezierCurveTo(0.55 * k, -0.45 * k, 0.75 * k, 0.15 * k, 0.5 * k, 0.55 * k);
  ctx.arc(0, 0.45 * k, 0.5 * k, 0.2, Math.PI - 0.2);
  ctx.bezierCurveTo(-0.75 * k, 0.15 * k, -0.55 * k, -0.45 * k, 0, -1.25 * k);
  ctx.closePath();
}

function starPath(ctx: CanvasRenderingContext2D, points: number, outer: number, inner: number): void {
  ctx.beginPath();
  for (let i = 0; i <= points * 2; i++) {
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const r = i % 2 ? inner : outer;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

/** Uma partícula do elemento, centrada em (0,0) e com tamanho ~1 antes da escala. */
function drawParticle(ctx: CanvasRenderingContext2D, type: PokemonType, x: number, y: number, size: number, rotation: number, phase = 0): void {
  if (size < 0.4) return;
  const pal = PALETTE[type];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(size, size);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (type) {
    case 'fire':
    case 'dragon':
      ctx.fillStyle = type === 'dragon' ? pal.body : pal.edge;
      flamePath(ctx, 1.1); ctx.fill();
      ctx.fillStyle = type === 'dragon' ? '#c7a8ff' : pal.body;
      flamePath(ctx, 0.8); ctx.fill();
      ctx.fillStyle = pal.core;
      flamePath(ctx, 0.42); ctx.fill();
      break;
    case 'water':
      ctx.fillStyle = pal.body;
      ctx.beginPath();
      ctx.moveTo(0, -1.2);
      ctx.bezierCurveTo(0.45, -0.55, 0.75, -0.1, 0.75, 0.3);
      ctx.arc(0, 0.3, 0.75, 0, Math.PI);
      ctx.bezierCurveTo(-0.75, -0.1, -0.45, -0.55, 0, -1.2);
      ctx.fill();
      ctx.fillStyle = pal.core;
      ctx.beginPath(); ctx.ellipse(-0.25, 0.2, 0.16, 0.3, 0.4, 0, TAU); ctx.fill();
      break;
    case 'electric': {
      const j = Math.sin(phase * 7.3) * 0.25;
      ctx.beginPath();
      ctx.moveTo(0.1, -1.3); ctx.lineTo(-0.45 + j, -0.2); ctx.lineTo(0.3, -0.1); ctx.lineTo(-0.2 - j, 1.3);
      ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.55; ctx.stroke();
      ctx.strokeStyle = pal.body; ctx.lineWidth = 0.34; ctx.stroke();
      ctx.strokeStyle = pal.core; ctx.lineWidth = 0.14; ctx.stroke();
      break;
    }
    case 'ice':
      ctx.beginPath(); ctx.moveTo(0, -1.4); ctx.lineTo(0.38, -0.1); ctx.lineTo(0, 0.75); ctx.lineTo(-0.38, -0.1); ctx.closePath();
      ctx.fillStyle = pal.body; ctx.fill();
      ctx.strokeStyle = pal.core; ctx.lineWidth = 0.14; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -1.1); ctx.lineTo(0, 0.5); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.1; ctx.stroke();
      break;
    case 'rock':
    case 'ground':
      ctx.beginPath();
      ctx.moveTo(-0.8, -0.3); ctx.lineTo(-0.3, -0.85); ctx.lineTo(0.5, -0.7); ctx.lineTo(0.9, 0.05); ctx.lineTo(0.45, 0.75); ctx.lineTo(-0.5, 0.7);
      ctx.closePath();
      ctx.fillStyle = pal.body; ctx.fill();
      ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.16; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.3, -0.6); ctx.lineTo(0.35, -0.45); ctx.strokeStyle = pal.core; ctx.lineWidth = 0.14; ctx.stroke();
      break;
    case 'grass':
      ctx.beginPath(); ctx.moveTo(0, -1.3); ctx.quadraticCurveTo(0.85, -0.2, 0, 1.1); ctx.quadraticCurveTo(-0.85, -0.2, 0, -1.3);
      ctx.fillStyle = pal.body; ctx.fill();
      ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.12; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -1.05); ctx.lineTo(0, 1.1);
      ctx.moveTo(0, -0.2); ctx.lineTo(0.32, -0.5); ctx.moveTo(0, 0.25); ctx.lineTo(-0.32, -0.05);
      ctx.strokeStyle = pal.core; ctx.lineWidth = 0.1; ctx.stroke();
      break;
    case 'bug': {
      const flap = 0.75 + Math.abs(Math.sin(phase * 9)) * 0.35;
      ctx.fillStyle = 'rgba(240,255,210,.75)';
      ctx.beginPath();
      ctx.ellipse(-0.45, -0.2, 0.42 * flap, 0.7, -0.6, 0, TAU);
      ctx.ellipse(0.45, -0.2, 0.42 * flap, 0.7, 0.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = pal.body;
      ctx.beginPath(); ctx.ellipse(0, 0.15, 0.3, 0.75, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.edge;
      ctx.beginPath(); ctx.arc(0, -0.65, 0.26, 0, TAU); ctx.fill();
      ctx.fillRect(-0.3, 0.05, 0.6, 0.1); ctx.fillRect(-0.28, 0.35, 0.56, 0.1);
      break;
    }
    case 'poison':
      ctx.beginPath(); ctx.arc(0, 0, 0.85, 0, TAU);
      ctx.fillStyle = pal.body; ctx.globalAlpha *= 0.85; ctx.fill(); ctx.globalAlpha /= 0.85;
      ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.14; ctx.stroke();
      ctx.fillStyle = pal.core;
      ctx.beginPath(); ctx.arc(-0.3, -0.3, 0.22, 0, TAU); ctx.fill();
      break;
    case 'ghost': {
      const wave = Math.sin(phase * 5) * 0.15;
      ctx.beginPath();
      ctx.arc(0, -0.35, 0.65, Math.PI, 0);
      ctx.lineTo(0.65, 0.5); ctx.quadraticCurveTo(0.35, 0.9 + wave, 0.15, 0.55); ctx.quadraticCurveTo(0, 1.05 - wave, -0.15, 0.55);
      ctx.quadraticCurveTo(-0.35, 0.9 + wave, -0.65, 0.5);
      ctx.closePath();
      ctx.fillStyle = pal.body; ctx.globalAlpha *= 0.8; ctx.fill(); ctx.globalAlpha /= 0.8;
      ctx.fillStyle = pal.core;
      ctx.beginPath(); ctx.ellipse(-0.22, -0.35, 0.1, 0.17, 0, 0, TAU); ctx.ellipse(0.22, -0.35, 0.1, 0.17, 0, 0, TAU); ctx.fill();
      break;
    }
    case 'psychic':
      ctx.strokeStyle = pal.body; ctx.lineWidth = 0.24;
      ctx.beginPath(); ctx.ellipse(0, 0, 1, 0.42, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = pal.core; ctx.lineWidth = 0.12;
      ctx.beginPath(); ctx.ellipse(0, 0, 0.55, 0.22, 0, 0, TAU); ctx.stroke();
      break;
    case 'fairy':
      starPath(ctx, 4, 1.2, 0.3); ctx.fillStyle = pal.body; ctx.fill();
      starPath(ctx, 4, 0.7, 0.18); ctx.fillStyle = pal.core; ctx.fill();
      break;
    case 'dark':
      ctx.beginPath(); ctx.arc(0, 0, 1, -2.2, 2.2); ctx.arc(-0.45, 0, 0.75, 1.9, -1.9, true); ctx.closePath();
      ctx.fillStyle = pal.body; ctx.fill();
      ctx.strokeStyle = pal.core; ctx.lineWidth = 0.12; ctx.stroke();
      break;
    case 'steel':
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 1.25, Math.sin(a) * 1.25); ctx.lineTo(Math.cos(a + 0.75) * 0.45, Math.sin(a + 0.75) * 0.45);
      }
      ctx.closePath();
      ctx.fillStyle = pal.body; ctx.fill();
      ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.12; ctx.stroke();
      ctx.fillStyle = pal.edge; ctx.beginPath(); ctx.arc(0, 0, 0.2, 0, TAU); ctx.fill();
      break;
    case 'flying':
      ctx.strokeStyle = pal.body; ctx.lineWidth = 0.3;
      ctx.beginPath(); ctx.arc(0, 0.6, 1.1, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
      ctx.strokeStyle = pal.core; ctx.lineWidth = 0.14;
      ctx.beginPath(); ctx.arc(0, 0.9, 0.8, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
      break;
    case 'fighting':
      starPath(ctx, 5, 1.2, 0.5); ctx.fillStyle = pal.body; ctx.fill();
      ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.12; ctx.stroke();
      starPath(ctx, 5, 0.6, 0.25); ctx.fillStyle = pal.core; ctx.fill();
      break;
    case 'normal':
      starPath(ctx, 4, 1.15, 0.38); ctx.fillStyle = pal.body; ctx.fill();
      ctx.strokeStyle = pal.edge; ctx.lineWidth = 0.1; ctx.stroke();
      break;
  }
  ctx.restore();
}

/** Contorno de um círculo no chão, projetado ponto a ponto (fica elíptico no BONK). */
function groundRing(ctx: CanvasRenderingContext2D, map: WorldToScreen, cx: number, cy: number, r: number, z = 0, segments = 28, wobble?: (a: number) => number): boolean {
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * TAU;
    const rr = r * (wobble ? wobble(a) : 1);
    const p = map(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, z);
    if (!p) return false;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  return true;
}

/** Ângulo na tela entre dois pontos do mundo (no BONK a perspectiva muda as direções). */
function screenAngle(a: ScreenPoint, b: ScreenPoint): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function zigzag(ctx: CanvasRenderingContext2D, from: ScreenPoint, to: ScreenPoint, seed: number, steps: number, amplitude: number): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const off = (hash(seed, i, 3) - 0.5) * 2 * amplitude;
    ctx.lineTo(from.x + dx * t - (dy / len) * off, from.y + dy * t + (dx / len) * off);
  }
  ctx.lineTo(to.x, to.y);
}

function strokeBolt(ctx: CanvasRenderingContext2D, pal: Palette, width: number): void {
  ctx.strokeStyle = pal.edge; ctx.lineWidth = width * 2.2; ctx.globalAlpha *= 0.5; ctx.stroke(); ctx.globalAlpha /= 0.5;
  ctx.strokeStyle = pal.body; ctx.lineWidth = width * 1.3; ctx.stroke();
  ctx.strokeStyle = pal.core; ctx.lineWidth = width * 0.55; ctx.stroke();
}

/**
 * Disparo do elemento: cabeça com a forma do tipo e um rastro próprio (brasas, gotas, raio que treme, cauda de
 * fantasma…). `head` e `tail` já estão na tela; `tail` é o ponto de onde o disparo veio há pouco.
 */
export function drawElementProjectile(
  ctx: CanvasRenderingContext2D, type: PokemonType, head: ScreenPoint, tail: ScreenPoint,
  sizePx: number, alpha: number, timeMs: number, detailed: boolean, seed: number,
): void {
  const pal = PALETTE[type];
  const dir = screenAngle(tail, head);
  const back = dir + Math.PI;
  const size = Math.max(2, sizePx);
  ctx.save();
  ctx.globalAlpha = alpha;
  // Halo: dá volume sem `shadowBlur` (caro por disparo).
  if (detailed) {
    const halo = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, size * 2.6);
    halo.addColorStop(0, pal.body);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(head.x, head.y, size * 2.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = alpha;
  }
  const trail = detailed ? 4 : 2;
  const dx = head.x - tail.x;
  const dy = head.y - tail.y;
  if (type === 'electric') {
    zigzag(ctx, tail, head, seed + Math.floor(timeMs / 45), 5, size * 0.9);
    strokeBolt(ctx, pal, Math.max(1, size * 0.35));
  } else if (type === 'ghost' || type === 'psychic' || type === 'dragon' || type === 'poison') {
    // Cauda que ondula: fantasma, mente, dragão e veneno não deixam pontos soltos, deixam um véu.
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const wave = Math.sin(t * 6 + timeMs / 90 + seed) * size * 0.6 * t;
      const px = head.x - dx * t - Math.sin(dir) * wave;
      const py = head.y - dy * t + Math.cos(dir) * wave;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = pal.body; ctx.lineWidth = size * 1.1; ctx.globalAlpha = alpha * 0.45; ctx.stroke();
    ctx.strokeStyle = pal.core; ctx.lineWidth = size * 0.4; ctx.globalAlpha = alpha * 0.5; ctx.stroke();
    ctx.globalAlpha = alpha;
  } else {
    for (let i = trail; i >= 1; i--) {
      const t = i / (trail + 1);
      const jitter = (hash(seed, i, Math.floor(timeMs / 70)) - 0.5) * size * (type === 'fire' ? 1.4 : 0.8);
      const px = head.x - dx * t - Math.sin(dir) * jitter;
      const py = head.y - dy * t + Math.cos(dir) * jitter;
      ctx.globalAlpha = alpha * (1 - t) * 0.85;
      const rotation = type === 'fire' ? pointing(back) : POINTED.has(type) ? pointing(dir) : timeMs / 120 + i;
      drawParticle(ctx, type, px, py, size * (1 - t * 0.6), rotation, timeMs / 1000 + i);
    }
    ctx.globalAlpha = alpha;
  }
  // Cabeça: a chama e a gota apontam para trás (como um cometa), o cristal aponta para frente, pedra e aço giram.
  const headRotation = type === 'fire' || type === 'water' || type === 'dragon' ? pointing(back)
    : type === 'ice' || type === 'flying' || type === 'ghost' ? pointing(dir)
      : timeMs / (type === 'steel' ? 50 : 140) + seed;
  drawParticle(ctx, type, head.x, head.y, size * 1.6, headRotation, timeMs / 1000 + seed);
  if (type === 'electric' || type === 'normal' || type === 'fairy') {
    ctx.fillStyle = pal.core;
    ctx.beginPath(); ctx.arc(head.x, head.y, size * 0.45, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** Uma das partículas lançadas por uma explosão, já com a altura do movimento do elemento. */
function burstParticle(
  ctx: CanvasRenderingContext2D, map: WorldToScreen, type: PokemonType, cx: number, cy: number, r: number,
  t: number, i: number, n: number, seed: number, center: ScreenPoint,
): void {
  const motion = BLAST_MOTION[type];
  const h1 = hash(seed, i, 1);
  const h2 = hash(seed, i, 2);
  const baseAngle = (i / n) * TAU + h1 * 0.8;
  const speed = 0.55 + h2 * 0.6;
  let angle = baseAngle;
  let dist = r * (0.15 + 0.95 * t * speed);
  let z = 0;
  if (motion === 'arc') z = Math.sin(Math.min(1, t * 1.15) * Math.PI) * r * (0.35 + h2 * 0.5);
  else if (motion === 'rise') { z = r * t * (0.6 + h2 * 0.9); dist = r * (0.15 + 0.5 * t * speed); }
  else if (motion === 'spiral') { angle = baseAngle + t * 3.2; dist = r * (0.25 + 0.75 * t * speed); z = r * 0.25 * t; }
  const p = map(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist, z);
  if (!p) return;
  const outward = screenAngle(center, p);
  const rotation = motion === 'rise' ? 0
    : motion === 'spiral' ? pointing(outward + Math.PI / 2)
      : POINTED.has(type) ? pointing(outward) : t * 6 + h1 * 6;
  const fade = motion === 'rise' ? 1 - t * 0.8 : 1 - t;
  ctx.globalAlpha = clamp01(fade) * 0.95;
  drawParticle(ctx, type, p.x, p.y, (5 + h1 * 4) * p.s * (1 - t * 0.35), rotation, t * 4 + i);
}

/** Pulsos da aura em volta do Pokémon, com a forma e o movimento do elemento. */
function drawPulse(ctx: CanvasRenderingContext2D, fx: SurvivorFx, type: PokemonType, map: WorldToScreen, t: number, timeMs: number, detailed: boolean): void {
  const pal = PALETTE[type];
  const rr = fx.r * (0.55 + 0.45 * t);
  const center = map(fx.x, fx.y);
  if (!center) return;
  const seed = Math.round(fx.x + fx.y * 3);
  const wobble = type === 'psychic' ? (a: number) => 1 + Math.sin(a * 6 + timeMs / 120) * 0.06
    : type === 'water' ? (a: number) => 1 + Math.sin(a * 10 - timeMs / 80) * 0.025
      : undefined;
  ctx.globalAlpha = 0.6 * (1 - t);
  if (groundRing(ctx, map, fx.x, fx.y, rr, 0, 32, wobble)) {
    ctx.strokeStyle = pal.body; ctx.lineWidth = Math.max(1.5, 3 * center.s); ctx.stroke();
    if (detailed) { ctx.globalAlpha = 0.14 * (1 - t); ctx.fillStyle = pal.body; ctx.fill(); }
  }
  if (type === 'water' && groundRing(ctx, map, fx.x, fx.y, rr * 0.72, 0, 28)) {
    ctx.globalAlpha = 0.5 * (1 - t); ctx.strokeStyle = pal.core; ctx.lineWidth = Math.max(1, 1.6 * center.s); ctx.stroke();
  }
  const n = detailed ? 12 : 6;
  const spin = timeMs * 0.0012;
  const ringPoints: ScreenPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + spin + (seed % 7);
    const lift = type === 'fire' || type === 'ghost' || type === 'poison' ? fx.r * 0.3 * t : 0;
    const p = map(fx.x + Math.cos(a) * rr, fx.y + Math.sin(a) * rr, lift);
    if (!p) continue;
    ringPoints.push(p);
    if (type === 'electric') continue;
    const outward = screenAngle(center, p);
    const rotation = type === 'fire' ? 0 : POINTED.has(type) ? pointing(outward) : spin * 4 + i;
    ctx.globalAlpha = 0.9 * (1 - t);
    drawParticle(ctx, type, p.x, p.y, (type === 'fire' ? 9 : 7) * p.s * (1 - t * 0.35), rotation, timeMs / 1000 + i);
  }
  if (type === 'electric' && ringPoints.length > 1) {
    // A aura elétrica é uma coroa de arcos que estala entre os pontos do anel.
    ctx.globalAlpha = 0.95 * (1 - t);
    for (let i = 0; i < ringPoints.length; i += detailed ? 1 : 2) {
      const a = ringPoints[i]!;
      const b = ringPoints[(i + 1) % ringPoints.length]!;
      zigzag(ctx, a, b, seed + i + Math.floor(timeMs / 50), 4, 5 * center.s);
      strokeBolt(ctx, pal, Math.max(1, 1.6 * center.s));
    }
  }
  if ((type === 'rock' || type === 'ground') && detailed) {
    // Tremor: rachaduras curtas no chão a partir do anel.
    ctx.globalAlpha = 0.55 * (1 - t);
    ctx.strokeStyle = pal.edge; ctx.lineWidth = Math.max(1, 1.8 * center.s);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + hash(seed, i, 4);
      const from = map(fx.x + Math.cos(a) * rr * 0.55, fx.y + Math.sin(a) * rr * 0.55);
      const mid = map(fx.x + Math.cos(a + 0.12) * rr * 0.8, fx.y + Math.sin(a + 0.12) * rr * 0.8);
      const to = map(fx.x + Math.cos(a - 0.05) * rr * 1.05, fx.y + Math.sin(a - 0.05) * rr * 1.05);
      if (!from || !mid || !to) continue;
      ctx.moveTo(from.x, from.y); ctx.lineTo(mid.x, mid.y); ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
  }
}

/** Explosão da área: clarão no chão e partículas que seguem o movimento do elemento (com extras por tipo). */
function drawBlast(ctx: CanvasRenderingContext2D, fx: SurvivorFx, type: PokemonType, map: WorldToScreen, t: number, timeMs: number, detailed: boolean): void {
  const pal = PALETTE[type];
  const center = map(fx.x, fx.y);
  if (!center) return;
  const seed = Math.round(fx.x * 3 + fx.y);
  const grow = 0.35 + 0.65 * Math.min(1, t * 1.6);
  // Clarão curto no centro e uma marca leve no chão: quem conta o elemento são as partículas e os extras.
  ctx.globalAlpha = 0.16 * (1 - t);
  if (groundRing(ctx, map, fx.x, fx.y, fx.r * grow, 0, 28)) { ctx.fillStyle = pal.body; ctx.fill(); }
  const flash = clamp01(1 - t * 2.5);
  if (flash > 0) {
    ctx.globalAlpha = 0.75 * flash;
    if (groundRing(ctx, map, fx.x, fx.y, fx.r * (0.25 + t), 0, 20)) { ctx.fillStyle = pal.core; ctx.fill(); }
  }
  ctx.globalAlpha = 0.6 * (1 - t);
  if (groundRing(ctx, map, fx.x, fx.y, fx.r * grow, 0, 28)) { ctx.strokeStyle = pal.body; ctx.lineWidth = Math.max(1, 2.4 * center.s); ctx.stroke(); }
  if (type === 'fire' || type === 'dragon') {
    // Bola de fogo: labaredas grandes que sobem do centro.
    for (let i = 0; i < (detailed ? 5 : 3); i++) {
      const a = (i / 5) * TAU + hash(seed, i, 11);
      const p = map(fx.x + Math.cos(a) * fx.r * 0.22, fx.y + Math.sin(a) * fx.r * 0.22, fx.r * 0.5 * t);
      if (!p) continue;
      ctx.globalAlpha = 0.95 * (1 - t);
      drawParticle(ctx, type, p.x, p.y, (11 + hash(seed, i, 12) * 6) * p.s * (1 - t * 0.4), (hash(seed, i, 13) - 0.5) * 0.5, timeMs / 1000 + i);
    }
  }
  if (type === 'poison' || type === 'water') {
    // Veneno borbulha no lugar; a água deixa uma segunda onda.
    if (type === 'water') {
      ctx.globalAlpha = 0.7 * (1 - t);
      if (groundRing(ctx, map, fx.x, fx.y, fx.r * grow * 0.6, 0, 24)) { ctx.strokeStyle = pal.core; ctx.lineWidth = Math.max(1, 2 * center.s); ctx.stroke(); }
    } else {
      for (let i = 0; i < (detailed ? 6 : 3); i++) {
        const a = hash(seed, i, 14) * TAU;
        const d = hash(seed, i, 15) * fx.r * 0.6;
        const p = map(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d, fx.r * 0.2 * t);
        if (!p) continue;
        ctx.globalAlpha = 0.8 * (1 - t);
        drawParticle(ctx, type, p.x, p.y, (6 + hash(seed, i, 16) * 7) * p.s * (0.5 + t), 0, 0);
      }
    }
  }

  if (type === 'electric' && t < 0.6) {
    // O raio cai do céu no alvo.
    const sky = map(fx.x + (hash(seed, 1, 9) - 0.5) * fx.r * 0.6, fx.y, fx.r * 3.2);
    if (sky) {
      ctx.globalAlpha = 1 - t / 0.6;
      zigzag(ctx, sky, center, seed + Math.floor(timeMs / 40), 7, 9 * center.s);
      strokeBolt(ctx, pal, Math.max(1.2, 2 * center.s));
    }
  }
  if (type === 'ice' && detailed) {
    // Espinhos de gelo brotam do chão em volta do impacto.
    const height = fx.r * 0.75 * Math.min(1, t * 4) * (1 - Math.max(0, t - 0.6) / 0.4);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + hash(seed, i, 5);
      const d = fx.r * (0.35 + hash(seed, i, 6) * 0.45);
      const base = map(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d);
      const tip = map(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d, height * (0.6 + hash(seed, i, 7) * 0.6));
      if (!base || !tip) continue;
      const w = 4.5 * base.s;
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(base.x - w, base.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(base.x + w, base.y); ctx.closePath();
      ctx.fillStyle = pal.body; ctx.fill(); ctx.strokeStyle = pal.core; ctx.lineWidth = Math.max(0.8, 1.2 * base.s); ctx.stroke();
    }
  }
  if (type === 'rock' || type === 'ground') {
    ctx.globalAlpha = 0.65 * (1 - t);
    ctx.strokeStyle = pal.edge; ctx.lineWidth = Math.max(1, 2 * center.s);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + hash(seed, i, 8);
      ctx.moveTo(center.x, center.y);
      for (let k = 1; k <= 3; k++) {
        const p = map(fx.x + Math.cos(a + (hash(seed, i, k) - 0.5) * 0.5) * fx.r * k * 0.34, fx.y + Math.sin(a + (hash(seed, i, k) - 0.5) * 0.5) * fx.r * k * 0.34);
        if (p) ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }
  if (type === 'psychic') {
    for (let k = 0; k < 3; k++) {
      const tk = clamp01(t * 1.4 - k * 0.18);
      if (tk <= 0) continue;
      ctx.globalAlpha = 0.7 * (1 - tk);
      if (groundRing(ctx, map, fx.x, fx.y, fx.r * (0.3 + tk * 0.9), 0, 28, (a) => 1 + Math.sin(a * 5 + timeMs / 100) * 0.07)) {
        ctx.strokeStyle = k === 1 ? pal.core : pal.body; ctx.lineWidth = Math.max(1, 2.2 * center.s); ctx.stroke();
      }
    }
  }
  if (type === 'dark' || type === 'fighting' || type === 'normal' || type === 'steel') {
    // Golpes físicos: linhas de impacto (dark corta em X).
    const rays = type === 'dark' ? 2 : 8;
    ctx.globalAlpha = 0.9 * (1 - t);
    ctx.strokeStyle = type === 'dark' ? pal.core : pal.core;
    ctx.lineWidth = Math.max(1.2, (type === 'dark' ? 3 : 1.8) * center.s);
    ctx.beginPath();
    for (let i = 0; i < rays; i++) {
      const a = type === 'dark' ? Math.PI / 4 + i * Math.PI / 2 : (i / rays) * TAU + hash(seed, i, 2) * 0.4;
      const inner = type === 'dark' ? -fx.r * 0.8 : fx.r * (0.2 + t * 0.5);
      const outer = type === 'dark' ? fx.r * 0.8 : fx.r * (0.55 + t * 0.6);
      const a1 = map(fx.x + Math.cos(a) * inner, fx.y + Math.sin(a) * inner, 6);
      const a2 = map(fx.x + Math.cos(a) * outer, fx.y + Math.sin(a) * outer, 6);
      if (!a1 || !a2) continue;
      ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y);
    }
    ctx.stroke();
  }
  const n = detailed ? 14 : 6;
  for (let i = 0; i < n; i++) burstParticle(ctx, map, type, fx.x, fx.y, fx.r, t, i, n, seed, center);
}

/** Cone: o leque real do golpe, preenchido do Pokémon até a borda, com uma frente que avança e partículas jorrando. */
function drawCone(ctx: CanvasRenderingContext2D, fx: SurvivorFx, type: PokemonType, map: WorldToScreen, t: number, timeMs: number, detailed: boolean): void {
  const pal = PALETTE[type];
  const aim = fx.angle ?? 0;
  const spread = fx.spread ?? SURVIVOR_CONE_HALF_ANGLE;
  const apex = map(fx.x, fx.y, 6);
  if (!apex) return;
  const seed = Math.round(fx.x * 5 + fx.y * 2);
  const reach = fx.r * (0.35 + 0.65 * Math.min(1, t * 2.2));
  const segments = 14;
  const edge: ScreenPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = aim - spread + (i / segments) * spread * 2;
    const p = map(fx.x + Math.cos(a) * reach, fx.y + Math.sin(a) * reach, 6);
    if (p) edge.push(p);
  }
  if (edge.length < 2) return;
  const mid = edge[Math.floor(edge.length / 2)]!;
  ctx.beginPath();
  ctx.moveTo(apex.x, apex.y);
  for (const p of edge) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  if (detailed) {
    const gradient = ctx.createLinearGradient(apex.x, apex.y, mid.x, mid.y);
    gradient.addColorStop(0, pal.core);
    gradient.addColorStop(0.45, pal.body);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.55 * (1 - t);
  } else {
    ctx.fillStyle = pal.body;
    ctx.globalAlpha = 0.3 * (1 - t);
  }
  ctx.fill();
  // Laterais do leque: deixam claro onde o golpe começa e termina.
  ctx.globalAlpha = 0.5 * (1 - t);
  ctx.strokeStyle = pal.body;
  ctx.lineWidth = Math.max(1, 1.4 * apex.s);
  ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.lineTo(edge[0]!.x, edge[0]!.y);
  ctx.moveTo(apex.x, apex.y); ctx.lineTo(edge[edge.length - 1]!.x, edge[edge.length - 1]!.y); ctx.stroke();
  // Frente do golpe: arco grosso que corre até a borda.
  ctx.globalAlpha = 0.95 * (1 - t);
  ctx.beginPath();
  edge.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = pal.core; ctx.lineWidth = Math.max(1.5, 3.2 * apex.s); ctx.stroke();
  if (type === 'fighting' || type === 'normal') {
    // Onda de choque do soco: dois arcos atrás da frente e um clarão de impacto na ponta.
    for (let k = 1; k <= 2; k++) {
      const rk = reach * (1 - k * 0.22);
      ctx.beginPath();
      for (let i = 0; i <= segments; i++) {
        const a = aim - spread * (1 - k * 0.15) + (i / segments) * spread * 2 * (1 - k * 0.15);
        const p = map(fx.x + Math.cos(a) * rk, fx.y + Math.sin(a) * rk, 6);
        if (!p) continue;
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.globalAlpha = 0.7 * (1 - t) / k;
      ctx.strokeStyle = pal.body; ctx.lineWidth = Math.max(1.2, (3.4 - k) * apex.s); ctx.stroke();
    }
    const punch = map(fx.x + Math.cos(aim) * fx.r * 0.28, fx.y + Math.sin(aim) * fx.r * 0.28, 8);
    if (punch && t < 0.55) {
      ctx.globalAlpha = 1 - t / 0.55;
      drawParticle(ctx, type, punch.x, punch.y, (8 + t * 10) * punch.s, timeMs / 200, 0);
    }
  }
  if (type === 'electric') {
    ctx.globalAlpha = 1 - t;
    for (let i = 0; i < (detailed ? 3 : 1); i++) {
      const target = edge[Math.floor(hash(seed, i, Math.floor(timeMs / 60)) * edge.length)];
      if (!target) continue;
      zigzag(ctx, apex, target, seed + i + Math.floor(timeMs / 45), 6, 7 * apex.s);
      strokeBolt(ctx, pal, Math.max(0.9, 1.4 * apex.s));
    }
  }
  // Jato de partículas do elemento ao longo do leque.
  const n = detailed ? 18 : 7;
  for (let i = 0; i < n; i++) {
    const h1 = hash(seed, i, 1);
    const h2 = hash(seed, i, 2);
    const a = aim + (h1 * 2 - 1) * spread * 0.9;
    // Cada partícula corre do Pokémon até a borda em fase própria: o leque inteiro fica cheio, não uma fileira.
    const d = fx.r * (0.12 + 0.85 * ((h2 + t * 1.4) % 1));
    const p = map(fx.x + Math.cos(a) * d, fx.y + Math.sin(a) * d, 6 + (type === 'fire' ? fx.r * 0.12 * t : 0));
    if (!p) continue;
    const dir = screenAngle(apex, p);
    const rotation = type === 'fire' ? pointing(dir + Math.PI) : POINTED.has(type) ? pointing(dir) : t * 5 + h1 * 6;
    ctx.globalAlpha = 0.95 * (1 - t);
    drawParticle(ctx, type, p.x, p.y, (4.5 + h2 * 4) * p.s * (0.6 + d / fx.r * 0.7), rotation, timeMs / 1000 + i);
  }
}

/** Toque de um orbital (ou bloqueio de projétil): uma faísca curta do elemento. */
function drawOrbitHit(ctx: CanvasRenderingContext2D, fx: SurvivorFx, type: PokemonType, map: WorldToScreen, t: number, detailed: boolean): void {
  const pal = PALETTE[type];
  const center = map(fx.x, fx.y, 10);
  if (!center) return;
  const seed = Math.round(fx.x + fx.y * 7);
  ctx.globalAlpha = 0.8 * (1 - t);
  ctx.strokeStyle = pal.core;
  ctx.lineWidth = Math.max(1, 2 * center.s);
  ctx.beginPath(); ctx.arc(center.x, center.y, fx.r * (0.4 + t * 0.8) * center.s, 0, TAU); ctx.stroke();
  const n = detailed ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(seed, i, 1);
    const d = fx.r * (0.3 + t * 1.1) * center.s;
    ctx.globalAlpha = 1 - t;
    drawParticle(ctx, type, center.x + Math.cos(a) * d, center.y + Math.sin(a) * d, 3 * center.s * (1 - t * 0.5), pointing(a), t * 5 + i);
  }
}

/**
 * Desenha uma marca do golpe com a arte do elemento. Devolve false para as marcas que não são de golpe do jogador
 * (explosão de inimigo, cura de suporte…): quem chama mantém o desenho genérico delas.
 */
export function drawElementFx(ctx: CanvasRenderingContext2D, fx: SurvivorFx, map: WorldToScreen, timeMs: number, detailed: boolean): boolean {
  const type = fx.moveType;
  if (!type || (fx.kind !== 'pulse' && fx.kind !== 'blast' && fx.kind !== 'cone' && fx.kind !== 'orbit-hit')) return false;
  const t = clamp01(fx.ageMs / fx.lifeMs);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (fx.kind === 'pulse') drawPulse(ctx, fx, type, map, t, timeMs, detailed);
  else if (fx.kind === 'blast') drawBlast(ctx, fx, type, map, t, timeMs, detailed);
  else if (fx.kind === 'cone') drawCone(ctx, fx, type, map, t, timeMs, detailed);
  else drawOrbitHit(ctx, fx, type, map, t, detailed);
  ctx.restore();
  return true;
}

type OrbitPlayer = Pick<SurvivorPlayer, 'x' | 'y' | 'shots' | 'attackRadius' | 'orbitAngle'>;

/** Trilha do giro no chão, para ler o alcance da órbita. */
export function drawOrbitPath(ctx: CanvasRenderingContext2D, player: OrbitPlayer, type: PokemonType, map: WorldToScreen, z = 12): void {
  ctx.save();
  ctx.globalAlpha = 0.22;
  if (groundRing(ctx, map, player.x, player.y, survivorOrbitRadius(player), z * 0.4, 36)) {
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = PALETTE[type].body;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Um orbital do golpe de órbita, na posição real do motor: um rastro curto atrás dele e o próprio objeto do
 * elemento (folha girando, inseto batendo asas…).
 */
export function drawElementOrbiter(
  ctx: CanvasRenderingContext2D, player: OrbitPlayer, type: PokemonType, map: WorldToScreen, index: number, timeMs: number, detailed: boolean, z = 12,
): void {
  const orbiter = survivorOrbiters(player)[index];
  if (!orbiter) return;
  const p = map(orbiter.x, orbiter.y, z);
  if (!p) return;
  const pal = PALETTE[type];
  const radius = survivorOrbitRadius(player);
  const size = survivorOrbiterHitRadius(player) * 0.5;
  ctx.save();
  if (detailed) {
    // Rastro em arco: o giro se lê mesmo num quadro parado.
    for (let k = 3; k >= 1; k--) {
      const a = orbiter.angle - k * 0.2;
      const q = map(player.x + Math.cos(a) * radius, player.y + Math.sin(a) * radius, z);
      if (!q) continue;
      ctx.globalAlpha = 0.18 * (4 - k);
      drawParticle(ctx, type, q.x, q.y, size * q.s * (1 - k * 0.18), timeMs / 90 + index - k, timeMs / 1000);
    }
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size * 2.1 * p.s);
    halo.addColorStop(0, pal.body);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(p.x, p.y, size * 2.1 * p.s, 0, TAU); ctx.fill();
  }
  const ahead = map(player.x + Math.cos(orbiter.angle + 0.2) * radius, player.y + Math.sin(orbiter.angle + 0.2) * radius, z);
  const heading = ahead ? screenAngle(p, ahead) : orbiter.angle + Math.PI / 2;
  const rotation = type === 'bug' || POINTED.has(type) ? pointing(heading) : timeMs / 70 + index;
  ctx.globalAlpha = 1;
  drawParticle(ctx, type, p.x, p.y, size * 1.05 * p.s, rotation, timeMs / 1000 + index);
  ctx.restore();
}

/** Campo da aura sempre visível: um anel suave com marcas do elemento girando devagar. */
export function drawElementAuraField(
  ctx: CanvasRenderingContext2D, player: Pick<SurvivorPlayer, 'x' | 'y' | 'attackRadius'>, type: PokemonType, map: WorldToScreen, timeMs: number, detailed: boolean,
): void {
  const pal = PALETTE[type];
  const radius = player.attackRadius * 0.8;
  ctx.save();
  if (groundRing(ctx, map, player.x, player.y, radius, 0, 36)) {
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = pal.body;
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = pal.body;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const n = detailed ? 6 : 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + timeMs * 0.0006;
    const p = map(player.x + Math.cos(a) * radius, player.y + Math.sin(a) * radius, 4);
    if (!p) continue;
    ctx.globalAlpha = 0.55;
    drawParticle(ctx, type, p.x, p.y, 3.2 * p.s, type === 'fire' ? 0 : timeMs / 400 + i, timeMs / 1000 + i);
  }
  ctx.restore();
}

/** Mira do cone: um leque bem leve mostrando para onde o próximo golpe sai. */
export function drawConeGuide(
  ctx: CanvasRenderingContext2D, player: Pick<SurvivorPlayer, 'x' | 'y' | 'aimAngle' | 'facing'>, range: number, type: PokemonType, map: WorldToScreen, readiness: number,
): void {
  const pal = PALETTE[type];
  const aim = survivorAimAngle(player);
  const apex = map(player.x, player.y, 2);
  if (!apex) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(apex.x, apex.y);
  for (let i = 0; i <= 10; i++) {
    const a = aim - SURVIVOR_CONE_HALF_ANGLE + (i / 10) * SURVIVOR_CONE_HALF_ANGLE * 2;
    const p = map(player.x + Math.cos(a) * range, player.y + Math.sin(a) * range, 2);
    if (p) ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.globalAlpha = 0.07 + 0.08 * clamp01(readiness);
  ctx.fillStyle = pal.body;
  ctx.fill();
  ctx.globalAlpha = 0.25 + 0.2 * clamp01(readiness);
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = pal.body;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}
