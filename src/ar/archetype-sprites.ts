import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';
import { fxHash } from '../core/archetype-fx';
import type { FxPalette, FxRecipe, FxShape } from '../core/archetype-fx';

/**
 * Folhas de quadros das animações dos arquétipos, pré-renderizadas no aparelho com Canvas 2D no estilo cel-shading:
 * contorno escuro grosso, cor base, uma faixa de sombra dura embaixo à direita e um brilho chapado em cima à esquerda.
 * Cada quadro é pequeno (32 px) e o alfa é binarizado, para a textura ampliada com `NearestFilter` parecer sprite de
 * jogo 2D. As folhas ficam em cache por desenho e paleta (a textura é criada por quem usa e liberada com ele).
 */

export const FX_FRAME_PX = 32;
export const FX_FRAMES = 6;
const RUNE_PX = 96;
const BADGE_PX_HEIGHT = 28;

type Ctx = CanvasRenderingContext2D;
/** Pinta um quadro centrado na origem. `f`: fase do quadro (0..1); `R`: raio útil do desenho em pixels. */
type Painter = (ctx: Ctx, f: number, pal: FxPalette, R: number) => void;

const TAU = Math.PI * 2;

/** Preenchimento em cel-shading: sombra inteira, base deslocada para cima/esquerda (sobra a borda de sombra) e contorno. */
function cel(ctx: Ctx, path: Path2D, pal: FxPalette, R: number, rule: CanvasFillRule = 'nonzero'): void {
  const [outline, shadow, base] = pal;
  ctx.fillStyle = shadow;
  ctx.fill(path, rule);
  ctx.save();
  ctx.clip(path, rule);
  ctx.translate(-R * 0.16, -R * 0.16);
  ctx.fillStyle = base;
  ctx.fill(path, rule);
  ctx.restore();
  ctx.lineWidth = Math.max(1.6, R * 0.14);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  ctx.stroke(path);
}

/** Brilho chapado (sem degradê). */
function gloss(ctx: Ctx, x: number, y: number, rx: number, ry: number, pal: FxPalette, rot = -0.6): void {
  ctx.fillStyle = pal[3];
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.8, rx), Math.max(0.8, ry), rot, 0, TAU);
  ctx.fill();
}

function poly(points: readonly (readonly [number, number])[], R: number): Path2D {
  const p = new Path2D();
  points.forEach(([x, y], i) => (i ? p.lineTo(x * R, y * R) : p.moveTo(x * R, y * R)));
  p.closePath();
  return p;
}

