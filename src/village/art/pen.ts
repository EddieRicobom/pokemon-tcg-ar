import { createBuf } from '../../box/ground-art';
import type { PixelBuf } from '../../box/ground-art';

/**
 * Pincel da pixel art de itens, acessórios e móveis. Desenha num buffer RGBA por código (sem canvas, então roda nos
 * testes) e termina o desenho em um passo só (`finish`): luz vindo de cima à esquerda, sombra embaixo à direita e um
 * contorno de 1 pixel. O contorno `sel` usa um tom escuro da própria cor vizinha (como os ícones da mochila da 5ª
 * geração); o `ink` é quase preto (como os acessórios da 4ª geração).
 *
 * Sprites detalhados vêm como mapa de texto (`Pen.map`): cada caractere é um pixel, com a cor da paleta do próprio
 * sprite, e `.` ou espaço fica vazio. As paletas saem de `tones`, que monta uma rampa com variação de matiz (luz puxa
 * para o amarelo, sombra para o azul), o jeito clássico de dar volume sem deixar a cor suja.
 */

export type Palette = Record<string, number>;
export type Draw = (p: Pen) => void;

// ----------------------------------------------------------------------------- cor

function toHsl(c: number): [number, number, number] {
  const r = ((c >> 16) & 255) / 255;
  const g = ((c >> 8) & 255) / 255;
  const b = (c & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  l = Math.min(1, Math.max(0, l));
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

/** Puxa o matiz `h` em direção a `target` (graus), no máximo `amount` graus. */
function pull(h: number, target: number, amount: number): number {
  let d = target - h;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return h + Math.sign(d) * Math.min(Math.abs(d), amount);
}

/**
 * Clareia (`k` > 0) ou escurece (`k` < 0) com variação de matiz. Cinzas não ganham matiz (não viram bege nem azul);
 * cores saturadas na sombra ganham um pouco de saturação para não ficarem barrentas.
 */
export function tint(c: number, k: number): number {
  const [h, s, l] = toHsl(c);
  if (k >= 0) {
    const hue = s < 0.08 ? h : pull(h, 55, 14 * k * 2);
    return fromHsl(hue, s * (1 - 0.15 * k), l + (1 - l) * k);
  }
  const m = -k;
  const hue = s < 0.08 ? h : pull(h, 245, 16 * m * 2);
  return fromHsl(hue, s < 0.08 ? s : Math.min(1, s + 0.12 * m), l * (1 - m));
}

/**
 * Rampa de uma cor para a paleta de um sprite: as letras de `keys` recebem, em ordem, brilho, luz, base, sombra e
 * sombra funda (quantas letras vierem). Ex.: `tones('abc', RED)` → a = luz, b = base, c = sombra.
 */
export function tones(keys: string, base: number): Palette {
  const steps: Record<number, number[]> = {
    1: [0],
    2: [0, -0.28],
    3: [0.3, 0, -0.28],
    4: [0.55, 0.28, 0, -0.28],
    5: [0.62, 0.3, 0, -0.26, -0.48],
  };
  const ks = steps[keys.length] ?? steps[3]!;
  const out: Palette = {};
  [...keys].forEach((ch, i) => { out[ch] = ks[i] === 0 ? base : tint(base, ks[i]!); });
  return out;
}

/** Mistura duas cores (t = 0 fica com `a`). */
export function mix(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

// ----------------------------------------------------------------------------- pincel

export class Pen {
  constructor(readonly buf: PixelBuf) {}
  px(x: number, y: number, c: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.buf.w || y >= this.buf.h) return;
    const i = (y * this.buf.w + x) * 4;
    this.buf.data[i] = (c >> 16) & 255;
    this.buf.data[i + 1] = (c >> 8) & 255;
    this.buf.data[i + 2] = c & 255;
    this.buf.data[i + 3] = 255;
  }
  rect(x: number, y: number, w: number, h: number, c: number): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  disc(cx: number, cy: number, rx: number, ry: number, c: number): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.px(x, y, c);
    }
  }
  /** Só a borda de uma elipse. */
  ring(cx: number, cy: number, rx: number, ry: number, c: number): void {
    for (let a = 0; a < 64; a++) this.px(cx + Math.cos((a / 64) * Math.PI * 2) * rx, cy + Math.sin((a / 64) * Math.PI * 2) * ry, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, t = 1): void {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const y = y0 + ((y1 - y0) * i) / n;
      for (let j = 0; j < t; j++) for (let k = 0; k < t; k++) this.px(x + j, y + k, c);
    }
  }
  /** Triângulo cheio de ponta (tx, ty) e base de (bx0, by) a (bx1, by); a base pode ficar acima ou abaixo da ponta. */
  tri(tx: number, ty: number, bx0: number, bx1: number, by: number, c: number): void {
    const dir = by >= ty ? 1 : -1;
    const span = by - ty || 1;
    for (let y = ty; dir > 0 ? y <= by : y >= by; y += dir) {
      const k = (y - ty) / span;
      const x0 = tx + (bx0 - tx) * k;
      const x1 = tx + (bx1 - tx) * k;
      for (let x = Math.round(Math.min(x0, x1)); x <= Math.round(Math.max(x0, x1)); x++) this.px(x, y, c);
    }
  }
  /** Sprite em texto a partir de (x0, y0): uma linha por linha de pixels; `.` e espaço ficam vazios. */
  map(x0: number, y0: number, rows: string, pal: Palette): void {
    const lines = rows.split('\n').filter((l) => l.trim().length > 0);
    const indent = Math.min(...lines.map((l) => l.length - l.trimStart().length));
    lines.forEach((line, y) => {
      [...line.slice(indent)].forEach((ch, x) => {
        if (ch === '.' || ch === ' ') return;
        const c = pal[ch];
        if (c === undefined) throw new Error(`cor '${ch}' fora da paleta`);
        this.px(x0 + x, y0 + y, c);
      });
    });
  }
  /** Lê a cor de um pixel (-1 = vazio). */
  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.buf.w || y >= this.buf.h) return -1;
    const i = (y * this.buf.w + x) * 4;
    if ((this.buf.data[i + 3] ?? 0) === 0) return -1;
    return ((this.buf.data[i] ?? 0) << 16) | ((this.buf.data[i + 1] ?? 0) << 8) | (this.buf.data[i + 2] ?? 0);
  }
}

