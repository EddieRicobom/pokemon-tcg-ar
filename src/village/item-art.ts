import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { COLOR_NAMES, itemDef } from '../core/village/catalog';
import type { ColorKey } from '../core/village/catalog';

/**
 * Ícones e móveis da Vila em pixel art (16×16, ou 16×32 nos móveis altos), todos desenhados por código. Cada móvel tem o
 * seu desenho (o mesmo no chão e na mochila); sementes viram saquinhos com a cor da planta; colheitas, frutas, comidas,
 * peixes e materiais têm o próprio ícone. Todo desenho ganha luz no topo e sombra embaixo (`shade`) e um contorno escuro,
 * para parecer sólido mesmo bem pequeno.
 */

type Draw = (b: Pen) => void;

class Pen {
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
  /** Contorno de 1 pixel em volta do desenho. */
  outline(c: number): void {
    const { w, h, data } = this.buf;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (data[(y * w + x) * 4 + 3] ?? 0) > 0;
    const marks: [number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) marks.push([x, y]);
    for (const [x, y] of marks) this.px(x, y, c);
  }
  /** Luz de cima: o pixel com vazio acima clareia; o com vazio embaixo escurece (a figura ganha volume). */
  shade(): void {
    const { w, h, data } = this.buf;
    const a = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? (data[(y * w + x) * 4 + 3] ?? 0) : 0);
    const edits: [number, number, number][] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (a(x, y) === 0) continue;
        if (a(x, y - 1) === 0) edits.push([x, y, 1]);
        else if (a(x, y + 1) === 0) edits.push([x, y, -1]);
      }
    }
    for (const [x, y, dir] of edits) {
      const i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) {
        const v = data[i + k] ?? 0;
        data[i + k] = dir > 0 ? Math.min(255, Math.round(v + (255 - v) * 0.22)) : Math.round(v * 0.78);
      }
    }
  }
}

const WOOD = 0xb8844a;
const WOOD_D = 0x8a5a2e;
const WOOD_L = 0xd2a66c;
const LEG = 0x6a4a28;
const STONE = 0x9a968e;
const STONE_L = 0xc4c0b8;
const IRON = 0x6a6e7a;
const IRON_L = 0x9aa0ae;
const RED = 0xd8463c;
const WHITE = 0xf6f6f6;
const GOLD = 0xffcb05;
const GREEN = 0x4aa84a;
const GREEN_D = 0x2f7f36;
const GREEN_L = 0x6cc85c;
const BLUE = 0x4f8fe0;
const PINK = 0xf8a8c8;
const DARK = 0x2a2a34;
const CLOTH = 0x5a8ad8;
const GLASS = 0x8fd0ff;
const ORANGE = 0xf08a28;

interface Pal {
  m: number;
  l: number;
  d: number;
}
const PAL: Record<ColorKey, Pal> = {
  vermelho: { m: 0xd8463c, l: 0xf0705f, d: 0xa83228 },
  azul: { m: 0x4f8fe0, l: 0x7aa8f0, d: 0x3a6ad8 },
  verde: { m: 0x4aa84a, l: 0x6cc85c, d: 0x2f7f36 },
  rosa: { m: 0xe86aa0, l: 0xf8a8c8, d: 0xb84a78 },
  amarelo: { m: 0xf2c84a, l: 0xffe27a, d: 0xc89a2a },
  roxo: { m: 0x8a5ad8, l: 0xa88af0, d: 0x6a3aa8 },
  listrado: { m: 0xe86aa0, l: 0xffe27a, d: 0x4f8fe0 },
};

type Furn = (p: Pen, lit: boolean, frame: number) => void;

// Famílias que têm variação de cor (o desenho recebe a paleta).
const FAMILY: Record<string, (p: Pen, c: Pal) => void> = {
  cadeira: (p, c) => { p.rect(4, 2, 8, 7, WOOD_D); p.rect(5, 3, 6, 5, c.m); p.rect(5, 3, 6, 1, c.l); p.rect(3, 9, 10, 3, c.m); p.rect(3, 9, 10, 1, c.l); p.rect(4, 12, 2, 3, LEG); p.rect(10, 12, 2, 3, LEG); },
  sofa: (p, c) => { p.rect(0, 3, 16, 7, c.d); p.rect(1, 4, 14, 4, c.m); p.rect(1, 4, 14, 1, c.l); p.rect(0, 8, 16, 5, c.m); p.rect(0, 8, 16, 1, c.l); p.rect(7, 4, 1, 9, c.d); p.rect(1, 13, 2, 2, LEG); p.rect(13, 13, 2, 2, LEG); },
  poltrona: (p, c) => { p.rect(2, 2, 12, 9, c.d); p.rect(4, 3, 8, 6, c.m); p.rect(4, 3, 8, 1, c.l); p.rect(1, 6, 3, 7, c.d); p.rect(12, 6, 3, 7, c.d); p.rect(4, 9, 8, 4, c.m); p.rect(3, 13, 2, 2, LEG); p.rect(11, 13, 2, 2, LEG); },
  cama: (p, c) => { p.rect(1, 1, 14, 14, WOOD_D); p.rect(2, 2, 12, 3, WHITE); p.rect(3, 3, 4, 2, 0xe6ecf4); p.rect(2, 5, 12, 9, c.m); p.rect(2, 5, 12, 1, c.l); p.rect(2, 9, 12, 1, c.d); p.rect(2, 13, 12, 1, c.d); },
  tapete: (p, c) => { p.rect(1, 4, 14, 9, c.m); p.rect(2, 5, 12, 7, c.l); p.rect(4, 6, 8, 5, c.m); p.rect(6, 7, 4, 3, c.d); for (let x = 1; x < 15; x += 2) { p.px(x, 3, c.l); p.px(x, 13, c.l); } },
  vaso: (p, c) => { p.rect(4, 9, 8, 6, 0xc8643c); p.rect(3, 8, 10, 2, 0xe07a4c); p.rect(5, 10, 6, 1, 0xa84a2c); for (const [x, y, k] of [[5, 4, c.m], [8, 3, c.l], [10, 5, c.m], [7, 6, GREEN], [6, 7, GREEN], [9, 7, GREEN]] as const) p.rect(x, y, 2, 2, k); },
};

const VARIANT_BASE: Record<string, string> = { cadeira: 'cadeira', sofa: 'sofa', poltrona: 'poltrona', cama: 'cama', tapete: 'tapete', vaso: 'vaso' };

/** Cor padrão de cada família quando não há variação (o móvel original). */
const FAMILY_DEFAULT: Record<string, Pal> = {
  cadeira: { m: 0xc8a068, l: 0xe0be88, d: 0x8a5a2e },
  sofa: PAL.azul,
  poltrona: { m: 0xe06a5a, l: 0xf08a7a, d: 0xa83a38 },
  cama: PAL.rosa,
  tapete: { m: 0xc0504d, l: 0xf2c84a, d: 0x8a2a2a },
  vaso: { m: 0xf06048, l: 0xffd84a, d: 0xe84a3a },
};

