import { createBuf } from '../box/ground-art';
import type { PixelBuf } from '../box/ground-art';
import { blend, FRAME, GLASS, glassWindow, INK_DEEP, inkOutline, mix } from './building-style';
import { disc, put, rect } from './village-art';

/**
 * Prédios dos modos de jogo, pintados por código no jeito dos prédios grandes de Gen 4/5: telhado enorme visto de cima em
 * 3/4 (mais da metade da altura), fachada baixa e larga, rampa de 5 tons por material, contorno colorido e detalhes de
 * telhado (ar-condicionado, claraboia, costelas, ameias). Desenho original; a Torre é a exceção alta, de andares redondos.
 */

interface Ramp {
  hi: number;
  lt: number;
  md: number;
  sh: number;
  dp: number;
}

const ramp = (c: number): Ramp => ({
  hi: blend(c, 0xffffff, 0.5),
  lt: blend(c, 0xffffff, 0.22),
  md: c,
  sh: blend(mix(c, 0.72), INK_DEEP, 0.12),
  dp: blend(mix(c, 0.5), INK_DEEP, 0.3),
});

const erase = (b: PixelBuf, x: number, y: number): void => put(b, x, y, 0, 0);

/** Bloco de telhado plano: topo claro, lado direito e frente na sombra, cantos arredondados. */
function slab(b: PixelBuf, x: number, y: number, w: number, h: number, c: Ramp): void {
  rect(b, x, y, w, h, c.md);
  rect(b, x, y, w, 1, c.hi);
  rect(b, x, y + 1, w, 1, c.lt);
  rect(b, x, y, 1, h, c.lt);
  rect(b, x + w - 2, y, 2, h, c.sh);
  rect(b, x, y + h - 3, w, 2, c.sh);
  rect(b, x, y + h - 1, w, 1, c.dp);
  for (const px of [x, x + w - 1]) {
    erase(b, px, y);
    erase(b, px, y + h - 1);
  }
}

/** Piso do terraço, com juntas desencontradas e a sombra da mureta no alto e à esquerda. */
function deck(b: PixelBuf, x: number, y: number, w: number, h: number, base: number, line: number, shadow: number): void {
  rect(b, x, y, w, h, base);
  for (let row = 3, n = 0; row < h; row += 4, n++) {
    rect(b, x, y + row, w, 1, line);
    for (let px = x + 3 + (n % 2) * 4; px < x + w; px += 8) rect(b, px, y + row - 3, 1, 3, line);
  }
  rect(b, x, y, w, 2, shadow);
  rect(b, x, y, 2, h, shadow);
}

/** Fachada: sombra do beiral no alto, luz à esquerda, sombra à direita e barra de pedra junto ao chão. */
function facade(b: PixelBuf, x: number, y: number, w: number, h: number, c: Ramp, base: Ramp): void {
  rect(b, x, y, w, h, c.md);
  rect(b, x, y, w, 2, c.dp);
  rect(b, x, y + 2, 1, h - 2, c.lt);
  rect(b, x + w - 2, y + 2, 2, h - 2, c.sh);
  rect(b, x, y + h - 4, w, 4, base.md);
  rect(b, x, y + h - 4, w, 1, base.lt);
  rect(b, x, y + h - 1, w, 1, base.sh);
  for (let px = x + 3; px < x + w; px += 6) rect(b, px, y + h - 3, 1, 2, base.sh);
}

/** Caixa de ar-condicionado no telhado, com a ventoinha e a sombra caindo à direita. */
function vent(b: PixelBuf, x: number, y: number): void {
  rect(b, x + 1, y + 1, 12, 10, 0x1c1838);
  slab(b, x, y, 11, 9, ramp(0xc4c8d4));
  disc(b, x + 5, y + 4, 3, 3, 0x70748a);
  disc(b, x + 5, y + 4, 1.4, 1.4, 0xdfe2ea);
}

