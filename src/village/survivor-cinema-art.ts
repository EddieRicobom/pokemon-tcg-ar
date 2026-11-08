import type { CinemaBanner, CinemaLook } from '../core/survivor-cinema';
import { shadowFrom } from '../core/survivor-impacts';

/**
 * Desenho da luz cinematográfica da Torre. Feito para custar pouco: sem `shadowBlur` nem filtros; o brilho é um sprite
 * pronto, as sombras saem num único traço, a noite é uma máscara pequena e tudo tem limite por quadro.
 */

const GLOW_SIZE = 64;
const glowSprites = new Map<string, HTMLCanvasElement>();

/** Brilho redondo pré-desenhado: pintar uma vez e só copiar é bem mais barato que um gradiente por quadro. */
function glowSprite(color: string): HTMLCanvasElement | null {
  const known = glowSprites.get(color);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = GLOW_SIZE;
  canvas.height = GLOW_SIZE;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const middle = GLOW_SIZE / 2;
  const gradient = c.createRadialGradient(middle, middle, 0, middle, middle, middle);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.18, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gradient;
  c.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  if (glowSprites.size >= 32) glowSprites.clear();
  glowSprites.set(color, canvas);
  return canvas;
}

export interface CinemaLight {
  x: number;
  y: number;
  r: number;
  color: string;
  alpha: number;
}

/** Sombras só de quem está perto de um clarão, apontando para longe dele, num traço só. */
export function drawCastShadows(c: CanvasRenderingContext2D, casters: readonly { x: number; y: number; radius: number }[], lights: readonly CinemaLight[], look: CinemaLook): void {
  if (casters.length === 0 || lights.length === 0) return;
  c.save();
  c.fillStyle = 'rgba(8, 8, 20, 0.42)';
  c.beginPath();
  for (const e of casters) {
    const cast = shadowFrom(e.x, e.y, e.radius, lights, look.shadowLength);
    if (!cast) continue;
    const cx = e.x + Math.cos(cast.angle) * cast.reach * 0.7;
    const cy = e.y + Math.sin(cast.angle) * cast.reach * 0.55;
    const ry = Math.max(3, e.radius * 0.42);
    c.moveTo(cx + Math.cos(cast.angle) * cast.reach, cy + Math.sin(cast.angle) * cast.reach);
    c.ellipse(cx, cy, cast.reach, ry, cast.angle, 0, Math.PI * 2);
  }
  c.fill();
  c.restore();
}

const MASK_SIZE = 192;
let mask: { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } | null = null;

function nightMask(): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D } | null {
  if (mask) return mask;
  const canvas = document.createElement('canvas');
  canvas.width = MASK_SIZE;
  canvas.height = MASK_SIZE;
  const c = canvas.getContext('2d');
  if (c) mask = { canvas, c };
  return mask;
}

/** A noite cobre a tela por igual, e cada luz abre um buraco nela: é o golpe que clareia o mapa, não o Pokémon. */
export function drawNight(c: CanvasRenderingContext2D, look: CinemaLook, lights: readonly CinemaLight[], view: { x: number; y: number; w: number; h: number }, timeMs: number): void {
  const night = nightMask();
  const hole = glowSprite('#ffffff');
  if (!night || !hole) return;
  const pulse = look.finale ? 0.05 * Math.sin(timeMs / 420) : 0;
  const [r, g, b] = look.tint;
  const m = night.c;
  m.globalCompositeOperation = 'source-over';
  m.globalAlpha = 1;
  m.clearRect(0, 0, MASK_SIZE, MASK_SIZE);
  m.fillStyle = `rgba(${r},${g},${b},${Math.min(0.85, look.dark + pulse)})`;
  m.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
  m.globalCompositeOperation = 'destination-out';
  const sx = MASK_SIZE / view.w;
  const sy = MASK_SIZE / view.h;
  for (const light of lights) {
    const rw = light.r * 2 * sx;
    const rh = light.r * 2 * sy;
    m.globalAlpha = Math.min(1, light.alpha * 1.5);
    m.drawImage(hole, (light.x - view.x) * sx - rw / 2, (light.y - view.y) * sy - rh / 2, rw, rh);
  }
  c.save();
  c.imageSmoothingEnabled = true;
  c.drawImage(night.canvas, view.x, view.y, view.w, view.h);
  c.restore();
}