const FURNITURE: Record<string, Furn> = {
  banquinho: (p) => { p.rect(3, 6, 10, 3, WOOD); p.rect(3, 6, 10, 1, WOOD_L); p.rect(4, 9, 2, 6, LEG); p.rect(10, 9, 2, 6, LEG); },
  'banco-praca': (p) => { p.rect(1, 6, 14, 4, WOOD); p.rect(2, 6, 12, 1, WOOD_L); p.rect(2, 10, 2, 5, LEG); p.rect(12, 10, 2, 5, LEG); p.rect(4, 3, 2, 4, WOOD_D); p.rect(10, 3, 2, 4, WOOD_D); },
  'fonte-mini': (p, _l, f) => { p.rect(3, 9, 10, 5, STONE); p.rect(2, 8, 12, 2, STONE_L); p.rect(6, 4, 4, 5, STONE); p.rect(5, 3, 6, 2, STONE_L); p.disc(8, 7, 2, 1, f % 2 ? BLUE : GLASS); },
  'placa-bemvindo': (p) => { p.rect(3, 3, 10, 7, WOOD); p.rect(4, 4, 8, 5, WOOD_L); p.rect(7, 10, 2, 5, LEG); p.rect(5, 6, 6, 1, RED); p.rect(6, 5, 1, 3, RED); p.rect(9, 5, 1, 3, RED); },
  mesa: (p) => { p.rect(1, 5, 14, 4, WOOD); p.rect(1, 5, 14, 1, WOOD_L); p.rect(2, 9, 2, 6, LEG); p.rect(12, 9, 2, 6, LEG); p.rect(6, 3, 4, 2, WHITE); p.px(7, 2, RED); },
  mesinha: (p) => { p.disc(8, 8, 6, 3, WOOD); p.disc(8, 7.5, 5, 2, WOOD_L); p.rect(7, 10, 2, 5, LEG); p.rect(5, 14, 6, 1, LEG); },
  estante: (p) => { p.rect(2, 1, 12, 14, WOOD_D); for (const y of [2, 7, 12]) { p.rect(3, y, 10, 4, 0x4a2e18); for (let x = 3; x < 13; x += 2) p.rect(x, y + 1, 1, 3, [RED, BLUE, GREEN, GOLD, PINK][(x + y) % 5]!); } },
  bau: (p) => { p.rect(2, 5, 12, 9, WOOD); p.rect(2, 5, 12, 3, WOOD_D); p.rect(2, 8, 12, 1, IRON); p.rect(7, 7, 2, 3, GOLD); p.rect(3, 5, 1, 9, IRON); p.rect(12, 5, 1, 9, IRON); },
  relogio: (p) => { p.rect(5, 0, 6, 15, WOOD_D); p.rect(6, 1, 4, 13, WOOD); p.disc(8, 4, 2.5, 2.5, WHITE); p.px(8, 3, DARK); p.px(9, 4, DARK); p.rect(7, 8, 2, 5, GOLD); },
  quadro: (p) => { p.rect(2, 3, 12, 10, GOLD); p.rect(3, 4, 10, 8, GLASS); p.rect(3, 9, 10, 3, GREEN); p.disc(10, 6, 1.5, 1.5, 0xffe27a); },
  'quadro-mar': (p) => { p.rect(2, 3, 12, 10, WOOD_D); p.rect(3, 4, 10, 8, 0xbfe8ff); p.rect(3, 8, 10, 4, BLUE); for (const x of [4, 7, 10]) p.rect(x, 9, 2, 1, WHITE); p.tri(11, 5, 10, 12, 8, WHITE); p.rect(11, 8, 1, 1, WOOD_D); },
  'quadro-pokebola': (p) => { p.rect(2, 3, 12, 10, DARK); p.rect(3, 4, 10, 8, 0xf2e6c8); p.disc(8, 8, 3.5, 3.5, WHITE); for (let y = 4; y < 8; y++) for (let x = 4; x < 13; x++) if (((x - 8) / 3.5) ** 2 + ((y - 8) / 3.5) ** 2 <= 1) p.px(x, y, RED); p.rect(4, 8, 8, 1, DARK); p.disc(8, 8, 1, 1, WHITE); },
  'quadro-flores': (p) => { p.rect(2, 3, 12, 10, GOLD); p.rect(3, 4, 10, 8, 0xf2e6c8); p.rect(7, 8, 2, 3, 0x3a6ad8); for (const [x, y, c] of [[5, 6, RED], [8, 5, PINK], [10, 7, 0xffd84a]] as const) p.rect(x, y, 2, 2, c); p.rect(8, 7, 1, 1, GREEN); },
  televisao: (p, _l, f) => { p.rect(1, 3, 14, 9, DARK); p.rect(2, 4, 12, 7, f % 2 ? 0x6ac8e8 : 0x4aa8d8); p.rect(3, 5, 4, 2, f % 2 ? 0xffe27a : 0xb0f0ff); p.rect(8, 8, 4, 2, f % 2 ? 0xe86aa0 : 0x8ae8a8); p.rect(6, 12, 4, 3, DARK); },
  radio: (p, _l, f) => { p.rect(2, 5, 12, 8, 0x8a5ad8); p.rect(2, 5, 12, 1, 0xa88af0); p.disc(5.5, 9, 2, 2, DARK); p.rect(9, 7, 4, 1, WHITE); p.rect(9, 9, 4, 1, WHITE); p.rect(11, 1, 1, 4, IRON); if (f % 2) p.px(13, 3, 0xffe27a); },
  lareira: (p, _l, f) => { p.rect(1, 2, 14, 13, STONE); p.rect(1, 2, 14, 2, STONE_L); p.rect(4, 7, 8, 8, 0x2a1a14); p.disc(8, 12, 2.4 + (f % 2) * 1.2, 2.2 + (f % 2) * 1.1, 0xf06048); p.disc(8, 12.5, 1.2, 1.5 + (f % 2) * 0.6, 0xffd84a); if (f % 2) p.px(10, 8, 0xffd84a); },
  geladeira: (p) => { p.rect(3, 1, 10, 14, 0xe8eef4); p.rect(3, 1, 10, 1, WHITE); p.rect(3, 6, 10, 1, 0xaab4c0); p.rect(11, 3, 1, 2, IRON); p.rect(11, 8, 1, 3, IRON); p.rect(12, 2, 1, 13, 0xc8d2dc); },
  fogao: (p, _l, f) => { p.rect(2, 5, 12, 10, 0xdcdcdc); p.rect(2, 5, 12, 1, WHITE); p.rect(3, 4, 4, 1, DARK); p.rect(9, 4, 4, 1, DARK); p.rect(4, 9, 8, 4, DARK); p.rect(5, 10, 6, 2, 0x5a5a68); for (const x of [4, 7, 10]) p.px(x, 7, RED); if (f % 2) { p.px(4, 3, 0xffd84a); p.px(5, 3, ORANGE); p.px(10, 3, ORANGE); p.px(11, 3, 0xffd84a); } },
  pia: (p) => { p.rect(1, 7, 14, 8, WOOD); p.rect(1, 6, 14, 2, 0xdcdcdc); p.rect(5, 5, 6, 2, 0x9ac8e8); p.rect(8, 2, 1, 3, IRON_L); p.rect(8, 2, 3, 1, IRON_L); p.rect(4, 9, 3, 5, WOOD_D); p.rect(9, 9, 3, 5, WOOD_D); },
  'guarda-roupa': (p) => { p.rect(2, 1, 12, 14, WOOD_D); p.rect(3, 2, 5, 12, WOOD); p.rect(8, 2, 5, 12, WOOD); p.rect(3, 2, 10, 1, WOOD_L); p.px(7, 8, GOLD); p.px(9, 8, GOLD); },
  espelho: (p) => { p.rect(4, 1, 8, 13, GOLD); p.rect(5, 2, 6, 11, 0xbfe8ff); p.px(6, 3, WHITE); p.px(7, 4, WHITE); p.px(6, 5, WHITE); p.rect(6, 14, 4, 1, WOOD_D); },
  piano: (p) => { p.rect(1, 3, 14, 8, DARK); p.rect(5, 1, 6, 2, WHITE); p.rect(1, 10, 14, 3, WHITE); for (let x = 2; x < 15; x += 2) p.rect(x, 10, 1, 2, DARK); p.rect(2, 13, 2, 2, DARK); p.rect(12, 13, 2, 2, DARK); p.rect(1, 3, 14, 1, 0x4a4a58); },
  violao: (p) => { p.rect(7, 0, 2, 6, WOOD_D); p.rect(6, 0, 4, 1, LEG); p.disc(8, 10, 5, 5, 0xd8883a); p.disc(8, 10, 1.5, 1.5, 0x2a1a10); p.rect(7, 12, 2, 1, WOOD_D); p.disc(6.5, 8, 1.5, 1, 0xf0a860); },
  aquario: (p, _l, f) => { p.rect(1, 3, 14, 11, GLASS); p.rect(1, 3, 14, 1, 0xd8f0ff); p.rect(1, 12, 14, 2, 0xe8d8a0); p.rect(12, 7, 1, 5, GREEN); p.rect(11, 8, 1, 2, GREEN_L); p.rect(3 + f * 4, 7, 3, 2, ORANGE); p.px(2 + f * 4, 7, 0xffd84a); p.px(f * 4 + 4, 6, WHITE); p.px(10, 5 + f, WHITE); p.px(9, 4 + f, WHITE); p.rect(0, 2, 16, 1, IRON); },
  samambaia: (p) => { p.rect(5, 11, 6, 4, 0xc8643c); p.rect(4, 10, 8, 2, 0xe07a4c); for (const [x, y, rx] of [[8, 4, 1.5], [5, 6, 2.5], [11, 6, 2.5], [4, 8, 2], [12, 8, 2], [8, 8, 2]] as const) p.disc(x, y, rx, 2.5, GREEN); p.disc(8, 5, 1, 1.5, GREEN_L); },
  cacto: (p) => { p.rect(5, 12, 6, 3, 0xc8643c); p.rect(6, 3, 4, 10, GREEN); p.rect(6, 3, 1, 10, GREEN_L); p.rect(3, 6, 3, 2, GREEN); p.rect(3, 4, 2, 3, GREEN); p.rect(10, 7, 3, 2, GREEN); p.rect(12, 5, 2, 3, GREEN); p.px(8, 2, PINK); p.px(7, 1, PINK); p.px(9, 1, PINK); },
  globo: (p) => { p.rect(7, 12, 2, 3, WOOD_D); p.rect(5, 14, 6, 1, WOOD_D); p.disc(8, 7, 5.5, 5.5, BLUE); for (const [x, y, w, h] of [[5, 4, 3, 3], [9, 7, 3, 4], [6, 9, 2, 2]] as const) p.rect(x, y, w, h, GREEN); p.ring(8, 7, 6.5, 6.5, GOLD); },
  cortina: (p) => { p.rect(1, 1, 14, 1, IRON); p.rect(6, 2, 4, 12, GLASS); p.rect(1, 2, 5, 12, 0xc0504d); p.rect(10, 2, 5, 12, 0xc0504d); for (const x of [2, 4, 11, 13]) p.rect(x, 2, 1, 12, 0x8a2a2a); p.rect(6, 7, 4, 1, WHITE); },
  escrivaninha: (p) => { p.rect(1, 5, 14, 2, WOOD); p.rect(1, 5, 14, 1, WOOD_L); p.rect(1, 7, 5, 8, WOOD_D); p.rect(2, 8, 3, 2, WOOD); p.rect(2, 11, 3, 2, WOOD); p.rect(13, 7, 2, 8, LEG); p.rect(8, 3, 4, 2, WHITE); p.px(9, 2, RED); },
  computador: (p, _l, f) => { p.rect(2, 2, 12, 8, DARK); p.rect(3, 3, 10, 6, f % 2 ? 0x6ac8e8 : 0x4a90d8); p.rect(4, 4, 5, 1, WHITE); p.rect(4, 6, 3, 1, 0x8ae8a8); p.rect(7, 10, 2, 2, IRON); p.rect(3, 12, 10, 2, IRON_L); },
  banheira: (p, _l, f) => { p.rect(1, 6, 14, 7, WHITE); p.rect(1, 6, 14, 1, 0xe6ecf4); p.rect(2, 7, 12, 3, 0x9cd0ff); p.rect(2, 12, 12, 1, 0xc8d2dc); p.rect(2, 13, 2, 2, GOLD); p.rect(12, 13, 2, 2, GOLD); p.rect(13, 3, 1, 3, IRON_L); p.px(5 + f * 4, 6, WHITE); p.px(9, 5 - f, WHITE); p.px(4, 5, WHITE); },
  pufe: (p) => { p.disc(8, 10, 6, 5, 0x8a5ad8); p.disc(6, 8, 2.5, 1.5, 0xa88af0); p.rect(5, 14, 6, 1, 0x6a3aa8); },
  'criado-mudo': (p) => { p.rect(3, 6, 10, 9, WOOD); p.rect(3, 6, 10, 1, WOOD_L); p.rect(4, 8, 8, 3, WOOD_D); p.px(8, 9, GOLD); p.rect(4, 12, 8, 2, WOOD_D); p.px(8, 13, GOLD); p.rect(5, 3, 2, 3, 0xe86aa0); },
  fliperama: (p, _l, f) => { p.rect(3, 0, 10, 15, 0x3a3ad8); p.rect(3, 0, 10, 2, 0xffd84a); p.rect(4, 3, 8, 5, DARK); p.rect(5, 4, 6, 3, f % 2 ? 0xffd84a : 0xff6a4a); p.rect(4, 9, 8, 2, 0x2a2aa8); p.px(6, 10, RED); p.px(9, 10, 0x8ae8a8); p.px(10, 10, 0xffd84a); p.rect(4, 12, 8, 3, DARK); },
  'caixa-som': (p, _l, f) => { p.rect(3, 1, 10, 14, DARK); p.rect(3, 1, 10, 1, 0x4a4a58); p.disc(8, 5, 2 + (f % 2) * 0.5, 2 + (f % 2) * 0.5, 0x4a4a58); p.disc(8, 5, 0.8, 0.8, IRON_L); p.disc(8, 11, 3.5 + (f % 2) * 0.5, 3.5 + (f % 2) * 0.5, 0x4a4a58); p.disc(8, 11, 1.5, 1.5, IRON_L); },
  'bola-disco': (p, _l, f) => { p.rect(8, 0, 1, 3, IRON_L); p.disc(8, 8, 5, 5, 0xcfd8e8); for (let y = 3; y < 14; y += 2) for (let x = 3; x < 14; x += 2) if (((x - 8) / 5) ** 2 + ((y - 8) / 5) ** 2 <= 1) p.px(x, y, [0xffffff, 0xff8ac8, 0x8ad8ff, 0xffe27a][(x + y + f) % 4]!); p.px(15, 3 + f, WHITE); p.px(1, 10 - f, WHITE); },
  rede: (p) => { p.rect(1, 2, 2, 13, WOOD_D); p.rect(13, 2, 2, 13, WOOD_D); for (let x = 3; x < 13; x++) { const y = 6 + Math.round(((x - 8) / 5) ** 2 * 3); p.rect(x, y, 1, 3, x % 2 ? 0xe8a03a : 0xc8802a); } p.px(3, 5, 0xe8a03a); p.px(12, 5, 0xe8a03a); },
  'ping-pong': (p) => { p.rect(1, 6, 14, 4, 0x2f7fa8); p.rect(1, 6, 14, 1, 0x4a9fc8); p.rect(8, 4, 1, 6, WHITE); p.rect(2, 10, 2, 5, IRON); p.rect(12, 10, 2, 5, IRON); p.px(4, 5, WHITE); p.px(11, 5, 0xffd84a); },
  bandeirinhas: (p) => { p.rect(0, 3, 16, 1, 0x4a3a28); for (let x = 1; x < 16; x += 3) p.tri(x + 1, 8, x - 0, x + 2, 4, [RED, 0xffd84a, BLUE, GREEN][((x - 1) / 3) % 4]!); p.rect(0, 2, 1, 13, WOOD_D); p.rect(15, 2, 1, 13, WOOD_D); },
  fossil: (p) => { p.rect(2, 10, 12, 5, STONE); p.rect(2, 10, 12, 1, STONE_L); p.disc(8, 7, 6, 6, 0xc8b898); p.disc(8, 7, 4, 4, 0xe0d4b4); p.disc(8, 7, 2, 2, 0xc8b898); p.disc(8, 7, 0.7, 0.7, 0x8a7a5a); },
  ovo: (p, _l, f) => { p.disc(8 + (f % 2), 9, 5, 6, 0xf6f0d8); p.disc(6 + (f % 2), 7, 1.5, 1.5, 0xffffff); for (const [x, y, c] of [[9, 8, GREEN], [7, 11, RED], [10, 11, GREEN]] as const) p.rect(x + (f % 2), y, 2, 2, c); },
  luminaria: (p, lit) => { p.rect(7, 6, 2, 9, 0x4a4a52); p.rect(5, 13, 6, 2, 0x4a4a52); p.rect(5, 1, 6, 6, lit ? 0xffe27a : 0xc8b070); p.rect(6, 2, 4, 4, lit ? 0xfff6c0 : 0xe0d098); },
  abajur: (p, lit) => { p.rect(4, 3, 8, 5, lit ? 0xfff0a0 : 0xf2e2a0); p.rect(4, 3, 8, 1, WHITE); p.rect(7, 8, 2, 5, IRON); p.rect(5, 13, 6, 2, IRON); },
  poste: (p, lit) => { p.rect(7, 3, 2, 12, IRON); p.rect(5, 14, 6, 1, IRON); p.rect(5, 0, 6, 4, IRON_L); p.rect(6, 1, 4, 2, lit ? 0xfff6c0 : 0xd0d4dc); },
  lanterna: (p, lit) => { p.rect(7, 0, 2, 2, DARK); p.disc(8, 7, 5, 5, lit ? 0xf87050 : RED); for (const y of [4, 7, 10]) p.rect(4, y, 9, 1, 0xa83228); p.rect(6, 12, 4, 2, DARK); },
  fogueira: (p, _l, f) => { p.rect(3, 12, 10, 2, WOOD_D); p.rect(5, 11, 6, 2, WOOD); for (const x of [2, 4, 11, 13]) p.disc(x, 13.5, 1.5, 1.2, STONE); p.disc(8, 8 - (f % 2), 3 - (f === 1 ? 0.5 : 0), 4, 0xf06048); p.disc(8, 9, 2, 2.5 + (f % 3 === 2 ? 1 : 0), 0xffa028); p.disc(8, 10, 1, 1.6, 0xffe27a); },
  tocha: (p, _l, f) => { p.rect(7, 7, 2, 8, WOOD_D); p.rect(6, 6, 4, 2, 0x4a3a28); p.disc(8, 4, 2.2 + (f % 3 === 1 ? 0.6 : 0), 3.2 + (f % 3) * 0.7, 0xf06048); p.disc(8, 4.5, 1.2, 2, 0xffe27a); },
  'pisca-pisca': (p, _l, f) => { p.rect(0, 3, 16, 1, DARK); for (let x = 1; x < 16; x += 3) { p.rect(x, 4, 1, 1, DARK); p.rect(x - 0, 5, 2, 2, [0xff5a5a, 0xffe27a, 0x5aff8a, 0x5ab8ff][((x - 1) / 3 + f) % 4]!); } p.rect(0, 2, 1, 13, WOOD_D); p.rect(15, 2, 1, 13, WOOD_D); },
  'lampiao-cristal': (p, lit, f) => { p.rect(7, 9, 2, 5, IRON); p.rect(5, 14, 6, 1, IRON); p.tri(8, 1, 4, 12, 9, lit ? 0xc8f8ff : 0x8adaf0); p.tri(8, 3, 6, 10, 8, WHITE); p.px(3 + (f % 2) * 9, 4 + (f % 2) * 3, WHITE); },
  fonte: (p, _l, f) => { p.disc(8, 11, 7, 4, STONE); p.disc(8, 10.5, 5.5, 2.6, BLUE); p.rect(7, 3, 2, 8, STONE); for (const [x, y] of (f % 2 ? [[5, 4], [11, 5], [8, 1]] : [[6, 5], [10, 4], [8, 2]]) as [number, number][]) p.px(x, y, 0x9cd0ff); },
  placa: (p) => { p.rect(7, 9, 2, 6, LEG); p.rect(2, 2, 12, 8, WOOD); p.rect(2, 2, 12, 1, WOOD_L); p.rect(4, 4, 8, 1, LEG); p.rect(4, 6, 6, 1, LEG); },
  banco: (p) => { p.rect(0, 4, 16, 2, WOOD); p.rect(0, 8, 16, 2, WOOD); p.rect(1, 10, 2, 5, IRON); p.rect(13, 10, 2, 5, IRON); p.rect(1, 4, 1, 6, IRON); p.rect(14, 4, 1, 6, IRON); },
  balanco: (p, _l, f) => { p.rect(1, 0, 14, 2, WOOD_D); p.rect(1, 0, 2, 15, WOOD_D); p.rect(13, 0, 2, 15, WOOD_D); const o = f % 2 ? 1 : -1; p.line(5, 2, 5 + o, 11, 0x8a8a8a); p.line(10, 2, 10 + o, 11, 0x8a8a8a); p.rect(4 + o, 11, 8, 2, RED); },
  escorregador: (p) => { p.rect(1, 3, 2, 12, IRON); p.rect(1, 3, 5, 2, IRON_L); for (let i = 0; i < 10; i++) p.rect(5 + i, 4 + i, 2, 2, 0xf2c84a); p.rect(1, 7, 3, 1, IRON_L); p.rect(1, 11, 3, 1, IRON_L); },
  'guarda-sol': (p) => { p.disc(8, 5, 7, 4, RED); for (const x of [3, 8, 13]) p.rect(x - 1, 2, 2, 6, WHITE); p.rect(7, 8, 2, 7, 0x8a8a8a); },
  churrasqueira: (p, _l, f) => { p.disc(8, 7, 6, 3, DARK); p.rect(3, 6, 10, 1, IRON_L); p.rect(4, 9, 2, 6, IRON); p.rect(10, 9, 2, 6, IRON); p.px(6, 5, 0xf06048); p.px(10, 5, 0xffd84a); if (f % 2) { p.px(8, 3, 0xcfd2da); p.px(9, 2, 0xcfd2da); p.px(7, 4, 0xcfd2da); } },
  correio: (p) => { p.rect(7, 8, 2, 7, LEG); p.rect(3, 3, 10, 6, CLOTH); p.disc(8, 4, 5, 2, CLOTH); p.rect(12, 2, 1, 4, RED); p.rect(12, 2, 3, 2, RED); },
  espantalho: (p) => { p.rect(7, 5, 2, 10, WOOD_D); p.rect(2, 7, 12, 2, WOOD_D); p.disc(8, 3, 3, 3, 0xf2e2a0); p.rect(4, 0, 8, 2, 0xd8b060); p.rect(5, 8, 6, 4, 0x6a8ad8); p.px(7, 3, DARK); p.px(9, 3, DARK); },
  poco: (p) => { p.rect(2, 8, 12, 7, STONE); p.rect(2, 8, 12, 2, STONE_L); p.rect(3, 1, 2, 8, WOOD_D); p.rect(11, 1, 2, 8, WOOD_D); p.rect(2, 0, 12, 2, RED); p.rect(7, 2, 1, 5, 0x8a8a8a); p.rect(6, 6, 3, 2, WOOD); },
  bonsai: (p) => { p.rect(4, 11, 8, 4, 0x3a5ad8); p.rect(7, 6, 2, 5, WOOD_D); p.disc(5, 6, 3, 2, GREEN); p.disc(11, 5, 3, 2, GREEN); p.disc(8, 3, 3, 2, GREEN_D); },
  cogumelo: (p) => { p.rect(6, 8, 4, 7, 0xf1e6c8); p.disc(8, 6, 7, 5, RED); for (const [x, y] of [[4, 5], [9, 3], [11, 7], [6, 8]] as const) p.rect(x, y, 2, 2, WHITE); },
  'abobora-lanterna': (p, lit) => { p.disc(8, 9, 7, 5.5, ORANGE); p.rect(7, 2, 2, 3, GREEN_D); p.rect(4, 7, 2, 2, lit ? 0xffe27a : 0x5a2a0a); p.rect(10, 7, 2, 2, lit ? 0xffe27a : 0x5a2a0a); p.rect(5, 11, 6, 1, lit ? 0xffe27a : 0x5a2a0a); },
  girassois: (p) => { p.rect(1, 12, 14, 3, WOOD); for (const x of [4, 8, 12]) { p.rect(x, 5, 1, 7, GREEN_D); p.disc(x, 4, 2.5, 2.5, 0xffd84a); p.px(x, 4, 0x6a3a1a); } },
  cerca: (p) => { p.rect(2, 4, 2, 11, WOOD_L); p.rect(12, 4, 2, 11, WOOD_L); p.rect(0, 6, 16, 2, WOOD); p.rect(0, 11, 16, 2, WOOD); },
  'cerca-branca': (p) => { for (const x of [1, 4, 7, 10, 13]) { p.rect(x, 4, 2, 11, WHITE); p.px(x, 3, WHITE); p.px(x + 1, 3, WHITE); } p.rect(0, 7, 16, 1, 0xd8dce4); p.rect(0, 11, 16, 1, 0xd8dce4); },
  'cerca-pedra': (p) => { for (const [x, y, w] of [[0, 8, 5], [5, 8, 5], [10, 8, 6], [2, 11, 6], [8, 11, 6], [0, 14, 4]] as const) { p.rect(x, y, w, 3, (x + y) % 2 ? STONE : STONE_L); p.rect(x, y + 2, w, 1, 0x7a766e); } },
  'cerca-viva': (p) => { p.disc(8, 10, 8, 5, GREEN_D); p.disc(5, 8, 4, 3.5, GREEN); p.disc(11, 9, 4, 3.5, GREEN); p.disc(8, 7, 3, 2.5, GREEN_L); p.px(4, 7, PINK); p.px(12, 9, PINK); },
  topiaria: (p) => { p.rect(5, 12, 6, 3, 0xc8643c); p.rect(7, 10, 2, 3, WOOD_D); p.disc(8, 8, 5, 3, GREEN); p.disc(8, 4, 3.5, 3, GREEN_L); p.disc(8, 1.5, 1.5, 1.5, GREEN); p.px(6, 8, GREEN_D); p.px(10, 7, GREEN_D); },
  laguinho: (p, _l, f) => { p.disc(8, 10, 7.5, 4.5, STONE); p.disc(8, 10, 6.5, 3.5, BLUE); p.disc(8, 10, 5, 2.5, 0x6aa8f0); p.ring(8 + (f - 1) * 1, 11, 2.5 + f * 0.6, 1.2 + f * 0.3, 0xcfe8ff); p.rect(5 + f, 8, 3, 2, 0xffd84a); p.px(5 + f, 8, ORANGE); p.px(5 + f, 7, 0xffd84a); },
  'cesta-piquenique': (p) => { p.rect(0, 10, 16, 5, WHITE); for (let y = 10; y < 15; y += 2) for (let x = (y / 2) % 2 ? 0 : 2; x < 16; x += 4) p.rect(x, y, 2, 2, RED); p.disc(8, 8, 5, 3, WOOD_L); p.rect(3, 8, 10, 2, WOOD); p.ring(8, 6, 4, 3, WOOD_D); p.px(6, 9, RED); p.px(10, 9, 0xffd84a); },
  tenda: (p) => { p.tri(8, 1, 0, 15, 14, 0xe8a03a); p.tri(8, 1, 6, 10, 14, 0xc8802a); p.tri(8, 6, 6, 10, 14, DARK); p.rect(7, 0, 2, 2, 0x4a3a28); p.rect(0, 14, 16, 1, 0x8a5a2e); },
  estufa: (p) => { p.rect(1, 5, 14, 10, 0xc8f0e0); p.tri(8, 1, 0, 15, 5, 0xb0e0d0); for (const x of [1, 5, 10, 14]) p.rect(x, 4, 1, 11, WHITE); p.rect(1, 9, 14, 1, WHITE); p.rect(0, 14, 16, 1, IRON_L); for (const [x, y] of [[3, 11], [7, 12], [12, 11]] as const) p.rect(x, y, 2, 2, GREEN); p.px(7, 11, RED); },
  'carrinho-sorvete': (p) => { p.rect(2, 9, 12, 4, PINK); p.rect(2, 9, 12, 1, WHITE); p.disc(8, 5, 7.5, 3, WHITE); for (const x of [2, 6, 10]) p.rect(x, 3, 2, 5, RED); p.rect(8, 2, 1, 8, 0x8a8a8a); p.disc(4, 14, 2, 2, DARK); p.disc(12, 14, 2, 2, DARK); p.rect(5, 6, 1, 2, ORANGE); },
  'barraca-suco': (p) => { p.rect(1, 8, 14, 7, WOOD); p.rect(1, 8, 14, 1, WOOD_L); for (let x = 0; x < 16; x += 4) { p.rect(x, 2, 2, 5, RED); p.rect(x + 2, 2, 2, 5, WHITE); } p.rect(0, 7, 16, 1, 0xa83228); for (const [x, c] of [[3, ORANGE], [7, 0xe84a8a], [11, 0x8ae848]] as const) { p.rect(x, 9, 2, 3, c); p.rect(x, 9, 2, 1, WHITE); } },
  bicicleta: (p) => { p.ring(4, 11, 3.2, 3.2, DARK); p.ring(12, 11, 3.2, 3.2, DARK); p.line(4, 11, 8, 6, RED); p.line(8, 6, 12, 11, RED); p.line(4, 11, 8, 11, RED); p.line(8, 11, 8, 6, RED); p.line(6, 5, 9, 5, DARK); p.line(12, 11, 11, 5, IRON); p.line(10, 4, 12, 4, DARK); },
  skate: (p) => { p.rect(2, 10, 12, 2, 0xe8503a); p.rect(2, 10, 12, 1, 0xff8a6a); p.disc(4, 13, 1.2, 1.2, DARK); p.disc(12, 13, 1.2, 1.2, DARK); p.px(7, 11, WHITE); p.px(8, 11, WHITE); },
  pokebola: (p) => { p.disc(8, 8, 7, 7, WHITE); for (let y = 1; y < 8; y++) for (let x = 1; x < 16; x++) if (((x - 8) / 7) ** 2 + ((y - 8) / 7) ** 2 <= 1) p.px(x, y, RED); p.rect(1, 7, 14, 2, DARK); p.disc(8, 8, 2.5, 2.5, DARK); p.disc(8, 8, 1.4, 1.4, WHITE); },
  'cama-poke': (p) => { p.disc(8, 10, 7, 5, 0xe86aa0); p.disc(8, 10, 5, 3, 0xf8c8dc); p.disc(6, 9, 1.5, 1, WHITE); },
  trofeu: (p) => { p.rect(4, 2, 8, 6, GOLD); p.rect(2, 3, 2, 3, GOLD); p.rect(12, 3, 2, 3, GOLD); p.rect(7, 8, 2, 4, GOLD); p.rect(4, 12, 8, 3, WOOD_D); p.px(6, 3, 0xfff6c0); },
  pelucia: (p) => { p.disc(8, 9, 6, 6, WHITE); for (let y = 3; y < 9; y++) for (let x = 2; x < 15; x++) if (((x - 8) / 6) ** 2 + ((y - 9) / 6) ** 2 <= 1) p.px(x, y, RED); p.rect(2, 8, 12, 1, DARK); p.disc(8, 9, 1.5, 1.5, DARK); p.px(5, 7, 0x1a1a24); p.px(11, 7, 0x1a1a24); },
  totem: (p) => { p.rect(5, 1, 6, 14, WOOD_D); for (const [y, c] of [[2, 0x8a8070], [5, GREEN], [8, BLUE], [11, GOLD]] as const) p.rect(6, y, 4, 2, c); },
  comedouro: (p) => { p.rect(2, 9, 12, 5, WOOD); p.rect(3, 9, 10, 2, WOOD_D); for (const x of [4, 7, 10]) p.disc(x + 1, 8, 1.5, 1.2, 0x4a6ae8); },
  'caixa-areia': (p) => { p.rect(0, 8, 16, 7, WOOD); p.rect(1, 9, 14, 5, 0xf0dca0); p.rect(0, 8, 16, 1, WOOD_L); p.rect(2, 10, 4, 1, 0xd8c080); p.tri(11, 5, 9, 13, 9, 0xe0c080); p.rect(10, 7, 2, 2, 0xd8b060); p.rect(3, 6, 3, 3, RED); p.rect(3, 6, 3, 1, 0xa83228); },
  'cama-elastica': (p, _l, f) => { p.ring(8, 10, 7, 3, IRON); p.disc(8, 10 - (f % 2), 6, 2.5, DARK); p.rect(2, 10, 1, 5, IRON); p.rect(13, 10, 1, 5, IRON); p.rect(7, 12, 2, 3, IRON); },
  gangorra: (p, _l, f) => { p.tri(8, 9, 5, 11, 15, IRON); for (let x = 1; x < 15; x++) p.rect(x, Math.round(10 + (f ? 1 : -1) * ((x - 8) / 7) * 2), 1, 2, x % 3 ? 0xf2c84a : 0xd8a828); p.rect(1, f ? 9 : 12, 2, 2, RED); p.rect(13, f ? 12 : 9, 2, 2, RED); },
  'bola-praia': (p) => { p.disc(8, 9, 6, 6, WHITE); for (let y = 3; y < 15; y++) for (let x = 2; x < 15; x++) { if (((x - 8) / 6) ** 2 + ((y - 9) / 6) ** 2 > 1) continue; const a = Math.atan2(y - 9, x - 8); p.px(x, y, [RED, WHITE, BLUE, 0xffd84a][Math.floor(((a + Math.PI) / (Math.PI * 2)) * 4) % 4]!); } p.disc(8, 9, 1, 1, WHITE); },
  casinha: (p) => { p.rect(2, 8, 12, 7, 0xd2a66c); p.tri(8, 1, 0, 15, 8, 0xd8463c); p.tri(8, 3, 4, 11, 8, 0xe86a5a); p.disc(8, 13, 2, 2.2, 0x3a2a1a); p.rect(6, 13, 4, 2, 0x3a2a1a); p.rect(3, 9, 2, 2, GLASS); p.rect(11, 9, 2, 2, GLASS); },
  'roda-giratoria': (p, _l, f) => { p.ring(8, 8, 6.5, 6.5, IRON_L); p.ring(8, 8, 5.5, 5.5, IRON); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + f * 0.4; p.line(8, 8, 8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, IRON_L); } p.rect(7, 13, 2, 2, IRON); p.rect(4, 14, 8, 1, IRON); },
  'pelucia-gigante': (p) => { p.disc(4, 3, 2.5, 2.5, 0xb88858); p.disc(12, 3, 2.5, 2.5, 0xb88858); p.disc(8, 8, 6.5, 6, 0xd8a870); p.disc(8, 10, 3.5, 3, 0xf0d0a0); p.px(6, 7, DARK); p.px(10, 7, DARK); p.rect(7, 9, 2, 1, DARK); p.rect(6, 13, 4, 2, 0xe8503a); p.px(8, 13, GOLD); },
};