/** Toldo listrado com a barra de baixo em ondas. */
function awning(b: PixelBuf, cx: number, y: number, half: number, color: number): void {
  const c = ramp(color);
  rect(b, cx - half, y, half * 2, 4, c.md);
  for (let x = cx - half, n = 0; x < cx + half; x += 4, n++) {
    const tone = n % 2 ? 0xf8f4e8 : c.md;
    rect(b, x, y, 4, 4, tone);
    rect(b, x, y + 4, 4, 1, n % 2 ? 0xc8c2b4 : c.sh);
    rect(b, x + 1, y + 5, 2, 1, n % 2 ? 0xc8c2b4 : c.sh);
  }
  rect(b, cx - half, y, half * 2, 1, c.hi);
}

/** Porta de vidro dupla, com batente e degrau. */
function glassDoor(b: PixelBuf, cx: number, bottom: number, frame: Ramp): void {
  rect(b, cx - 8, bottom - 16, 16, 15, frame.dp);
  rect(b, cx - 7, bottom - 15, 14, 14, frame.lt);
  rect(b, cx - 6, bottom - 14, 5, 13, GLASS.mid);
  rect(b, cx + 1, bottom - 14, 5, 13, GLASS.mid);
  rect(b, cx - 6, bottom - 14, 5, 4, GLASS.light);
  rect(b, cx + 1, bottom - 14, 5, 4, GLASS.light);
  put(b, cx - 3, bottom - 12, GLASS.shine);
  put(b, cx + 4, bottom - 12, GLASS.shine);
  rect(b, cx - 2, bottom - 7, 1, 2, frame.dp);
  rect(b, cx + 1, bottom - 7, 1, 2, frame.dp);
  rect(b, cx - 10, bottom - 2, 20, 2, 0xdcd8cc);
  rect(b, cx - 10, bottom - 1, 20, 1, 0xa8a498);
}

/** Tom de uma superfície redonda: `u` vai de -1 (esquerda) a 1 (direita); a luz vem da esquerda, um pouco para dentro. */
function roundTone(c: Ramp, u: number): number {
  if (u < -0.82) return c.md;
  if (u < -0.3) return u < -0.62 ? c.lt : c.hi;
  if (u < 0.3) return c.lt;
  if (u < 0.68) return c.md;
  return u < 0.88 ? c.sh : c.dp;
}

/** Tronco redondo, afinando de `hwTop` para `hwBottom`. */
function column(b: PixelBuf, cx: number, top: number, bottom: number, hwTop: number, hwBottom: number, c: Ramp): void {
  for (let y = top; y < bottom; y++) {
    const half = hwTop + (hwBottom - hwTop) * ((y - top) / Math.max(1, bottom - top - 1));
    for (let x = Math.round(cx - half); x < Math.round(cx + half); x++) put(b, x, y, roundTone(c, (x + 0.5 - cx) / half));
  }
}

/** Anel redondo em volta da torre: topo claro em elipse e aba escura embaixo. */
function ring(b: PixelBuf, cx: number, y: number, half: number, c: Ramp): void {
  const ry = Math.max(2, half * 0.28);
  disc(b, cx, y + 2, half, ry, c.dp);
  disc(b, cx, y + 1, half, ry, c.sh);
  disc(b, cx, y, half, ry, c.md);
  disc(b, cx - half * 0.08, y - 0.5, half * 0.86, ry * 0.8, c.lt);
}

/** Alvenaria de blocos em três tons, fiadas desencontradas, com luz no alto de cada bloco. */
function stones(b: PixelBuf, x: number, y: number, w: number, h: number, c: Ramp): void {
  rect(b, x, y, w, h, c.dp);
  for (let row = 0; row * 5 < h; row++) {
    for (let px = x - (row % 2) * 5, n = 0; px < x + w; px += 10, n++) {
      const tone = [c.md, c.sh, c.lt, c.md][(row * 3 + n * 5) % 4] ?? c.md;
      const left = Math.max(x, px);
      const right = Math.min(x + w, px + 9);
      const top = y + row * 5;
      const tall = Math.min(4, y + h - top);
      if (right <= left || tall <= 0) continue;
      rect(b, left, top, right - left, tall, tone);
      rect(b, left, top, right - left, 1, tone === c.sh ? c.md : c.hi);
    }
  }
}

