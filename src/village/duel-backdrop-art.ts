/**
 * Cenário do duelo por turnos, pintado por código em pixel art: céu em faixas, morros, fileira de árvores e gramado em
 * perspectiva, além do tablado oval onde cada Pokémon pisa. O desenho é fixo por tema; o tema vem do nome do oponente.
 */

export const DUEL_THEMES = ['campo', 'entardecer', 'neve', 'noite'] as const;
export type DuelTheme = (typeof DUEL_THEMES)[number];

interface Palette {
  sky: readonly [number, number, number, number];
  cloud: number;
  hills: readonly [number, number];
  trees: readonly [number, number, number];
  ground: readonly [number, number, number];
  pad: readonly [number, number, number, number];
}

const PALETTES: Record<DuelTheme, Palette> = {
  campo: {
    sky: [0x5aa8e8, 0x7cc0f0, 0xa4d8f8, 0xd4f0fc],
    cloud: 0xf8fcff,
    hills: [0x88c8a0, 0x68b080],
    trees: [0x4a9a58, 0x347a48, 0x7cc468],
    ground: [0x8cd070, 0x78c060, 0xa8e088],
    pad: [0xc8f0a0, 0x98d878, 0x68b058, 0x48864a],
  },
  entardecer: {
    sky: [0x6a58a8, 0xc06a98, 0xf09a78, 0xfcd490],
    cloud: 0xffd0b8,
    hills: [0xa86a90, 0x7c5088],
    trees: [0x584878, 0x403460, 0x8a6090],
    ground: [0xb09860, 0x988450, 0xd4b878],
    pad: [0xe8d498, 0xc8a868, 0x987c50, 0x6a5840],
  },
  neve: {
    sky: [0x8cb4dc, 0xa8c8e8, 0xc8dcf0, 0xe8f0f8],
    cloud: 0xffffff,
    hills: [0xd4e0f0, 0xb8cce4],
    trees: [0x6a94a0, 0x4e7484, 0xd8ecf4],
    ground: [0xe4eef8, 0xd0e0f0, 0xf8fcff],
    pad: [0xffffff, 0xdcecf8, 0xa8c4dc, 0x7c9cbc],
  },
  noite: {
    sky: [0x141c48, 0x20285c, 0x303a74, 0x4c5490],
    cloud: 0x5c6498,
    hills: [0x2c3460, 0x20284c],
    trees: [0x1c3440, 0x142630, 0x2e5058],
    ground: [0x2c5848, 0x234a3e, 0x3c7058],
    pad: [0x6ca088, 0x4a8070, 0x2e5c54, 0x1e4040],
  },
};

/** Tema estável por oponente: o mesmo treinador sempre luta no mesmo lugar. */
export function duelTheme(name: string): DuelTheme {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return DUEL_THEMES[hash % DUEL_THEMES.length] ?? 'campo';
}

export interface ArtBuffer {
  w: number;
  h: number;
  data: Uint8ClampedArray;
}

const buffer = (w: number, h: number): ArtBuffer => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });

function dot(b: ArtBuffer, x: number, y: number, rgb: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return;
  const i = (y * b.w + x) * 4;
  b.data[i] = (rgb >> 16) & 255;
  b.data[i + 1] = (rgb >> 8) & 255;
  b.data[i + 2] = rgb & 255;
  b.data[i + 3] = 255;
}

function row(b: ArtBuffer, x: number, y: number, w: number, rgb: number): void {
  for (let i = 0; i < w; i++) dot(b, x + i, y, rgb);
}

function oval(b: ArtBuffer, cx: number, cy: number, rx: number, ry: number, rgb: number): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    const t = (y - cy) / ry;
    if (Math.abs(t) > 1) continue;
    const half = rx * Math.sqrt(1 - t * t);
    row(b, Math.round(cx - half), y, Math.round(half * 2), rgb);
  }
}

export const BACKDROP_W = 240;
export const BACKDROP_H = 140;
const HORIZON = 72;