/** Móveis altos (16×32): o pé fica na linha de baixo e a copa sobe um bloco. */
const TALL: Record<string, Furn> = {
  moinho: (p, _l, f) => { p.tri(8, 12, 4, 12, 31, 0xe8d8c0); p.tri(8, 12, 7, 9, 31, 0xd8c8a8); p.tri(8, 6, 3, 13, 12, 0xc8643c); p.rect(6, 24, 4, 7, 0x6a4a28); p.rect(7, 16, 2, 3, GLASS); for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + (f * Math.PI) / 8; p.line(8, 11, 8 + Math.cos(a) * 9, 11 + Math.sin(a) * 9, WHITE, 2); } p.disc(8, 11, 1.5, 1.5, WOOD_D); },
  gazebo: (p) => { p.tri(8, 2, 0, 15, 13, 0xd8463c); p.tri(8, 4, 3, 12, 13, 0xe86a5a); p.rect(0, 13, 16, 2, 0xa83228); for (const x of [1, 13]) p.rect(x, 15, 2, 14, WHITE); p.rect(0, 29, 16, 2, WOOD_D); p.rect(0, 27, 16, 2, WOOD_L); for (const x of [3, 5, 9, 11]) p.rect(x, 21, 1, 6, 0xd8dce4); p.rect(2, 21, 12, 1, WHITE); for (const [x, y] of [[2, 16], [13, 18], [3, 24], [12, 22]] as const) p.px(x, y, GREEN); p.px(2, 17, PINK); p.px(13, 19, PINK); },
  cerejeira: (p, _l, f) => { p.rect(7, 16, 3, 15, 0x6a4a38); p.rect(7, 16, 1, 15, 0x8a6a52); p.rect(5, 22, 2, 1, 0x6a4a38); p.rect(10, 20, 2, 1, 0x6a4a38); p.disc(8, 9, 8, 7, 0xf8a8c8); p.disc(5, 7, 4, 4, 0xfcc8dc); p.disc(11, 12, 4, 3, 0xe88aa8); p.disc(10, 5, 3, 2.5, 0xfcc8dc); for (const [x, y] of [[3, 16 + f * 2], [13, 20 - f], [9, 25 + f]] as const) p.px(x, y, 0xfcc8dc); },
  palmeira: (p, _l, f) => { for (let y = 12; y < 31; y++) p.rect(7 + Math.round(Math.sin((y - 12) / 6) * 1.2), y, 3, 1, y % 3 ? 0x9a7a52 : 0x7a5a3a); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3 + (f ? 0.12 : 0); p.line(9, 11, 9 + Math.cos(a) * 8, 11 + Math.sin(a) * 4 + Math.abs(Math.cos(a)) * 3, k % 2 ? GREEN : GREEN_D, 2); } p.disc(8, 12, 1.4, 1.4, 0x6a4a28); p.disc(10, 13, 1.3, 1.3, 0x6a4a28); },
  pinheirinho: (p, lit, f) => { p.rect(7, 27, 2, 4, WOOD_D); p.tri(8, 5, 4, 12, 13, GREEN); p.tri(8, 10, 2, 14, 21, GREEN_D); p.tri(8, 16, 0, 16, 28, GREEN); p.px(7, 3, GOLD); p.rect(7, 3, 2, 3, GOLD); p.px(8, 2, 0xfff6c0); for (const [x, y, c] of [[6, 10, RED], [9, 14, 0xffd84a], [5, 19, BLUE], [11, 20, PINK], [8, 24, RED], [3, 26, 0xffd84a], [13, 26, BLUE]] as const) p.rect(x, y, 2, 2, lit ? [0xff5a5a, 0xffe27a, 0x5ab8ff, 0xff8ac8][(x + f) % 4]! : c); },
  estatua: (p) => { p.rect(3, 25, 10, 6, STONE); p.rect(3, 25, 10, 1, STONE_L); p.rect(4, 23, 8, 2, 0x8a867e); p.disc(8, 8, 3, 3, STONE_L); p.rect(5, 11, 6, 11, STONE); p.rect(5, 11, 2, 11, STONE_L); p.rect(11, 6, 2, 8, STONE); p.disc(12, 5, 2.2, 2.2, 0xb8c0cc); p.rect(5, 16, 2, 6, 0x7a766e); p.rect(9, 22, 2, 1, 0x6e6a64); },
  'estatua-dourada': (p) => { p.rect(3, 25, 10, 6, 0x6a4a28); p.rect(3, 25, 10, 1, 0x9a7a48); p.rect(4, 23, 8, 2, 0x8a6a38); p.disc(8, 8, 3, 3, 0xffe27a); p.rect(5, 11, 6, 11, GOLD); p.rect(5, 11, 2, 11, 0xfff0a0); p.rect(11, 6, 2, 8, GOLD); p.disc(12, 5, 2.2, 2.2, RED); p.rect(5, 16, 2, 6, 0xc89a2a); p.px(6, 7, WHITE); p.px(12, 4, WHITE); },
  mastro: (p, _l, f) => { p.rect(3, 1, 2, 30, IRON_L); p.rect(3, 1, 1, 30, WHITE); p.disc(4, 1, 1.5, 1.5, GOLD); for (let x = 0; x < 9; x++) { const wave = Math.round(Math.sin(x * 0.8 + f * 1.6) * 1); p.rect(5 + x, 3 + wave, 1, 7, x < 4 ? BLUE : 0xe8503a); } p.px(7, 6 + (f ? 0 : 0), GOLD); p.rect(1, 29, 6, 2, STONE); },
};