export function paintArcadeHall(): PixelBuf {
  const b = createBuf(80, 72);
  const roof = ramp(0x7c4ccc);
  const wall = ramp(0x3c3c90);
  const gold = ramp(0xf0b42c);
  const base = ramp(0x9a98b0);

  // Telhadão de terraço, com ar-condicionado e claraboia néon.
  slab(b, 2, 14, 76, 33, roof);
  deck(b, 6, 19, 68, 22, 0x54309c, 0x46288a, 0x3a2274);
  vent(b, 9, 25);
  vent(b, 60, 25);
  rect(b, 26, 25, 28, 12, 0x2a1c58);
  rect(b, 27, 26, 26, 10, gold.lt);
  for (let i = 0; i < 4; i++) {
    const px = 28 + i * 6;
    rect(b, px, 27, 5, 8, i % 2 ? 0x7be6ff : 0xff7ab6);
    rect(b, px, 27, 5, 2, 0xffffff);
    put(b, px + 1, 30, 0xffffff);
    put(b, px + 2, 29, 0xffffff);
  }

  // Letreiro com lâmpadas: controle e moeda, a marca da casa.
  rect(b, 19, 20, 42, 2, 0x2a1c58);
  slab(b, 17, 1, 46, 20, gold);
  rect(b, 20, 4, 40, 14, 0x1d1540);
  rect(b, 20, 4, 40, 2, 0x120c2c);
  for (let x = 19, n = 0; x < 61; x += 3, n++) {
    put(b, x, 2, n % 2 ? 0xffffff : 0xff5a8a);
    put(b, x, 18, n % 2 ? 0xff5a8a : 0xffffff);
  }
  rect(b, 27, 8, 7, 3, 0x7be6ff);
  rect(b, 29, 6, 3, 7, 0x7be6ff);
  disc(b, 40, 9.5, 4.5, 4.5, gold.sh);
  disc(b, 40, 9.5, 3.6, 3.6, 0xffe36e);
  rect(b, 39, 7, 2, 5, gold.md);
  disc(b, 49, 11, 2, 2, 0xff5a8a);
  disc(b, 54, 8, 2, 2, 0x7cf08a);

  // Beiral dourado.
  rect(b, 2, 45, 76, 3, gold.md);
  rect(b, 2, 45, 76, 1, gold.hi);
  rect(b, 2, 47, 76, 1, gold.dp);

  facade(b, 4, 48, 72, 24, wall, base);
  for (let x = 6, n = 0; x < 74; x += 3, n++) put(b, x, 51, n % 2 ? 0xffe36e : 0xff7ab6);

  // Vitrines com as máquinas lá dentro.
  for (const x of [7, 20, 48, 61]) {
    glassWindow(b, x, 54, 12, 11, { frame: FRAME.mid });
    rect(b, x + 3, 58, 3, 6, 0x3a2f78);
    rect(b, x + 7, 58, 3, 6, 0xb03a62);
    put(b, x + 4, 59, 0x7be6ff);
    put(b, x + 8, 59, 0xffe36e);
  }
  glassDoor(b, 40, 72, gold);
  awning(b, 40, 52, 12, 0xe0407a);
  inkOutline(b);
  return b;
}