// ----------------------------------------------------------------------------- acabamento

export interface Finish {
  /** `soft`: luz e sombra automáticas pela silhueta (desenhos feitos com formas); `none`: o sprite já vem sombreado. */
  shade?: 'soft' | 'none';
  /** `sel`: contorno no tom escuro da cor vizinha; `ink`: quase preto; `none`: sem contorno. */
  outline?: 'sel' | 'ink' | 'none';
}

const solidAt = (buf: PixelBuf, x: number, y: number) => x >= 0 && y >= 0 && x < buf.w && y < buf.h && (buf.data[(y * buf.w + x) * 4 + 3] ?? 0) > 0;

/** Luz de cima à esquerda: borda de cima e da esquerda clareiam; de baixo e da direita escurecem. */
function softShade(buf: PixelBuf): void {
  const pen = new Pen(buf);
  const edits: [number, number, number][] = [];
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      const c = pen.at(x, y);
      if (c < 0) continue;
      const up = !solidAt(buf, x, y - 1);
      const down = !solidAt(buf, x, y + 1);
      const left = !solidAt(buf, x - 1, y);
      const right = !solidAt(buf, x + 1, y);
      const k = up ? 0.24 : down ? -0.22 : left ? 0.1 : right ? -0.12 : 0;
      if (k !== 0) edits.push([x, y, tint(c, k)]);
    }
  }
  for (const [x, y, c] of edits) pen.px(x, y, c);
}

/** Contorno de 1 pixel em volta do desenho, colorido pela cor vizinha mais escura. */
function outline(buf: PixelBuf, mode: 'sel' | 'ink'): void {
  const pen = new Pen(buf);
  const marks: [number, number, number][] = [];
  for (let y = 0; y < buf.h; y++) {
    for (let x = 0; x < buf.w; x++) {
      if (solidAt(buf, x, y)) continue;
      let best = -1;
      let bestL = 2;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const c = pen.at(x + dx, y + dy);
        if (c < 0) continue;
        const l = toHsl(c)[2];
        if (l < bestL) { bestL = l; best = c; }
      }
      if (best < 0) continue;
      const [h, s, l] = toHsl(best);
      const c = mode === 'ink'
        ? fromHsl(s < 0.08 ? h : pull(h, 245, 25), Math.min(0.45, s), 0.07 + l * 0.08)
        : fromHsl(s < 0.08 ? h : pull(h, 245, 22), s < 0.08 ? s : Math.min(1, s * 0.8 + 0.15), Math.max(0.1, l * 0.36));
      marks.push([x, y, c]);
    }
  }
  for (const [x, y, c] of marks) pen.px(x, y, c);
}

/** Desenha num buffer novo e aplica o acabamento. */
export function render(fn: Draw | null, w = 16, h = 16, opts: Finish = {}): PixelBuf {
  const buf = createBuf(w, h);
  if (!fn) return buf;
  fn(new Pen(buf));
  if ((opts.shade ?? 'soft') === 'soft') softShade(buf);
  const o = opts.outline ?? 'sel';
  if (o !== 'none') outline(buf, o);
  return buf;
}

/** Recorta a margem vazia (o desenho fica do tamanho real). Um buffer vazio vira 1×1 transparente. */
export function crop(buf: PixelBuf): PixelBuf {
  let x0 = buf.w, y0 = buf.h, x1 = -1, y1 = -1;
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) if (solidAt(buf, x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  if (x1 < 0) return createBuf(1, 1);
  const out = createBuf(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const s = ((y + y0) * buf.w + x + x0) * 4;
    const d = (y * out.w + x) * 4;
    for (let k = 0; k < 4; k++) out.data[d + k] = buf.data[s + k] ?? 0;
  }
  return out;
}

/** Centraliza um desenho menor num quadro `w`×`h` (o ícone da mochila de um acessório pequeno). */
export function center(buf: PixelBuf, w = 16, h = 16): PixelBuf {
  const out = createBuf(w, h);
  const ox = Math.floor((w - buf.w) / 2);
  const oy = Math.floor((h - buf.h) / 2);
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) {
    const tx = x + ox, ty = y + oy;
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
    const s = (y * buf.w + x) * 4;
    const d = (ty * w + tx) * 4;
    for (let k = 0; k < 4; k++) out.data[d + k] = buf.data[s + k] ?? 0;
  }
  return out;
}