const MATERIAL_ICONS: Record<string, Draw> = {
  madeira: (p) => { p.rect(2, 5, 12, 6, WOOD); p.disc(13, 8, 2, 3, WOOD_L); p.rect(2, 7, 10, 1, WOOD_D); },
  pedra: (p) => { p.disc(8, 9, 6, 5, STONE); p.disc(6, 7, 3, 2, STONE_L); },
  oran: (p) => { p.disc(8, 9, 5, 5, 0x4a6ae8); p.disc(6.5, 7.5, 1.5, 1.5, 0x9ab8ff); p.rect(7, 2, 2, 3, GREEN_D); },
  pecha: (p) => { p.disc(8, 9, 5, 5, PINK); p.disc(6.5, 7.5, 1.5, 1.5, 0xffe0ec); p.rect(7, 2, 2, 3, GREEN_D); },
  flor: (p) => { p.rect(7, 8, 2, 7, GREEN); for (const [dx, dy] of [[0, -3], [-3, 0], [3, 0], [0, 3]] as const) p.disc(8 + dx, 6 + dy, 2, 2, 0xf06048); p.disc(8, 6, 1.5, 1.5, 0xffd84a); },
  concha: (p) => { p.disc(8, 9, 6, 5, 0xf8c8b0); for (let x = 4; x < 13; x += 2) p.rect(x, 6, 1, 7, 0xe8a088); },
  tecido: (p) => { p.rect(2, 4, 12, 9, CLOTH); p.rect(2, 4, 12, 2, 0x7aa8f0); p.rect(4, 8, 8, 1, 0x3a6ad8); },
  ferro: (p) => { p.rect(2, 6, 12, 6, IRON); p.rect(3, 6, 10, 2, IRON_L); },
  areia: (p) => { p.disc(8, 11, 7, 4, 0xf0dca0); p.disc(8, 9, 4.5, 3, 0xf6e8b8); for (const [x, y] of [[4, 11], [10, 12], [7, 9]] as const) p.px(x, y, 0xd8c080); },
  argila: (p) => { p.disc(8, 10, 6, 4.5, 0xc8703c); p.disc(6.5, 8.5, 3, 2, 0xe08a52); p.px(10, 11, 0xa85a2c); p.px(5, 11, 0xa85a2c); },
  mel: (p) => { p.rect(4, 5, 8, 9, 0xe8a828); p.rect(5, 6, 6, 7, 0xf8c848); p.rect(3, 3, 10, 3, 0x8a5a2e); p.rect(4, 3, 8, 1, 0xa8743e); p.px(6, 8, WHITE); },
  champignon: (p) => { p.rect(6, 8, 4, 6, 0xf1e6c8); p.disc(8, 7, 6, 4, 0xb87a48); p.disc(6.5, 5.5, 2.5, 1.5, 0xd8a070); p.px(10, 7, 0xf1e6c8); },
  pena: (p) => { p.line(3, 13, 12, 3, 0xe8edf4, 3); p.line(3, 13, 13, 2, IRON_L); for (let k = 0; k < 4; k++) p.line(5 + k * 2, 11 - k * 2, 9 + k * 2, 11 - k * 2 + 1, 0xcfd8e8); },
  cristal: (p) => { p.tri(8, 1, 4, 12, 10, 0x6ae8f0); p.tri(8, 9, 4, 12, 14, 0x3ab8e0); p.tri(8, 3, 6, 9, 9, 0xc8fcff); p.px(7, 5, WHITE); },
  ouro: (p) => { p.disc(8, 9, 6, 4.5, GOLD); p.disc(6, 7.5, 3, 2, 0xfff0a0); p.disc(11, 11, 3, 2, 0xc89a2a); p.px(5, 7, WHITE); },
  la: (p) => { for (const [x, y] of [[5, 8], [8, 6], [11, 8], [6, 11], [10, 11], [8, 9]] as const) p.disc(x, y, 3, 3, 0xf6f6f6); p.px(6, 6, 0xdce4ee); p.px(10, 10, 0xdce4ee); },
  peixe: (p) => { p.disc(7, 8, 5, 3.5, 0x6aa8e8); p.tri(14, 8, 11, 14, 4, 0x4a88c8); p.tri(14, 8, 11, 14, 12, 0x4a88c8); p.disc(7, 10, 4, 1.5, 0xcfe8ff); p.px(4, 7, DARK); p.px(8, 6, 0x8ac8ff); },
  dourado: (p) => { p.disc(7, 8, 5, 3.8, ORANGE); p.tri(14, 8, 11, 15, 3, 0xffd84a); p.tri(14, 8, 11, 15, 13, 0xffd84a); p.disc(7, 5, 2, 1.5, 0xffd84a); p.px(4, 7, DARK); p.px(7, 8, 0xffe27a); p.px(9, 9, 0xffe27a); },
  estrela: (p) => { for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; p.line(8, 8, 8 + Math.cos(a) * 6.5, 8 + Math.sin(a) * 6.5, 0xe86a3a, 3); } p.disc(8, 8, 2, 2, 0xf88a5a); p.px(8, 4, 0xffd0a0); },
  perola: (p) => { p.disc(8, 11, 7, 4, 0xe8d8e8); for (let x = 2; x < 15; x += 2) p.rect(x, 8, 1, 6, 0xc8b0c8); p.disc(8, 8, 3, 3, WHITE); p.px(7, 7, 0xe8f0ff); p.px(9, 9, 0xdcc8e8); },
  alga: (p) => { for (const [x, o] of [[4, 0], [8, 2], [12, 1]] as const) for (let y = 2 + o; y < 15; y++) p.rect(x + Math.round(Math.sin(y * 0.8 + x) * 1), y, 2, 1, y % 3 ? GREEN : GREEN_D); },
  bota: (p) => { p.rect(5, 2, 5, 9, 0x8a5a2e); p.rect(5, 2, 5, 2, 0xa8743e); p.rect(4, 10, 10, 4, 0x6a4a28); p.rect(4, 13, 10, 1, DARK); p.px(6, 6, 0xc89a5a); p.px(9, 7, 0x5a3a1e); },
  tabua: (p) => { p.rect(1, 3, 14, 3, WOOD_L); p.rect(1, 7, 14, 3, WOOD); p.rect(1, 11, 14, 3, WOOD_D); for (const [x, y] of [[4, 4], [11, 8], [7, 12]] as const) p.px(x, y, LEG); },
  tijolo: (p) => { for (const [x, y, w] of [[1, 3, 7], [9, 3, 6], [1, 7, 3], [5, 7, 7], [13, 7, 2], [1, 11, 7], [9, 11, 6]] as const) { p.rect(x, y, w, 3, 0xc8503c); p.rect(x, y, w, 1, 0xe0705a); } },
  vidro: (p) => { p.rect(3, 2, 10, 12, 0xcfeeff); p.rect(3, 2, 10, 1, WHITE); p.rect(4, 3, 8, 10, 0xa8dcf8); p.line(5, 11, 9, 4, WHITE); p.line(8, 12, 11, 7, 0xe8f8ff); },
  girassol: (p) => { p.rect(7, 9, 2, 6, GREEN); p.disc(8, 6, 5, 5, 0xffd84a); p.disc(8, 6, 2.5, 2.5, 0x6a3a1a); },
  abobora: (p) => { p.disc(8, 9, 7, 5.5, ORANGE); p.rect(7, 2, 2, 3, GREEN_D); p.rect(5, 5, 1, 9, 0xd8701a); p.rect(10, 5, 1, 9, 0xd8701a); },
  tomate: (p) => { p.disc(8, 9, 5.5, 5, 0xe84a3a); p.rect(6, 3, 4, 2, GREEN); p.px(6, 7, 0xff9a8a); },
  morango: (p) => { p.disc(8, 9, 5, 5.5, 0xe8344a); p.rect(5, 3, 6, 2, GREEN); for (const [x, y] of [[6, 8], [9, 10], [7, 12], [10, 7]] as const) p.px(x, y, 0xffe27a); },
  cenoura: (p) => { p.tri(8, 15, 4, 12, 5, ORANGE); p.tri(8, 14, 6, 9, 6, 0xffa850); for (const x of [6, 8, 10]) p.rect(x, 1, 1, 4, GREEN); p.rect(5, 8, 3, 1, 0xd8701a); p.rect(8, 11, 3, 1, 0xd8701a); },
  milho: (p) => { p.disc(8, 8, 3, 6.5, 0xffd84a); for (let y = 3; y < 13; y += 2) for (let x = 6; x < 11; x += 2) p.px(x, y, 0xffe88a); p.tri(3, 15, 3, 9, 6, GREEN); p.tri(13, 15, 7, 13, 6, GREEN_D); },
  uva: (p) => { for (const [x, y] of [[5, 7], [8, 6], [11, 7], [6, 10], [10, 10], [8, 13], [8, 9]] as const) { p.disc(x, y, 2.2, 2.2, 0x8a3ad8); p.px(x - 1, y - 1, 0xc88af0); } p.rect(8, 1, 1, 3, GREEN_D); p.rect(9, 2, 3, 2, GREEN); },
  melancia: (p) => { p.tri(8, 14, 0, 16, 5, GREEN_D); p.tri(8, 13, 1, 15, 5, 0xf8f0d0); p.tri(8, 12, 2, 14, 5, 0xe84a5a); for (const [x, y] of [[6, 8], [9, 9], [8, 6], [11, 7], [5, 7]] as const) p.px(x, y, DARK); },
  batata: (p) => { p.disc(8, 9, 6, 4.5, 0xc8a068); p.disc(6.5, 8, 3, 2, 0xe0be88); for (const [x, y] of [[5, 10], [10, 8], [9, 11]] as const) p.px(x, y, 0x8a6a38); },
  lavanda: (p) => { p.rect(8, 7, 1, 8, GREEN_D); p.rect(5, 9, 1, 6, GREEN); p.rect(11, 9, 1, 6, GREEN); for (const [x, y] of [[8, 1], [8, 3], [8, 5], [5, 4], [5, 6], [11, 4], [11, 6]] as const) p.rect(x - 1, y, 3, 2, 0x9a6ae8); p.px(8, 1, 0xc8a8f8); },
};