export function paintPinsHall(): PixelBuf {
  const b = createBuf(80, 72);
  const shell = ramp(0x4fb878);
  const ribs = ramp(0xe05a4a);
  const wall = ramp(0xece6cf);
  const base = ramp(0x8f9a8c);
  const trim = ramp(0xe05a4a);
  const cx = 40;
  const top = 2;
  const eave = 45;

  // Abóbada do ginásio: costelas vermelhas sobre casca verde, escurecendo para o beiral.
  const tones = (r: Ramp, t: number): number => (t < 0.08 ? r.hi : t < 0.26 ? r.lt : t < 0.6 ? r.md : t < 0.86 ? r.sh : r.dp);
  for (let y = top; y < eave; y++) {
    const t = (y - top) / (eave - top - 1);
    const half = Math.round(38 - 13 * (1 - t) ** 3);
    const dither = (y + top) % 2 === 0 ? 0.03 : -0.03;
    for (let x = cx - half; x < cx + half; x++) {
      const u = (x + 0.5 - cx) / half;
      const edge = Math.abs(u) > 0.93;
      const rib = Math.abs(((u + 1.2) % 0.4) - 0.2) < 0.022;
      const r = rib ? ribs : shell;
      const side = u > 0.72 ? 0.2 : u < -0.86 ? 0.08 : 0;
      put(b, x, y, tones(r, t + side + (edge ? 0.25 : 0) + ((x + y) % 2 ? dither : 0)));
    }
  }

  // Disco gigante na abóbada: a marca da Pista.
  disc(b, cx, 23, 13, 13, 0x25304c);
  disc(b, cx, 23, 12, 12, 0xf0b42c);
  disc(b, cx, 23, 10.5, 10.5, 0xf6f4ea);
  disc(b, cx + 1, 24, 9, 9, 0xdcdad0);
  disc(b, cx, 23, 9, 9, 0xf6f4ea);
  for (let y = 19; y <= 26; y++) {
    const half = Math.round(Math.sqrt(Math.max(0, 110 - (y - 23) ** 2)));
    rect(b, cx - half, y, half * 2, 1, y < 23 ? 0xe05a4a : 0xb83c34);
  }
  disc(b, cx, 23, 3.4, 3.4, 0x25304c);
  disc(b, cx, 23, 2.4, 2.4, 0xf6f4ea);
  rect(b, cx - 6, 15, 4, 1, 0xffffff);

  // Beiral branco com a faixa da pista.
  rect(b, 2, 44, 76, 4, 0xf4f2ea);
  rect(b, 2, 44, 76, 1, 0xffffff);
  rect(b, 2, 46, 76, 1, trim.md);
  rect(b, 2, 47, 76, 1, 0x8f8c80);

  facade(b, 4, 48, 72, 24, wall, base);
  for (const x of [20, 56]) {
    rect(b, x, 50, 4, 18, wall.hi);
    rect(b, x + 3, 50, 1, 18, wall.sh);
  }
  for (const x of [8, 62]) glassWindow(b, x, 53, 10, 11, { frame: FRAME.light, mullion: true });
  for (const x of [26, 44]) glassWindow(b, x, 53, 9, 5, { frame: FRAME.light });
  glassDoor(b, cx, 72, trim);
  awning(b, cx, 50, 10, 0x4fb878);
  inkOutline(b);
  return b;
}

