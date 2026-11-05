import type { CinemaLook, Crater } from '../core/survivor-cinema';

/**
 * Desenho da luz cinematográfica da Torre. Feito para custar pouco: sem `shadowBlur` nem filtros; o brilho é um sprite
 * pronto, as sombras e os raios saem num único traço e tudo tem limite por quadro.
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

/** Sombras na direção do sol, a mesma para todos, coladas nos pés e num traço só. */
export function drawCastShadows(c: CanvasRenderingContext2D, casters: readonly { x: number; y: number; radius: number }[], look: CinemaLook): void {
  if (casters.length === 0) return;
  c.save();
  const angle = 0.5;
  c.fillStyle = 'rgba(8, 10, 24, 0.38)';
  c.beginPath();
  for (const e of casters) {
    const reach = look.shadowLength + e.radius;
    const cx = e.x + Math.cos(angle) * reach * 0.7;
    const cy = e.y + Math.sin(angle) * reach * 0.7;
    const rx = reach;
    const ry = Math.max(3, e.radius * 0.42);
    c.moveTo(cx + Math.cos(angle) * rx, cy + Math.sin(angle) * rx);
    c.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
  }
  c.fill();
  c.restore();
}

/** Chão destruído para o resto da corrida: buraco de borda irregular, terra revirada e pedras soltas, em poucos traços. */
export function drawCraters(c: CanvasRenderingContext2D, craters: readonly Crater[], view: { x: number; y: number; w: number; h: number }): void {
  const visible = craters.filter((k) => k.x > view.x - 100 && k.x < view.x + view.w + 100 && k.y > view.y - 100 && k.y < view.y + view.h + 100);
  if (visible.length === 0) return;
  const outline = (grow: number): void => {
    c.beginPath();
    for (const { x, y, r } of visible) {
      for (let i = 0; i <= 11; i++) {
        const angle = (i % 11) * 0.5712;
        const jag = 1 + 0.22 * Math.sin((i % 11) * 2.7 + x * 0.13 + y * 0.07);
        const px = x + Math.cos(angle) * r * jag * grow;
        const py = y + Math.sin(angle) * r * 0.66 * jag * grow;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
    }
  };
  c.save();
  // Terra revirada em volta, buraco escuro e fundo ainda mais fundo.
  c.fillStyle = 'rgba(92, 66, 44, 0.75)';
  outline(1.28);
  c.fill();
  c.fillStyle = 'rgba(34, 24, 22, 0.92)';
  outline(1);
  c.fill();
  c.fillStyle = 'rgba(12, 9, 12, 0.9)';
  outline(0.55);
  c.fill();
  // Pedras soltas na borda.
  c.fillStyle = '#a89a86';
  for (const { x, y, r } of visible) {
    for (let i = 0; i < 6; i++) {
      const angle = i * 1.1 + x * 0.05;
      c.fillRect(Math.round(x + Math.cos(angle) * r * 1.2), Math.round(y + Math.sin(angle) * r * 0.8), 3, 2);
    }
  }
  c.restore();
}

/** A escuridão em volta do Pokémon: um único gradiente sobre a tela. */
export function drawDarkness(c: CanvasRenderingContext2D, look: CinemaLook, x: number, y: number, view: { x: number; y: number; w: number; h: number }, timeMs: number): void {
  const pulse = look.finale ? 0.06 * Math.sin(timeMs / 420) : 0;
  const [r, g, b] = look.tint;
  const gradient = c.createRadialGradient(x, y, look.lightRadius * 0.35, x, y, Math.max(look.lightRadius * 1.6, Math.hypot(view.w, view.h) * 0.62));
  gradient.addColorStop(0, `rgba(${r},${g},${b},0)`);
  gradient.addColorStop(1, `rgba(${r},${g},${b},${Math.min(0.9, look.dark + pulse)})`);
  c.fillStyle = gradient;
  c.fillRect(view.x, view.y, view.w, view.h);
}

/** Brilhos, raios e fagulhas, somados à imagem. */
export function drawLights(c: CanvasRenderingContext2D, look: CinemaLook, lights: readonly CinemaLight[], player: { x: number; y: number; color: string }, view: { x: number; y: number; w: number; h: number }, timeMs: number, animate: boolean): void {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const light of lights) {
    const sprite = glowSprite(light.color);
    if (!sprite) continue;
    c.globalAlpha = light.alpha;
    c.drawImage(sprite, light.x - light.r, light.y - light.r, light.r * 2, light.r * 2);
  }
  if (look.rays > 0) {
    // Raios de luz girando devagar em volta do Pokémon, todos num traço só.
    const turn = animate ? timeMs / 5200 : 0;
    const inner = 18;
    const outer = look.lightRadius * 1.5;
    c.globalAlpha = look.rayAlpha;
    c.fillStyle = player.color;
    c.beginPath();
    for (let i = 0; i < look.rays; i++) {
      const angle = turn + (i * Math.PI * 2) / look.rays;
      const width = 0.11 + 0.05 * Math.sin(i * 2.4 + timeMs / 900);
      c.moveTo(player.x + Math.cos(angle) * inner, player.y - 14 + Math.sin(angle) * inner);
      c.lineTo(player.x + Math.cos(angle - width) * outer, player.y - 14 + Math.sin(angle - width) * outer);
      c.lineTo(player.x + Math.cos(angle + width) * outer, player.y - 14 + Math.sin(angle + width) * outer);
      c.closePath();
    }
    c.fill();
  }
  if (look.embers > 0 && animate) {
    // Fagulhas: posição calculada do relógio, sem guardar nada entre quadros.
    c.globalAlpha = 0.75;
    c.fillStyle = look.finale ? '#ff7a4a' : '#ffd28a';
    for (let i = 0; i < look.embers; i++) {
      const seed = i * 127.1;
      const life = ((timeMs / (2600 + (i % 7) * 340)) + seed) % 1;
      const ex = view.x + ((seed * 13.7) % 1 + (i * 0.618) % 1) % 1 * view.w + Math.sin(timeMs / 700 + i) * 10;
      const ey = view.y + view.h * (1 - life);
      c.fillRect(ex, ey, 2, 2);
    }
  }
  c.restore();
}