const FOOD_ICONS: Record<string, Draw> = {
  'suco-oran': (p) => { p.rect(4, 5, 8, 9, 0xdcf0ff); p.rect(5, 7, 6, 6, 0x4a6ae8); p.rect(5, 7, 6, 1, 0x9ab8ff); p.line(9, 1, 10, 6, 0xe8503a); p.disc(4, 5, 2, 1.5, ORANGE); },
  'suco-pecha': (p) => { p.rect(4, 5, 8, 9, 0xdcf0ff); p.rect(5, 7, 6, 6, 0xf28ab0); p.rect(5, 7, 6, 1, 0xffd0e0); p.line(9, 1, 10, 6, 0xe8503a); p.disc(4, 5, 2, 1.5, PINK); },
  salada: (p) => { p.disc(8, 10, 7, 4, 0xf6f6f6); p.disc(8, 9, 6, 3, GREEN); p.disc(8, 8, 4, 2, GREEN_L); p.disc(6, 8, 1.5, 1.2, 0xe84a3a); p.disc(10, 9, 1.5, 1.2, ORANGE); },
  'sopa-abobora': (p) => { p.disc(8, 10, 7, 4.5, 0xf6f6f6); p.disc(8, 9, 6, 3, ORANGE); p.disc(8, 8.5, 4, 1.8, 0xffa850); p.px(6, 3, 0xe8edf4); p.px(8, 2, 0xe8edf4); p.px(10, 4, 0xe8edf4); },
  'bolo-morango': (p) => { p.rect(2, 9, 12, 5, 0xf8e0c0); p.rect(2, 9, 12, 2, 0xf6f6f6); p.rect(3, 6, 10, 4, 0xf8a8c8); p.rect(3, 6, 10, 1, WHITE); p.disc(8, 5, 2, 2, 0xe8344a); p.px(8, 2, GREEN); p.px(5, 5, 0xe8344a); p.px(11, 5, 0xe8344a); },
  'torta-pecha': (p) => { p.tri(8, 4, 1, 15, 14, 0xe8b868); p.tri(8, 6, 4, 12, 13, 0xf28ab0); p.rect(1, 12, 14, 2, 0xc89048); p.px(7, 9, WHITE); p.px(9, 10, WHITE); p.px(6, 11, 0xe86a98); },
  'pao-mel': (p) => { p.disc(8, 9, 7, 5, 0xb87a38); p.disc(8, 7.5, 6, 3.5, 0xd89a48); p.disc(6, 6, 2.5, 1.5, 0xf0c878); p.px(10, 8, 0xf8d888); p.px(7, 10, 0x8a5a2e); },
  'peixe-grelhado': (p) => { p.disc(8, 11, 7.5, 3.5, WHITE); p.disc(7, 9, 5, 3, 0xd8985a); p.tri(13, 9, 11, 15, 6, 0xc8803a); p.tri(13, 9, 11, 15, 12, 0xc8803a); for (let x = 4; x < 11; x += 2) p.rect(x, 7, 1, 4, 0x8a5a2e); p.px(3, 8, DARK); p.rect(10, 5, 2, 1, GREEN); },
  espetinho: (p) => { p.line(1, 14, 14, 2, WOOD_D); for (const [x, y, c] of [[4, 11, 0xb87a48], [6, 9, 0xe84a3a], [8, 7, 0xb87a48], [10, 5, 0xe84a3a], [12, 3, 0xb87a48]] as const) p.disc(x, y, 2, 2, c); p.px(3, 10, 0xd8a070); },
  pipoca: (p) => { p.rect(3, 7, 10, 8, WHITE); for (let x = 3; x < 13; x += 4) p.rect(x, 7, 2, 8, RED); for (const [x, y] of [[4, 5], [7, 3], [10, 5], [6, 5], [9, 3], [12, 6], [3, 6]] as const) { p.disc(x, y, 2, 2, 0xfff6d0); p.px(x, y, 0xf8d878); } },
  geleia: (p) => { p.rect(4, 5, 8, 9, 0x8a3ad8); p.rect(5, 6, 6, 7, 0xb86af0); p.rect(3, 3, 10, 3, 0xe8d8b0); p.rect(4, 2, 8, 1, 0xa88850); p.rect(5, 8, 4, 3, 0xf6f6f6); p.px(6, 9, 0x8a3ad8); },
  'melancia-gelada': (p) => { p.tri(8, 13, 0, 16, 4, GREEN_D); p.tri(8, 12, 1, 15, 4, 0xf8f0d0); p.tri(8, 11, 2, 14, 4, 0xe84a5a); for (const [x, y] of [[6, 7], [9, 8], [8, 5]] as const) p.px(x, y, DARK); p.rect(10, 1, 3, 3, 0xcfeeff); p.px(11, 2, WHITE); },
  ensopado: (p) => { p.disc(8, 10, 7, 4.5, 0x6a4a38); p.rect(1, 8, 14, 2, 0x8a6a52); p.disc(8, 8, 6, 2, 0xa86a38); p.disc(6, 8, 1.5, 1.2, ORANGE); p.disc(10, 8, 1.5, 1.2, 0xc8a068); p.px(8, 3, 0xe8edf4); p.px(6, 2, 0xe8edf4); p.px(10, 2, 0xe8edf4); },
  'lanche-pokebola': (p) => { p.disc(8, 9, 7, 6, 0xe8b868); for (let y = 3; y < 9; y++) for (let x = 1; x < 16; x++) if (((x - 8) / 7) ** 2 + ((y - 9) / 6) ** 2 <= 1) p.px(x, y, RED); p.rect(1, 8, 14, 1, 0x8a5a2e); p.rect(2, 9, 12, 1, GREEN); p.rect(2, 10, 12, 1, 0xe84a3a); p.disc(8, 8, 2, 2, WHITE); p.disc(8, 8, 1, 1, DARK); },
};

