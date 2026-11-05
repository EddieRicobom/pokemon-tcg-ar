import type { CinemaLook } from '../core/survivor-cinema';
import { shadowFrom } from '../core/survivor-scars';

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