export function paintDuelBackdrop(theme: DuelTheme): ArtBuffer {
  const b = buffer(BACKDROP_W, BACKDROP_H);
  const p = PALETTES[theme];

  // Céu em quatro faixas, com a passagem pontilhada.
  for (let y = 0; y < HORIZON; y++) {
    const at = (y / HORIZON) * p.sky.length;
    const band = Math.min(p.sky.length - 1, Math.floor(at));
    const next = Math.min(p.sky.length - 1, band + 1);
    const fade = at - band;
    for (let x = 0; x < b.w; x++) dot(b, x, y, fade > 0.8 && (x + y) % 2 === 0 ? (p.sky[next] ?? 0) : (p.sky[band] ?? 0));
  }

  if (theme === 'noite') {
    for (let i = 0; i < 46; i++) dot(b, (i * 53) % b.w, (i * 29) % (HORIZON - 16), i % 5 === 0 ? 0xffffff : 0xb8c4ec);
    oval(b, 188, 20, 9, 9, 0xf4eec8);
    oval(b, 185, 18, 2, 2, 0xdcd4a8);
  } else {
    for (const [x, y, size] of [[34, 16, 1], [118, 26, 0.8], [196, 12, 1.2]] as const) {
      oval(b, x, y, 16 * size, 4 * size, p.cloud);
      oval(b, x - 7 * size, y - 2, 9 * size, 4 * size, p.cloud);
      oval(b, x + 8 * size, y - 3, 8 * size, 5 * size, p.cloud);
    }
  }

  // Dois planos de morros.
  for (let x = 0; x < b.w; x++) {
    const far = Math.round(52 + 7 * Math.sin(x * 0.026) + 3 * Math.sin(x * 0.071 + 1));
    for (let y = far; y < HORIZON + 8; y++) dot(b, x, y, p.hills[0]);
    const near = Math.round(62 + 5 * Math.sin(x * 0.041 + 2));
    for (let y = near; y < HORIZON + 8; y++) dot(b, x, y, p.hills[1]);
  }

  // Fileira de árvores, com copa iluminada à esquerda.
  for (let x = -4, n = 0; x < b.w + 8; x += 11, n++) {
    const tall = 8 + ((n * 7) % 5);
    const cy = HORIZON - 1 - ((n * 3) % 3);
    oval(b, x, cy, 8, tall, p.trees[1]);
    oval(b, x - 1, cy - 1, 7, tall - 1, p.trees[0]);
    oval(b, x - 3, cy - tall * 0.4, 3, tall * 0.34, p.trees[2]);
  }

  // Gramado com faixas que alargam para perto: é isso que dá a perspectiva.
  let y = HORIZON + 4;
  for (let band = 0, tall = 3; y < b.h; band++, tall += 1) {
    for (let j = 0; j < tall && y < b.h; j++, y++) row(b, 0, y, b.w, p.ground[band % 2] ?? 0);
  }
  for (let i = 0; i < 150; i++) {
    const gy = HORIZON + 6 + ((i * i * 7) % (b.h - HORIZON - 7));
    const gx = (i * 37 + gy * 11) % b.w;
    const reach = gy > 112 ? 2 : 1;
    row(b, gx, gy, reach + 1, p.ground[2]);
    if (reach > 1) dot(b, gx + 1, gy - 1, p.ground[2]);
  }
  return b;
}

export const PAD_W = 96;
export const PAD_H = 30;

/** Tablado oval: lateral escura, topo em dois tons e borda clara, com a luz vindo do alto à esquerda. */
export function paintDuelPad(theme: DuelTheme): ArtBuffer {
  const b = buffer(PAD_W, PAD_H);
  const [hi, top, side, deep] = PALETTES[theme].pad;
  const cx = PAD_W / 2;
  oval(b, cx, 16, 47, 13, deep);
  oval(b, cx, 14, 47, 12, side);
  oval(b, cx, 12, 45, 11, top);
  oval(b, cx - 3, 11, 37, 8, hi);
  oval(b, cx + 1, 12.5, 33, 6.5, top);
  for (let i = 0; i < 26; i++) {
    const a = i * 2.4;
    const d = 0.3 + ((i * 7) % 10) / 16;
    dot(b, Math.round(cx + Math.cos(a) * 40 * d), Math.round(12 + Math.sin(a) * 9 * d), i % 2 ? hi : side);
  }
  return b;
}

/** Imagem do desenho para usar no CSS. Sem canvas (ambiente de teste), volta vazio e o CSS usa só a cor de fundo. */
export function artUrl(art: ArtBuffer): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = art.w;
    canvas.height = art.h;
    const c = canvas.getContext('2d');
    if (!c) return '';
    c.putImageData(new ImageData(new Uint8ClampedArray(art.data), art.w, art.h), 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}