const ACCESSORY_ICONS: Record<string, Draw> = {
  // Prêmios de conquistas (ver `rewards.ts`).
  'bone-treinador': (p) => { p.disc(8, 8, 5.5, 4.5, BLUE); p.rect(8, 9, 7, 2, 0x2f5fb8); p.rect(2, 9, 10, 1, 0x2f5fb8); p.disc(7, 6.5, 1.8, 1.8, WHITE); p.px(7, 6, RED); p.px(7, 7, RED); p.rect(5, 8, 1, 1, 0x7aa8f0); },
  'fita-chama': (p) => { p.rect(1, 8, 14, 3, RED); p.rect(1, 8, 14, 1, 0xf0705f); p.rect(13, 10, 2, 5, RED); p.rect(0, 11, 2, 3, 0xa83228); p.tri(8, 2, 5, 11, 8, ORANGE); p.tri(8, 4, 7, 9, 8, GOLD); },
  louros: (p) => { for (let i = 0; i < 5; i++) { const y = 4 + i * 2; p.disc(2 + i * 0.6, y, 1.8, 1.1, GREEN); p.disc(14 - i * 0.6, y, 1.8, 1.1, GREEN); } p.rect(3, 12, 10, 1, GREEN_D); p.px(1, 6, GREEN_L); p.px(14, 6, GREEN_L); p.disc(8, 11, 1.6, 1.6, GOLD); },
  'tiara-brilho': (p) => { p.rect(2, 10, 12, 2, 0xe6ecf4); p.rect(2, 10, 12, 1, WHITE); for (const [x, h, c] of [[4, 3, 0x6ac8e8], [8, 6, GOLD], [12, 3, 0xe86aa0]] as const) { p.rect(x - 1, 10 - h, 2, h, 0xe6ecf4); p.px(x - 1, 10 - h, c); p.px(x, 9 - h, WHITE); } p.px(8, 7, WHITE); },
  'tiara-coracoes': (p) => { p.rect(2, 11, 12, 2, 0xe86aa0); for (const x of [4, 8, 12]) { p.disc(x - 1, 8, 1.6, 1.6, RED); p.disc(x + 1, 8, 1.6, 1.6, RED); p.tri(x, 12, x - 3, x + 3, 9, RED); } p.px(3, 7, 0xff9a8a); p.px(7, 7, 0xff9a8a); p.px(11, 7, 0xff9a8a); },
  monoculo: (p) => { p.ring(10, 7, 3.4, 3.4, GOLD); p.ring(10, 7, 2.6, 2.6, 0xc89a2a); p.disc(10, 7, 2.4, 2.4, GLASS); p.px(9, 6, WHITE); p.px(10, 5, WHITE); p.line(10, 10, 6, 15, GOLD); p.px(5, 15, GOLD); },
  'oculos-estrela': (p) => { for (const cx of [4.5, 11.5]) { p.disc(cx, 8, 3.2, 3.2, GOLD); p.tri(cx, 4, cx - 1, cx + 1, 8, GOLD); p.tri(cx, 12, cx - 1, cx + 1, 8, GOLD); p.disc(cx, 8, 1.8, 1.8, 0xe86aa0); } p.rect(7, 7, 2, 1, GOLD); p.px(3, 7, WHITE); p.px(10, 7, WHITE); },
  'colar-estrela': (p) => { p.line(2, 2, 8, 9, GOLD); p.line(14, 2, 8, 9, GOLD); p.tri(8, 6, 4, 12, 11, GOLD); p.tri(8, 15, 4, 12, 10, GOLD); p.disc(8, 10, 2, 2, 0xfff0a0); p.px(8, 10, 0xc89a2a); },
  'laco-amizade': (p) => { p.tri(7, 8, 3, 8, 15, 0xa83228); p.tri(9, 8, 8, 13, 15, RED); p.disc(4.5, 6, 3.6, 3, RED); p.disc(11.5, 6, 3.6, 3, RED); p.disc(4.5, 5.5, 1.8, 1.2, 0xf0705f); p.disc(11.5, 5.5, 1.8, 1.2, 0xf0705f); p.disc(8, 6, 2, 2, 0xa83228); p.px(8, 5, 0xf0705f); },
  insignia: (p) => { p.rect(7, 0, 2, 4, IRON); p.disc(8, 9, 5.5, 5.5, GOLD); p.disc(8, 9, 4, 4, 0xfff0a0); p.tri(8, 5, 6, 10, 9, RED); p.tri(8, 13, 6, 10, 9, BLUE); p.px(8, 9, WHITE); p.ring(8, 9, 5.5, 5.5, 0xc89a2a); },
  'faixa-vencedor': (p) => { p.tri(2, 1, 1, 7, 6, RED); p.tri(14, 1, 9, 15, 6, RED); p.line(3, 4, 13, 14, RED, 3); p.line(3, 4, 13, 14, 0xf0705f, 1); p.disc(7, 9, 2, 2, GOLD); p.px(7, 9, 0xc89a2a); },
  'capa-estelar': (p) => { p.tri(8, 14, 1, 15, 3, 0x4a3a9a); p.rect(3, 2, 10, 2, 0x2f2370); p.rect(2, 4, 12, 3, 0x4a3a9a); p.rect(7, 4, 2, 10, 0x2f2370); p.rect(6, 1, 4, 2, GOLD); for (const [x, y] of [[4, 5], [11, 6], [5, 10], [10, 11], [8, 13]] as const) p.px(x, y, 0xfff0a0); },
  'capa-liga': (p) => { p.tri(8, 14, 1, 15, 3, GOLD); p.rect(3, 2, 10, 2, 0xc89a2a); p.rect(2, 4, 12, 3, GOLD); p.rect(7, 4, 2, 10, 0xc89a2a); p.rect(6, 1, 4, 2, RED); p.disc(8, 8, 2.2, 2.2, RED); p.disc(8, 8, 1, 1, WHITE); p.px(4, 5, 0xfff0a0); p.px(11, 6, 0xfff0a0); },
  // Torre de Sobrevivência (ver `rewards.ts`).
  'fita-torre': (p) => { p.rect(2, 7, 12, 3, 0x6ac8e8); p.rect(2, 7, 12, 1, 0xcfeeff); p.tri(2, 10, 0, 6, 15, 0x3a8ad8); p.tri(14, 10, 10, 16, 15, 0x3a8ad8); p.disc(8, 8, 1.6, 1.6, WHITE); p.px(8, 8, 0x3a8ad8); },
  'pin-treinador': (p) => { p.disc(8, 8, 5.5, 5.5, 0x4a6ae8); p.ring(8, 8, 5.5, 5.5, 0x2a3fa8); p.rect(5, 7, 6, 3, GOLD); p.px(5, 10, DARK); p.px(10, 10, DARK); p.px(8, 11, DARK); },
  'pin-chefao': (p) => { p.disc(8, 8, 6, 6, 0x2a1a3a); p.ring(8, 8, 6, 6, GOLD); p.disc(8, 8, 3.5, 3.5, RED); p.tri(8, 4, 5, 11, 10, GOLD); p.tri(8, 12, 5, 11, 7, GOLD); p.px(8, 8, WHITE); },
  'trofeu-torre': (p) => { p.rect(5, 1, 6, 7, GOLD); p.disc(5, 4, 1.5, 2, 0xc89a2a); p.disc(11, 4, 1.5, 2, 0xc89a2a); p.rect(6, 8, 4, 2, 0xc89a2a); p.rect(5, 10, 6, 2, 0xc89a2a); p.rect(4, 12, 8, 2, 0x8a5a2e); p.px(7, 4, 0xfff0a0); p.px(8, 3, WHITE); },
  'capa-sobrevivente': (p) => { p.tri(8, 14, 1, 15, 3, 0x2a3fa8); p.rect(3, 2, 10, 2, 0x1a2a7a); p.rect(2, 4, 12, 3, 0x2a3fa8); p.rect(7, 4, 2, 10, 0x1a2a7a); p.rect(5, 1, 6, 2, 0x6ac8e8); p.disc(8, 8, 2.4, 2.4, GOLD); p.px(8, 8, 0xfff0a0); for (const [x, y] of [[4, 10], [11, 11]] as const) p.px(x, y, 0x8ac8f8); },
  'chapeu-palha': (p) => { p.disc(8, 10, 7, 2.5, 0xe8c870); p.disc(8, 7, 4, 3, 0xe8c870); p.rect(4, 8, 8, 1, RED); p.disc(8, 5.5, 2, 1.2, 0xf6e098); },
  bone: (p) => { p.disc(8, 8, 5, 4, RED); p.rect(8, 9, 7, 2, 0xa82828); p.rect(3, 9, 10, 1, 0xa82828); p.px(7, 6, WHITE); p.px(8, 6, WHITE); },
  laco: (p) => { p.disc(4, 8, 3.5, 3, PINK); p.disc(12, 8, 3.5, 3, PINK); p.disc(8, 8, 2, 2, 0xe86aa0); p.px(4, 7, 0xffe0ec); p.px(12, 7, 0xffe0ec); },
  'coroa-flores': (p) => { p.rect(1, 9, 14, 2, GREEN); for (const [x, c] of [[2, 0xf06048], [6, 0xffd84a], [10, PINK], [14, WHITE]] as const) p.disc(x, 8, 1.8, 1.8, c); },
  cartola: (p) => { p.rect(4, 2, 8, 9, DARK); p.rect(1, 11, 14, 2, DARK); p.rect(4, 8, 8, 2, RED); p.rect(5, 3, 1, 5, 0x4a4a58); },
  tiara: (p) => { p.rect(2, 10, 12, 2, GOLD); for (const [x, h] of [[4, 3], [8, 5], [12, 3]] as const) p.rect(x - 1, 10 - h, 2, h, GOLD); p.px(8, 6, 0x6ac8e8); p.px(4, 8, PINK); p.px(12, 8, PINK); },
  gorro: (p) => { p.disc(8, 9, 6, 5, 0x3a8ad8); p.rect(2, 10, 12, 3, WHITE); p.disc(8, 3, 2, 2, WHITE); for (const x of [4, 7, 10]) p.px(x, 7, 0x8ac8f8); },
  'chapeu-bruxa': (p) => { p.disc(8, 12, 7.5, 2, 0x3a2a5a); p.tri(9, 1, 5, 12, 12, 0x4a3a7a); p.rect(5, 9, 6, 2, 0xd8463c); p.rect(9, 9, 1, 2, GOLD); p.tri(10, 1, 9, 11, 3, 0x4a3a7a); },
  'chapeu-festa': (p) => { p.tri(8, 2, 4, 12, 13, 0xe86aa0); for (let y = 5; y < 13; y += 3) p.rect(4 + (y - 2) / 4, y, 8 - (y - 2) / 2, 1, 0xffe27a); p.disc(8, 2, 1.8, 1.8, 0x6ac8e8); p.rect(3, 13, 10, 1, 0xb84a78); },
  'chapeu-chef': (p) => { p.disc(5, 5, 3, 3, WHITE); p.disc(8, 4, 3.5, 3.5, WHITE); p.disc(11, 5, 3, 3, WHITE); p.rect(4, 7, 8, 5, WHITE); p.rect(4, 11, 8, 2, 0xdce4ee); p.px(8, 3, 0xdce4ee); },
  'chapeu-cowboy': (p) => { p.disc(8, 11, 8, 2.5, 0x8a5a2e); p.rect(1, 9, 3, 2, 0x8a5a2e); p.rect(12, 9, 3, 2, 0x8a5a2e); p.rect(4, 4, 8, 7, 0xa8743e); p.rect(5, 3, 6, 2, 0xa8743e); p.rect(4, 9, 8, 1, 0x4a2e18); p.px(6, 5, 0xc89a5a); },
  capacete: (p) => { p.disc(8, 9, 6.5, 5.5, 0xe8503a); p.rect(2, 10, 12, 3, 0xc83a28); p.rect(7, 4, 2, 8, WHITE); p.px(5, 5, 0xff9a8a); p.rect(2, 12, 12, 1, DARK); },
  boina: (p) => { p.disc(8, 9, 7, 3.5, 0xa83a48); p.disc(8, 8, 5.5, 2.5, 0xc84a58); p.rect(7, 4, 2, 2, 0x8a2a38); p.rect(3, 11, 10, 2, 0x8a2a38); },
  'coroa-real': (p) => { p.rect(2, 8, 12, 5, GOLD); for (const x of [2, 6, 10]) p.tri(x + 1, 3, x - 1, x + 3, 8, GOLD); p.rect(2, 12, 12, 1, 0xc89a2a); for (const [x, y, c] of [[3, 3, RED], [8, 2, 0x6ac8e8], [12, 3, RED]] as const) p.rect(x, y, 2, 2, c); p.px(5, 10, 0x6ac8e8); p.px(10, 10, 0x6ac8e8); },
  'orelhas-gato': (p) => { p.rect(2, 11, 12, 2, DARK); p.tri(4, 2, 1, 7, 11, DARK); p.tri(12, 2, 9, 15, 11, DARK); p.tri(4, 5, 3, 6, 10, PINK); p.tri(12, 5, 10, 13, 10, PINK); },
  chifres: (p) => { p.rect(3, 11, 10, 2, 0x4a2a2a); p.tri(3, 3, 2, 6, 11, RED); p.tri(13, 3, 10, 14, 11, RED); p.tri(3, 5, 3, 5, 10, 0xff6a5a); },
  bandana: (p) => { p.rect(1, 6, 14, 3, BLUE); p.tri(8, 14, 2, 14, 9, BLUE); p.rect(1, 6, 14, 1, 0x7aa8f0); for (const [x, y] of [[4, 7], [8, 8], [11, 11], [7, 11]] as const) p.px(x, y, WHITE); p.rect(13, 8, 3, 3, 0x3a6ad8); },
  'flor-orelha': (p) => { for (const [dx, dy] of [[0, -2.5], [-2.5, 0], [2.5, 0], [0, 2.5]] as const) p.disc(8 + dx, 8 + dy, 2.3, 2.3, 0xff8ac8); p.disc(8, 8, 1.6, 1.6, 0xffd84a); p.rect(9, 11, 2, 2, GREEN); },
  fones: (p) => { p.ring(8, 9, 6, 6, DARK); p.ring(8, 9, 5, 5, IRON); p.rect(1, 8, 3, 5, 0xe8503a); p.rect(12, 8, 3, 5, 0xe8503a); p.rect(2, 9, 1, 3, 0x4a4a58); p.rect(13, 9, 1, 3, 0x4a4a58); },
  oculos: (p) => { p.rect(2, 6, 5, 4, DARK); p.rect(9, 6, 5, 4, DARK); p.rect(7, 7, 2, 1, DARK); p.px(3, 7, 0x8a8aa0); p.px(10, 7, 0x8a8aa0); },
  'oculos-redondos': (p) => { p.ring(4.5, 8, 2.8, 2.8, 0x6a4a28); p.ring(11.5, 8, 2.8, 2.8, 0x6a4a28); p.rect(7, 7, 2, 1, 0x6a4a28); p.px(3, 7, 0xcfeeff); p.px(10, 7, 0xcfeeff); p.rect(0, 7, 2, 1, 0x6a4a28); p.rect(14, 7, 2, 1, 0x6a4a28); },
  mascara: (p) => { p.rect(1, 5, 14, 6, 0x3a6ad8); p.rect(2, 6, 5, 3, WHITE); p.rect(9, 6, 5, 3, WHITE); p.px(4, 7, DARK); p.px(11, 7, DARK); p.rect(1, 5, 14, 1, 0x7aa8f0); p.rect(7, 9, 2, 2, 0x3a6ad8); },
  bigode: (p) => { p.disc(5, 9, 4, 2.2, 0x4a2e18); p.disc(11, 9, 4, 2.2, 0x4a2e18); p.rect(7, 7, 2, 3, 0x4a2e18); p.tri(1, 11, 1, 4, 8, 0x4a2e18); p.tri(15, 11, 12, 15, 8, 0x4a2e18); },
  'nariz-palhaco': (p) => { p.disc(8, 9, 4.5, 4.5, RED); p.disc(6.5, 7.5, 1.5, 1.5, 0xff9a8a); },
  cachecol: (p) => { p.rect(2, 5, 12, 4, RED); p.rect(9, 9, 3, 6, RED); for (let x = 2; x < 14; x += 3) p.rect(x, 5, 1, 4, WHITE); p.rect(9, 13, 3, 1, WHITE); },
  gravata: (p) => { p.tri(5, 8, 1, 5, 4, RED); p.tri(5, 8, 1, 5, 12, RED); p.tri(11, 8, 11, 15, 4, RED); p.tri(11, 8, 11, 15, 12, RED); p.rect(6, 6, 4, 5, 0xa83228); p.px(7, 7, 0xf0705f); },
  medalha: (p) => { p.tri(5, 1, 3, 8, 8, BLUE); p.tri(11, 1, 8, 13, 8, RED); p.disc(8, 11, 4, 4, GOLD); p.disc(8, 11, 2.5, 2.5, 0xfff0a0); p.px(8, 11, 0xc89a2a); },
  mochila: (p) => { p.rect(3, 3, 10, 11, 0xe8a03a); p.rect(3, 3, 10, 3, 0xc8802a); p.rect(5, 8, 6, 4, 0xc8802a); p.rect(7, 4, 2, 1, IRON); p.rect(2, 5, 1, 7, 0x8a5a2e); p.rect(13, 5, 1, 7, 0x8a5a2e); },
  capa: (p) => { p.tri(8, 14, 1, 15, 3, RED); p.rect(3, 2, 10, 2, 0xa83228); p.rect(2, 4, 12, 3, RED); p.rect(7, 4, 2, 10, 0xa83228); p.px(4, 5, 0xf0705f); p.rect(6, 1, 4, 2, GOLD); },
  asinhas: (p) => { p.disc(4, 7, 3.5, 5, WHITE); p.disc(12, 7, 3.5, 5, WHITE); p.disc(4, 5, 2, 3, 0xe6ecf4); p.disc(12, 5, 2, 3, 0xe6ecf4); p.px(3, 11, 0xdce4ee); p.px(12, 11, 0xdce4ee); p.rect(7, 6, 2, 3, 0xdce4ee); },
};