export function paintDungeonGate(): PixelBuf {
  const b = createBuf(80, 72);
  const stone = ramp(0x8c8698);
  const slabs = ramp(0xa8a4a8);
  const cap = ramp(0x8a4a5a);
  const moss = [0x5f8a4a, 0x7ba65a, 0x47703c] as const;
  const dark = 0x0e0a18;

  // Terraço de lajes atrás da muralha.
  slab(b, 12, 12, 56, 24, slabs);
  deck(b, 15, 15, 50, 18, 0x96929a, 0x7a7680, 0x6a6672);

  // Muralha com ameias.
  stones(b, 12, 34, 56, 38, stone);
  for (let x = 18; x < 62; x += 9) {
    slab(b, x, 28, 6, 8, stone);
  }
  rect(b, 12, 34, 56, 1, stone.hi);

  // Arco de aduelas e a escada que afunda no escuro.
  const cx = 40;
  disc(b, cx, 52, 19, 19, stone.dp);
  disc(b, cx, 52, 18, 18, slabs.md);
  disc(b, cx, 52, 18, 18, slabs.md);
  rect(b, 22, 52, 36, 20, slabs.md);
  rect(b, 21, 52, 1, 20, stone.dp);
  rect(b, 58, 52, 1, 20, stone.dp);
  for (let a = -3.05; a < 0.1; a += 0.32) {
    rect(b, Math.round(cx + Math.cos(a) * 16), Math.round(52 + Math.sin(a) * 16), 1, 2, stone.sh);
  }
  disc(b, cx, 52, 13.5, 13.5, dark);
  rect(b, 27, 52, 27, 20, dark);
  rect(b, 25, 56, 2, 16, slabs.sh);
  rect(b, 54, 56, 2, 16, slabs.sh);
  for (let step = 0; step < 6; step++) {
    const half = 13 - step;
    const y = 69 - step * 3;
    const tone = blend(0x9a96a0, dark, step / 6);
    rect(b, cx - half, y, half * 2, 3, tone);
    rect(b, cx - half, y, half * 2, 1, blend(0xc4c0c8, dark, step / 6));
  }
  disc(b, cx, 53, 5, 5, 0x2a1848);
  disc(b, cx, 53, 2.5, 2.5, 0x8a5fc0);
  put(b, cx - 1, 52, 0xe4ccff);

  // Pedra-chave de cristal.
  rect(b, 36, 30, 8, 8, stone.dp);
  rect(b, 37, 31, 6, 6, 0x8a5fc0);
  rect(b, 37, 31, 3, 3, 0xd8b8ff);
  rect(b, 41, 35, 2, 2, 0x5a3a8c);

  // Torreões redondos de pedra com capuz de telhas.
  for (const tx of [10, 70]) {
    column(b, tx, 22, 72, 10, 10, slabs);
    for (let y = 26, n = 0; y < 70; y += 5, n++) {
      for (let x = tx - 9 + (n % 2) * 4; x < tx + 9; x += 8) rect(b, x, y, 1, 4, stone.sh);
      rect(b, tx - 9, y + 4, 18, 1, stone.sh);
    }
    for (let y = 2; y < 24; y++) {
      const half = 1 + (y - 2) * 0.56;
      for (let x = Math.round(tx - half); x < Math.round(tx + half); x++) {
        const tile = (y + (Math.floor(x / 3) % 2)) % 3 === 0;
        put(b, x, y, tile ? cap.dp : roundTone(cap, (x + 0.5 - tx) / half));
      }
    }
    disc(b, tx, 24, 13, 3, cap.dp);
    disc(b, tx, 23, 13, 3, cap.sh);
    rect(b, tx - 1, 0, 2, 3, 0xf0c060);
    rect(b, tx - 2, 34, 4, 9, dark);
    rect(b, tx - 1, 35, 2, 7, 0x8a5fc0);
    rect(b, tx - 2, 49, 4, 9, dark);
    rect(b, tx - 1, 50, 2, 7, 0xffa53c);
  }

  // Limo subindo das juntas.
  for (const [x, y, w, h, i] of [[16, 66, 8, 6, 0], [52, 62, 7, 10, 2], [3, 60, 5, 12, 1], [72, 64, 6, 8, 0], [30, 35, 6, 2, 1], [58, 36, 5, 2, 0], [14, 44, 4, 3, 2]] as const) {
    for (let n = 0; n < w; n++) {
      const tall = Math.max(1, h - ((n * 7) % 5));
      rect(b, x + n, y + h - tall, 1, tall, moss[(n + i) % 3] ?? moss[0]);
    }
  }
  inkOutline(b);
  return b;
}

