import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { itemDef } from '../core/village/catalog';

/**
 * Ícones e móveis da Vila em pixel art 16×16, todos desenhados por código. Cada móvel tem o seu desenho (o mesmo no chão e
 * na mochila); sementes viram saquinhos com a cor da planta; colheitas, frutas e materiais têm o próprio ícone.
 */

type Draw = (b: Pen) => void;

class Pen {
  constructor(readonly buf: PixelBuf) {}
  px(x: number, y: number, c: number): void {
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
  /** Contorno de 1 pixel em volta do desenho. */
  outline(c: number): void {
    const { w, h, data } = this.buf;
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (data[(y * w + x) * 4 + 3] ?? 0) > 0;
    const marks: [number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) marks.push([x, y]);
    for (const [x, y] of marks) this.px(x, y, c);
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
const BLUE = 0x4f8fe0;
const PINK = 0xf8a8c8;
const CLOTH = 0x5a8ad8;

const FURNITURE: Record<string, (p: Pen, lit: boolean, frame: number) => void> = {
  cadeira: (p) => { p.rect(4, 2, 8, 7, WOOD_D); p.rect(5, 3, 6, 5, WOOD); p.rect(3, 9, 10, 2, WOOD_D); p.rect(4, 11, 2, 4, LEG); p.rect(10, 11, 2, 4, LEG); },
  banquinho: (p) => { p.rect(3, 6, 10, 3, WOOD); p.rect(3, 6, 10, 1, WOOD_L); p.rect(4, 9, 2, 6, LEG); p.rect(10, 9, 2, 6, LEG); },
  poltrona: (p) => { p.rect(2, 3, 12, 8, 0xc0504d); p.rect(4, 4, 8, 5, 0xe06a5a); p.rect(1, 6, 3, 7, 0xa83a38); p.rect(12, 6, 3, 7, 0xa83a38); p.rect(3, 13, 2, 2, LEG); p.rect(11, 13, 2, 2, LEG); },
  sofa: (p) => { p.rect(0, 4, 16, 6, CLOTH); p.rect(1, 5, 14, 3, 0x7aa8f0); p.rect(0, 8, 16, 5, 0x3a6ad8); p.rect(1, 13, 2, 2, LEG); p.rect(13, 13, 2, 2, LEG); },
  mesa: (p) => { p.rect(1, 5, 14, 4, WOOD); p.rect(1, 5, 14, 1, WOOD_L); p.rect(2, 9, 2, 6, LEG); p.rect(12, 9, 2, 6, LEG); },
  mesinha: (p) => { p.disc(8, 8, 6, 3, WOOD); p.disc(8, 7.5, 5, 2, WOOD_L); p.rect(7, 10, 2, 5, LEG); p.rect(5, 14, 6, 1, LEG); },
  cama: (p) => { p.rect(1, 2, 14, 13, WOOD_D); p.rect(2, 3, 12, 3, WHITE); p.rect(2, 6, 12, 8, 0xe86aa0); p.rect(2, 6, 12, 1, 0xf8a8c8); },
  estante: (p) => { p.rect(2, 1, 12, 14, WOOD_D); for (const y of [2, 7, 12]) { p.rect(3, y, 10, 4, 0x4a2e18); for (let x = 3; x < 13; x += 2) p.rect(x, y + 1, 1, 3, [RED, BLUE, GREEN, GOLD, PINK][(x + y) % 5]!); } },
  bau: (p) => { p.rect(2, 5, 12, 9, WOOD); p.rect(2, 5, 12, 3, WOOD_D); p.rect(2, 8, 12, 1, IRON); p.rect(7, 7, 2, 3, GOLD); },
  tapete: (p) => { p.rect(1, 5, 14, 8, 0xc0504d); p.rect(3, 7, 10, 4, 0xf2c84a); p.rect(5, 8, 6, 2, 0xc0504d); for (let x = 1; x < 15; x += 2) { p.px(x, 4, 0xf2c84a); p.px(x, 13, 0xf2c84a); } },
  relogio: (p) => { p.rect(5, 0, 6, 15, WOOD_D); p.disc(8, 4, 2.5, 2.5, WHITE); p.px(8, 3, 0x1a1a24); p.px(9, 4, 0x1a1a24); p.rect(7, 8, 2, 5, GOLD); },
  quadro: (p) => { p.rect(2, 3, 12, 10, GOLD); p.rect(3, 4, 10, 8, 0x8fd0ff); p.rect(3, 9, 10, 3, GREEN); p.disc(10, 6, 1.5, 1.5, 0xffe27a); },
  televisao: (p) => { p.rect(1, 3, 14, 9, 0x2a2a34); p.rect(2, 4, 12, 7, 0x6ac8e8); p.rect(3, 5, 4, 2, 0xb0f0ff); p.rect(6, 12, 4, 3, 0x2a2a34); },
  radio: (p) => { p.rect(2, 5, 12, 8, 0x8a5ad8); p.disc(5.5, 9, 2, 2, 0x2a2a34); p.rect(9, 7, 4, 1, WHITE); p.rect(9, 9, 4, 1, WHITE); p.rect(11, 1, 1, 4, IRON); },
  lareira: (p, lit) => { p.rect(1, 2, 14, 13, STONE); p.rect(1, 2, 14, 2, STONE_L); p.rect(4, 7, 8, 8, 0x2a1a14); if (lit || true) { p.disc(8, 12, 2.5, 2.5, 0xf06048); p.disc(8, 12.5, 1.2, 1.5, 0xffd84a); } },
  luminaria: (p, lit) => { p.rect(7, 6, 2, 9, 0x4a4a52); p.rect(5, 13, 6, 2, 0x4a4a52); p.rect(5, 1, 6, 6, lit ? 0xffe27a : 0xc8b070); p.rect(6, 2, 4, 4, lit ? 0xfff6c0 : 0xe0d098); },
  abajur: (p, lit) => { p.rect(4, 3, 8, 5, lit ? 0xfff0a0 : 0xf2e2a0); p.rect(7, 8, 2, 5, IRON); p.rect(5, 13, 6, 2, IRON); },
  poste: (p, lit) => { p.rect(7, 3, 2, 12, IRON); p.rect(5, 14, 6, 1, IRON); p.rect(5, 0, 6, 4, IRON_L); p.rect(6, 1, 4, 2, lit ? 0xfff6c0 : 0xd0d4dc); },
  lanterna: (p, lit) => { p.rect(7, 0, 2, 2, 0x2a2a34); p.disc(8, 7, 5, 5, lit ? 0xf87050 : 0xd8463c); for (const y of [4, 7, 10]) p.rect(4, y, 9, 1, 0xa83228); p.rect(6, 12, 4, 2, 0x2a2a34); },
  vaso: (p) => { p.rect(4, 9, 8, 6, 0xc8643c); p.rect(3, 8, 10, 2, 0xe07a4c); for (const [x, y, c] of [[5, 4, 0xf06048], [8, 3, 0xffd84a], [10, 5, PINK], [7, 6, GREEN], [6, 7, GREEN], [9, 7, GREEN]] as const) p.rect(x, y, 2, 2, c); },
  fonte: (p, _l, frame) => { p.disc(8, 11, 7, 4, STONE); p.disc(8, 10.5, 5.5, 2.6, BLUE); p.rect(7, 3, 2, 8, STONE); for (const [x, y] of (frame % 2 ? [[5, 4], [11, 5], [8, 1]] : [[6, 5], [10, 4], [8, 2]]) as [number, number][]) p.px(x, y, 0x9cd0ff); },
  cerca: (p) => { p.rect(2, 4, 2, 11, WOOD_L); p.rect(12, 4, 2, 11, WOOD_L); p.rect(0, 6, 16, 2, WOOD); p.rect(0, 11, 16, 2, WOOD); },
  placa: (p) => { p.rect(7, 9, 2, 6, LEG); p.rect(2, 2, 12, 8, WOOD); p.rect(4, 4, 8, 1, LEG); p.rect(4, 6, 6, 1, LEG); },
  banco: (p) => { p.rect(0, 4, 16, 2, WOOD); p.rect(0, 8, 16, 2, WOOD); p.rect(1, 10, 2, 5, IRON); p.rect(13, 10, 2, 5, IRON); p.rect(1, 4, 1, 6, IRON); p.rect(14, 4, 1, 6, IRON); },
  balanco: (p) => { p.rect(1, 0, 14, 2, WOOD_D); p.rect(1, 0, 2, 15, WOOD_D); p.rect(13, 0, 2, 15, WOOD_D); p.rect(5, 2, 1, 9, 0x8a8a8a); p.rect(10, 2, 1, 9, 0x8a8a8a); p.rect(4, 11, 8, 2, RED); },
  escorregador: (p) => { p.rect(1, 3, 2, 12, IRON); p.rect(1, 3, 5, 2, IRON_L); for (let i = 0; i < 10; i++) p.rect(5 + i, 4 + i, 2, 2, 0xf2c84a); p.rect(1, 7, 3, 1, IRON_L); p.rect(1, 11, 3, 1, IRON_L); },
  'guarda-sol': (p) => { p.disc(8, 5, 7, 4, RED); for (const x of [3, 8, 13]) p.rect(x - 1, 2, 2, 6, WHITE); p.rect(7, 8, 2, 7, 0x8a8a8a); },
  churrasqueira: (p) => { p.disc(8, 7, 6, 3, 0x2a2a34); p.rect(3, 6, 10, 1, IRON_L); p.rect(4, 9, 2, 6, IRON); p.rect(10, 9, 2, 6, IRON); p.px(6, 5, 0xf06048); p.px(10, 5, 0xffd84a); },
  correio: (p) => { p.rect(7, 8, 2, 7, LEG); p.rect(3, 3, 10, 6, CLOTH); p.disc(8, 4, 5, 2, CLOTH); p.rect(12, 2, 1, 4, RED); p.rect(12, 2, 3, 2, RED); },
  espantalho: (p) => { p.rect(7, 5, 2, 10, WOOD_D); p.rect(2, 7, 12, 2, WOOD_D); p.disc(8, 3, 3, 3, 0xf2e2a0); p.rect(4, 0, 8, 2, 0xd8b060); p.rect(5, 8, 6, 4, 0x6a8ad8); },
  poco: (p) => { p.rect(2, 8, 12, 7, STONE); p.rect(2, 8, 12, 2, STONE_L); p.rect(3, 1, 2, 8, WOOD_D); p.rect(11, 1, 2, 8, WOOD_D); p.rect(2, 0, 12, 2, RED); p.rect(7, 2, 1, 5, 0x8a8a8a); p.rect(6, 6, 3, 2, WOOD); },
  bonsai: (p) => { p.rect(4, 11, 8, 4, 0x3a5ad8); p.rect(7, 6, 2, 5, WOOD_D); p.disc(5, 6, 3, 2, GREEN); p.disc(11, 5, 3, 2, GREEN); p.disc(8, 3, 3, 2, GREEN_D); },
  cogumelo: (p) => { p.rect(6, 8, 4, 7, 0xf1e6c8); p.disc(8, 6, 7, 5, 0xd8463c); for (const [x, y] of [[4, 5], [9, 3], [11, 7], [6, 8]] as const) p.rect(x, y, 2, 2, WHITE); },
  'abobora-lanterna': (p, lit) => { p.disc(8, 9, 7, 5.5, 0xf08a28); p.rect(7, 2, 2, 3, GREEN_D); p.rect(4, 7, 2, 2, lit ? 0xffe27a : 0x5a2a0a); p.rect(10, 7, 2, 2, lit ? 0xffe27a : 0x5a2a0a); p.rect(5, 11, 6, 1, lit ? 0xffe27a : 0x5a2a0a); },
  girassois: (p) => { p.rect(1, 12, 14, 3, WOOD); for (const x of [4, 8, 12]) { p.rect(x, 5, 1, 7, GREEN_D); p.disc(x, 4, 2.5, 2.5, 0xffd84a); p.px(x, 4, 0x6a3a1a); } },
  pokebola: (p) => { p.disc(8, 8, 7, 7, WHITE); for (let y = 1; y < 8; y++) for (let x = 1; x < 16; x++) if (((x - 8) / 7) ** 2 + ((y - 8) / 7) ** 2 <= 1) p.px(x, y, RED); p.rect(1, 7, 14, 2, 0x2a2a34); p.disc(8, 8, 2.5, 2.5, 0x2a2a34); p.disc(8, 8, 1.4, 1.4, WHITE); },
  'cama-poke': (p) => { p.disc(8, 10, 7, 5, 0xe86aa0); p.disc(8, 10, 5, 3, 0xf8c8dc); p.disc(6, 9, 1.5, 1, WHITE); },
  trofeu: (p) => { p.rect(4, 2, 8, 6, GOLD); p.rect(2, 3, 2, 3, GOLD); p.rect(12, 3, 2, 3, GOLD); p.rect(7, 8, 2, 4, GOLD); p.rect(4, 12, 8, 3, WOOD_D); p.px(6, 3, 0xfff6c0); },
  pelucia: (p) => { p.disc(8, 9, 6, 6, WHITE); for (let y = 3; y < 9; y++) for (let x = 2; x < 15; x++) if (((x - 8) / 6) ** 2 + ((y - 9) / 6) ** 2 <= 1) p.px(x, y, RED); p.rect(2, 8, 12, 1, 0x2a2a34); p.disc(8, 9, 1.5, 1.5, 0x2a2a34); p.px(5, 7, 0x1a1a24); p.px(11, 7, 0x1a1a24); },
  totem: (p) => { p.rect(5, 1, 6, 14, WOOD_D); for (const [y, c] of [[2, 0x8a8070], [5, GREEN], [8, BLUE], [11, GOLD]] as const) p.rect(6, y, 4, 2, c); },
  comedouro: (p) => { p.rect(2, 9, 12, 5, WOOD); p.rect(3, 9, 10, 2, WOOD_D); for (const x of [4, 7, 10]) p.disc(x + 1, 8, 1.5, 1.2, 0x4a6ae8); },
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
  girassol: (p) => { p.rect(7, 9, 2, 6, GREEN); p.disc(8, 6, 5, 5, 0xffd84a); p.disc(8, 6, 2.5, 2.5, 0x6a3a1a); },
  abobora: (p) => { p.disc(8, 9, 7, 5.5, 0xf08a28); p.rect(7, 2, 2, 3, GREEN_D); p.rect(5, 5, 1, 9, 0xd8701a); p.rect(10, 5, 1, 9, 0xd8701a); },
  tomate: (p) => { p.disc(8, 9, 5.5, 5, 0xe84a3a); p.rect(6, 3, 4, 2, GREEN); p.px(6, 7, 0xff9a8a); },
  morango: (p) => { p.disc(8, 9, 5, 5.5, 0xe8344a); p.rect(5, 3, 6, 2, GREEN); for (const [x, y] of [[6, 8], [9, 10], [7, 12], [10, 7]] as const) p.px(x, y, 0xffe27a); },
};

const ACCESSORY_ICONS: Record<string, Draw> = {
  'chapeu-palha': (p) => { p.disc(8, 10, 7, 2.5, 0xe8c870); p.disc(8, 7, 4, 3, 0xe8c870); p.rect(4, 8, 8, 1, RED); },
  bone: (p) => { p.disc(8, 8, 5, 4, RED); p.rect(8, 9, 7, 2, 0xa82828); p.rect(3, 9, 10, 1, 0xa82828); },
  oculos: (p) => { p.rect(2, 6, 5, 4, 0x2a2a34); p.rect(9, 6, 5, 4, 0x2a2a34); p.rect(7, 7, 2, 1, 0x2a2a34); p.px(3, 7, 0x8a8aa0); p.px(10, 7, 0x8a8aa0); },
  cachecol: (p) => { p.rect(2, 5, 12, 4, RED); p.rect(9, 9, 3, 6, RED); for (let x = 2; x < 14; x += 3) p.rect(x, 5, 1, 4, WHITE); },
  mochila: (p) => { p.rect(3, 3, 10, 11, 0xe8a03a); p.rect(3, 3, 10, 3, 0xc8802a); p.rect(5, 8, 6, 4, 0xc8802a); p.rect(7, 4, 2, 1, IRON); },
  laco: (p) => { p.disc(4, 8, 3.5, 3, PINK); p.disc(12, 8, 3.5, 3, PINK); p.disc(8, 8, 2, 2, 0xe86aa0); },
  'coroa-flores': (p) => { p.rect(1, 9, 14, 2, GREEN); for (const [x, c] of [[2, 0xf06048], [6, 0xffd84a], [10, PINK], [14, WHITE]] as const) p.disc(x, 8, 1.8, 1.8, c); },
  cartola: (p) => { p.rect(4, 2, 8, 9, 0x2a2a34); p.rect(1, 11, 14, 2, 0x2a2a34); p.rect(4, 8, 8, 2, RED); },
  tiara: (p) => { p.rect(2, 10, 12, 2, GOLD); for (const [x, h] of [[4, 3], [8, 5], [12, 3]] as const) p.rect(x - 1, 10 - h, 2, h, GOLD); p.px(8, 6, 0x6ac8e8); },
  gorro: (p) => { p.disc(8, 9, 6, 5, 0x3a8ad8); p.rect(2, 10, 12, 3, WHITE); p.disc(8, 3, 2, 2, WHITE); },
};

const SEED_COLORS: Record<string, number> = { 'sem-oran': 0x4a6ae8, 'sem-pecha': PINK, 'sem-girassol': 0xffd84a, 'sem-tomate': 0xe84a3a, 'sem-morango': 0xe8344a, 'sem-abobora': 0xf08a28 };

function seedBag(p: Pen, color: number): void {
  p.rect(4, 5, 8, 9, 0xe8d8b0);
  p.rect(5, 3, 6, 3, 0xd8c890);
  p.rect(5, 2, 6, 1, 0xa88850);
  p.disc(8, 10, 2.5, 2.5, color);
}

function draw(fn: Draw | null, outlineColor = 0x2a1a10): PixelBuf {
  const buf = createBuf(16, 16);
  if (fn) {
    const pen = new Pen(buf);
    fn(pen);
    pen.outline(outlineColor);
  }
  return buf;
}

/** Móvel no chão (`lit` à noite para luzes; `frame` para a água da fonte). */
export function paintFurnitureItem(id: string, lit = false, frame = 0): PixelBuf {
  const fn = FURNITURE[id];
  return draw(fn ? (p) => fn(p, lit, frame) : null);
}

/** Ícone de qualquer item (mochila, loja, catálogo). */
export function paintItemIcon(id: string): PixelBuf {
  const def = itemDef(id);
  if (def?.kind === 'furniture') return paintFurnitureItem(id, true, 0);
  if (def?.kind === 'seed') return draw((p) => seedBag(p, SEED_COLORS[id] ?? GREEN));
  if (def?.kind === 'accessory') return draw(ACCESSORY_ICONS[id] ?? null);
  return draw(MATERIAL_ICONS[id] ?? null);
}

/** Acessório para pôr na cabeça de um Pokémon (o mesmo ícone, sem contorno extra). */
export function paintAccessory(id: string): PixelBuf {
  return draw(ACCESSORY_ICONS[id] ?? null, 0x1a1a24);
}

/** Planta na horta: brotinho, folhas, planta crescida e a colheita aparecendo. */
export function paintCrop(cropId: string, stage: number, stages: number): PixelBuf {
  return draw((p) => {
    p.rect(2, 12, 12, 3, 0x8e6638);
    p.rect(3, 12, 10, 1, 0xb88a52);
    if (stage === 0) {
      p.rect(7, 10, 2, 2, 0x6a4a28);
      return;
    }
    const h = Math.min(10, 3 + stage * 3);
    p.rect(7, 12 - h, 2, h, GREEN_D);
    p.disc(5, 12 - h / 2, 2, 1.2, GREEN);
    p.disc(11, 12 - h * 0.7, 2, 1.2, GREEN);
    if (stage >= stages) {
      const icon = MATERIAL_ICONS[cropId];
      const c = { girassol: 0xffd84a, abobora: 0xf08a28, tomate: 0xe84a3a, morango: 0xe8344a, oran: 0x4a6ae8, pecha: PINK }[cropId] ?? GOLD;
      if (icon && cropId === 'abobora') p.disc(8, 10, 4, 3, c);
      else for (const [x, y] of [[5, 12 - h + 2], [11, 12 - h + 3], [8, 12 - h]] as const) p.disc(x, y, 1.6, 1.6, c);
    }
  }, 0x2a1a10);
}

/** Lista de móveis desenhados (para conferir que todo móvel do catálogo tem arte). */
export const FURNITURE_ART_IDS = Object.keys(FURNITURE);
export const MATERIAL_ART_IDS = Object.keys(MATERIAL_ICONS);
export const ACCESSORY_ART_IDS = Object.keys(ACCESSORY_ICONS);