const SEED_COLORS: Record<string, number> = {
  'sem-oran': 0x4a6ae8, 'sem-pecha': PINK, 'sem-girassol': 0xffd84a, 'sem-tomate': 0xe84a3a, 'sem-morango': 0xe8344a, 'sem-abobora': ORANGE,
  'sem-cenoura': ORANGE, 'sem-milho': 0xffe27a, 'sem-uva': 0x8a3ad8, 'sem-melancia': 0xe84a5a, 'sem-batata': 0xc8a068, 'sem-lavanda': 0x9a6ae8,
};

function seedBag(p: Pen, color: number): void {
  p.rect(4, 5, 8, 9, 0xe8d8b0);
  p.rect(5, 3, 6, 3, 0xd8c890);
  p.rect(5, 2, 6, 1, 0xa88850);
  p.disc(8, 10, 2.5, 2.5, color);
  p.px(7, 9, WHITE);
}

function draw(fn: Draw | null, outlineColor = 0x2a1a10, h = 16): PixelBuf {
  const buf = createBuf(16, h);
  if (fn) {
    const pen = new Pen(buf);
    fn(pen);
    pen.shade();
    pen.outline(outlineColor);
  }
  return buf;
}

// Registra as variações de cor das famílias: `<família>-<cor>` e o móvel original (cor padrão da família).
for (const base of Object.keys(VARIANT_BASE)) {
  const fam = FAMILY[base]!;
  FURNITURE[base] = (p) => fam(p, FAMILY_DEFAULT[base]!);
  for (const color of Object.keys(COLOR_NAMES) as ColorKey[]) FURNITURE[`${base}-${color}`] = (p) => fam(p, PAL[color]);
}
// O tapete listrado tem faixas de várias cores.
FURNITURE['tapete-listrado'] = (p) => { p.rect(1, 4, 14, 9, 0xf6f6f6); for (let x = 1; x < 15; x += 3) { p.rect(x, 4, 1, 9, 0xe86aa0); p.rect(x + 1, 4, 1, 9, 0x4f8fe0); } for (let x = 1; x < 15; x += 2) { p.px(x, 3, 0xffe27a); p.px(x, 13, 0xffe27a); } };