function starPath(points: number, outer: number, inner: number, rot = -Math.PI / 2): Path2D {
  const p = new Path2D();
  for (let k = 0; k < points * 2; k++) {
    const r = k % 2 ? inner : outer;
    const a = rot + (k * Math.PI) / points;
    if (k) p.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  p.closePath();
  return p;
}

function circle(x: number, y: number, r: number, p = new Path2D()): Path2D {
  p.moveTo(x + r, y);
  p.arc(x, y, r, 0, TAU);
  return p;
}

function flamePath(R: number, w: number, h: number, sway: number): Path2D {
  const p = new Path2D();
  p.moveTo(0, R * 0.9);
  p.bezierCurveTo(-R * w, R * 0.9, -R * w * 1.15, 0, sway * R, -R * h);
  p.bezierCurveTo(R * w * 1.15, 0, R * w, R * 0.9, 0, R * 0.9);
  return p;
}

const PAINTERS: Readonly<Record<Exclude<FxShape, 'rune' | 'badge'>, Painter>> = {
  flame(ctx, f, pal, R) {
    const flick = Math.sin(f * TAU);
    cel(ctx, flamePath(R, 0.62, 0.95 + flick * 0.12, flick * 0.18), pal, R);
    ctx.fillStyle = pal[3];
    ctx.fill(flamePath(R * 0.55, 0.55, 0.6 - flick * 0.1, -flick * 0.15));
  },
  drop(ctx, f, pal, R) {
    const sq = 1 + Math.sin(f * TAU) * 0.12;
    ctx.scale(1 / sq, sq);
    const p = new Path2D();
    p.moveTo(0, -R);
    p.bezierCurveTo(R * 0.25, -R * 0.5, R * 0.75, 0, R * 0.7, R * 0.35);
    p.arc(0, R * 0.35, R * 0.7, 0, Math.PI);
    p.bezierCurveTo(-R * 0.75, 0, -R * 0.25, -R * 0.5, 0, -R);
    cel(ctx, p, pal, R);
    gloss(ctx, -R * 0.25, R * 0.15, R * 0.14, R * 0.26, pal, 0.3);
  },
  bolt(ctx, f, pal, R) {
    const flash = Math.floor(f * FX_FRAMES) % 2 === 1;
    const p = poly([[-0.15, -1], [0.5, -1], [0.1, -0.2], [0.45, -0.2], [-0.35, 1], [-0.08, 0.12], [-0.42, 0.12]], R);
    cel(ctx, p, flash ? [pal[0], pal[2], pal[3], '#ffffff'] : pal, R);
  },
  leaf(ctx, f, pal, R) {
    ctx.rotate(f * TAU * 0.5);
    ctx.scale(Math.max(0.25, Math.abs(Math.cos(f * TAU))), 1);
    const p = new Path2D();
    p.moveTo(0, -R);
    p.quadraticCurveTo(R * 0.8, 0, 0, R);
    p.quadraticCurveTo(-R * 0.8, 0, 0, -R);
    cel(ctx, p, pal, R);
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = Math.max(1, R * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.75);
    ctx.lineTo(0, R * 0.9);
    ctx.stroke();
  },
  crystal(ctx, f, pal, R) {
    ctx.rotate(f * TAU * 0.25);
    cel(ctx, poly([[0, -1], [0.45, -0.25], [0.3, 1], [-0.3, 1], [-0.45, -0.25]], R), pal, R);
    ctx.fillStyle = pal[3];
    ctx.fill(poly([[0, -0.85], [0.18, -0.25], [0, 0.6], [-0.2, -0.25]], R));
  },
  sparkle(ctx, f, pal, R) {
    ctx.scale(0.55 + 0.45 * Math.abs(Math.sin(f * Math.PI)), 0.55 + 0.45 * Math.abs(Math.sin(f * Math.PI)));
    cel(ctx, starPath(4, R, R * 0.3), pal, R);
    ctx.fillStyle = pal[3];
    ctx.fill(starPath(4, R * 0.45, R * 0.14));
  },
  star(ctx, f, pal, R) {
    ctx.rotate(Math.sin(f * TAU) * 0.25);
    cel(ctx, starPath(5, R, R * 0.46), pal, R);
    gloss(ctx, -R * 0.15, -R * 0.2, R * 0.16, R * 0.1, pal);
  },
  burst(ctx, f, pal, R) {
    const grow = 0.45 + 0.55 * Math.min(1, f * 1.6);
    const spikes = 12;
    const pts: [number, number][] = [];
    for (let k = 0; k < spikes * 2; k++) {
      const a = (k * Math.PI) / spikes + f * 0.4;
      const r = (k % 2 ? 0.5 : 0.85 + fxHash(k, 7) * 0.15) * grow;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    cel(ctx, poly(pts, R), pal, R);
    ctx.fillStyle = pal[3];
    ctx.fill(poly(pts.map(([x, y]) => [x * 0.5, y * 0.5] as [number, number]), R));
  },
  bubble(ctx, f, pal, R) {
    if (f >= 0.8) {
      // Estourou: pedaços do contorno se afastando.
      ctx.strokeStyle = pal[0];
      ctx.lineWidth = Math.max(1.4, R * 0.12);
      const rr = R * (0.8 + (f - 0.8) * 2);
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, rr, (k * TAU) / 6, (k * TAU) / 6 + 0.5);
        ctx.stroke();
      }
      return;
    }
    cel(ctx, circle(0, 0, R * (0.62 + f * 0.25)), pal, R);
    gloss(ctx, -R * 0.25, -R * 0.25, R * 0.16, R * 0.1, pal);
  },
  rock(ctx, f, pal, R) {
    ctx.rotate(f * Math.PI * 0.5);
    const pts: [number, number][] = [];
    for (let k = 0; k < 7; k++) {
      const a = (k * TAU) / 7;
      const r = 0.7 + fxHash(k, 11) * 0.3;
      pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.85]);
    }
    cel(ctx, poly(pts, R), pal, R);
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = Math.max(1, R * 0.08);
    ctx.beginPath();
    ctx.moveTo(-R * 0.1, -R * 0.3);
    ctx.lineTo(R * 0.15, R * 0.05);
    ctx.lineTo(R * 0.05, R * 0.35);
    ctx.stroke();
  },
  feather(ctx, f, pal, R) {
    ctx.rotate(0.5 + Math.sin(f * TAU) * 0.35);
    const p = new Path2D();
    p.moveTo(0, -R);
    p.bezierCurveTo(R * 0.55, -R * 0.6, R * 0.45, R * 0.4, 0, R * 0.75);
    p.bezierCurveTo(-R * 0.45, R * 0.4, -R * 0.55, -R * 0.6, 0, -R);
    cel(ctx, p, pal, R);
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = Math.max(1, R * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.85);
    ctx.lineTo(0, R);
    ctx.stroke();
  },
  wisp(ctx, f, pal, R) {
    const wave = Math.sin(f * TAU);
    const p = new Path2D();
    p.moveTo(-R * 0.6, 0);
    p.arc(0, 0, R * 0.6, Math.PI, 0);
    for (let k = 0; k <= 4; k++) {
      const x = R * 0.6 - (k * R * 1.2) / 4;
      const y = R * (0.55 + (k % 2 ? 0.35 : 0) + wave * 0.1 * (k % 2 ? 1 : -1));
      p.lineTo(x, y);
    }
    p.closePath();
    ctx.translate(0, -R * 0.15);
    cel(ctx, p, pal, R);
    ctx.fillStyle = pal[0];
    for (const x of [-0.22, 0.22]) {
      ctx.beginPath();
      ctx.ellipse(x * R, -R * 0.05, R * 0.09, R * 0.16, 0, 0, TAU);
      ctx.fill();
    }
  },
  gear(ctx, f, pal, R) {
    ctx.rotate((f * TAU) / 8);
    const teeth = 8;
    const pts: [number, number][] = [];
    for (let k = 0; k < teeth * 4; k++) {
      const a = (k * TAU) / (teeth * 4);
      const r = (k % 4) < 2 ? 1 : 0.74;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const p = poly(pts, R);
    p.moveTo(R * 0.3, 0);
    p.arc(0, 0, R * 0.3, 0, TAU, true);
    cel(ctx, p, pal, R);
  },
  heart(ctx, f, pal, R) {
    const beat = 0.8 + 0.2 * Math.abs(Math.sin(f * TAU));
    ctx.scale(beat, beat);
    const p = new Path2D();
    p.moveTo(0, R * 0.85);
    p.bezierCurveTo(-R * 1.1, R * 0.05, -R * 0.6, -R * 0.95, 0, -R * 0.35);
    p.bezierCurveTo(R * 0.6, -R * 0.95, R * 1.1, R * 0.05, 0, R * 0.85);
    cel(ctx, p, pal, R);
    gloss(ctx, -R * 0.4, -R * 0.3, R * 0.15, R * 0.1, pal);
  },
  slash(ctx, f, pal, R) {
    // Meia-lua que varre o quadro (corte de desenho animado).
    const start = -Math.PI * 0.85;
    const span = Math.PI * 1.25 * Math.min(1, 0.3 + f * 1.6);
    const steps = 14;
    const outer: [number, number][] = [];
    const inner: [number, number][] = [];
    for (let k = 0; k <= steps; k++) {
      const a = start + (span * k) / steps;
      const w = Math.sin((Math.PI * k) / steps) * 0.38;
      outer.push([Math.cos(a), Math.sin(a)]);
      inner.push([Math.cos(a) * (1 - w), Math.sin(a) * (1 - w)]);
    }
    cel(ctx, poly([...outer, ...inner.reverse()], R * 0.95), pal, R);
  },
  hex(ctx, f, pal, R) {
    const pulse = 0.85 + 0.15 * Math.sin(f * TAU);
    ctx.scale(pulse, pulse);
    const hexPts = (r: number) => Array.from({ length: 6 }, (_, k) => [Math.cos((k * TAU) / 6 - Math.PI / 2) * r, Math.sin((k * TAU) / 6 - Math.PI / 2) * r] as [number, number]);
    cel(ctx, poly(hexPts(1), R), pal, R);
    ctx.strokeStyle = pal[3];
    ctx.lineWidth = Math.max(1, R * 0.1);
    ctx.stroke(poly(hexPts(0.6), R));
  },
  dust(ctx, f, pal, R) {
    const g = 0.55 + 0.45 * f;
    const p = new Path2D();
    for (const [x, y, r] of [[-0.35, 0.15, 0.45], [0.3, 0.2, 0.4], [0, -0.2, 0.5], [0.1, 0.35, 0.35]] as const) circle(x * R * g, y * R * g, r * R * g, p);
    cel(ctx, p, pal, R);
  },
  coin(ctx, f, pal, R) {
    ctx.scale(Math.max(0.18, Math.abs(Math.cos(f * Math.PI))), 1);
    cel(ctx, circle(0, 0, R * 0.85), pal, R);
    ctx.strokeStyle = pal[1];
    ctx.lineWidth = Math.max(1, R * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.55, 0, TAU);
    ctx.stroke();
    gloss(ctx, -R * 0.3, -R * 0.3, R * 0.14, R * 0.08, pal);
  },
  orb(ctx, f, pal, R) {
    cel(ctx, circle(0, 0, R * 0.58), pal, R);
    gloss(ctx, -R * 0.2, -R * 0.2, R * 0.14, R * 0.09, pal);
    ctx.strokeStyle = pal[0];
    ctx.lineWidth = Math.max(1.4, R * 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.95, R * 0.32, f * Math.PI, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = pal[3];
    ctx.lineWidth = Math.max(0.8, R * 0.05);
    ctx.stroke();
  },
  scale(ctx, f, pal, R) {
    ctx.rotate(Math.sin(f * TAU) * 0.4);
    const p = new Path2D();
    p.moveTo(-R * 0.75, -R * 0.2);
    p.arc(0, -R * 0.2, R * 0.75, Math.PI, 0);
    p.quadraticCurveTo(R * 0.6, R * 0.5, 0, R);
    p.quadraticCurveTo(-R * 0.6, R * 0.5, -R * 0.75, -R * 0.2);
    cel(ctx, p, pal, R);
    gloss(ctx, -R * 0.25, -R * 0.4, R * 0.18, R * 0.1, pal);
  },
  streak(ctx, f, pal, R) {
    const len = 0.4 + 0.6 * Math.min(1, f * 2);
    cel(ctx, poly([[-len, 0], [len * 0.7, -0.14], [len, 0], [len * 0.7, 0.14]], R), pal, R);
  },
};

function blank(width: number, height: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D indisponível.');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

/** Alfa binário: tira o antisserrilhado do Canvas e deixa a borda dura de sprite. */
function hardenAlpha(canvas: HTMLCanvasElement, ctx: Ctx): void {
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 3; i < d.length; i += 4) d[i] = d[i]! >= 110 ? 255 : 0;
  ctx.putImageData(image, 0, 0);
}

function paintSheet(shape: Exclude<FxShape, 'rune' | 'badge'>, pal: FxPalette): HTMLCanvasElement {
  const s = FX_FRAME_PX;
  const { canvas, ctx } = blank(s * FX_FRAMES, s);
  for (let k = 0; k < FX_FRAMES; k++) {
    ctx.save();
    ctx.translate(k * s + s / 2, s / 2);
    PAINTERS[shape](ctx, k / FX_FRAMES, pal, s * 0.4);
    ctx.restore();
  }
  hardenAlpha(canvas, ctx);
  return canvas;
}

/** Círculo mágico deitado na carta: anéis, marcas e runas em volta. */
function paintRune(pal: FxPalette): HTMLCanvasElement {
  const s = RUNE_PX;
  const { canvas, ctx } = blank(s, s);
  ctx.translate(s / 2, s / 2);
  const R = s * 0.46;
  const ring = new Path2D();
  ring.arc(0, 0, R, 0, TAU);
  ring.arc(0, 0, R * 0.84, 0, TAU, true);
  cel(ctx, ring, pal, R * 0.12);
  ctx.strokeStyle = pal[0];
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.55, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = pal[2];
  ctx.lineWidth = 1;
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k * TAU) / 8;
    ctx.save();
    ctx.rotate(a);
    ctx.translate(0, -R * 0.7);
    cel(ctx, k % 2 ? poly([[0, -1], [0.8, 0.7], [-0.8, 0.7]], R * 0.08) : circle(0, 0, R * 0.06), pal, R * 0.07);
    ctx.restore();
  }
  cel(ctx, starPath(6, R * 0.32, R * 0.16), pal, R * 0.1);
  hardenAlpha(canvas, ctx);
  return canvas;
}