/** Linhas de velocidade convergindo para o centro: um único caminho, sem gradiente nem sombra. */
export function drawSpeedLines(c: CanvasRenderingContext2D, w: number, h: number, strength: number, color: string, timeMs: number, count: number): void {
  if (strength <= 0) return;
  const cx = w / 2;
  const cy = h / 2;
  const outer = Math.hypot(w, h) * 0.56;
  const tick = Math.floor(timeMs / 40);
  c.save();
  c.strokeStyle = color;
  c.globalAlpha = Math.min(0.5, 0.5 * strength);
  c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i < count; i++) {
    // Sorteio barato e estável por quadro curto: só desenho, não toca no RNG do jogo.
    const noise = Math.abs(Math.sin((i + 1) * 12.9898 + tick * 3.233) * 43758.5453) % 1;
    const a = (i / count) * Math.PI * 2 + noise * 0.3;
    const inner = outer * (0.42 + noise * 0.26);
    c.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    c.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
  }
  c.stroke();
  c.restore();
}

export function drawScreenFlash(c: CanvasRenderingContext2D, w: number, h: number, alpha: number, color: string): void {
  if (alpha <= 0) return;
  c.save();
  c.globalAlpha = Math.min(0.8, alpha);
  c.fillStyle = color;
  c.fillRect(0, 0, w, h);
  c.restore();
}

/** Letreiro inclinado que cruza a tela. Sem `motion`, aparece parado (movimento reduzido). */
export function drawCinemaBanner(c: CanvasRenderingContext2D, w: number, h: number, banner: CinemaBanner, motion: boolean, portrait: ((x: number, y: number, scale: number) => void) | null): void {
  const t = 1 - banner.leftMs / banner.totalMs;
  const enter = motion ? Math.min(1, t / 0.16) : 1;
  const leave = Math.min(1, (1 - t) / 0.16);
  const slide = (1 - enter * enter) * w;
  const bandH = Math.min(92, h * 0.15);
  const y = h * 0.3;
  const skew = bandH * 0.3;
  c.save();
  c.globalAlpha = Math.max(0, leave);
  c.translate(slide, 0);
  c.fillStyle = 'rgba(8, 10, 20, 0.86)';
  c.beginPath();
  c.moveTo(-skew, y + bandH);
  c.lineTo(skew, y);
  c.lineTo(w + skew, y);
  c.lineTo(w - skew, y + bandH);
  c.closePath();
  c.fill();
  c.fillStyle = banner.color;
  c.fillRect(0, y - 3, w, 3);
  c.fillRect(0, y + bandH, w, 3);
  const textLeft = portrait ? Math.min(w * 0.3, 118) : w * 0.08;
  const room = w - textLeft - w * 0.05;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = banner.color;
  c.font = `800 ${Math.max(10, bandH * 0.17)}px system-ui, sans-serif`;
  c.fillText(banner.kicker, textLeft, y + bandH * 0.26, room);
  c.fillStyle = '#ffffff';
  let size = Math.min(34, bandH * 0.44);
  c.font = `900 ${size}px system-ui, sans-serif`;
  const width = c.measureText(banner.title).width;
  if (width > room) {
    size *= room / width;
    c.font = `900 ${size}px system-ui, sans-serif`;
  }
  c.fillText(banner.title, textLeft, y + bandH * 0.64);
  c.restore();
  if (portrait) {
    c.save();
    c.globalAlpha = Math.max(0, leave);
    portrait(w * 0.14 + slide * 1.2, y + bandH * 0.98, 1.9);
    c.restore();
  }
}

/** O brilho colorido das luzes, somado à imagem. */
export function drawLights(c: CanvasRenderingContext2D, lights: readonly CinemaLight[]): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const light of lights) {
    const sprite = glowSprite(light.color);
    if (!sprite) continue;
    c.globalAlpha = Math.min(0.55, light.alpha * 0.55);
    c.drawImage(sprite, light.x - light.r, light.y - light.r, light.r * 2, light.r * 2);
  }
  c.restore();
}