for (const [id, fn] of Object.entries(TALL)) FURNITURE[id] = fn;

/** Móvel no chão (`lit` à noite para luzes; `frame` para os móveis animados). Os altos têm 16×32. */
export function paintFurnitureItem(id: string, lit = false, frame = 0): PixelBuf {
  const fn = FURNITURE[id];
  return draw(fn ? (p) => fn(p, lit, frame) : null, 0x2a1a10, id in TALL ? 32 : 16);
}

/** Ícone de qualquer item (mochila, loja, catálogo). */
export function paintItemIcon(id: string): PixelBuf {
  const def = itemDef(id);
  if (def?.kind === 'furniture') return paintFurnitureItem(id, true, 0);
  if (def?.kind === 'seed') return draw((p) => seedBag(p, SEED_COLORS[id] ?? GREEN));
  if (def?.kind === 'accessory') return draw(ACCESSORY_ICONS[id] ?? null);
  if (def?.kind === 'food') return draw(FOOD_ICONS[id] ?? null);
  return draw(MATERIAL_ICONS[id] ?? null);
}

/** Acessório para pôr no corpo de um Pokémon (o mesmo ícone, com contorno escuro). */
export function paintAccessory(id: string): PixelBuf {
  return draw(ACCESSORY_ICONS[id] ?? null, 0x1a1a24);
}

const CROP_COLOR: Record<string, number> = { girassol: 0xffd84a, abobora: ORANGE, tomate: 0xe84a3a, morango: 0xe8344a, oran: 0x4a6ae8, pecha: PINK, cenoura: ORANGE, milho: 0xffd84a, uva: 0x8a3ad8, melancia: GREEN_D, batata: 0xc8a068, lavanda: 0x9a6ae8 };

/** Planta na horta: brotinho, folhas, planta crescida e a colheita aparecendo. */
export function paintCrop(cropId: string, stage: number, stages: number): PixelBuf {
  return draw((p) => {
    p.rect(2, 12, 12, 3, 0x8e6638);
    p.rect(3, 12, 10, 1, 0xb88a52);
    p.px(5, 13, 0x6a4a28);
    p.px(10, 14, 0x6a4a28);
    if (stage === 0) {
      p.rect(7, 10, 2, 2, 0x6a4a28);
      p.px(8, 9, GREEN_L);
      return;
    }
    const ripe = stage >= stages;
    const c = CROP_COLOR[cropId] ?? GOLD;
    const h = Math.min(10, 3 + stage * 3);
    if (cropId === 'melancia' && ripe) {
      p.disc(8, 10, 6, 4.5, GREEN_D);
      for (const x of [4, 7, 10]) p.rect(x, 7, 1, 7, GREEN_L);
      p.px(8, 5, GREEN);
      return;
    }
    if (cropId === 'batata' && ripe) {
      for (const [x, y] of [[4, 11], [8, 10], [12, 11]] as const) p.disc(x, y, 2.2, 1.6, c);
      p.rect(7, 4, 2, 6, GREEN_D);
      p.disc(5, 6, 2, 1.2, GREEN);
      p.disc(11, 7, 2, 1.2, GREEN);
      return;
    }
    if (cropId === 'cenoura' && ripe) {
      for (const x of [4, 8, 12]) { p.rect(x, 6, 1, 5, GREEN); p.rect(x - 1, 5, 3, 1, GREEN_L); p.tri(x, 12, x - 1, x + 1, 9, ORANGE); }
      return;
    }
    p.rect(7, 12 - h, 2, h, GREEN_D);
    p.disc(5, 12 - h / 2, 2, 1.2, GREEN);
    p.disc(11, 12 - h * 0.7, 2, 1.2, GREEN);
    if (ripe) {
      if (cropId === 'abobora') p.disc(8, 10, 4, 3, c);
      else if (cropId === 'milho') for (const [x, y] of [[5, 12 - h + 3], [11, 12 - h + 4]] as const) { p.rect(x, y, 2, 4, 0xffd84a); p.rect(x - 1, y + 2, 1, 2, GREEN); }
      else if (cropId === 'uva') for (const [x, y] of [[5, 12 - h + 2], [8, 12 - h + 3], [11, 12 - h + 2], [7, 12 - h + 5], [9, 12 - h + 5]] as const) p.disc(x, y, 1.4, 1.4, c);
      else if (cropId === 'lavanda') for (const [x, y] of [[8, 12 - h], [6, 12 - h + 2], [10, 12 - h + 2]] as const) p.rect(x - 1, y, 3, 3, c);
      else for (const [x, y] of [[5, 12 - h + 2], [11, 12 - h + 3], [8, 12 - h]] as const) p.disc(x, y, 1.6, 1.6, c);
    }
  }, 0x2a1a10);
}

/** Lista de itens desenhados (para conferir que todo item do catálogo tem arte). */
export const FURNITURE_ART_IDS = Object.keys(FURNITURE);
export const MATERIAL_ART_IDS = Object.keys(MATERIAL_ICONS);
export const FOOD_ART_IDS = Object.keys(FOOD_ICONS);
export const ACCESSORY_ART_IDS = Object.keys(ACCESSORY_ICONS);
export const TALL_ART_IDS = Object.keys(TALL);