/** Selo com texto: fita arredondada em cel-shading, letras claras com contorno escuro. */
function paintBadge(text: string, pal: FxPalette): HTMLCanvasElement {
  const h = BADGE_PX_HEIGHT;
  const font = `800 ${Math.round(h * 0.62)}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
  const measure = blank(1, 1).ctx;
  measure.font = font;
  const textW = Math.ceil(measure.measureText(text).width);
  const w = textW + h;
  const { canvas, ctx } = blank(w + 4, h + 4);
  ctx.translate(2, 2);
  const p = new Path2D();
  const rr = h * 0.42;
  p.moveTo(rr, 0);
  p.arcTo(w, 0, w, h, rr);
  p.arcTo(w, h, 0, h, rr);
  p.arcTo(0, h, 0, 0, rr);
  p.arcTo(0, 0, w, 0, rr);
  p.closePath();
  cel(ctx, p, pal, h * 0.3);
  gloss(ctx, w * 0.25, h * 0.22, w * 0.16, h * 0.08, pal, 0);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal[0];
  ctx.strokeText(text, w / 2, h / 2 + 1);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, h / 2 + 1);
  hardenAlpha(canvas, ctx);
  return canvas;
}

export interface FxSheet {
  canvas: HTMLCanvasElement;
  /** Quadros na horizontal (1 no selo e no círculo). */
  frames: number;
  /** Largura ÷ altura de um quadro. */
  aspect: number;
}

const sheets = new Map<string, FxSheet>();

/** Folha pré-renderizada da receita (em cache: a mesma folha serve a todas as cartas). */
export function fxSheet(recipe: FxRecipe): FxSheet {
  const key = `${recipe.shape}|${recipe.palette.join()}|${recipe.badge ?? ''}`;
  const cached = sheets.get(key);
  if (cached) return cached;
  let sheet: FxSheet;
  if (recipe.shape === 'badge') {
    const canvas = paintBadge(recipe.badge ?? '', recipe.palette);
    sheet = { canvas, frames: 1, aspect: canvas.width / canvas.height };
  } else if (recipe.shape === 'rune') {
    sheet = { canvas: paintRune(recipe.palette), frames: 1, aspect: 1 };
  } else {
    sheet = { canvas: paintSheet(recipe.shape, recipe.palette), frames: FX_FRAMES, aspect: 1 };
  }
  sheets.set(key, sheet);
  return sheet;
}

/** Textura da folha, com pixels duros. Cada partícula usa um `clone()` (mesma imagem na GPU, quadro próprio). */
export function fxTexture(sheet: FxSheet): CanvasTexture {
  const texture = new CanvasTexture(sheet.canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.repeat.set(1 / sheet.frames, 1);
  return texture;
}