/** A Torre digital: três andares redondos de metal e vidro, anéis de LED, cúpula de dados e antena. */
export function paintDigitalTower(): PixelBuf {
  const b = createBuf(64, 132);
  const cx = 32;
  const steel = ramp(0xc8d4e4);
  const blue = ramp(0x3f7ccc);
  const teal = ramp(0x45d4c4);
  const base = ramp(0x8f9ab4);

  // Praça de base.
  slab(b, 3, 110, 58, 15, steel);
  deck(b, 7, 113, 50, 9, 0xb0bccc, 0x98a4b8, 0x8a96aa);
  facade(b, 5, 122, 54, 10, ramp(0x4a5a8c), base);
  for (const x of [9, 44]) glassWindow(b, x, 124, 10, 4, { frame: FRAME.mid });

  const led = (y: number, half: number): void => {
    for (let x = Math.round(cx - half), n = 0; x < cx + half; x++, n++) put(b, x, y, n % 4 < 2 ? 0x67f8cf : 0x53dcff);
  };
  const glassBand = (top: number, bottom: number, hwTop: number, hwBottom: number): void => {
    for (let y = top; y < bottom; y++) {
      const half = hwTop + (hwBottom - hwTop) * ((y - top) / (bottom - top));
      const floor = (y - top) % 6;
      if (floor > 3) continue;
      for (const u of [-0.72, -0.42, -0.12, 0.18, 0.48]) {
        const left = Math.round(cx + u * half);
        const right = Math.round(cx + (u + 0.22) * half);
        rect(b, left, y, right - left, 1, floor === 0 ? GLASS.light : u > 0.3 ? blue.md : GLASS.deep);
      }
    }
  };

  // Andar de baixo, largo.
  column(b, cx, 72, 114, 17, 21, steel);
  glassBand(76, 110, 17, 21);
  ring(b, cx, 72, 23, blue);
  led(74, 21);
  disc(b, cx, 114, 22, 5, steel.sh);
  column(b, cx, 96, 114, 19, 21, steel);
  glassBand(98, 112, 19, 21);
  // Portal.
  rect(b, cx - 8, 108, 16, 24, steel.dp);
  rect(b, cx - 7, 109, 14, 23, blue.md);
  rect(b, cx - 6, 111, 5, 19, GLASS.mid);
  rect(b, cx + 1, 111, 5, 19, GLASS.mid);
  rect(b, cx - 6, 111, 5, 5, GLASS.light);
  rect(b, cx + 1, 111, 5, 5, GLASS.light);
  rect(b, cx - 8, 106, 16, 3, teal.md);
  rect(b, cx - 8, 106, 16, 1, teal.hi);

  // Andar do meio.
  column(b, cx, 42, 72, 12, 15, steel);
  glassBand(46, 70, 12, 15);
  ring(b, cx, 42, 18, blue);
  led(44, 16);

  // Pescoço e cúpula de dados.
  column(b, cx, 28, 42, 7, 9, steel);
  rect(b, cx - 1, 28, 2, 14, teal.lt);
  ring(b, cx, 30, 13, blue);
  disc(b, cx, 21, 11, 10.5, teal.dp);
  disc(b, cx, 20.5, 10, 10, teal.sh);
  disc(b, cx - 1, 20, 9, 9, teal.md);
  disc(b, cx - 3, 18, 6, 6, teal.lt);
  disc(b, cx - 4, 16, 2.6, 2.6, 0xffffff);
  for (const y of [15, 19, 23]) {
    for (let x = cx - 8, n = 0; x < cx + 8; x += 2, n++) if ((n * 5 + y) % 3 === 0) put(b, x, y, 0xe6fff8);
  }
  ring(b, cx, 11, 5, steel);

  // Antena.
  rect(b, cx - 1, 3, 2, 8, steel.md);
  rect(b, cx - 1, 3, 1, 8, steel.hi);
  rect(b, cx - 4, 7, 8, 1, steel.sh);
  rect(b, cx - 3, 4, 6, 1, steel.sh);
  rect(b, cx - 2, 0, 4, 3, 0xff5a5a);
  put(b, cx - 1, 0, 0xffd0d0);
  inkOutline(b);
  return b;
}

export interface GameBuildingArt {
  paint: () => PixelBuf;
  /** Janelas que acendem à noite: x, y, largura e altura em pixels do desenho. */
  windows: readonly (readonly [number, number, number, number])[];
}

export const GAME_BUILDINGS: Readonly<Record<string, GameBuildingArt>> = {
  arcade: { paint: paintArcadeHall, windows: [[8, 55, 10, 9], [21, 55, 10, 9], [49, 55, 10, 9], [62, 55, 10, 9]] },
  pins: { paint: paintPinsHall, windows: [[9, 54, 8, 9], [63, 54, 8, 9], [27, 54, 7, 3], [45, 54, 7, 3]] },
  masmorra: { paint: paintDungeonGate, windows: [[8, 35, 4, 7], [68, 35, 4, 7], [8, 50, 4, 7], [68, 50, 4, 7]] },
  torre: { paint: paintDigitalTower, windows: [[18, 76, 28, 30], [22, 46, 20, 22], [24, 14, 16, 14]] },
};
